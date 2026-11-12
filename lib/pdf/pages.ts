/** Turns "1-3, 5, 8-" into zero-based page numbers. Throws a plain message if the text is not understood. */
export function parsePages(spec: string, total: number): number[] {
  const text = spec.trim().toLowerCase();
  if (!text || text === "all") return Array.from({ length: total }, (_, i) => i);
  if (text === "odd") return Array.from({ length: total }, (_, i) => i).filter((i) => i % 2 === 0);
  if (text === "even") return Array.from({ length: total }, (_, i) => i).filter((i) => i % 2 === 1);
  const out: number[] = [];
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    let a: number;
    let b: number;
    if (m) {
      a = m[1] ? parseInt(m[1], 10) : 1;
      b = m[2] ? parseInt(m[2], 10) : total;
    } else if (/^\d+$/.test(part)) {
      a = b = parseInt(part, 10);
    } else {
      throw new Error(`"${part}" is not a page number or range. Use something like 1-3, 5.`);
    }
    if (a < 1 || b < 1 || a > total || b > total) throw new Error(`This PDF has ${total} page${total === 1 ? "" : "s"}, so "${part}" is out of range.`);
    if (a > b) throw new Error(`"${part}" goes backwards. Write it as ${b}-${a}.`);
    for (let p = a; p <= b; p++) if (!out.includes(p - 1)) out.push(p - 1);
  }
  if (!out.length) throw new Error("No pages were chosen.");
  return out;
}

/** Like parsePages, but keeps the order typed, allows repeats and reversed ranges (8-1). Used to reorder pages. */
export function parseOrder(spec: string, total: number): number[] {
  const text = spec.trim();
  if (!text) throw new Error("Type the new page order, for example 3, 1, 2.");
  const out: number[] = [];
  for (const part of text.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    const a = m ? parseInt(m[1], 10) : /^\d+$/.test(part) ? parseInt(part, 10) : NaN;
    const b = m ? parseInt(m[2], 10) : a;
    if (Number.isNaN(a)) throw new Error(`"${part}" is not a page number or range. Use something like 3, 1, 2 or 8-1.`);
    if (a < 1 || b < 1 || a > total || b > total) throw new Error(`This PDF has ${total} page${total === 1 ? "" : "s"}, so "${part}" is out of range.`);
    const step = a <= b ? 1 : -1;
    for (let p = a; p !== b + step; p += step) out.push(p - 1);
  }
  if (out.length > 5000) throw new Error("That would make too many pages.");
  return out;
}
