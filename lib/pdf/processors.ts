import "server-only";
import { degrees, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { drawLine, loadFonts, widthOf, wrapText } from "./fonts";
import { parseOrder, parsePages } from "./pages";

export type Input = { name: string; bytes: Uint8Array };
export type Output = { name: string; bytes: Uint8Array; type: string; note?: string };
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
export type Block = { t: "h"; level: number; text: string } | { t: "li"; ordered: boolean; text: string } | { t: "p"; text: string } | { t: "pb" };
type MuDoc = Awaited<ReturnType<typeof openMu>>["doc"];

/** Reads the text of the chosen pages as headings, list items and paragraphs. Headings are guessed from font size. */
function readBlocks(doc: MuDoc, idx: number[]): Block[] {
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
  const out: Block[] = [];
  pages.forEach((blocks, pi) => {
    for (const lines of blocks) {
      const head = lines[0];
      const level = head.size >= body * 1.6 ? 1 : head.size >= body * 1.3 ? 2 : head.size >= body * 1.12 && head.bold ? 3 : 0;
      if (level && lines.every((l) => l.size === head.size)) {
        out.push({ t: "h", level, text: lines.map((l) => l.text).join(" ") });
        continue;
      }
      const items: Block[] = [];
      const para: string[] = [];
      const flush = () => {
        if (para.length) out.push({ t: "p", text: para.join(" ") });
        para.length = 0;
      };
      for (const l of lines) {
        const li = /^([•▪◦●○\-–*]|\d+[.)])\s+(.*)$/.exec(l.text);
        if (li) {
          flush();
          const it: Block = { t: "li", ordered: /^\d/.test(li[1]), text: li[2] };
          items.push(it);
          out.push(it);
        } else if (items.length && out[out.length - 1].t === "li") (out[out.length - 1] as { text: string }).text += ` ${l.text}`;
        else para.push(l.text);
      }
      flush();
    }
    if (pi < pages.length - 1) out.push({ t: "pb" });
  });
  return out;
}
const hasText = (bl: Block[]) => bl.some((b) => b.t !== "pb");
const NOTEXT = "No text was found. This looks like a scanned PDF, which needs OCR (coming later).";

async function pdfToMarkdown({ inputs, options }: Ctx): Promise<Output> {
  const { doc } = await openMu(inputs[0]);
  try {
    const bl = readBlocks(doc, parsePages(str(options.pages, "all"), doc.countPages()));
    if (!hasText(bl)) throw new Error(NOTEXT);
    const md: string[] = [];
    let list: string[] = [];
    let n = 0;
    const flush = () => {
      if (list.length) md.push(list.join("\n"));
      list = [];
      n = 0;
    };
    for (const b of bl) {
      if (b.t === "li") list.push(b.ordered ? `${++n}. ${b.text}` : `- ${b.text}`);
      else {
        flush();
        if (b.t === "h") md.push(`${"#".repeat(b.level)} ${b.text}`);
        else if (b.t === "p") md.push(b.text);
        else if (options.marks) md.push("---");
      }
    }
    flush();
    return textOut(`${stem(inputs[0].name)}.md`, md.join("\n\n") + "\n", "text/markdown; charset=utf-8");
  } finally {
    doc.destroy();
  }
}

async function pdfToWord({ inputs, options }: Ctx): Promise<Output> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const { doc } = await openMu(inputs[0]);
  try {
    const bl = readBlocks(doc, parsePages(str(options.pages, "all"), doc.countPages()));
    if (!hasText(bl)) throw new Error(NOTEXT);
    const H = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
    const kids = bl.flatMap((b) => {
      if (b.t === "pb") return [];
      if (b.t === "h") return [new Paragraph({ heading: H[b.level - 1], children: [new TextRun(b.text)] })];
      if (b.t === "li") return [new Paragraph({ bullet: { level: 0 }, children: [new TextRun(b.text)] })];
      return [new Paragraph({ spacing: { after: 140 }, children: [new TextRun(b.text)] })];
    });
    const bytes = await Packer.toBuffer(new Document({ sections: [{ children: kids }] }));
    return { name: `${stem(inputs[0].name)}.docx`, bytes: new Uint8Array(bytes), type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", note: "Text and headings only. Pictures and exact layout are not carried over." };
  } finally {
    doc.destroy();
  }
}

