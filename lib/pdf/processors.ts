import "server-only";
import { degrees, PDFDocument } from "pdf-lib";
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

export const PROCESSORS: Record<string, (c: Ctx) => Promise<Output>> = { merge, rotate, split, remove, extract, organize, "images-to-pdf": imagesToPdf, "pdf-to-images": pdfToImages };
