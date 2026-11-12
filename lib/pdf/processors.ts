import "server-only";
import { degrees, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import sharp from "sharp";
import { parseOrder, parsePages } from "./pages";

export type Input = { name: string; bytes: Uint8Array };
export type Output = { name: string; bytes: Uint8Array; type: string };
export type Ctx = { inputs: Input[]; options: Record<string, unknown> };

const stem = (n: string) => n.replace(/\.[^.]+$/, "") || "file";
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

async function open(i: Input): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(i.bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new Error(`"${i.name}" is password protected. Remove the password first.`);
    throw new Error(`"${i.name}" could not be read as a PDF.`);
  }
}

async function merge({ inputs }: Ctx): Promise<Output> {
  const out = await PDFDocument.create();
  for (const i of inputs) {
    const doc = await open(i);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return { name: "merged.pdf", bytes: await out.save(), type: "application/pdf" };
}

async function rotate({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  const angle = [90, 180, 270].includes(Number(options.angle)) ? Number(options.angle) : 90;
  const pages = doc.getPages();
  for (const idx of parsePages(str(options.pages, "all"), pages.length)) {
    const p = pages[idx];
    p.setRotation(degrees((p.getRotation().angle + angle) % 360));
  }
  return { name: `${stem(inputs[0].name)}-rotated.pdf`, bytes: await doc.save(), type: "application/pdf" };
}

async function pick(doc: PDFDocument, idx: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  (await out.copyPages(doc, idx)).forEach((p) => out.addPage(p));
  return out.save();
}
const pdfOut = (name: string, bytes: Uint8Array): Output => ({ name, bytes, type: "application/pdf" });
const zipOut = async (name: string, zip: JSZip): Promise<Output> => ({ name, bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }), type: "application/zip" });
const MAX_PARTS = 200;

async function split({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  const total = doc.getPageCount();
  const mode = str(options.mode, "ranges");
  let groups: number[][] = [];
  if (mode === "single") groups = doc.getPageIndices().map((i) => [i]);
  else if (mode === "every") {
    const n = Math.max(1, Math.floor(Number(options.n) || 1));
    for (let i = 0; i < total; i += n) groups.push(doc.getPageIndices().slice(i, i + n));
  } else {
    const parts = str(options.ranges).split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) throw new Error("Type at least one range, for example 1-3, 4-6.");
    groups = parts.map((p) => parsePages(p, total));
  }
  if (groups.length > MAX_PARTS) throw new Error(`That would make ${groups.length} files. The limit is ${MAX_PARTS}.`);
  if (groups.length < 2 && mode !== "ranges") throw new Error("This PDF is too short to split that way.");
  const zip = new JSZip();
  const base = stem(inputs[0].name);
  const width = String(groups.length).length;
  for (let g = 0; g < groups.length; g++) zip.file(`${base}-part${String(g + 1).padStart(width, "0")}.pdf`, await pick(doc, groups[g]));
  return zipOut(`${base}-split.zip`, zip);
}

