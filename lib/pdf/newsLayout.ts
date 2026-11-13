/**
 * Page planning for ClipBook. Plain maths with no server code, so the server draws the PDF
 * and the browser draws the live preview from the very same numbers.
 * All positions are in PDF points measured from the top-left corner of the page.
 */

export type NewsPiece = { w: number; h: number; caption: string; source: string; n: number; cont: boolean };
export type NewsLayoutOpts = { layout: string; landscape: boolean; headerMode: string; numbers: boolean };
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
export type NewsLayout<T> = { pw: number; ph: number; margin: number; headTop: number; headRuleY: number; headBase: number; dateBase: number; footBase: number; showHeadOn: (page: number) => boolean; pages: NewsPage<T>[] };

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
  const plan: Plan[] = [];
  if (o.layout === "auto") {
    // two on a page only when both stay at least 62% of their single-page size
    const g = NEWS.gap;
    const aw = PW - M * 2;
    const ah = PH - M - (o.headerMode === "none" ? 0 : 39) - (M + 14) - 26;
    const fit = (it: T, cw: number, ch: number) => Math.min(cw / it.w, ch / it.h, 1.25);
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
    const per = o.layout === "1" ? 1 : o.layout === "4" ? 4 : 2;
    for (let i = 0; i < items.length; i += per) plan.push({ kind: o.layout as Plan["kind"], items: items.slice(i, i + per) });
  }

  const pages: NewsPage<T>[] = plan.map((p, pi) => {
    const top = M + (headerOn(pi) ? NEWS.headSize + 22 : 0);
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
      return { it, x: cx + (cw - dw) / 2, y: cy, w: dw, h: dh, label, source: it.source, lines, size: sz, base: cy + dh + 6 + sz };
    });
    return { kind: p.kind, cells };
  });
  const hs = NEWS.headSize;
  return { pw: PW, ph: PH, margin: M, headTop: M, headBase: M + hs, headRuleY: M + hs + 9, dateBase: M + 12, footBase: PH - (M - 6), showHeadOn: headerOn, pages };
}