type Word = { x0: number; x1: number; y: number; size: number; text: string };
/** Words on a page with their positions. */
function pageWords(page: ReturnType<MuDoc["loadPage"]>): Word[] {
  const words: Word[] = [];
  let cur: Word | null = null;
  page.toStructuredText("preserve-whitespace").walk({
    beginLine() {
      cur = null;
    },
    onChar(c, origin, _f, size, quad) {
      if (c === " " || c === "\u00a0" || c === "\t") {
        cur = null;
        return;
      }
      const x1 = Math.max(quad[0], quad[2], quad[4], quad[6]);
      if (cur && origin[0] - cur.x1 < size * 0.6) {
        cur.text += c;
        cur.x1 = x1;
      } else {
        cur = { x0: origin[0], x1, y: origin[1], size, text: c };
        words.push(cur);
      }
    },
    endLine() {
      cur = null;
    },
  });
  return words;
}

async function pdfToExcel({ inputs, options }: Ctx): Promise<Output> {
  const ExcelJS = (await import("exceljs")).default;
  const { doc } = await openMu(inputs[0]);
  try {
    const idx = parsePages(str(options.pages, "all"), doc.countPages());
    const wb = new ExcelJS.Workbook();
    let cells = 0;
    for (const i of idx) {
      const page = doc.loadPage(i);
      const words = pageWords(page).sort((a, b) => a.y - b.y || a.x0 - b.x0);
      page.destroy();
      const rows: Word[][] = [];
      for (const w of words) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last[0].y - w.y) < w.size * 0.5) last.push(w);
        else rows.push([w]);
      }
      const table: { x0: number; text: string }[][] = rows.map((r) => {
        r.sort((a, b) => a.x0 - b.x0);
        const row: { x0: number; x1: number; text: string }[] = [];
        for (const w of r) {
          const l = row[row.length - 1];
          if (l && w.x0 - l.x1 < w.size * 1.3) {
            l.text += ` ${w.text}`;
            l.x1 = w.x1;
          } else row.push({ x0: w.x0, x1: w.x1, text: w.text });
        }
        return row;
      });
      const anchors: number[] = [];
      for (const x of table.flat().map((c) => c.x0).sort((a, b) => a - b)) if (!anchors.length || x - anchors[anchors.length - 1] > 8) anchors.push(x);
      const ws = wb.addWorksheet(`Page ${i + 1}`);
      table.forEach((row, ri) => {
        row.forEach((c) => {
          let col = 0;
          while (col + 1 < anchors.length && c.x0 - anchors[col + 1] > -8) col++;
          const cell = ws.getCell(ri + 1, col + 1);
          cell.value = cell.value ? `${cell.value} ${c.text}` : /^-?\d+(\.\d+)?$/.test(c.text) ? Number(c.text) : c.text;
          cells++;
        });
      });
      ws.columns.forEach((c) => (c.width = 18));
    }
    if (!cells) throw new Error(NOTEXT);
    const bytes = await wb.xlsx.writeBuffer();
    return { name: `${stem(inputs[0].name)}.xlsx`, bytes: new Uint8Array(bytes as ArrayBuffer), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", note: "Works best on PDFs made from spreadsheets or tables. Check the columns before you rely on them." };
  } finally {
    doc.destroy();
  }
}

