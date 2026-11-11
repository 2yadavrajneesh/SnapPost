/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RawLink } from "./core";

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"']+/i;
const MAIL_RE = /^mailto:[^\s]+$/i;
const BARE_RE = /^(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|int|info|news|io|co|in|uk|us|ca|au|de|fr|ac)(?:\/\S*)?$/i;

/** The web address inside a piece of cell text, or null. `bare` also accepts a lone domain such as example.com. */
export function findLink(text: unknown, bare: boolean): string | null {
  const t = String(text).trim();
  if (!t) return null;
  if (MAIL_RE.test(t)) return t;
  const m = t.match(URL_RE);
  if (m) {
    let u = m[0].replace(/[.,;:!?)\]}]+$/, "");
    if (/^www\./i.test(u)) u = "https://" + u;
    return u;
  }
  if (bare && BARE_RE.test(t)) return "https://" + t;
  return null;
}

export type MakerStats = { linked: number; already: number; per: { name: string; n: number }[] };

/** Adds a hyperlink to every plain-text cell that holds an address. Changes the workbook in place. */
export function convertWorkbook(wb: any, bare: boolean): MakerStats {
  const stats: MakerStats = { linked: 0, already: 0, per: [] };
  wb.SheetNames.forEach((name: string) => {
    const ws = wb.Sheets[name];
    let n = 0;
    Object.keys(ws).forEach((key) => {
      if (key[0] === "!") return;
      const c = ws[key];
      if (c.l && c.l.Target) {
        stats.already++;
        return;
      }
      if (c.t !== "s" || typeof c.v !== "string") return;
      const u = findLink(c.v, bare);
      if (u && u.length < 2000) {
        c.l = { Target: u, Tooltip: u };
        n++;
        stats.linked++;
      }
    });
    stats.per.push({ name, n });
  });
  return stats;
}

/** Every web link in the converted workbook, titled with the first plain text cell of its row. */
export function collectLinks(XLSX: any, wb: any): RawLink[] {
  const out: RawLink[] = [];
  wb.SheetNames.forEach((name: string) => {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) return;
    const rng = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = rng.s.r; r <= rng.e.r; r++) {
      const cells: any[] = [];
      for (let c = rng.s.c; c <= rng.e.c; c++) cells.push(ws[XLSX.utils.encode_cell({ r, c })]);
      let label = "";
      cells.some((cell) => {
        if (!cell || cell.t !== "s" || !cell.v) return false;
        const v = String(cell.v).trim();
        if (!v || (cell.l && cell.l.Target) || findLink(v, false)) return false;
        label = v;
        return true;
      });
      cells.forEach((cell) => {
        if (cell && cell.l && /^https?:\/\//i.test(cell.l.Target || "")) out.push({ url: cell.l.Target, label: label || `Row ${r + 1}`, row: r + 1 });
      });
    }
  });
  return out;
}