async function remove({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  const spec = str(options.pages).trim();
  if (!spec) throw new Error("Type the pages to remove, for example 2, 5-7.");
  const drop = new Set(parsePages(spec, doc.getPageCount()));
  const keep = doc.getPageIndices().filter((i) => !drop.has(i));
  if (!keep.length) throw new Error("That would remove every page.");
  return pdfOut(`${stem(inputs[0].name)}-trimmed.pdf`, await pick(doc, keep));
}

async function extract({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  const spec = str(options.pages).trim();
  if (!spec) throw new Error("Type the pages to keep, for example 1-3, 8.");
  const keep = parsePages(spec, doc.getPageCount()).sort((a, b) => a - b);
  return pdfOut(`${stem(inputs[0].name)}-extract.pdf`, await pick(doc, keep));
}

async function organize({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  return pdfOut(`${stem(inputs[0].name)}-organized.pdf`, await pick(doc, parseOrder(str(options.order), doc.getPageCount())));
}

const SIZES: Record<string, [number, number]> = { a4: [595.28, 841.89], letter: [612, 792] };
async function imagesToPdf({ inputs, options }: Ctx): Promise<Output> {
  const out = await PDFDocument.create();
  const size = SIZES[str(options.size, "fit")];
  const margin = size ? Math.min(100, Math.max(0, Number(options.margin) || 0)) : 0;
  for (const i of inputs) {
    let img;
    try {
      const jpeg = i.bytes[0] === 0xff && i.bytes[1] === 0xd8;
      const png = i.bytes[0] === 0x89 && i.bytes[1] === 0x50;
      if (jpeg) img = await out.embedJpg(i.bytes);
      else if (png) img = await out.embedPng(i.bytes);
      else img = await out.embedPng(await sharp(i.bytes).rotate().png().toBuffer());
    } catch {
      throw new Error(`"${i.name}" could not be read as an image.`);
    }
    if (!size) {
      out.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      continue;
    }
    const landscape = img.width > img.height;
    const [pw, ph] = landscape ? [size[1], size[0]] : size;
    const k = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
    const w = img.width * k;
    const h = img.height * k;
    out.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
  }
  return pdfOut("images.pdf", await out.save());
}

async function pdfToImages({ inputs, options }: Ctx): Promise<Output> {
  const mupdf = await import("mupdf");
  let doc;
  try {
    doc = mupdf.Document.openDocument(inputs[0].bytes, "application/pdf");
  } catch {
    throw new Error(`"${inputs[0].name}" could not be read as a PDF.`);
  }
  try {
    if (doc.needsPassword()) throw new Error(`"${inputs[0].name}" is password protected. Remove the password first.`);
    const total = doc.countPages();
    const idx = parsePages(str(options.pages, "all"), total);
    if (idx.length > 100) throw new Error("Pick 100 pages or fewer at a time.");
    const jpg = str(options.format) === "jpg";
    const dpi = [96, 150, 220].includes(Number(options.dpi)) ? Number(options.dpi) : 150;
    const scale = dpi / 72;
    const zip = new JSZip();
    const base = stem(inputs[0].name);
    const width = String(total).length;
    for (const i of idx) {
      const page = doc.loadPage(i);
      const [x0, y0, x1, y1] = page.getBounds();
      if (((x1 - x0) * scale) * ((y1 - y0) * scale) > 40_000_000) throw new Error(`Page ${i + 1} is too large to render at this quality. Choose a lower one.`);
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      zip.file(`${base}-page${String(i + 1).padStart(width, "0")}.${jpg ? "jpg" : "png"}`, jpg ? pix.asJPEG(90, false) : pix.asPNG());
      pix.destroy();
      page.destroy();
    }
    return zipOut(`${base}-images.zip`, zip);
  } finally {
    doc.destroy();
  }
}


const COLORS: Record<string, [number, number, number]> = { black: [0, 0, 0], gray: [0.45, 0.45, 0.45], red: [0.8, 0.1, 0.1], blue: [0.1, 0.25, 0.8] };
const num = (v: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) && v !== "" ? Number(v) : d));
const textOut = (name: string, text: string, type: string): Output => ({ name, bytes: new TextEncoder().encode(text), type });

/** Draws one line of text near a corner or edge of a page. */
function place(page: PDFPage, text: string, font: PDFFont, size: number, pos: string, color: [number, number, number]) {
  const { width, height } = page.getSize();
  const w = font.widthOfTextAtSize(text, size);
  const m = 28;
  const x = pos.endsWith("l") ? m : pos.endsWith("r") ? width - m - w : (width - w) / 2;
  const y = pos.startsWith("t") ? height - m - size * 0.8 : pos === "c" ? (height - size) / 2 : m;
  page.drawText(text, { x, y, size, font, color: rgb(...color) });
}
async function withFont(run: () => Promise<Output>): Promise<Output> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Error && /WinAnsi|cannot encode/i.test(e.message)) throw new Error("This tool can only write letters, numbers and common punctuation (no emoji or non-Latin scripts) for now.");
    throw e;
  }
}

