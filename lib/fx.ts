/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-side helpers for talking to FxEmbed (https://github.com/FxEmbed/FxEmbed) and turning its
 * responses into the small, stable shape the UI uses. Handles both the v2 API (`/2/status/{id}`,
 * wrapper field `status`) and the older v1 API (`/{user}/status/{id}`, wrapper field `tweet`).
 */

export type FxVideo = {
  /** Playable MP4 URLs, best first. */
  sources: string[];
  /** HLS playlist, only useful as a last resort (Safari plays it natively). */
  hls: string | null;
  poster: string | null;
  width: number;
  height: number;
  gif: boolean;
  /** Every H.264 MP4 rendition (one per height, best bitrate), tallest first: used for the download options. */
  variants: { url: string; height: number; width: number }[];
};

/** Badge colour: blue = individual, gold = organization, gray = government / official. */
function badgeKind(author: any): "blue" | "gold" | "gray" {
  const t = String(author?.verification?.type ?? author?.verified_type ?? "").toLowerCase();
  if (/org|business|company/.test(t)) return "gold";
  if (/gov|official/.test(t)) return "gray";
  return "blue";
}

export type FxPost = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  verifiedType: "blue" | "gold" | "gray";
  text: string;
  timestamp: number | null;
  photos: string[];
  video: FxVideo | null;
  replies: number;
  reposts: number;
  likes: number;
  views: number;
  replyingTo: string | null;
  /** Id of the post this one replies to, when the service says. */
  replyingToId: string | null;
  quote: FxPost | null;
};

export const fxBase = () => (process.env.FX_API_BASE || "https://api.fxtwitter.com").replace(/\/+$/, "");

/** Asks X's image CDN for the original-resolution file instead of the default medium size. */
export function hiRes(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === "pbs.twimg.com" && u.pathname.startsWith("/media/")) {
      u.pathname = u.pathname.replace(/:(orig|large|medium|small|thumb)$/, "");
      u.searchParams.set("name", "orig");
      return u.toString();
    }
  } catch {
    /* not a URL: leave as is */
  }
  return url;
}

const isMp4Url = (s: unknown) => typeof s === "string" && /\.mp4(\?|$)/i.test(s);

/**
 * Picks the best playable MP4 renditions for a video/GIF. X serves several (and HLS, and sometimes
 * HEVC that browsers can't play), so we prefer H.264 MP4s, up to 1080p, highest quality first.
 */
