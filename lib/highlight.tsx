import type { CSSProperties, ReactNode } from "react";

/** marker / underline highlight text; bar / blur hide it (redaction). */
export type HighlightStyle = "marker" | "underline" | "bar" | "blur";
export type Highlight = { start: number; end: number; color: string; style: HighlightStyle };

export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#fde047" },
  { name: "Green", value: "#86efac" },
  { name: "Pink", value: "#f9a8d4" },
  { name: "Blue", value: "#93c5fd" },
  { name: "Orange", value: "#fdba74" },
] as const;

/** Removes [start, end) from every range, splitting the ones that straddle it. */
function cut(list: Highlight[], start: number, end: number): Highlight[] {
  const out: Highlight[] = [];
  for (const h of list) {
    if (h.end <= start || h.start >= end) out.push(h);
    else {
      if (h.start < start) out.push({ ...h, end: start });
      if (h.end > end) out.push({ ...h, start: end });
    }
  }
  return out;
}

/** Adds a highlight; it replaces whatever it overlaps. */
export function addHighlight(list: Highlight[], h: Highlight): Highlight[] {
  if (h.end <= h.start) return list;
  return [...cut(list, h.start, h.end), h].sort((a, b) => a.start - b.start);
}

export function removeHighlight(list: Highlight[], start: number, end: number): Highlight[] {
  return end > start ? cut(list, start, end) : list;
}

type Seg = { start: number; end: number; hl: Highlight | null };

/** Splits the text into plain and highlighted pieces, in order. */
export function segments(text: string, list: Highlight[]): Seg[] {
  const segs: Seg[] = [];
  let at = 0;
  for (const h of list) {
    const s = Math.max(at, Math.min(h.start, text.length));
    const e = Math.min(h.end, text.length);
    if (e <= s) continue;
    if (s > at) segs.push({ start: at, end: s, hl: null });
    segs.push({ start: s, end: e, hl: h });
    at = e;
  }
  if (at < text.length) segs.push({ start: at, end: text.length, hl: null });
  return segs;
}

export const REDACT_STYLES = [
  { label: "Black bar", style: "bar", color: "#0f1419" },
  { label: "Gray bar", style: "bar", color: "#8b98a5" },
  { label: "Blur", style: "blur", color: "#6b7280" },
] as const;

export function highlightStyle(h: Highlight): CSSProperties {
  // Redacted text is painted transparent, so the real glyphs never reach the exported image.
  if (h.style === "bar") return { backgroundColor: h.color, color: "transparent", borderRadius: "0.1em", padding: "0 0.08em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", userSelect: "none" };
  if (h.style === "blur") return { color: "transparent", textShadow: `0 0 0.7em ${h.color}, 0 0 0.7em ${h.color}, 0 0 0.7em ${h.color}`, userSelect: "none" };
  return h.style === "underline"
    ? { textDecoration: "underline", textDecorationColor: h.color, textDecorationThickness: "0.14em", textUnderlineOffset: "0.16em" }
    : { backgroundColor: h.color, color: "#0f1419", borderRadius: "0.14em", padding: "0 0.08em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" };
}

/** The text with its highlights. Each piece records where it starts so a selection can be mapped back. */
export function renderHighlighted(text: string, list: Highlight[] | undefined, markStart = false): ReactNode {
  if (!list?.length && !markStart) return text;
  return segments(text, list ?? []).map((s) => (
    <span key={s.start} data-start={markStart ? s.start : undefined} style={s.hl ? highlightStyle(s.hl) : undefined}>
      {text.slice(s.start, s.end)}
    </span>
  ));
}
