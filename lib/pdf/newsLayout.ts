/**
 * Page planning for ClipBook. Plain maths with no server code, so the server draws the PDF
 * and the browser draws the live preview from the very same numbers.
 * All positions are in PDF points measured from the top-left corner of the page.
 */

export type NewsPiece = {
  w: number; h: number; caption: string; source: string; n: number; cont: boolean;
  /** Hand-set move from the automatic spot, in points. */
  dx?: number; dy?: number;
  /** Page number the picture was sent to (a tall one continues on the pages after it). */
  pin?: number;
};
export type NewsLayoutOpts = { layout: string; landscape: boolean; headerMode: string; numbers: boolean; titleStyle?: string; showDate?: boolean };

export const TITLE_STYLES = [
  { v: "classic", l: "Classic: left title, line below" },
  { v: "centered", l: "Centred: double line" },
  { v: "masthead", l: "Masthead: big title, date strip" },
  { v: "banner", l: "Banner: colour bar" },
  { v: "minimal", l: "Minimal: small title" },
] as const;

export type HeadGeom = {
  h: number;
  title: { x: number; base: number; size: number; align: "left" | "center"; color: "accent" | "white" };
  date: { x: number; base: number; size: number; align: "left" | "center" | "right"; color: "gray" | "white" } | null;
  /** Filled bars, measured from the top of the page. */
  rects: { x: number; y: number; w: number; h: number; color: "accent" | "gray" }[];
};

/** Where the title, date and rules go for each title style. */
export function headGeom(style: string, pw: number, M: number, hasDate: boolean): HeadGeom {
  const W = pw - M * 2;
  const mid = pw / 2;
  if (style === "centered")
    return {
      h: hasDate ? 62 : 46,
      title: { x: mid, base: M + 20, size: 20, align: "center", color: "accent" },
      date: hasDate ? { x: mid, base: M + 46, size: 9.5, align: "center", color: "gray" } : null,
      rects: [{ x: M, y: M + 29, w: W, h: 1.6, color: "accent" }, { x: M, y: M + 33, w: W, h: 0.6, color: "accent" }],
    };
  if (style === "masthead")
    return {
      h: hasDate ? 74 : 52,
      title: { x: mid, base: M + 28, size: 28, align: "center", color: "accent" },
      date: hasDate ? { x: mid, base: M + 54, size: 9.5, align: "center", color: "gray" } : null,
      rects: [
        { x: M, y: M + 36, w: W, h: 2.6, color: "accent" },
        ...(hasDate ? [{ x: M, y: M + 60, w: W, h: 0.6, color: "gray" as const }] : []),
      ],
    };
  if (style === "banner")
    return {
      h: 46,
      title: { x: M + 10, base: M + 20, size: 16, align: "left", color: "white" },
      date: hasDate ? { x: pw - M - 10, base: M + 19, size: 9.5, align: "right", color: "white" } : null,
      rects: [{ x: M, y: M, w: W, h: 28, color: "accent" }],
    };
  if (style === "minimal")
    return {
      h: 30,
      title: { x: M, base: M + 12, size: 12, align: "left", color: "accent" },
      date: hasDate ? { x: pw - M, base: M + 11, size: 9, align: "right", color: "gray" } : null,
      rects: [{ x: M, y: M + 19, w: W, h: 0.6, color: "gray" }],
    };
  return {
    h: 39,
    title: { x: M, base: M + 17, size: 17, align: "left", color: "accent" },
    date: hasDate ? { x: pw - M, base: M + 12, size: 9.5, align: "right", color: "gray" } : null,
    rects: [{ x: M, y: M + 26, w: W, h: 1.6, color: "accent" }],
  };
}
export type Wrap = (text: string, width: number, size: number, maxLines: number) => string[];

export type NewsCell<T> = {
  it: T;
  /** The picture rectangle. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** "1." or "(continued)" label and the source, drawn on the first text line. */
  label: string;
  source: string;
  lines: string[];
  size: number;
  /** Baseline of the first text line. */
  base: number;
};
export type NewsPage<T> = { kind: "1" | "2across" | "2down" | "4"; cells: NewsCell<T>[] };
export type NewsLayout<T> = { pw: number; ph: number; margin: number; head: HeadGeom; footBase: number; showHeadOn: (page: number) => boolean; pages: NewsPage<T>[] };

export const NEWS = { margin: 34, gap: 14, headSize: 17, textSize: 9, maxEdge: [1800, 9000] as const };

/** How a tall screenshot is cut into pieces that each fit on a page. */
export function splitPlan(w: number, h: number, splitTall: boolean): { top: number; h: number }[] {
  const chunk = Math.round(w * 1.35);
  if (splitTall && h > w * 2.1 && h > chunk * 1.3) {
    const n = Math.ceil(h / chunk);
    const each = Math.ceil(h / n);
    return Array.from({ length: n }, (_, k) => ({ top: k * each, h: Math.min(each, h - k * each) }));
  }
  return [{ top: 0, h }];
}

