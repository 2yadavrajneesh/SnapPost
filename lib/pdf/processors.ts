import "server-only";
import { degrees, PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { drawLine, loadFonts, widthOf, wrapText } from "./fonts";
import { layoutNews, NEWS, splitPlan } from "./newsLayout";

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

const pdfOut = (name: string, bytes: Uint8Array): Output => ({ name, bytes, type: "application/pdf" });
const num = (v: unknown, d: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) && v !== "" ? Number(v) : d));

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
    for (const part of splitPlan(w, h, splitTall)) {
      pieces.push(part.h === h ? { buf, w, h } : { buf: await sharp(buf).extract({ left: 0, top: part.top, width: w, height: part.h }).toBuffer(), w, h: part.h });
    }
    for (let k = 0; k < pieces.length; k++) {
      const jpg = await sharp(pieces[k].buf).flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
      items.push({ jpg: new Uint8Array(jpg), w: pieces[k].w, h: pieces[k].h, caption: k === 0 ? caption : "", source: k === 0 ? source : "", n: i + 1, cont: k > 0 });
    }
  }
  if (items.length > 150) throw new Error("That would make too many pieces. Use fewer or shorter screenshots.");

  // 2. plan pages (shared with the live preview in the browser)
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("ClipBook");
  const fonts = await loadFonts(doc);
  const L = layoutNews(items, { layout, landscape, headerMode, numbers }, (t, w, sz, max) => wrapText(fonts.regular, t, sz, w, max));
  const { pw: PW, ph: PH, margin: M } = L;

  // 3. draw
  const total = L.pages.length;
  const imgQueue: { page: PDFPage; it: NewsItem; x: number; y: number; w: number; h: number }[] = [];
  const embedCache = new Map<NewsItem, Awaited<ReturnType<PDFDocument["embedJpg"]>>>();
  L.pages.forEach((pl, pi) => {
    const page = doc.addPage([PW, PH]);
    if (L.showHeadOn(pi)) {
      drawLine(page, fonts.bold, title, M, PH - L.headBase, NEWS.headSize, accent);
      if (date) drawLine(page, fonts.regular, date, PW - M, PH - L.dateBase, 9.5, [0.3, 0.3, 0.3], "right");
      page.drawRectangle({ x: M, y: PH - L.headRuleY, width: PW - M * 2, height: 1.6, color: rgb(...accent) });
    }
    drawLine(page, fonts.regular, footer, M, PH - L.footBase, 8, [0.45, 0.45, 0.45]);
    drawLine(page, fonts.regular, `Page ${pi + 1} of ${total}`, PW - M, PH - L.footBase, 8, [0.45, 0.45, 0.45], "right");
    for (const c of pl.cells) {
      const iy = PH - (c.y + c.h);
      page.drawRectangle({ x: c.x - 0.5, y: iy - 0.5, width: c.w + 1, height: c.h + 1, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.75 });
      imgQueue.push({ page, it: c.it, x: c.x, y: iy, w: c.w, h: c.h });
      let ty = PH - c.base;
      if (c.label || c.source) {
        let x = c.x;
        if (c.label) {
          drawLine(page, fonts.bold, c.label, x, ty, c.size, accent);
          x += widthOf(fonts.bold, c.label + " ", c.size);
        }
        if (c.source) drawLine(page, fonts.bold, c.source, x, ty, c.size, [0.15, 0.15, 0.15]);
        ty -= c.size * 1.35;
      }
      for (const ln of c.lines) {
        drawLine(page, fonts.regular, ln, c.x, ty, c.size, [0.25, 0.25, 0.25]);
        ty -= c.size * 1.3;
      }
    }
  });
  for (const q of imgQueue) {
    let img = embedCache.get(q.it);
    if (!img) embedCache.set(q.it, (img = await doc.embedJpg(q.it.jpg)));
    q.page.drawImage(img, { x: q.x, y: q.y, width: q.w, height: q.h });
  }
  const safe = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "news";
  const when = date.match(/\d{1,2}\s+\w+\s+\d{4}/)?.[0]?.replace(/\s+/g, "-") ?? "";
  return { name: `${safe}${when ? `-${when}` : ""}.pdf`, bytes: await doc.save(), type: "application/pdf", note: `${inputs.length} screenshot${inputs.length === 1 ? "" : "s"} on ${total} page${total === 1 ? "" : "s"}.` };
}

