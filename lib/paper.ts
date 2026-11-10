import { renderPng } from "./export";

export type PageSizeId = "a3" | "a4" | "a5" | "a6" | "b5" | "letter" | "legal" | "tabloid" | "executive";
export type Orientation = "portrait" | "landscape";

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

export type PaperTheme = {
  id: string;
  label: string;
  bg: string;
  fg: string;
  muted: string;
  line: string;
};

export const PAPER_THEMES: PaperTheme[] = [{ id: "paper", label: "Paper", bg: "#ffffff", fg: "#1c1917", muted: "#78716c", line: "#e7e5e4" }];

const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Lays the given blocks (header, then each post) onto PDF pages of the chosen size, top to bottom.
 * A block is never split: if it does not fit in what is left of a page it starts the next one, and a
 * block taller than a whole page is scaled down to fit. Blocks are rendered as images, so any
 * language, emoji and the exact on-screen look carry over.
 */
export async function renderThreadPdf(
  blocks: HTMLElement[],
  opts: { size: PageSizeId; orientation: Orientation; theme: PaperTheme },
): Promise<{ blob: Blob; pages: number }> {
  const { jsPDF } = await import("jspdf");
  const sz = PAGE_SIZES.find((s) => s.id === opts.size) ?? PAGE_SIZES[0];
  const landscape = opts.orientation === "landscape";
  const W = landscape ? sz.h : sz.w;
  const H = landscape ? sz.w : sz.h;
  const margin = Math.max(8, Math.min(14, W * 0.06));
  const footer = 6;
  const cw = W - margin * 2;
  const ch = H - margin * 2 - footer;
  const [br, bg, bb] = hexToRgb(opts.theme.bg);
  const [mr, mg, mb] = hexToRgb(opts.theme.muted);

  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: [sz.w, sz.h], compress: true });
  const paint = () => {
    pdf.setFillColor(br, bg, bb);
    pdf.rect(0, 0, W, H, "F");
  };
  paint();

  let y = margin;
  let page = 1;
  for (const node of blocks) {
    const img = await renderPng(node, { maxWidth: 1600 });
    let w = cw;
    let h = (img.height / img.width) * w;
    if (h > ch) {
      h = ch;
      w = (img.width / img.height) * h;
    }
    if (y + h > margin + ch && y > margin) {
      pdf.addPage([sz.w, sz.h], landscape ? "landscape" : "portrait");
      paint();
      page += 1;
      y = margin;
    }
    pdf.addImage(img.dataUrl, "PNG", margin + (cw - w) / 2, y, w, h, undefined, "FAST");
    y += h;
  }

  // Page numbers, now that the total is known.
  pdf.setFontSize(8);
  pdf.setTextColor(mr, mg, mb);
  for (let i = 1; i <= page; i++) {
    pdf.setPage(i);
    pdf.text(`${i} / ${page}`, W / 2, H - margin / 2, { align: "center" });
  }
  return { blob: pdf.output("blob"), pages: page };
}
