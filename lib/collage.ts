/** Layout rules for the Tweet Collage Maker. Everything here is plain maths, so it is easy to test. */

export const FRAME_W = 1600; // logical width of the collage picture
export const CARD_W = 520; // width a tweet card is drawn at before it is scaled into its cell
export const MAX_TWEETS = 12;

export type LayoutMode = "grid" | "masonry";
export type LastRow = "left" | "center";
export type CanvasKey = "auto" | "square" | "portrait" | "wide" | "story";

export const CANVASES: Record<CanvasKey, { label: string; note: string; ratio: number | null }> = {
  auto: { label: "Auto", note: "Fit to content", ratio: null },
  square: { label: "Square", note: "1:1", ratio: 1 },
  portrait: { label: "Portrait", note: "4:5", ratio: 4 / 5 },
  wide: { label: "Wide", note: "16:9", ratio: 16 / 9 },
  story: { label: "Story", note: "9:16", ratio: 9 / 16 },
};

/** A sensible number of columns for n tweets (2 → 2, 3 → 3, 4 → 2×2, 5–9 → 3, more → 4). */
export function autoCols(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

export type Cell = { x: number; y: number; w: number; h: number; scale: number };
export type LayoutInput = {
  n: number;
  mode: LayoutMode;
  cols: number; // 0 = automatic
  ratio: number | null; // frame width / height, null = fit to content
  gap: number;
  pad: number;
  lastRow: LastRow;
  /** Height of each card at CARD_W, as measured on screen. */
  natural: number[];
};

/** Where every card goes, and how tall the whole picture is. */
export function layoutCollage(o: LayoutInput): { cells: Cell[]; height: number; cols: number } {
  const n = o.n;
  if (!n) return { cells: [], height: Math.round(FRAME_W / (o.ratio ?? 1)), cols: 0 };
  const cols = Math.max(1, Math.min(o.cols || autoCols(n), n));
  const cellW = (FRAME_W - 2 * o.pad - (cols - 1) * o.gap) / cols;
  const sW = cellW / CARD_W;
  const nat = (i: number) => Math.max(40, o.natural[i] || 300);
  const cells: Cell[] = [];

  if (o.mode === "masonry") {
    // each card keeps its own height; the next card goes under the shortest column
    const bottoms = new Array(cols).fill(o.pad);
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let k = 1; k < cols; k++) if (bottoms[k] < bottoms[c] - 0.5) c = k;
      const h = nat(i) * sW;
      cells.push({ x: o.pad + c * (cellW + o.gap), y: bottoms[c], w: cellW, h, scale: sW });
      bottoms[c] += h + o.gap;
    }
    return { cells, height: Math.round(Math.max(...bottoms) - o.gap + o.pad), cols };
  }

  // grid: every cell is the same size, so rows and columns line up exactly
  const rows = Math.ceil(n / cols);
  let cellH: number;
  let height: number;
  if (o.ratio) {
    height = Math.round(FRAME_W / o.ratio);
    cellH = (height - 2 * o.pad - (rows - 1) * o.gap) / rows;
  } else {
    // fit to content: the tallest tweet sets the row height, but one very tall outlier must not leave the rest
    // floating in blank space. It is capped, and that tweet is drawn wider so its text wraps less.
    const hs = o.natural.slice(0, n).map((_, i) => nat(i) * sW);
    const sorted = [...hs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    cellH = Math.min(Math.max(...hs), Math.max(median * 1.1, cellW * 1.2));
    height = Math.round(2 * o.pad + rows * cellH + (rows - 1) * o.gap);
  }
  cellH = Math.max(60, cellH);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const shift = o.lastRow === "center" ? ((cols - inRow) * (cellW + o.gap)) / 2 : 0;
    // a tall tweet shrinks to fit its cell instead of being cut
    const scale = Math.min(sW, cellH / nat(i));
    cells.push({ x: o.pad + shift + c * (cellW + o.gap), y: o.pad + r * (cellH + o.gap), w: cellW, h: cellH, scale });
  }
  return { cells, height, cols };
}

export type Background = { id: string; label: string; css: string; dark: boolean };
export const BACKGROUNDS: Background[] = [
  { id: "white", label: "White", css: "#ffffff", dark: false },
  { id: "cream", label: "Cream", css: "#f6f1e9", dark: false },
  { id: "grey", label: "Light grey", css: "#e8eaed", dark: false },
  { id: "black", label: "Black", css: "#0b0b0c", dark: true },
  { id: "navy", label: "Navy", css: "#0f1b33", dark: true },
  { id: "sunset", label: "Sunset", css: "linear-gradient(135deg,#ff9a5a,#ff5e7e)", dark: false },
  { id: "ocean", label: "Ocean", css: "linear-gradient(135deg,#4facfe,#00c6a7)", dark: false },
  { id: "violet", label: "Violet", css: "linear-gradient(135deg,#7f5af0,#d65db1)", dark: true },
  { id: "mint", label: "Mint", css: "linear-gradient(135deg,#d4fc79,#96e6a1)", dark: false },
];
