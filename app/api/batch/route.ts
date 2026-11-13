import { NextRequest, NextResponse } from "next/server";
import { parseTweetUrl } from "@/lib/parse";
import { fxJson, normalizePost, type FxPost } from "@/lib/fx";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LINKS = 40;
const MAX_THREAD_POSTS = 40;

type Result = { url: string; posts?: FxPost[]; error?: string };

async function loadOne(url: string, threads: boolean): Promise<Result> {
  const parsed = parseTweetUrl(url);
  if (!parsed) return { url, error: "Not a tweet link." };
  if (threads) {
    const res = await fxJson(`/2/thread/${parsed.id}`);
    if (res.ok) {
      const focal = normalizePost(res.json?.status);
      const entries: unknown[] = Array.isArray(res.json?.thread) ? res.json.thread : [];
      const all = [...entries, res.json?.status].map((p) => normalizePost(p)).filter((p): p is FxPost => !!p);
      const author = (focal?.username ?? parsed.username).toLowerCase();
      const seen = new Set<string>();
      const posts = all
        .filter((p) => p.username.toLowerCase() === author)
        .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
        .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
        .slice(0, MAX_THREAD_POSTS);
      if (posts.length >= 2) return { url, posts };
    }
  }
  let res = await fxJson(`/2/status/${parsed.id}`);
  let raw: unknown = res.ok ? res.json?.status : null;
  if (!raw) {
    res = await fxJson(`/${parsed.username}/status/${parsed.id}`);
    raw = res.ok ? (res.json?.tweet ?? res.json?.status) : null;
  }
  const post = normalizePost(raw);
  if (!post) return { url, error: res.ok ? "That post is unavailable (deleted, suspended or private)." : res.status === 429 ? "The tweet service is busy. Try again in a moment." : "Couldn't load this post." };
  return { url, posts: [post] };
}

/**
 * POST { urls: string[], threads?: boolean }
 * Loads many posts in one request (the browser would otherwise use up its rate limit one call per link).
 * Returns one result per link, in the same order.
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, BUCKETS.batch);
  if (limited) return limited;
  let body: { urls?: unknown; threads?: unknown } = {};
  try {
    body = await req.json();
  } catch {}
  const urls = Array.isArray(body.urls) ? body.urls.map((u) => String(u)).slice(0, MAX_LINKS) : [];
  if (!urls.length) return NextResponse.json({ error: "No links to load." }, { status: 400 });
  const threads = body.threads === true;
  const results: Result[] = new Array(urls.length);
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      try {
        results[i] = await loadOne(urls[i], threads);
      } catch {
        results[i] = { url: urls[i], error: "Couldn't load this post." };
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return NextResponse.json({ results });
}
