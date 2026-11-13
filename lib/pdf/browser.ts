/**
 * PDF operations that run entirely in the browser with pdf-lib, so files never leave the device
 * and there is no upload size limit. Page numbers in the signatures are 0-based unless noted.
 */
import { degrees, PDFArray, PDFDocument, PDFPage, rgb, StandardFonts } from "pdf-lib";

export type Bytes = Uint8Array;

export async function loadDoc(bytes: Bytes, name = "This file"): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new Error(`${name} is password protected. Remove the password first.`);
    throw new Error(`${name} could not be read as a PDF.`);
  }
}

/** "all", "odd", "even" or "1-3, 5, 8-" into 0-based page numbers (in the order written, no repeats). */
export function parseRange(text: string, count: number): number[] {
  const t = text.trim().toLowerCase();
  const all = Array.from({ length: count }, (_, i) => i);
  if (!t || t === "all") return all;
  if (t === "odd") return all.filter((i) => i % 2 === 0);
  if (t === "even") return all.filter((i) => i % 2 === 1);
  const out: number[] = [];
  for (const part of t.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    let a: number;
    let b: number;
    if (m && (m[1] || m[2])) {
      a = m[1] ? Number(m[1]) : 1;
      b = m[2] ? Number(m[2]) : count;
    } else if (/^\d+$/.test(part)) a = b = Number(part);
    else throw new Error(`"${part}" is not a page or a range. Use something like 1-3, 5.`);
    if (a > b) [a, b] = [b, a];
    if (a < 1 || b > count) throw new Error(`Page ${a < 1 ? a : b} does not exist. This file has ${count} page${count === 1 ? "" : "s"}.`);
    for (let p = a; p <= b; p++) if (!out.includes(p - 1)) out.push(p - 1);
  }
  if (!out.length) throw new Error("No pages chosen.");
  return out;
}

export async function mergePdfs(files: { name: string; bytes: Bytes }[]): Promise<Bytes> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const d = await loadDoc(f.bytes, `"${f.name}"`);
    const pages = await out.copyPages(d, d.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/** Builds a new PDF from the listed pages. `src` of -1 adds a blank page the size of the first page. `rot` turns it further. */
export async function organizePdf(bytes: Bytes, plan: { src: number; rot: number }[]): Promise<Bytes> {
  if (!plan.length) throw new Error("Keep at least one page.");
  const d = await loadDoc(bytes);
  const out = await PDFDocument.create();
  const [bw, bh] = (() => {
    const s = d.getPage(0).getSize();
    return [s.width, s.height];
  })();
  for (const p of plan) {
    if (p.src < 0) {
      out.addPage([bw, bh]);
      continue;
    }
    const [page] = await out.copyPages(d, [p.src]);
    if (p.rot) page.setRotation(degrees((((page.getRotation().angle + p.rot) % 360) + 360) % 360));
    out.addPage(page);
  }
  return out.save();
}

/** Turns pages by the given degrees (multiples of 90). Pages not listed stay as they are. */
export async function rotatePdf(bytes: Bytes, turn: Record<number, number>): Promise<Bytes> {
  const d = await loadDoc(bytes);
  d.getPages().forEach((p, i) => {
    const t = turn[i] ?? 0;
    if (t % 360) p.setRotation(degrees((((p.getRotation().angle + t) % 360) + 360) % 360));
  });
  return d.save();
}

export async function pickPages(bytes: Bytes, idx: number[]): Promise<Bytes> {
  const d = await loadDoc(bytes);
  const out = await PDFDocument.create();
  (await out.copyPages(d, idx)).forEach((p) => out.addPage(p));
  return out.save();
}

export type SplitMode = "ranges" | "every" | "each";
/** Cuts a PDF into parts. "ranges": "1-3, 4-6, 9"; "every": N pages per file; "each": one file per page. */
export async function splitPdf(bytes: Bytes, mode: SplitMode, spec: string, count: number): Promise<{ name: string; bytes: Bytes }[]> {
  let groups: number[][];
  if (mode === "each") groups = Array.from({ length: count }, (_, i) => [i]);
  else if (mode === "every") {
    const n = Math.max(1, Math.floor(Number(spec) || 1));
    groups = [];
    for (let i = 0; i < count; i += n) groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k));
  } else groups = spec.split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((s) => parseRange(s, count));
  if (!groups.length) throw new Error("Tell me where to split, for example 1-3, 4-6.");
  if (groups.length > 300) throw new Error("That would make more than 300 files. Use bigger parts.");
  const d = await loadDoc(bytes);
  const width = String(groups.length).length;
  const parts: { name: string; bytes: Bytes }[] = [];
  for (let g = 0; g < groups.length; g++) {
    const out = await PDFDocument.create();
    (await out.copyPages(d, groups[g])).forEach((p) => out.addPage(p));
    const a = groups[g][0] + 1;
    const b = groups[g][groups[g].length - 1] + 1;
    parts.push({ name: `part-${String(g + 1).padStart(width, "0")}-pages-${a === b ? a : `${a}-${b}`}.pdf`, bytes: await out.save() });
  }
  return parts;
}