async function pageNumbers({ inputs, options }: Ctx): Promise<Output> {
  return withFont(async () => {
    const doc = await open(inputs[0]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    const start = Math.floor(num(options.start, 1, 0, 9999));
    const size = num(options.size, 11, 6, 48);
    const fmt = str(options.format, "n");
    const total = pages.length + start - 1;
    for (const i of parsePages(str(options.pages, "all"), pages.length)) {
      const n = start + i;
      place(pages[i], fmt === "of" ? `Page ${n} of ${total}` : fmt === "page" ? `Page ${n}` : String(n), font, size, str(options.pos, "bc"), COLORS.black);
    }
    return pdfOut(`${stem(inputs[0].name)}-numbered.pdf`, await doc.save());
  });
}

async function watermark({ inputs, options }: Ctx): Promise<Output> {
  const text = str(options.text).trim();
  if (!text) throw new Error("Type the watermark text.");
  return withFont(async () => {
    const doc = await open(inputs[0]);
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const pages = doc.getPages();
    const deg = Number(options.angle) === 0 ? 0 : 45;
    const rad = (deg * Math.PI) / 180;
    const opacity = num(options.opacity, 25, 10, 100) / 100;
    const color = COLORS[str(options.color, "gray")] ?? COLORS.gray;
    for (const i of parsePages(str(options.pages, "all"), pages.length)) {
      const pg = pages[i];
      const { width, height } = pg.getSize();
      let size = num(options.size, 64, 12, 200);
      const fit = (Math.min(width, height) * (deg ? 1.2 : 0.9)) / font.widthOfTextAtSize(text, size);
      if (fit < 1) size *= fit;
      const w = font.widthOfTextAtSize(text, size);
      const h = size * 0.7;
      const cx = width / 2;
      const cy = height / 2;
      const x = cx - ((w / 2) * Math.cos(rad) - (h / 2) * Math.sin(rad));
      const y = cy - ((w / 2) * Math.sin(rad) + (h / 2) * Math.cos(rad));
      pg.drawText(text, { x, y, size, font, color: rgb(...color), opacity, rotate: degrees(deg) });
    }
    return pdfOut(`${stem(inputs[0].name)}-watermarked.pdf`, await doc.save());
  });
}

async function crop({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  const pt = (k: string) => (num(options[k], 0, 0, 300) * 72) / 25.4;
  const [t, r, b, l] = [pt("top"), pt("right"), pt("bottom"), pt("left")];
  const pages = doc.getPages();
  for (const i of parsePages(str(options.pages, "all"), pages.length)) {
    const pg = pages[i];
    const box = pg.getCropBox();
    const w = box.width - l - r;
    const h = box.height - t - b;
    if (w < 36 || h < 36) throw new Error(`Page ${i + 1} would be too small after cropping. Use smaller margins.`);
    pg.setCropBox(box.x + l, box.y + b, w, h);
    pg.setMediaBox(box.x + l, box.y + b, w, h);
  }
  return pdfOut(`${stem(inputs[0].name)}-cropped.pdf`, await doc.save());
}

async function addText({ inputs, options }: Ctx): Promise<Output> {
  const text = str(options.text).trim();
  if (!text) throw new Error("Type the text to add.");
  return withFont(async () => {
    const doc = await open(inputs[0]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();
    for (const i of parsePages(str(options.pages, "all"), pages.length)) place(pages[i], text, font, num(options.size, 12, 6, 96), str(options.pos, "tl"), COLORS[str(options.color, "black")] ?? COLORS.black);
    return pdfOut(`${stem(inputs[0].name)}-text.pdf`, await doc.save());
  });
}

async function openMu(i: Input, password = "") {
  const mupdf = await import("mupdf");
  let doc;
  try {
    doc = mupdf.Document.openDocument(i.bytes, "application/pdf");
  } catch {
    throw new Error(`"${i.name}" could not be read as a PDF.`);
  }
  if (doc.needsPassword() && !doc.authenticatePassword(password)) {
    doc.destroy();
    throw new Error(password ? "That password is not correct." : `"${i.name}" is password protected. Enter its password.`);
  }
  return { mupdf, doc };
}
const asPdf = (doc: { asPDF(): unknown }, name: string) => {
  const pdf = doc.asPDF() as { saveToBuffer(o: string): { asUint8Array(): Uint8Array } } | null;
  if (!pdf) throw new Error(`"${name}" is not a PDF.`);
  return pdf;
};

async function protect({ inputs, options }: Ctx): Promise<Output> {
  const pw = str(options.password);
  if (pw.length < 4) throw new Error("Use a password of at least 4 characters.");
  if (/[,=]/.test(pw)) throw new Error("Please avoid commas and equals signs in the password.");
  const { doc } = await openMu(inputs[0]);
  try {
    const bytes = asPdf(doc, inputs[0].name).saveToBuffer(`encrypt=aes-256,user-password=${pw},owner-password=${pw}`);
    return pdfOut(`${stem(inputs[0].name)}-protected.pdf`, new Uint8Array(bytes.asUint8Array()));
  } finally {
    doc.destroy();
  }
}

async function unlock({ inputs, options }: Ctx): Promise<Output> {
  const { doc } = await openMu(inputs[0], str(options.password));
  try {
    const bytes = asPdf(doc, inputs[0].name).saveToBuffer("encrypt=none");
    return pdfOut(`${stem(inputs[0].name)}-unlocked.pdf`, new Uint8Array(bytes.asUint8Array()));
  } finally {
    doc.destroy();
  }
}

async function metadata({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  if (options.clear) {
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setCreator("");
    doc.setProducer("");
  }
  const t = str(options.title).trim();
  const a = str(options.author).trim();
  const s = str(options.subject).trim();
  const k = str(options.keywords).split(",").map((x) => x.trim()).filter(Boolean);
  if (t) doc.setTitle(t);
  if (a) doc.setAuthor(a);
  if (s) doc.setSubject(s);
  if (k.length) doc.setKeywords(k);
  if (!options.clear && !t && !a && !s && !k.length) throw new Error("Fill in at least one detail, or tick the box to remove them.");
  return pdfOut(`${stem(inputs[0].name)}-details.pdf`, await doc.save({ updateFieldAppearances: false }));
}

async function pdfToText({ inputs, options }: Ctx): Promise<Output> {
  const { doc } = await openMu(inputs[0]);
  try {
    const idx = parsePages(str(options.pages, "all"), doc.countPages());
    let out = "";
    for (const i of idx) {
      const page = doc.loadPage(i);
      const t = page.toStructuredText("preserve-whitespace").asText().trim();
      out += (options.marks ? `--- Page ${i + 1} ---\n\n` : "") + t + "\n\n";
      page.destroy();
    }
    if (!out.replace(/--- Page \d+ ---/g, "").trim()) throw new Error("No text was found. This looks like a scanned PDF, which needs OCR (coming later).");
    return textOut(`${stem(inputs[0].name)}.txt`, out.trimEnd() + "\n", "text/plain; charset=utf-8");
  } finally {
    doc.destroy();
  }
}

type Line = { text: string; size: number; bold: boolean };
async function pdfToMarkdown({ inputs, options }: Ctx): Promise<Output> {
  const { doc } = await openMu(inputs[0]);
  try {
    const idx = parsePages(str(options.pages, "all"), doc.countPages());
    const pages: Line[][][] = [];
    const sizes = new Map<number, number>();
    for (const i of idx) {
      const page = doc.loadPage(i);
      const json = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON()) as { blocks: { type: string; lines?: { font: { size: number; weight: string }; text: string }[] }[] };
      const blocks: Line[][] = [];
      for (const b of json.blocks) {
        if (b.type !== "text" || !b.lines) continue;
        const lines = b.lines.map((l) => ({ text: l.text.trim(), size: Math.round(l.font.size * 2) / 2, bold: l.font.weight === "bold" })).filter((l) => l.text);
        for (const l of lines) sizes.set(l.size, (sizes.get(l.size) ?? 0) + l.text.length);
        if (lines.length) blocks.push(lines);
      }
      pages.push(blocks);
      page.destroy();
    }
    let body = 11;
    let best = 0;
    for (const [s, n] of sizes) if (n > best) ((body = s), (best = n));
    const md: string[] = [];
    pages.forEach((blocks, pi) => {
      for (const lines of blocks) {
        const head = lines[0];
        const level = head.size >= body * 1.6 ? 1 : head.size >= body * 1.3 ? 2 : head.size >= body * 1.12 && head.bold ? 3 : 0;
        if (level && lines.every((l) => l.size === head.size)) {
          md.push(`${"#".repeat(level)} ${lines.map((l) => l.text).join(" ")}`);
          continue;
        }
        const items: string[] = [];
        for (const l of lines) {
          const li = /^([•▪◦●○\-–*]|\d+[.)])\s+(.*)$/.exec(l.text);
          if (li) items.push(`${/^\d/.test(li[1]) ? li[1].replace(")", ".") : "-"} ${li[2]}`);
          else if (items.length && /^(- |\d+\. )/.test(items[items.length - 1])) items[items.length - 1] += ` ${l.text}`;
          else items.push(l.text);
        }
        const isList = items.some((x) => /^(- |\d+\. )/.test(x));
        md.push(isList ? items.join("\n") : items.join(" "));
      }
      if (options.marks && pi < pages.length - 1) md.push("---");
    });
    if (!md.length) throw new Error("No text was found. This looks like a scanned PDF, which needs OCR (coming later).");
    return textOut(`${stem(inputs[0].name)}.md`, md.join("\n\n") + "\n", "text/markdown; charset=utf-8");
  } finally {
    doc.destroy();
  }
}

export const PROCESSORS: Record<string, (c: Ctx) => Promise<Output>> = { merge, rotate, split, remove, extract, organize, "images-to-pdf": imagesToPdf, "pdf-to-images": pdfToImages, "page-numbers": pageNumbers, watermark, crop, "add-text": addText, protect, unlock, metadata, "pdf-to-text": pdfToText, "pdf-to-markdown": pdfToMarkdown };