export function layoutNews<T extends NewsPiece>(items: T[], o: NewsLayoutOpts, wrap: Wrap): NewsLayout<T> {
  const [PW, PH] = o.landscape ? [841.89, 595.28] : [595.28, 841.89];
  const M = NEWS.margin;
  const headerOn = (pi: number) => o.headerMode === "every" || (o.headerMode === "first" && pi === 0);
  type Plan = { kind: NewsPage<T>["kind"]; items: T[] };
  const head = headGeom(o.titleStyle ?? "classic", PW, M, o.showDate !== false);
  const headH = head.h;
  const free = items.filter((it) => !it.pin);
  // a tall picture sent to page P keeps its later pieces on P+1, P+2 …
  const pinned: { it: T; page: number }[] = [];
  let lastPin = 0;
  items.forEach((it) => {
    if (it.pin) {
      lastPin = Math.max(1, Math.floor(it.pin));
      pinned.push({ it, page: lastPin });
    } else if (it.cont && lastPin) {
      lastPin += 1;
      pinned.push({ it, page: lastPin });
    } else lastPin = 0;
  });
  const plan: Plan[] = [];
  if (o.layout === "auto") {
    // two on a page only when both stay at least 62% of their single-page size
    const g = NEWS.gap;
    const aw = PW - M * 2;
    const ah = PH - M - (o.headerMode === "none" ? 0 : headH) - (M + 14) - 26;
    const fit = (it: T, cw: number, ch: number) => Math.min(cw / it.w, ch / it.h, 1.25);
    for (let i = 0; i < free.length; ) {
      const a = free[i];
      const b = free[i + 1];
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
    // in Auto a pinned picture gets a page of its own at that number
    pinned.sort((x, y) => x.page - y.page).forEach(({ it, page }) => plan.splice(Math.min(page - 1, plan.length), 0, { kind: "1", items: [it] }));
  } else {
    const per = o.layout === "1" ? 1 : o.layout === "4" ? 4 : 2;
    const maxPage = Math.max(1, Math.ceil(items.length / per));
    const queue = [...free];
    const waiting = pinned.map((x) => ({ ...x, page: Math.min(x.page, maxPage) }));
    for (let pg = 1; queue.length || waiting.length; pg++) {
      const here: T[] = [];
      for (let k = 0; k < waiting.length && here.length < per; ) {
        if (waiting[k].page <= pg) here.push(waiting.splice(k, 1)[0].it);
        else k++;
      }
      while (here.length < per && queue.length) here.push(queue.shift()!);
      if (here.length) plan.push({ kind: o.layout as Plan["kind"], items: here.sort((x, y) => x.n - y.n || Number(x.cont) - Number(y.cont)) });
    }
  }

  const pages: NewsPage<T>[] = plan.map((p, pi) => {
    const top = M + (headerOn(pi) ? headH : 0);
    const bottom = PH - (M + 14);
    const areaW = PW - M * 2;
    const areaH = bottom - top;
    const gap = NEWS.gap;
    const cols = p.kind === "2across" || p.kind === "4" ? 2 : 1;
    const rows = p.kind === "2down" || p.kind === "4" ? 2 : 1;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = (areaH - gap * (rows - 1)) / rows;
    const cells = p.items.map((it, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const cx = M + c * (cw + gap);
      const cy = top + r * (ch + gap);
      const label = `${o.numbers ? `${it.n}. ` : ""}${it.cont ? "(continued)" : ""}`.trim();
      const sz = NEWS.textSize;
      const lines = it.caption ? wrap(it.caption, cw - 2, sz, p.kind === "1" ? 5 : 3) : [];
      const head = [label, it.source].filter(Boolean).join("  ");
      const capH = (head ? sz * 1.35 : 0) + lines.length * sz * 1.3 + (head || lines.length ? 6 : 0);
      const s = Math.min(cw / it.w, (ch - capH) / it.h, 1.25);
      const dw = it.w * s;
      const dh = it.h * s;
      const mx = Math.max(-(cx + (cw - dw) / 2), Math.min(PW - dw - (cx + (cw - dw) / 2), it.dx ?? 0));
      const my = Math.max(-cy, Math.min(PH - dh - cy, it.dy ?? 0));
      return { it, x: cx + (cw - dw) / 2 + mx, y: cy + my, w: dw, h: dh, label, source: it.source, lines, size: sz, base: cy + my + dh + 6 + sz };
    });
    return { kind: p.kind, cells };
  });
  return { pw: PW, ph: PH, margin: M, head, footBase: PH - (M - 6), showHeadOn: headerOn, pages };
}