type EditAnn = { page?: number; k?: string; x?: number; y?: number; w?: number; h?: number; text?: string; size?: number; color?: string; bold?: boolean; width?: number; pts?: [number, number][]; data?: string };
const hexRgb = (hex: unknown): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(typeof hex === "string" ? hex : "");
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const unit = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(2, Math.max(-1, v)) : 0);

/** Applies the edits made in the page editor: text, shapes, highlights, drawings, signatures and pictures. */
async function editPdf({ inputs, options }: Ctx): Promise<Output> {
  const list = Array.isArray(options.annotations) ? (options.annotations as EditAnn[]) : [];
  if (!list.length) throw new Error("Nothing to save yet. Add some text, a highlight, a drawing or a signature first.");
  if (list.length > 2000) throw new Error("There are too many edits on this file. Save in two rounds.");
  const doc = await open(inputs[0]);
  const fonts = await loadFonts(doc);
  const pages = doc.getPages();
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  let applied = 0;
  for (const a of list) {
    const pi = Number(a.page);
    if (!Number.isInteger(pi) || pi < 0 || pi >= pages.length) continue;
    const page = pages[pi];
    if (page.getRotation().angle % 360 !== 0) throw new Error(`Page ${pi + 1} is rotated. Use Rotate PDF to turn it upright first, then edit it.`);
    const box = page.getCropBox();
    const W = box.width;
    const H = box.height;
    const X = (u: number) => box.x + unit(u) * W;
    const Y = (v: number) => box.y + H - unit(v) * H;
    const color = hexRgb(a.color);
    const lw = Math.min(30, Math.max(0.5, Number(a.width) || 2));
    if (a.k === "text") {
      const text = String(a.text ?? "").slice(0, 2000);
      const size = Math.min(120, Math.max(5, Number(a.size) || 14));
      text.split("\n").forEach((line, i) => drawLine(page, a.bold ? fonts.bold : fonts.regular, line, X(a.x as number), Y(a.y as number) - size * 0.95 - i * size * 1.25, size, color));
    } else if (a.k === "rect" || a.k === "highlight" || a.k === "white" || a.k === "ellipse") {
      const x = X(a.x as number);
      const w = Math.abs(unit(a.w) * W);
      const h = Math.abs(unit(a.h) * H);
      const y = Y(a.y as number) - h;
      if (a.k === "ellipse") page.drawEllipse({ x: x + w / 2, y: y + h / 2, xScale: w / 2, yScale: h / 2, borderColor: rgb(...color), borderWidth: lw });
      else if (a.k === "rect") page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(...color), borderWidth: lw });
      else if (a.k === "highlight") page.drawRectangle({ x, y, width: w, height: h, color: rgb(...color), opacity: 0.35 });
      else page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });
    } else if (a.k === "ink" && Array.isArray(a.pts) && a.pts.length > 1) {
      const pts = a.pts.slice(0, 20000);
      const d = pts.map(([u, v], i) => `${i ? "L" : "M"}${(unit(u) * W).toFixed(2)} ${(unit(v) * H).toFixed(2)}`).join(" ");
      page.drawSvgPath(d, { x: box.x, y: box.y + H, borderColor: rgb(...color), borderWidth: lw, borderLineCap: 1 });
    } else if (a.k === "image" && typeof a.data === "string") {
      const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(a.data);
      if (!m) continue;
      let img = images.get(a.data);
      if (!img) {
        const bytes = Buffer.from(m[2], "base64");
        img = m[1] === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
        images.set(a.data, img);
      }
      const w = Math.abs(unit(a.w) * W);
      const h = Math.abs(unit(a.h) * H);
      page.drawImage(img, { x: X(a.x as number), y: Y(a.y as number) - h, width: w, height: h });
    } else continue;
    applied++;
  }
  if (!applied) throw new Error("None of the edits could be applied.");
  return { ...pdfOut(`${stem(inputs[0].name)}-edited.pdf`, await doc.save()), note: `${applied} edit${applied === 1 ? "" : "s"} saved into the PDF.` };
}

export const PROCESSORS: Record<string, (c: Ctx) => Promise<Output>> = { "news-pdf": newsPdf, "edit-pdf": editPdf };
