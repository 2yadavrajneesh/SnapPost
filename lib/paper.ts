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
    if (i > 0) pdf.addPage([sz.w, sz.h], orient);
    pdf.addImage(img.dataUrl, "PNG", 0, 0, W, H, undefined, "FAST");
  }
  return { blob: pdf.output("blob"), pages: pageNodes.length };
}