/** X video URLs carry their size, e.g. ".../vid/avc1/0/0/1280x720/abc.mp4". */
export function dimsFromUrl(url: string): { width: number; height: number } | null {
  const m = /\/(\d{3,4})x(\d{3,4})\//.exec(url);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/**
 * The service sometimes returns just one MP4 for a video. X's public embed endpoint lists every
 * rendition, so ask it for the full ladder (best first, one MP4 per size).
 */
export async function syndicationVariants(id: string): Promise<{ url: string; height: number; width: number }[]> {
  try {
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
    const base = process.env.SYNDICATION_BASE ?? "https://cdn.syndication.twimg.com";
    const res = await fetch(`${base}/tweet-result?id=${encodeURIComponent(id)}&token=${token}`, {
      headers: { "User-Agent": "Mozilla/5.0 SnapPost" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const j = await res.json();
    const details: any[] = Array.isArray(j?.mediaDetails) ? j.mediaDetails : [];
    const vs: any[] = details.find((m) => m?.video_info?.variants)?.video_info?.variants ?? [];
    const best = new Map<number, { url: string; height: number; width: number; bitrate: number }>();
    for (const x of vs) {
      if (x?.content_type !== "video/mp4" || !x.url) continue;
      const d = dimsFromUrl(String(x.url));
      if (!d) continue;
      const bitrate = Number(x.bitrate) || 0;
      const have = best.get(d.height);
      if (!have || bitrate > have.bitrate) best.set(d.height, { url: String(x.url), ...d, bitrate });
    }
    return [...best.values()].sort((a, b) => b.height - a.height).map(({ url, height, width }) => ({ url, height, width }));
  } catch {
    return [];
  }
}

export function pickVideo(media: any): FxVideo | null {
  const list: any[] = media?.videos?.length
    ? media.videos
    : (media?.all ?? []).filter((m: any) => m?.type === "video" || m?.type === "gif");
  const v = list[0];
  if (!v) return null;

  const formats: any[] = Array.isArray(v.formats) ? v.formats : [];
  const mp4s = formats
    .filter((f) => f?.url && (f.container === "mp4" || isMp4Url(f.url)))
    .filter((f) => !f.codec || /^(h264|avc)/i.test(String(f.codec)))
    .sort((a, b) => {
      const rank = (f: any) => (Number(f.height) <= 1080 ? Number(f.height) || 0 : -Number(f.height));
      return rank(b) - rank(a) || (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
    })
    .map((f) => String(f.url));

  const sources = [...mp4s];
  const fmt = String(v.format ?? "");
  if (typeof v.url === "string" && v.url && (fmt.includes("mp4") || isMp4Url(v.url)) && !sources.includes(v.url)) {
    sources.push(v.url);
  }

  const hls =
    formats.find((f) => f?.container === "m3u8" && f.url)?.url ??
    (typeof v.url === "string" && /m3u8|mpegurl/i.test(`${v.url} ${fmt}`) ? v.url : null);

  if (!sources.length && !hls) return null;

  const byHeight = new Map<number, { url: string; height: number; width: number; bitrate: number }>();
  for (const f of formats) {
    if (!f?.url || !(f.container === "mp4" || isMp4Url(f.url))) continue;
    if (f.codec && !/^(h264|avc)/i.test(String(f.codec))) continue;
    const height = Number(f.height) || 0;
    const bitrate = Number(f.bitrate) || 0;
    const have = byHeight.get(height);
    if (!have || bitrate > have.bitrate) byHeight.set(height, { url: String(f.url), height, width: Number(f.width) || 0, bitrate });
  }
  const variants = [...byHeight.values()]
    .sort((a, b) => b.height - a.height)
    .map(({ url, height, width }) => ({ url, height, width }));
  if (!variants.length && sources[0]) {
    const d = dimsFromUrl(sources[0]);
    variants.push({ url: sources[0], height: d?.height || Number(v.height) || 0, width: d?.width || Number(v.width) || 0 });
  }

  return {
    sources,
    hls: hls ? String(hls) : null,
    poster: typeof v.thumbnail_url === "string" ? hiRes(v.thumbnail_url) : null,
    width: Number(v.width) || 16,
    height: Number(v.height) || 9,
    gif: v.type === "gif",
    variants,
  };
}

const MAX_QUOTE_DEPTH = 2;

/** Turns one FxEmbed post (v1 or v2 shape) into an FxPost. Returns null for tombstones/garbage. */
export function normalizePost(p: any, depth = 0): FxPost | null {
  if (!p || typeof p !== "object" || p.type === "tombstone") return null;
  const author = p.author ?? {};
  const photos: string[] = (p.media?.photos ?? [])
    .map((x: any) => (typeof x?.url === "string" ? hiRes(x.url) : ""))
    .filter(Boolean);

  const timestamp = p.created_timestamp
    ? Number(p.created_timestamp) * 1000
    : p.created_at
      ? Date.parse(p.created_at) || null
      : null;

  const replyingTo =
    typeof p.replying_to === "string" ? p.replying_to : (p.replying_to?.screen_name as string | undefined) ?? null;

  return {
    id: String(p.id ?? ""),
    name: String(author.name ?? author.screen_name ?? ""),
    username: String(author.screen_name ?? ""),
    avatar: typeof author.avatar_url === "string" ? author.avatar_url.replace("_normal.", "_400x400.") : "",
    verified: Boolean(author.verification?.verified ?? author.verified ?? false),
    verifiedType: badgeKind(author),
    text: String(p.text ?? ""),
    timestamp,
    photos,
    video: pickVideo(p.media),
    replies: Number(p.replies ?? 0),
    reposts: Number(p.reposts ?? p.retweets ?? 0),
    likes: Number(p.likes ?? 0),
    views: Number(p.views ?? 0),
    replyingTo,
    replyingToId: String(p.replying_to?.post ?? p.replying_to_status ?? "") || null,
    quote: p.quote && depth < MAX_QUOTE_DEPTH ? normalizePost(p.quote, depth + 1) : null,
  };
}

export type FxResult = { ok: true; json: any } | { ok: false; status: number };

export async function fxJson(path: string): Promise<FxResult> {
  try {
    const res = await fetch(`${fxBase()}${path}`, {
      headers: { "User-Agent": "SnapPost/0.2 (+tweet-to-image tool)", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, json: await res.json() };
  } catch {
    return { ok: false, status: 0 }; // network error or timeout
  }
}

/** Tiny TTL cache so repeat fetches of the same post don't hammer FxEmbed. */
export function makeCache<T>(ttlMs = 5 * 60 * 1000, max = 200) {
  const map = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = map.get(key);
      return hit && Date.now() - hit.at < ttlMs ? hit.value : undefined;
    },
    set(key: string, value: T) {
      if (map.size >= max) map.delete(map.keys().next().value as string);
      map.set(key, { at: Date.now(), value });
    },
  };
}
