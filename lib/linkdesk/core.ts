/** Shared rules for the LinkDesk tools (ported from the original LinkDesk app). */

export const LIMITS = {
  MAX_FILE: 100 * 1024 * 1024,
  MAX_LINKS: 5000,
  MAX_CELLS: 1_000_000,
  MAX_TEXT: 2_000_000,
  MAX_PDF_PAGES: 300,
  MAX_ZIP_ENTRIES: 2000,
  MAX_PART_CHARS: 15_000_000,
};

export const checkFileSize = (f: File | null | undefined): string => (f && f.size > LIMITS.MAX_FILE ? `That file is ${(f.size / 1048576).toFixed(1)} MB. The limit is 100 MB.` : "");

/** One link waiting to be opened. */
export type Item = { url: string; label: string; opened: boolean; at: string | null };
/** A link as found in a file or pasted text, before it is cleaned up. */
export type RawLink = { url: string; label?: string; row?: number };
export type Source = { name: string; sample: boolean } | null;

export const nowStr = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export function looksLikeUrl(str: unknown): boolean {
  if (!str || typeof str !== "string") return false;
  const s = str.trim();
  if (s.length < 4 || /\s/.test(s)) return false;
  if (/^(url|urls|link|links|website|websites|href|address)$/i.test(s)) return false;
  if (/^https?:\/\//i.test(s)) return true;
  if (/^www\.[a-z0-9-]+(\.[a-z]{2,})+/i.test(s)) return true;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,10}(\/.*)?$/i.test(s);
}

export function normalizeUrl(u: unknown, auto: boolean): string {
  let s = String(u ?? "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s) && auto) s = "https://" + s;
  return /^https?:\/\/\S+$/i.test(s) ? s : "";
}

/** Turns raw links into the batch list: adds https://, drops invalid lines (and optionally duplicates), keeps "opened" marks. */
export function buildItems(raw: RawLink[], opts: { auto: boolean; dedupe: boolean }, prev?: Item[]) {
  const was = new Map<string, string>();
  prev?.forEach((i) => i.opened && was.set(i.url.toLowerCase(), i.at ?? ""));
  const seen = new Set<string>();
  let out: Item[] = [];
  let skipped = 0;
  raw.forEach((r, idx) => {
    const url = normalizeUrl(r.url, opts.auto);
    if (!url) {
      skipped++;
      return;
    }
    const key = url.toLowerCase();
    if (opts.dedupe && seen.has(key)) return;
    seen.add(key);
    const opened = was.has(key);
    out.push({ url, label: r.label || `Row ${r.row ?? idx + 1}`, opened, at: opened ? (was.get(key) ?? null) : null });
  });
  const capped = out.length > LIMITS.MAX_LINKS;
  if (capped) out = out.slice(0, LIMITS.MAX_LINKS);
  return { items: out, skipped, capped };
}
