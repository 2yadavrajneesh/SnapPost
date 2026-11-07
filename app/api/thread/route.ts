import { rateLimit, BUCKETS } from "@/lib/ratelimit";
import { NextRequest, NextResponse } from "next/server";
import { parseTweetUrl } from "@/lib/parse";
import { fxJson, makeCache, normalizePost, type FxPost } from "@/lib/fx";

export const runtime = "nodejs";

const MAX_POSTS = 40;
const cache = makeCache<{ posts: FxPost[]; focalId: string }>();

/**
 * Detects whether a post belongs to a thread (a chain of posts by the same author) and, if so,
 * returns the whole thread in reading order. Best-effort: when nothing is found it returns an
 * empty list rather than an error, because threads are an optional extra.
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, BUCKETS.api);
  if (limited) return limited;
  const parsed = parseTweetUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!parsed) return NextResponse.json({ error: "Invalid tweet link." }, { status: 400 });

  const hit = cache.get(parsed.id);
  if (hit) return NextResponse.json(hit);

  const res = await fxJson(`/2/thread/${parsed.id}`);
  if (!res.ok) return NextResponse.json({ posts: [], focalId: parsed.id });

  const focal = normalizePost(res.json?.status);
  const entries: unknown[] = Array.isArray(res.json?.thread) ? res.json.thread : [];
  const all = [...entries, res.json?.status]
    .map((p) => normalizePost(p))
    .filter((p): p is FxPost => !!p);

  const author = (focal?.username ?? parsed.username).toLowerCase();
  const seen = new Set<string>();
  const posts = all
    .filter((p) => p.username.toLowerCase() === author)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .slice(0, MAX_POSTS);

  const data = { posts: posts.length >= 2 ? posts : [], focalId: focal?.id ?? parsed.id };
  cache.set(parsed.id, data);
  return NextResponse.json(data);
}
