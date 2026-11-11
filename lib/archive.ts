/** Turns what a person typed or pasted into a clean http(s) link, or null when it is not a usable web address. */
export function normalizeWebUrl(raw: string): string | null {
  let t = raw.trim();
  if (!t || /\s/.test(t) || t.length > 2000) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) t = `https://${t}`;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null;
  }
  return u.toString();
}

export type Snapshot = { url: string; timestamp: string };

/** "20261110123456" -> a Date (UTC). */
export function snapshotDate(ts: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(ts);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : null;
}

const enc = encodeURIComponent;

/** Links that open other archives with the page already filled in. Nothing is sent from our server. */
export const archiveLinks = (url: string) => ({
  waybackCalendar: `https://web.archive.org/web/*/${url}`,
  waybackSave: `https://web.archive.org/save/${url}`,
  todaySave: `https://archive.ph/?run=1&url=${enc(url)}`,
  todayFind: `https://archive.ph/newest/${url}`,
  ghostFind: `https://ghostarchive.org/search?term=${enc(url)}`,
});