/* ---------- plain ZIP writer (no compression: PDFs are already compressed) ---------- */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b: Bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
export function zipFiles(files: { name: string; bytes: Bytes }[]): Bytes {
  const enc = new TextEncoder();
  const chunks: Bytes[] = [];
  const central: Bytes[] = [];
  let offset = 0;
  const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
  const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.bytes);
    const head = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.bytes.length), ...u32(f.bytes.length), ...u16(name.length), ...u16(0)]);
    chunks.push(head, name, f.bytes);
    central.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(f.bytes.length), ...u32(f.bytes.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += head.length + name.length + f.bytes.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = Uint8Array.from([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/* ---------- page numbers ---------- */
export type NumberOpts = {
  /** 0..8: top-left … bottom-right (row by row). */
  pos: number;
  facing: boolean;
  margin: number;
  first: number;
  from: number;
  to: number;
  text: "n" | "page-n" | "page-n-of-N" | "n-of-N";
  font: "Helvetica" | "Times" | "Courier";
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
};
const FONTS: Record<string, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  Helvetica: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  Times: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  Courier: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};
export const hexRgb = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
export const numberLabel = (kind: NumberOpts["text"], n: number, total: number) => (kind === "n" ? `${n}` : kind === "page-n" ? `Page ${n}` : kind === "n-of-N" ? `${n} of ${total}` : `Page ${n} of ${total}`);

/** The visible area of a page as the viewer shows it (turned pages swap width and height). */
function visible(p: PDFPage) {
  const b = p.getCropBox();
  const r = ((p.getRotation().angle % 360) + 360) % 360;
  return { x: b.x, y: b.y, w: b.width, h: b.height, r };
}
/** Maps a point measured on the viewed page (origin bottom-left, as seen) to page space, plus the text angle. */
function toPage(p: PDFPage, vx: number, vy: number) {
  const { x, y, w, h, r } = visible(p);
  if (r === 90) return { x: x + vy, y: y + h - vx, a: 90 };
  if (r === 180) return { x: x + w - vx, y: y + h - vy, a: 180 };
  if (r === 270) return { x: x + w - vy, y: y + vx, a: 270 };
  return { x: x + vx, y: y + vy, a: 0 };
}
const viewSize = (p: PDFPage) => {
  const { w, h, r } = visible(p);
  return r % 180 ? { w: h, h: w } : { w, h };
};

export async function addPageNumbers(bytes: Bytes, o: NumberOpts): Promise<Bytes> {
  const d = await loadDoc(bytes);
  const total = d.getPageCount();
  const from = Math.max(1, Math.min(total, o.from));
  const to = Math.max(from, Math.min(total, o.to));
  const f = await d.embedFont(FONTS[o.font][o.bold && o.italic ? 3 : o.bold ? 1 : o.italic ? 2 : 0]);
  const [cr, cg, cb] = hexRgb(o.color);
  d.getPages().forEach((p, i) => {
    const pageNo = i + 1;
    if (pageNo < from || pageNo > to) return;
    const label = numberLabel(o.text, o.first + (pageNo - from), o.first + (to - from));
    const { w, h } = viewSize(p);
    let col = o.pos % 3;
    // facing pages: the number sits on the outer edge, so even pages swap left and right
    if (o.facing && pageNo % 2 === 0 && col !== 1) col = 2 - col;
    const row = Math.floor(o.pos / 3);
    const tw = f.widthOfTextAtSize(label, o.size);
    const vx = col === 0 ? o.margin : col === 1 ? (w - tw) / 2 : w - o.margin - tw;
    const vy = row === 0 ? h - o.margin - o.size * 0.8 : row === 1 ? (h - o.size * 0.7) / 2 : o.margin;
    const pt = toPage(p, vx, vy);
    p.drawText(label, { x: pt.x, y: pt.y, size: o.size, font: f, color: rgb(cr, cg, cb), rotate: degrees(pt.a) });
  });
  return d.save();
}

/* ---------- watermark ---------- */
export type WatermarkOpts = {
  /** PNG or JPEG bytes of the watermark (text is turned into a picture first, so any language works). */
  image: Bytes;
  png: boolean;
  /** Picture size in points at 100% scale. */
  w: number;
  h: number;
  pos: number;
  mosaic: boolean;
  opacity: number;
  rotation: number;
  from: number;
  to: number;
  below: boolean;
  /** Width of the mark as a share of the page width (0-1) for pictures; text uses its own size. */
  fit?: number;
};

export async function addWatermark(bytes: Bytes, o: WatermarkOpts): Promise<Bytes> {
  const d = await loadDoc(bytes);
  const img = o.png ? await d.embedPng(o.image) : await d.embedJpg(o.image);
  const total = d.getPageCount();
  const from = Math.max(1, Math.min(total, o.from));
  const to = Math.max(from, Math.min(total, o.to));
  d.getPages().forEach((p, i) => {
    const n = i + 1;
    if (n < from || n > to) return;
    const { w: vw, h: vh } = viewSize(p);
    let mw = o.w;
    let mh = o.h;
    if (o.fit) {
      mw = vw * o.fit;
      mh = (mw * o.h) / o.w;
    }
    const th = (o.rotation * Math.PI) / 180;
    const place = (cx: number, cy: number) => {
      // rotate about the centre: find the bottom-left corner that puts the middle at (cx, cy)
      const ox = cx - ((mw / 2) * Math.cos(th) - (mh / 2) * Math.sin(th));
      const oy = cy - ((mw / 2) * Math.sin(th) + (mh / 2) * Math.cos(th));
      const pt = toPage(p, ox, oy);
      p.drawImage(img, { x: pt.x, y: pt.y, width: mw, height: mh, rotate: degrees(o.rotation + pt.a), opacity: o.opacity });
    };
    if (o.mosaic) {
      const gx = mw * 1.5 + 30;
      const gy = mh * 2.4 + 40;
      let rowIx = 0;
      for (let cy = gy / 2; cy < vh + gy / 2; cy += gy, rowIx++) for (let cx = rowIx % 2 ? gx / 2 : 0; cx < vw + gx; cx += gx) place(cx, cy);
    } else {
      const col = o.pos % 3;
      const row = Math.floor(o.pos / 3);
      const pad = 24;
      const cx = col === 0 ? pad + mw / 2 : col === 1 ? vw / 2 : vw - pad - mw / 2;
      const cy = row === 0 ? vh - pad - mh / 2 : row === 1 ? vh / 2 : pad + mh / 2;
      place(cx, cy);
    }
    if (o.below) {
      // the mark was added as the last content stream: move it in front, so the page content draws on top
      const arr = p.node.Contents();
      if (arr instanceof PDFArray && arr.size() > 1) {
        const last = arr.get(arr.size() - 1);
        arr.remove(arr.size() - 1);
        arr.insert(0, last);
      }
    }
  });
  return d.save();
}

/** Draws text onto a transparent canvas and returns it as a PNG, so any font or script works in the PDF. */
export async function textMark(text: string, o: { family: string; size: number; bold: boolean; italic: boolean; underline: boolean; color: string }): Promise<{ png: Bytes; w: number; h: number }> {
  const S = 3;
  const font = `${o.italic ? "italic " : ""}${o.bold ? "bold " : ""}${o.size * S}px ${o.family}, "Noto Sans", "Noto Sans Devanagari", sans-serif`;
  const lines = text.split("\n").slice(0, 6);
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = font;
  const lh = o.size * S * 1.25;
  const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width), 1)) + 16 * S;
  const h = Math.ceil(lh * lines.length + 10 * S);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.font = font;
  g.fillStyle = o.color;
  g.textBaseline = "top";
  lines.forEach((l, i) => {
    const y = 5 * S + i * lh;
    g.fillText(l, 8 * S, y);
    if (o.underline) g.fillRect(8 * S, y + o.size * S * 1.08, probe.measureText(l).width, Math.max(1, o.size * S * 0.07));
  });
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
  return { png: new Uint8Array(await blob.arrayBuffer()), w: w / S, h: h / S };
}

/** Pages that carry black boxes are replaced by a picture with the boxes burned in; other pages are copied untouched. */
export async function assembleRedacted(bytes: Bytes, flat: Map<number, { jpg: Bytes; w: number; h: number }>): Promise<Bytes> {
  const d = await loadDoc(bytes);
  const out = await PDFDocument.create();
  for (let i = 0; i < d.getPageCount(); i++) {
    const f = flat.get(i);
    if (f) {
      const page = out.addPage([f.w, f.h]);
      page.drawImage(await out.embedJpg(f.jpg), { x: 0, y: 0, width: f.w, height: f.h });
    } else {
      const [pg] = await out.copyPages(d, [i]);
      out.addPage(pg);
    }
  }
  return out.save();
}
