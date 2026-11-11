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