async function pdfToPowerpoint({ inputs, options }: Ctx): Promise<Output> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const { mupdf, doc } = await openMu(inputs[0]);
  try {
    const idx = parsePages(str(options.pages, "all"), doc.countPages());
    if (idx.length > 100) throw new Error("Pick 100 pages or fewer at a time.");
    const pptx = new PptxGenJS();
    const picture = str(options.mode, "picture") === "picture";
    if (picture) {
      const [x0, y0, x1, y1] = doc.loadPage(idx[0]).getBounds();
      pptx.defineLayout({ name: "PAGE", width: (x1 - x0) / 72, height: (y1 - y0) / 72 });
      pptx.layout = "PAGE";
      for (const i of idx) {
        const page = doc.loadPage(i);
        const pix = page.toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
        const png = Buffer.from(pix.asPNG()).toString("base64");
        pptx.addSlide().addImage({ data: `image/png;base64,${png}`, x: 0, y: 0, w: "100%", h: "100%" });
        pix.destroy();
        page.destroy();
      }
    } else {
      pptx.layout = "LAYOUT_WIDE";
      const bl = readBlocks(doc, idx);
      if (!hasText(bl)) throw new Error(NOTEXT);
      let slide = pptx.addSlide();
      let used = false;
      const lines: string[] = [];
      let title = "";
      const emit = () => {
        if (!used) return;
        slide.addText(title || "Page", { x: 0.5, y: 0.3, w: 12.3, h: 0.9, fontSize: 28, bold: true });
        slide.addText(lines.join("\n"), { x: 0.5, y: 1.4, w: 12.3, h: 5.6, fontSize: 16, valign: "top", fit: "shrink" });
      };
      for (const b of bl) {
        if (b.t === "pb") {
          emit();
          slide = pptx.addSlide();
          used = false;
          lines.length = 0;
          title = "";
        } else {
          used = true;
          if (b.t === "h" && !title) title = b.text;
          else lines.push(b.t === "li" ? `• ${b.text}` : b.text);
        }
      }
      emit();
    }
    const bytes = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
    return { name: `${stem(inputs[0].name)}.pptx`, bytes, type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  } finally {
    doc.destroy();
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
async function pagesText(i: Input): Promise<string[]> {
  const { doc } = await openMu(i);
  try {
    const out: string[] = [];
    for (let p = 0; p < doc.countPages(); p++) {
      const page = doc.loadPage(p);
      out.push(page.toStructuredText("preserve-whitespace").asText());
      page.destroy();
    }
    return out;
  } finally {
    doc.destroy();
  }
}

async function compare({ inputs, options }: Ctx): Promise<Output> {
  const { diffLines } = await import("diff");
  const [a, b] = await Promise.all([pagesText(inputs[0]), pagesText(inputs[1])]);
  const ignore = options.ignore !== false;
  const norm = (s: string) => (ignore ? s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n") + "\n" : s);
  let added = 0;
  let removed = 0;
  let changedPages = 0;
  let html = "";
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const parts = diffLines(norm(a[i] ?? ""), norm(b[i] ?? ""));
    const diffs = parts.filter((p) => p.added || p.removed);
    if (!diffs.length) continue;
    changedPages++;
    html += `<h2>Page ${i + 1}${i >= a.length ? " (only in the second file)" : i >= b.length ? " (only in the first file)" : ""}</h2>`;
    for (const p of parts) {
      const n = p.value.split("\n").filter((l) => l.trim()).length;
      if (p.added) added += n;
      if (p.removed) removed += n;
      if (p.added || p.removed) html += `<pre class="${p.added ? "add" : "del"}">${esc(p.value.trimEnd())}</pre>`;
    }
  }
  const summary = changedPages ? `${changedPages} page${changedPages > 1 ? "s" : ""} differ: ${removed} line${removed === 1 ? "" : "s"} removed, ${added} added.` : "No text differences found.";
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PDF comparison</title><style>body{font:16px/1.5 Arial,sans-serif;max-width:860px;margin:2rem auto;padding:0 1rem;color:#1c1917}h1{font-size:1.5rem}h2{font-size:1.05rem;margin-top:2rem;border-bottom:1px solid #d6d3d1}pre{white-space:pre-wrap;margin:.3rem 0;padding:.4rem .6rem;font:14px/1.5 Arial,sans-serif}.add{background:#dcfce7;border-left:4px solid #16a34a}.del{background:#fee2e2;border-left:4px solid #dc2626;text-decoration:line-through}.meta{color:#57534e}</style></head><body><h1>PDF comparison</h1><p class="meta">Original: ${esc(inputs[0].name)}<br>Changed: ${esc(inputs[1].name)}</p><p><strong>${summary}</strong> <span class="meta">Red is only in the original, green is only in the changed file.${a.length !== b.length ? ` Page counts differ (${a.length} and ${b.length}).` : ""}</span></p>${html}</body></html>`;
  return { name: "comparison.html", bytes: new TextEncoder().encode(page), type: "text/html; charset=utf-8", note: summary };
}

async function redact({ inputs, options }: Ctx): Promise<Output> {
  const terms = str(options.terms).split("\n").map((t) => t.trim()).filter(Boolean);
  if (terms.length > 100) throw new Error("Use 100 words or phrases at most.");
  if (!terms.length && !options.emails && !options.phones) throw new Error("Type at least one word to redact, or tick emails or phone numbers.");
  const { mupdf, doc } = await openMu(inputs[0]);
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error(`"${inputs[0].name}" is not a PDF.`);
    const preview = str(options.mode, "redact") === "preview";
    const idx = parsePages(str(options.pages, "all"), pdf.countPages());
    const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
    const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
    let hits = 0;
    const pagesHit = new Set<number>();
    for (const i of idx) {
      const page = pdf.loadPage(i) as ReturnType<typeof pdf.loadPage> & { createAnnotation(t: string): any; applyRedactions(b?: boolean, i?: number, l?: number, t?: number): void; update(): boolean };
      const st = page.toStructuredText("preserve-whitespace");
      const text = st.asText();
      const needles = new Set<string>(terms);
      if (options.emails) for (const m of text.match(EMAIL) ?? []) needles.add(m);
      if (options.phones) for (const m of text.match(PHONE) ?? []) needles.add(m.trim());
      let any = false;
      for (const needle of needles) {
        for (const quads of page.search(needle, "ignore-case") as number[][][]) {
          const flat = quads.flat();
          const xs = flat.filter((_, k) => k % 2 === 0);
          const ys = flat.filter((_, k) => k % 2 === 1);
          const rect: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          if (preview) {
            const a = page.createAnnotation("Highlight");
            a.setQuadPoints(quads as never);
            a.setColor([1, 0.85, 0]);
            a.update();
          } else {
            const a = page.createAnnotation("Redact");
            a.setRect(rect);
            a.update();
          }
          hits++;
          any = true;
        }
      }
      if (any) {
        pagesHit.add(i + 1);
        if (!preview) page.applyRedactions(true, 2, 1, 0);
      }
      page.destroy();
    }
    if (!hits) throw new Error("None of those words were found. Nothing was changed.");
    const bytes = pdf.saveToBuffer("garbage=deduplicate,compress=yes").asUint8Array();
    const where = `${hits} match${hits === 1 ? "" : "es"} on ${pagesHit.size} page${pagesHit.size === 1 ? "" : "s"}`;
    return { name: `${stem(inputs[0].name)}-${preview ? "preview" : "redacted"}.pdf`, bytes: new Uint8Array(bytes), type: "application/pdf", note: preview ? `${where} highlighted. Nothing has been removed yet. Choose "Redact for real" to black them out.` : `${where} redacted. The text underneath was removed.` };
  } finally {
    doc.destroy();
  }
}

async function compress({ inputs, options }: Ctx): Promise<Output> {
  const before = inputs[0].bytes.length;
  const { mupdf, doc } = await openMu(inputs[0]);
  try {
    let bytes: Uint8Array;
    if (str(options.level, "normal") === "strong") {
      const dpi = [80, 110, 150].includes(Number(options.dpi)) ? Number(options.dpi) : 110;
      const n = doc.countPages();
      if (n > 150) throw new Error("Smallest mode handles 150 pages at most. Use Normal or split the file first.");
      const out = await PDFDocument.create();
      for (let i = 0; i < n; i++) {
        const page = doc.loadPage(i);
        const [x0, y0, x1, y1] = page.getBounds();
        const pix = page.toPixmap(mupdf.Matrix.scale(dpi / 72, dpi / 72), mupdf.ColorSpace.DeviceRGB, false, true);
        const img = await out.embedJpg(pix.asJPEG(70, false));
        out.addPage([x1 - x0, y1 - y0]).drawImage(img, { x: 0, y: 0, width: x1 - x0, height: y1 - y0 });
        pix.destroy();
        page.destroy();
      }
      bytes = await out.save();
    } else {
      const pdf = doc.asPDF();
      if (!pdf) throw new Error(`"${inputs[0].name}" is not a PDF.`);
      bytes = new Uint8Array(pdf.saveToBuffer("garbage=deduplicate,compress=yes,compress-images=yes,compress-fonts=yes,clean=yes").asUint8Array());
    }
    const same = bytes.length >= before;
    const pct = Math.round((1 - bytes.length / before) * 100);
    return { name: `${stem(inputs[0].name)}-compressed.pdf`, bytes: same ? inputs[0].bytes : bytes, type: "application/pdf", note: same ? "This file is already as small as Normal mode can make it. Try Smallest." : `Made ${pct}% smaller.` };
  } finally {
    doc.destroy();
  }
}

const TESS_LANGS = new Set(["eng", "hin", "spa", "fra", "deu"]);
/** Copies the bundled language files to a writable folder once, so the OCR engine can read them. */
async function langDir(codes: string[]): Promise<string> {
  const dir = path.join(os.tmpdir(), "papernest-tess");
  await fs.mkdir(dir, { recursive: true });
  for (const c of codes) {
    const dest = path.join(dir, `${c}.traineddata.gz`);
    if (await fs.stat(dest).then(() => true, () => false)) continue;
    const src = path.join(process.cwd(), "node_modules", "@tesseract.js-data", c, "4.0.0_best_int", `${c}.traineddata.gz`);
    await fs.copyFile(src, `${dest}.tmp`).catch(() => {
      throw new Error("The reading engine is not available on this server.");
    });
    await fs.rename(`${dest}.tmp`, dest);
  }
  return dir;
}

async function ocr({ inputs, options }: Ctx): Promise<Output> {
  const started = Date.now();
  const input = inputs[0];
  const lang = str(options.lang, "eng");
  const codes = lang.split("+");
  if (!codes.every((c) => TESS_LANGS.has(c))) throw new Error("That language is not available.");
  const wantPdf = str(options.output, "pdf") !== "txt";
  const DPI = 200;
  // 1. get page pictures
  const pics: { png: Buffer; wPt: number; hPt: number; label: number }[] = [];
  if (input.bytes[0] === 0x25 && input.bytes[1] === 0x50) {
    const { mupdf, doc } = await openMu(input);
    try {
      const idx = parsePages(str(options.pages, "all"), doc.countPages());
      if (idx.length > 40) throw new Error(`Reading ${idx.length} pages would take too long. Use the Pages box to do 40 or fewer at a time, for example 1-40.`);
      for (const i of idx) {
        const page = doc.loadPage(i);
        const [x0, y0, x1, y1] = page.getBounds();
        const pix = page.toPixmap(mupdf.Matrix.scale(DPI / 72, DPI / 72), mupdf.ColorSpace.DeviceRGB, false, true);
        pics.push({ png: Buffer.from(pix.asPNG()), wPt: x1 - x0, hPt: y1 - y0, label: i + 1 });
        pix.destroy();
        page.destroy();
      }
    } finally {
      doc.destroy();
    }
  } else {
    try {
      const img = sharp(input.bytes, { limitInputPixels: 120_000_000 }).rotate();
      const png = await img.png().toBuffer({ resolveWithObject: true });
      pics.push({ png: png.data, wPt: (png.info.width * 72) / DPI, hPt: (png.info.height * 72) / DPI, label: 1 });
    } catch {
      throw new Error(`"${input.name}" could not be read as an image or PDF.`);
    }
  }
  // 2. read the text
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(codes, 1, { langPath: await langDir(codes), gzip: true, cachePath: path.join(os.tmpdir(), "papernest-tess-cache") });
  let text = "";
  let words = 0;
  const out = wantPdf ? await PDFDocument.create() : null;
  try {
    for (const pic of pics) {
      if (Date.now() - started > 240_000) throw new Error("This took too long. Try fewer pages at a time using the Pages box.");
      const { data } = await worker.recognize(pic.png, {}, { pdf: wantPdf, text: true });
      const t = (data.text ?? "").trim();
      words += t ? t.split(/\s+/).length : 0;
      text += `${pics.length > 1 ? `--- Page ${pic.label} ---\n\n` : ""}${t}\n\n`;
      if (out) {
        const one = await PDFDocument.load(new Uint8Array(data.pdf as number[]));
        const [pg] = await out.copyPages(one, [0]);
        const k = Math.min(pic.wPt / pg.getWidth(), pic.hPt / pg.getHeight());
        pg.scaleContent(k, k);
        pg.setSize(pic.wPt, pic.hPt);
        out.addPage(pg);
      }
    }
  } finally {
    await worker.terminate();
  }
  if (!words) throw new Error("No text could be read. Check that the language is right and the scan is clear.");
  const note = `Read about ${words.toLocaleString("en")} words on ${pics.length} page${pics.length === 1 ? "" : "s"}. Check names and numbers, as scans can be misread.`;
  if (out) return { name: `${stem(input.name)}-searchable.pdf`, bytes: await out.save(), type: "application/pdf", note };
  return { ...textOut(`${stem(input.name)}.txt`, text.trimEnd() + "\n", "text/plain; charset=utf-8"), note };
}

type NewsItem = { jpg: Uint8Array; w: number; h: number; caption: string; source: string; n: number; cont: boolean };
const THEMES: Record<string, [number, number, number]> = { navy: [0.1, 0.2, 0.45], red: [0.75, 0.1, 0.12], green: [0.08, 0.45, 0.3], black: [0.1, 0.1, 0.1] };
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** Screenshots in, tidy daily-update PDF out: header, numbered clippings with source and caption, page numbers. */
async function newsPdf({ inputs, options }: Ctx): Promise<Output> {
  const meta = Array.isArray(options.items) ? (options.items as { caption?: unknown; source?: unknown }[]) : [];
  const title = clip(options.title, 90) || "Daily News Update";
  const date = clip(options.date, 60);
  const footer = clip(options.footer, 90);
  const landscape = str(options.orient) === "landscape";
  const layout = ["auto", "1", "2across", "2down", "4"].includes(str(options.layout)) ? str(options.layout, "auto") : "auto";
  const headerMode = ["every", "first", "none"].includes(str(options.header)) ? str(options.header) : "every";
  const accent = THEMES[str(options.theme, "navy")] ?? THEMES.navy;
  const numbers = options.numbers !== false;
  const trim = options.trim !== false;
  const splitTall = options.splitTall !== false;

  // 1. prepare pictures
  const items: NewsItem[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const caption = clip(meta[i]?.caption, 400);
    const source = clip(meta[i]?.source, 60);
    let buf: Buffer;
    let w: number;
    let h: number;
    try {
      let img = sharp(inputs[i].bytes, { limitInputPixels: 120_000_000 }).rotate().flatten({ background: "#ffffff" });
      if (trim) img = sharp(await img.png().toBuffer()).trim({ threshold: 14 });
      const r = await img.resize({ width: 1800, height: 9000, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
      buf = r.data;
      w = r.info.width;
      h = r.info.height;
    } catch {
      throw new Error(`"${inputs[i].name}" could not be read as an image.`);
    }
    const pieces: { buf: Buffer; w: number; h: number }[] = [];
    const chunk = Math.round(w * 1.35);
    if (splitTall && h > w * 2.1 && h > chunk * 1.3) {
      const n = Math.ceil(h / chunk);
      const each = Math.ceil(h / n);
      for (let k = 0; k < n; k++) {
        const top = k * each;
        const ph = Math.min(each, h - top);
        pieces.push({ buf: await sharp(buf).extract({ left: 0, top, width: w, height: ph }).toBuffer(), w, h: ph });
      }
    } else pieces.push({ buf, w, h });
    for (let k = 0; k < pieces.length; k++) {
      const jpg = await sharp(pieces[k].buf).flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      items.push({ jpg: new Uint8Array(jpg), w: pieces[k].w, h: pieces[k].h, caption: k === 0 ? caption : "", source: k === 0 ? source : "", n: i + 1, cont: k > 0 });
    }
  }
  if (items.length > 150) throw new Error("That would make too many pieces. Use fewer or shorter screenshots.");

  // 2. plan pages
  const [PW, PH] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const M = 34;
  type Plan = { kind: "1" | "2across" | "2down" | "4"; items: NewsItem[] };
  const plan: Plan[] = [];
  if (layout === "auto") {
    // Put two on a page only when both stay at least 62% of their single-page size.
    const g = 14;
    const aw = PW - M * 2;
    const ah = PH - M - (headerMode === "none" ? 0 : 39) - (M + 14) - 26;
    const fit = (it: NewsItem, cw: number, ch: number) => Math.min(cw / it.w, ch / it.h, 1.25);
    for (let i = 0; i < items.length; ) {
      const a = items[i];
      const b = items[i + 1];
      if (b) {
        const sa = fit(a, aw, ah);
        const sb = fit(b, aw, ah);
        const across = Math.min(fit(a, (aw - g) / 2, ah) / sa, fit(b, (aw - g) / 2, ah) / sb);
        const down = Math.min(fit(a, aw, (ah - g) / 2) / sa, fit(b, aw, (ah - g) / 2) / sb);
        if (Math.max(across, down) >= 0.62) {
          plan.push({ kind: across >= down ? "2across" : "2down", items: [a, b] });
          i += 2;
          continue;
        }
      }
      plan.push({ kind: "1", items: [a] });
      i += 1;
    }
  } else {
    const per = layout === "1" ? 1 : layout === "4" ? 4 : 2;
    for (let i = 0; i < items.length; i += per) plan.push({ kind: layout as Plan["kind"], items: items.slice(i, i + per) });
  }

  // 3. draw
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("PaperNest");
  const fonts = await loadFonts(doc);
  const total = plan.length;
  const imgQueue: { page: PDFPage; it: NewsItem; x: number; y: number; w: number; h: number }[] = [];
  const embedCache = new Map<NewsItem, Awaited<ReturnType<PDFDocument["embedJpg"]>>>();
  for (let pi = 0; pi < plan.length; pi++) {
    const page = doc.addPage([PW, PH]);
    const showHead = headerMode === "every" || (headerMode === "first" && pi === 0);
    let top = PH - M;
    if (showHead) {
      const ts = 17;
      drawLine(page, fonts.bold, title, M, top - ts, ts, accent);
      if (date) drawLine(page, fonts.regular, date, PW - M, top - 12, 9.5, [0.3, 0.3, 0.3], "right");
      page.drawRectangle({ x: M, y: top - ts - 9, width: PW - M * 2, height: 1.6, color: rgb(...accent) });
      top -= ts + 22;
    }
    const bottom = M + 14;
    drawLine(page, fonts.regular, footer, M, M - 6, 8, [0.45, 0.45, 0.45]);
    drawLine(page, fonts.regular, `Page ${pi + 1} of ${total}`, PW - M, M - 6, 8, [0.45, 0.45, 0.45], "right");
    const areaX = M;
    const areaW = PW - M * 2;
    const areaH = top - bottom;
    const gap = 14;
    const k = plan[pi].kind;
    const cols = k === "2across" || k === "4" ? 2 : 1;
    const rows = k === "2down" || k === "4" ? 2 : 1;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = (areaH - gap * (rows - 1)) / rows;
    plan[pi].items.forEach((it, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const cx = areaX + c * (cw + gap);
      const cyTop = top - r * (ch + gap);
      const labelBits = `${numbers ? `${it.n}. ` : ""}${it.cont ? "(continued)" : ""}`;
      const sz = 9;
      const srcText = it.source;
      const lines = it.caption ? wrapText(fonts.regular, it.caption, sz, cw - 2, k === "1" ? 5 : 3) : [];
      const head = [labelBits.trim(), srcText].filter(Boolean).join("  ");
      const capH = (head ? sz * 1.35 : 0) + lines.length * sz * 1.3 + (head || lines.length ? 6 : 0);
      const availH = ch - capH;
      const s = Math.min(cw / it.w, availH / it.h, 1.25);
      const dw = it.w * s;
      const dh = it.h * s;
      const ix = cx + (cw - dw) / 2;
      const iy = cyTop - dh;
      page.drawRectangle({ x: ix - 0.5, y: iy - 0.5, width: dw + 1, height: dh + 1, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.75 });
      imgQueue.push({ page, it, x: ix, y: iy, w: dw, h: dh });
      let ty = iy - 6 - sz;
      if (head) {
        const hasNum = labelBits.trim();
        let x = ix;
        if (hasNum) {
          drawLine(page, fonts.bold, labelBits.trim(), x, ty, sz, accent);
          x += widthOf(fonts.bold, labelBits.trim() + " ", sz);
        }
        if (srcText) drawLine(page, fonts.bold, srcText, x, ty, sz, [0.15, 0.15, 0.15]);
        ty -= sz * 1.35;
      }
      for (const ln of lines) {
        drawLine(page, fonts.regular, ln, ix, ty, sz, [0.25, 0.25, 0.25]);
        ty -= sz * 1.3;
      }
    });
  }
  for (const q of imgQueue) {
    let img = embedCache.get(q.it);
    if (!img) embedCache.set(q.it, (img = await doc.embedJpg(q.it.jpg)));
    q.page.drawImage(img, { x: q.x, y: q.y, width: q.w, height: q.h });
  }
  const safe = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "news";
  const when = date.match(/\d{1,2}\s+\w+\s+\d{4}/)?.[0]?.replace(/\s+/g, "-") ?? "";
  return { name: `${safe}${when ? `-${when}` : ""}.pdf`, bytes: await doc.save(), type: "application/pdf", note: `${inputs.length} screenshot${inputs.length === 1 ? "" : "s"} on ${total} page${total === 1 ? "" : "s"}.` };
}

export const PROCESSORS: Record<string, (c: Ctx) => Promise<Output>> = { merge, rotate, split, remove, extract, organize, "images-to-pdf": imagesToPdf, "pdf-to-images": pdfToImages, "page-numbers": pageNumbers, watermark, crop, "add-text": addText, protect, unlock, metadata, "pdf-to-text": pdfToText, "pdf-to-markdown": pdfToMarkdown, "pdf-to-word": pdfToWord, "pdf-to-excel": pdfToExcel, "pdf-to-powerpoint": pdfToPowerpoint, compare, redact, compress, ocr, "news-pdf": newsPdf };
