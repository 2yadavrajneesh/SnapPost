/**
 * Per-IP rate limiting with a fixed window. Once an IP uses up its quota it is blocked until the
 * window ends, then it can use the site again.
 *
 * Counts live in Upstash Redis when UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set
 * (exact across all Vercel servers). Without them it falls back to per-server memory, which is
 * weaker but keeps the site working. If Redis is unreachable the check falls back to memory too.
 */

export type Bucket = { name: string; max: number; windowSec: number };

const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const BUCKETS = {
  /** Tweet and thread lookups. */
  api: { name: "api", max: num(process.env.RATE_LIMIT_API_MAX, 30), windowSec: num(process.env.RATE_LIMIT_API_WINDOW_SEC, 600) },
  /** Loading many tweet links in one go (each call can hold up to 40 links). */
  batch: { name: "batch", max: num(process.env.RATE_LIMIT_BATCH_MAX, 8), windowSec: num(process.env.RATE_LIMIT_BATCH_WINDOW_SEC, 600) },
  /** Image proxy, video playback and media-size checks. */
  media: { name: "media", max: num(process.env.RATE_LIMIT_MEDIA_MAX, 300), windowSec: num(process.env.RATE_LIMIT_MEDIA_WINDOW_SEC, 600) },
  /** Video file downloads. */
  download: { name: "download", max: num(process.env.RATE_LIMIT_DOWNLOAD_MAX, 10), windowSec: num(process.env.RATE_LIMIT_DOWNLOAD_WINDOW_SEC, 3600) },
  /** Saving a page to the Wayback Machine (slow, and it uses their service). */
  archive: { name: "archive", max: num(process.env.RATE_LIMIT_ARCHIVE_MAX, 8), windowSec: num(process.env.RATE_LIMIT_ARCHIVE_WINDOW_SEC, 600) },
  /** PDF apps: asking for an upload slot (one per file). */
  pdfUpload: { name: "pdfup", max: num(process.env.RATE_LIMIT_PDF_UPLOAD_MAX, 150), windowSec: num(process.env.RATE_LIMIT_PDF_UPLOAD_WINDOW_SEC, 600) },
  /** PDF apps: running a tool. */
  pdfRun: { name: "pdfrun", max: num(process.env.RATE_LIMIT_PDF_RUN_MAX, 20), windowSec: num(process.env.RATE_LIMIT_PDF_RUN_WINDOW_SEC, 600) },
  /** PDF apps: a daily cap per visitor, so the free storage allowance lasts. */
  pdfDay: { name: "pdfday", max: num(process.env.RATE_LIMIT_PDF_DAY_MAX, 40), windowSec: 86400 },
} satisfies Record<string, Bucket>;

export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

const mem = new Map<string, { n: number; resetAt: number }>();

function memHit(key: string, b: Bucket): number {
  const now = Date.now();
  if (mem.size > 5000) for (const [k, v] of mem) if (v.resetAt <= now) mem.delete(k);
  let e = mem.get(key);
  if (!e || e.resetAt <= now) {
    e = { n: 0, resetAt: now + b.windowSec * 1000 };
    mem.set(key, e);
  }
  e.n += 1;
  return e.n > b.max ? Math.max(1, Math.ceil((e.resetAt - now) / 1000)) : 0;
}

async function redisHit(key: string, b: Bucket): Promise<number | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([["INCR", key], ["EXPIRE", key, String(b.windowSec), "NX"], ["TTL", key]]),
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const out = (await res.json()) as { result?: number }[];
    const count = Number(out[0]?.result);
    const ttl = Number(out[2]?.result);
    if (!Number.isFinite(count)) return null;
    return count > b.max ? Math.max(1, ttl > 0 ? ttl : b.windowSec) : 0;
  } catch {
    return null;
  }
}

/** Returns null when the request may go ahead, or a ready-made 429 response when the IP is over its limit. */
export async function rateLimit(req: Request, b: Bucket): Promise<Response | null> {
  const key = `rl:${b.name}:${clientIp(req)}`;
  const wait = (await redisHit(key, b)) ?? memHit(key, b);
  if (!wait) return null;
  const mins = Math.ceil(wait / 60);
  const when = wait < 90 ? `${wait} seconds` : mins < 90 ? `${mins} minutes` : `${Math.ceil(mins / 60)} hours`;
  return Response.json(
    { error: `Too many requests. Please try again in about ${when}.`, retryAfter: wait },
    { status: 429, headers: { "Retry-After": String(wait), "Cache-Control": "no-store" } },
  );
}
