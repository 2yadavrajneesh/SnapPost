import { LIMITS } from "./core";

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const BARE_RE = /(?<![@\w.\/-])(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|int|info|news|io|co|in|uk|us|ca|au|de|fr|ac)(?![\w-])(?:\/[^\s<>"'`]*)?/gi;

const TRACK = ("fbclid gclid dclid gbraid wbraid msclkid yclid twclid ttclid li_fat_id igshid igsh mc_cid mc_eid _hsenc _hsmi hsctatracking " +
  "mkt_tok vero_id ref_src ref_url s_cid ocid ncid spm sr_share rb_clickid _openstat wickedid __twitter_impression gclsrc _ga _gl mibextid").split(" ");
const TRACK_PREFIX = ["utm_", "pk_", "mtm_", "hsa_", "oly_", "vero_", "_hs", "mc_", "fb_", "matomo_", "piwik_"];
const HOST_RULES: { h: RegExp; p: string[]; prefix?: string[] }[] = [
  { h: /(^|\.)youtube\.com$|^youtu\.be$/, p: ["si", "feature", "pp", "kw"] },
  { h: /(^|\.)spotify\.com$/, p: ["si", "context", "nd", "dlsi"] },
  { h: /^(www\.|mobile\.)?(x|twitter)\.com$/, p: ["s", "t"] },
  { h: /(^|\.)amazon\.[a-z.]+$|^amzn\.to$/, p: ["ref", "ref_", "tag", "linkcode", "linkid", "qid", "sr", "crid", "sprefix", "dib", "dib_tag", "content-id", "smid"], prefix: ["pd_rd_", "pf_rd_"] },
  { h: /(^|\.)linkedin\.com$/, p: ["trackingid", "trk", "lipi", "midtoken", "midsig", "trkemail", "eid", "otptoken", "refid", "originalsubdomain"] },
  { h: /(^|\.)facebook\.com$|^fb\.watch$/, p: ["ref", "refsrc", "sfnsn", "_rdr", "rdid"], prefix: ["__cft__", "__tn__"] },
  { h: /(^|\.)instagram\.com$/, p: ["igshid", "igsh", "img_index"] },
];
const WRAP: { h: RegExp; p: RegExp; k: string[] }[] = [
  { h: /(^|\.)google\.[a-z.]+$/, p: /^\/url$/, k: ["url", "q"] },
  { h: /^(l|lm)\.facebook\.com$/, p: /^\/l\.php$/, k: ["u"] },
  { h: /^(www\.)?facebook\.com$/, p: /^\/flx\/warn\/?$/, k: ["u"] },
  { h: /^l\.instagram\.com$/, p: /^\/$/, k: ["u"] },
  { h: /^l\.messenger\.com$/, p: /^\/l\.php$/, k: ["u"] },
  { h: /\.safelinks\.protection\.outlook\.com$/, p: /./, k: ["url"] },
  { h: /(^|\.)youtube\.com$/, p: /^\/redirect$/, k: ["q"] },
  { h: /(^|\.)linkedin\.com$/, p: /^\/safety\/go/, k: ["url"] },
  { h: /^duckduckgo\.com$/, p: /^\/l\/?$/, k: ["uddg"] },
  { h: /^out\.reddit\.com$/, p: /./, k: ["url"] },
  { h: /^t\.umblr\.com$/, p: /^\/redirect$/, k: ["z"] },
];

export type QueryMode = "smart" | "all" | "tracking" | "keep";
export type CleanOpts = { query: QueryMode; track: boolean; wrap: boolean; dedupe: boolean; bare: boolean; anchor: boolean; slash: boolean; https: boolean };
export type CleanItem = { orig: string; url: string; changes: string[]; state: "" | "ok" | "bad" | "unknown" };
export type Rejected = { orig: string; reason: string };
export type CleanResult = { items: CleanItem[]; rejected: Rejected[]; dups: number; note: string };

function trimUrl(input: string): string {
  let u = input.replace(/[.,;:!?'"\]}>…”’]+$/, "");
  while (/\)$/.test(u) && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.replace(/\)$/, "");
  return u.replace(/[.,;:!?'"\]}>…”’]+$/, "");
}

function badHost(h: string): string {
  if (h.charAt(0) === "[" || h.includes(":")) return "Local address";
  if (h === "localhost" || /\.(local|localhost|internal|lan|invalid|test)$/.test(h)) return "Local address";
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ip) {
    const a = +ip[1];
    const b = +ip[2];
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return "Local address";
    return "";
  }
  if (!h.includes(".")) return "Not a valid domain";
  const tld = h.split(".").pop() as string;
  if (!/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(tld)) return "Not a valid domain";
  return "";
}

function unwrapOnce(u: URL): string | null {
  const host = u.hostname.toLowerCase();
  for (const r of WRAP) {
    if (r.h.test(host) && r.p.test(u.pathname)) {
      for (const key of r.k) {
        const v = u.searchParams.get(key);
        if (v && /^https?:\/\//i.test(v)) return v;
      }
    }
  }
  if (host === "urldefense.com") {
    const m = /\/v3\/__(.+?)__;/.exec(u.pathname + u.search);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
  }
  return null;
}

function stripQuery(search: string, host: string, useTrack: boolean) {
  if (!search || search === "?") return { q: "", n: 0 };
  let extra: (typeof HOST_RULES)[number] | null = null;
  HOST_RULES.forEach((r) => {
    if (r.h.test(host)) extra = r;
  });
  const keep: string[] = [];
  let n = 0;
  search.slice(1).split("&").forEach((p) => {
    if (!p) return;
    let k = p.split("=")[0];
    try {
      k = decodeURIComponent(k);
    } catch {}
    k = k.toLowerCase();
    let bad = false;
    if (useTrack) {
      const ex = extra as (typeof HOST_RULES)[number] | null;
      if (TRACK.includes(k)) bad = true;
      else if (TRACK_PREFIX.some((x) => k.startsWith(x))) bad = true;
      else if (ex && (ex.p.includes(k) || ex.prefix?.some((x) => k.startsWith(x)))) bad = true;
    }
    if (bad) n++;
    else keep.push(p);
  });
  return { q: keep.length ? "?" + keep.join("&") : "", n };
}

function needsQuery(host: string, path: string): boolean {
  if (path === "/" || path === "") return true;
  if (/(^|\.)youtube\.com$/.test(host) && /^\/(watch|playlist|results)/.test(path)) return true;
  if (/\.(php|aspx?|jspx?|cgi|do|ece|action|cfm)$/i.test(path)) return true;
  const last = (path.replace(/\/+$/, "").split("/").pop() ?? "").toLowerCase();
  return /^(search|results|query|find|watch|view|photo|detail|details|download|go|redirect|out|article)$/.test(last);
}

/** Cleans one address, or says why it was rejected. */
export function cleanOne(raw: string, o: CleanOpts): { ok: true; url: string; changes: string[] } | { ok: false; reason: string } {
  const changes: string[] = [];
  let s = trimUrl(raw);
  if (s !== raw) changes.push("Junk characters removed");
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "Not a valid address" };
  }
  let bh = badHost(u.hostname.toLowerCase());
  if (bh) return { ok: false, reason: bh };
  if (o.wrap) {
    let hops = 0;
    let nx: string | null;
    while (hops < 3 && (nx = unwrapOnce(u))) {
      try {
        u = new URL(nx);
      } catch {
        break;
      }
      hops++;
    }
    if (hops) {
      changes.push("Redirect removed");
      bh = badHost(u.hostname.toLowerCase());
      if (bh) return { ok: false, reason: bh };
    }
  }
  const host = u.hostname.toLowerCase();
  const sq = stripQuery(u.search, host, o.track);
  let path = u.pathname;
  let extra = 0;
  if (sq.q && (o.query === "all" || (o.query === "smart" && !needsQuery(host, u.pathname)))) {
    extra = sq.q.slice(1).split("&").length;
    sq.q = "";
  }
  if (o.track && /(^|\.)amazon\.[a-z.]+$/.test(host)) {
    const p2 = path.replace(/\/ref(?:=|%3D)[^/?#]*$/i, "");
    if (p2 !== path) {
      path = p2 || "/";
      sq.n++;
    }
  }
  let hash = u.hash;
  const h2 = hash.replace(/:~:text=.*$/i, "");
  if (h2 !== hash) {
    hash = h2;
    changes.push("Text highlight removed");
  }
  if (hash === "#") hash = "";
  if (o.anchor && hash) {
    hash = "";
    changes.push("Anchor removed");
  }
  if (u.username || u.password) changes.push("Login details removed");
  if (sq.n) changes.push(`Tracking removed (${sq.n})`);
  if (extra) changes.push(`After ? removed (${extra})`);
  let proto = u.protocol;
  if (o.https && proto === "http:") {
    proto = "https:";
    changes.push("Changed to https");
  }
  if (o.slash) path = path.replace(/\/+$/, "");
  return { ok: true, url: proto + "//" + u.host + path + sq.q + hash, changes };
}

function findHits(line: string, o: CleanOpts) {
  const hits: { s: number; e: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(line))) if (m[0].length > 6) hits.push({ s: m.index, e: m.index + m[0].length, raw: m[0] });
  if (o.bare) {
    BARE_RE.lastIndex = 0;
    while ((m = BARE_RE.exec(line))) {
      const s0 = m.index;
      const e0 = s0 + m[0].length;
      if (hits.some((h) => s0 < h.e && e0 > h.s)) continue;
      hits.push({ s: s0, e: e0, raw: m[0] });
    }
  }
  return hits.sort((a, b) => a.s - b.s);
}

/** Cleans every address found in a block of text, line by line. */
export function cleanText(input: string, o: CleanOpts): CleanResult {
  let text = input;
  let cut = "";
  if (text.length > LIMITS.MAX_TEXT) {
    text = text.slice(0, LIMITS.MAX_TEXT);
    cut = "The text was very long. Only the first 2 million characters were read.";
  }
  const items: CleanItem[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  let dups = 0;
  let capped = false;
  text.split(/\r?\n/).forEach((line) => {
    const t = line.trim();
    if (!t) return;
    // undo common "defanging" such as hxxp and [.]
    const L = t.replace(/[​-‍﻿­]/g, "").replace(/&amp;/gi, "&").replace(/hxxp/gi, "http").replace(/\[\.\]|\(\.\)|\[dot\]/gi, ".").replace(/\[:\]/g, ":");
    const hits = findHits(L, o);
    if (!hits.length) {
      rejected.push({ orig: t, reason: "No web address found" });
      return;
    }
    hits.forEach((h) => {
      const r = cleanOne(h.raw, o);
      if (!r.ok) {
        rejected.push({ orig: h.raw, reason: r.reason });
        return;
      }
      const key = r.url.toLowerCase().replace(/\/$/, "");
      if (o.dedupe && seen.has(key)) {
        dups++;
        return;
      }
      seen.add(key);
      if (items.length >= LIMITS.MAX_LINKS) {
        capped = true;
        return;
      }
      items.push({ orig: h.raw, url: r.url, changes: r.changes, state: "" });
    });
  });
  return { items, rejected, dups, note: (cut ? cut + " " : "") + (capped ? `Only the first ${LIMITS.MAX_LINKS.toLocaleString()} links are kept.` : "") };
}

/** Collects the text of every cell (and cell hyperlink) of a workbook so the cleaner can read it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function workbookText(wb: any): string {
  const lines: string[] = [];
  wb.SheetNames.forEach((n: string) => {
    const ws = wb.Sheets[n];
    Object.keys(ws).forEach((k) => {
      if (k[0] === "!") return;
      const c = ws[k];
      if (c.l && c.l.Target) lines.push(String(c.l.Target));
      if (c.t === "s" && c.v) lines.push(String(c.v));
    });
  });
  return lines.join("\n");
}
