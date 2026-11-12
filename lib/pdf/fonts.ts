import "server-only";
import "regenerator-runtime/runtime";
import fontkit from "@pdf-lib/fontkit";
import fs from "node:fs/promises";
import path from "node:path";
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

/** English and Hindi (Devanagari) fonts for text we write onto PDFs. Switches font per script. */
type Face = { la: PDFFont; dv: PDFFont; laSet: Set<number>; dvSet: Set<number> };
export type Fonts = { regular: Face; bold: Face };

const read = (pkg: string, file: string) => fs.readFile(path.join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file));

export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  doc.registerFontkit(fontkit);
  const face = async (w: 400 | 700): Promise<Face> => {
    const [la, dv] = await Promise.all([
      read("noto-sans", `noto-sans-latin-${w}-normal.woff`).then((b) => doc.embedFont(b, { subset: true })),
      read("noto-sans-devanagari", `noto-sans-devanagari-devanagari-${w}-normal.woff`).then((b) => doc.embedFont(b, { subset: true })),
    ]);
    return { la, dv, laSet: new Set(la.getCharacterSet()), dvSet: new Set(dv.getCharacterSet()) };
  };
  const [regular, bold] = await Promise.all([face(400), face(700)]);
  return { regular, bold };
}

const isDv = (cp: number) => cp >= 0x0900 && cp <= 0x097f;
const neutral = (c: string) => /[\s\d.,;:!?'"()\[\]\-–—“”‘’%&/]/.test(c);

type Seg = { font: PDFFont; text: string };
function segments(f: Face, text: string): Seg[] {
  const out: Seg[] = [];
  let prev: "la" | "dv" | null = null;
  for (const ch of text.replace(/[\r\n\t]+/g, " ")) {
    const cp = ch.codePointAt(0)!;
    let k: "la" | "dv";
    let c = ch;
    if (cp === 0x200c || cp === 0x200d) k = prev ?? "la";
    else if (isDv(cp) && f.dvSet.has(cp)) k = "dv";
    else if (prev && neutral(ch) && (prev === "la" ? f.laSet : f.dvSet).has(cp)) k = prev;
    else if (f.laSet.has(cp)) k = "la";
    else if (f.dvSet.has(cp)) k = "dv";
    else {
      k = prev ?? "la";
      c = "?";
    }
    prev = k;
    const font = k === "la" ? f.la : f.dv;
    const last = out[out.length - 1];
    if (last && last.font === font) last.text += c;
    else out.push({ font, text: c });
  }
  return out;
}

export const widthOf = (f: Face, text: string, size: number) => segments(f, text).reduce((a, s) => a + s.font.widthOfTextAtSize(s.text, size), 0);

export function drawLine(page: PDFPage, f: Face, text: string, x: number, y: number, size: number, color: [number, number, number] = [0, 0, 0], align: "left" | "right" | "center" = "left") {
  const w = widthOf(f, text, size);
  let cx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  for (const s of segments(f, text)) {
    page.drawText(s.text, { x: cx, y, size, font: s.font, color: rgb(...color) });
    cx += s.font.widthOfTextAtSize(s.text, size);
  }
}

/** Breaks text into lines that fit `maxW`. The last line is cut with an ellipsis if it runs past `maxLines`. */
export function wrapText(f: Face, text: string, size: number, maxW: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (widthOf(f, t, size) <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && widthOf(f, `${last}…`, size) > maxW) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}
