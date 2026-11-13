import { renderPng } from "./export";

export type PageSizeId = "a3" | "a4" | "a5" | "a6" | "b5" | "letter" | "legal" | "tabloid" | "executive";
export type Orientation = "portrait" | "landscape";

export type NumPos = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right" | "none";
export const NUM_POSITIONS: { value: NumPos; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top", label: "Top" },
  { value: "top-right", label: "Top right" },
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom", label: "Bottom" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "none", label: "None" },
];

export type NumFormat = "of" | "plain" | "page-of" | "page" | "dash" | "roman";
export const NUM_FORMATS: { value: NumFormat; label: string }[] = [
  { value: "of", label: "1 / 4" },
  { value: "plain", label: "1" },
  { value: "page-of", label: "Page 1 of 4" },
  { value: "page", label: "Page 1" },
  { value: "dash", label: "- 1 -" },
  { value: "roman", label: "I / IV" },
];

const ROMAN: [number, string][] = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
function roman(n: number): string {
  let out = "";
  for (const [v, r] of ROMAN) while (n >= v) { out += r; n -= v; }
  return out;
}

/** The page number text for page i (0-based) of n, in the chosen format. */
export function formatPageNumber(i: number, n: number, f: NumFormat): string {
  const k = i + 1;
  switch (f) {
    case "plain": return `${k}`;
    case "page-of": return `Page ${k} of ${n}`;
    case "page": return `Page ${k}`;
    case "dash": return `- ${k} -`;
    case "roman": return `${roman(k)} / ${roman(n)}`;
    default: return `${k} / ${n}`;
  }
}

/** Paper sizes in millimetres (portrait). */
export const PAGE_SIZES: { id: PageSizeId; label: string; w: number; h: number }[] = [
  { id: "a4", label: "A4", w: 210, h: 297 },
  { id: "a3", label: "A3", w: 297, h: 420 },
  { id: "a5", label: "A5", w: 148, h: 210 },
  { id: "a6", label: "A6", w: 105, h: 148 },
  { id: "b5", label: "B5", w: 176, h: 250 },
  { id: "letter", label: "US Letter", w: 215.9, h: 279.4 },
  { id: "legal", label: "US Legal", w: 215.9, h: 355.6 },
  { id: "tabloid", label: "Tabloid", w: 279.4, h: 431.8 },
  { id: "executive", label: "Executive", w: 184.2, h: 266.7 },
];

/** A faint label printed behind the text of every page, e.g. "Confidential". */
export type PageLabel = { text: string; color: string; strength: number };
export const LABEL_PRESETS: { text: string; color: string }[] = [
  { text: "Confidential", color: "#dc2626" },
  { text: "Important", color: "#d97706" },
  { text: "Draft", color: "#64748b" },
  { text: "Internal", color: "#2563eb" },
];
export const LABEL_COLORS = ["#dc2626", "#d97706", "#16a34a", "#2563eb", "#7c3aed", "#64748b"];
export const DEFAULT_LABEL_STRENGTH = 9;

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export type PaperTheme = {
  id: string;
  label: string;
  bg: string;
  fg: string;
  muted: string;
  line: string;
};

export const PAPER_THEMES: PaperTheme[] = [
  { id: "paper", label: "Paper", bg: "#ffffff", fg: "#1c1917", muted: "#78716c", line: "#e7e5e4" },
  { id: "sepia", label: "Sepia", bg: "#f4ecd8", fg: "#433422", muted: "#8a7558", line: "#dccfae" },
  { id: "dark", label: "Dark", bg: "#16191d", fg: "#e8e6e3", muted: "#9aa0a6", line: "#2d3238" },
  { id: "newsprint", label: "Newsprint", bg: "#e9e7e1", fg: "#222222", muted: "#6b6a66", line: "#c9c6bd" },
  { id: "ocean", label: "Ocean", bg: "#e8f3f8", fg: "#0c2a3b", muted: "#4f7488", line: "#bcd8e5" },
];

/** Builds the PDF from page nodes (one image per page, each exactly the page size). */
export async function renderPagesPdf(
  pageNodes: HTMLElement[],
  opts: { size: PageSizeId; orientation: Orientation },
): Promise<{ blob: Blob; pages: number }> {
  const { jsPDF } = await import("jspdf");
  const sz = PAGE_SIZES.find((s) => s.id === opts.size) ?? PAGE_SIZES[0];
  const landscape = opts.orientation === "landscape";
  const W = landscape ? sz.h : sz.w;
  const H = landscape ? sz.w : sz.h;
  const orient = landscape ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation: orient, unit: "mm", format: [sz.w, sz.h], compress: true });
  for (let i = 0; i < pageNodes.length; i++) {
    const img = await renderPng(pageNodes[i], { maxWidth: 1600 });
    // every page keeps its own shape, so a tall poster page is as long as its content
    const ph = Math.round((W * pageNodes[i].offsetHeight) / Math.max(1, pageNodes[i].offsetWidth) * 100) / 100;
    const tall = Math.abs(ph - H) > 0.5;
    const pw = W;
    if (i === 0 && tall) pdf.deletePage(1), pdf.addPage([pw, ph], pw > ph ? "landscape" : "portrait");
    else if (i > 0) pdf.addPage([tall ? pw : sz.w, tall ? ph : sz.h], tall ? (pw > ph ? "landscape" : "portrait") : orient);
    pdf.addImage(img.dataUrl, "PNG", 0, 0, pw, tall ? ph : H, undefined, "FAST");
  }
  return { blob: pdf.output("blob"), pages: pageNodes.length };
}
