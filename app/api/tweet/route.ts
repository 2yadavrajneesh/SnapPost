import { NextRequest, NextResponse } from "next/server";
import { parseTweetUrl } from "@/lib/parse";
import { fxJson, makeCache, normalizePost, type FxPost } from "@/lib/fx";

export const runtime = "nodejs";

type Payload = FxPost & { maybeThread: boolean; parents: FxPost[] };

const MAX_PARENTS = 3;
const cache = makeCache<Payload>();

function failure(status: number) {
  if (status === 404) {
    return NextResponse.json(
      { error: "Tweet not found. It may be deleted, or the account may be private." },
      { status: 404 },
    );
  }
  if (status === 429) {
    return NextResponse.json(
      { error: "The tweet service is rate-limiting requests. Wait a moment, or edit the details by hand." },
      { status: 429 },
    );
  }
  if (status === 0) {
    return NextResponse.json(
      { error: "Couldn't reach the tweet service. You can still edit the details by hand." },
      { status: 504 },
    );
  }
  return NextResponse.json(
    { error: `The tweet service returned an error (${status}). You can still edit the details by hand.` },
    { status: 502 },
  );
}

async function fetchPost(id: string): Promise<FxPost | null> {
  let res = await fxJson(`/2/status/${id}`);
  let raw: unknown = res.ok ? res.json?.status : null;
  if (!raw) {
    res = await fxJson(`/i/status/${id}`);
    raw = res.ok ? (res.json?.tweet ?? res.json?.status) : null;
  }
  return normalizePost(raw);
}

const idLess = (a: string, b: string) => {
  try {
    return BigInt(a) < BigInt(b);
  } catch {
    return false;
  }
};

/**
 * Walks up a reply chain (nearest parent last in the result). The service doesn't always say which
 * post is being replied to, so this tries, in order: the id on the post itself, the older endpoint's
 * record of it, and finally the conversation (thread) endpoint, matching on the replied-to account.
 */
async function findParents(post: FxPost, id: string): Promise<FxPost[]> {
  const parents: FxPost[] = [];
  const seen = new Set<string>([post.id || id]);
  const pool = new Map<string, FxPost>();
  let loaded = false;
  const loadPool = async () => {
    if (loaded) return;
    loaded = true;
    const res = await fxJson(`/2/thread/${id}`);
    if (!res.ok) return;
    const entries: unknown[] = [...(Array.isArray(res.json?.thread) ? res.json.thread : []), res.json?.status];
    for (const e of entries) {
      const p = normalizePost(e);
      if (p?.id) pool.set(p.id, p);
    }
  };

  let cur = post;
  while (parents.length < MAX_PARENTS) {
    let pid = cur.replyingToId;
    if (!pid && cur === post) {
      const v1 = await fxJson(`/${cur.username}/status/${id}`);
      pid = (v1.ok ? normalizePost(v1.json?.tweet ?? v1.json?.status) : null)?.replyingToId ?? null;
    }

    let parent: FxPost | null = null;
    if (pid && !seen.has(pid)) parent = pool.get(pid) ?? (await fetchPost(pid));
    if (!parent && cur.replyingTo) {
      await loadPool();
      if (pid && pool.has(pid)) parent = pool.get(pid)!;
      else {
        const handle = cur.replyingTo.toLowerCase();
        const candidates = [...pool.values()]
          .filter((p) => p.username.toLowerCase() === handle && !seen.has(p.id) && idLess(p.id, cur.id || id))
          .sort((x, y) => (idLess(x.id, y.id) ? 1 : -1)); // newest earlier post first
        parent = candidates[0] ?? null;
      }
    }
    if (!parent || seen.has(parent.id)) break; // unavailable, or we looped
    seen.add(parent.id);
    parents.unshift(parent);
    cur = parent;
    if (!cur.replyingTo) break;
  }
  return parents;
}

export async function GET(req: NextRequest) {
  const parsed = parseTweetUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!parsed) {
    return NextResponse.json(
      { error: "That doesn't look like a valid tweet link. Use a link like https://x.com/user/status/123…" },
      { status: 400 },
    );
  }

  const key = parsed.id;
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit, { headers: { "X-Cache": "HIT" } });

  // The v2 API has richer video data (every MP4 rendition); fall back to v1 if it isn't available.
  const v2 = await fxJson(`/2/status/${parsed.id}`);
  if (!v2.ok && v2.status === 429) return failure(429);

  let raw: unknown = v2.ok ? v2.json?.status : null;
  if (!raw) {
    const v1 = await fxJson(`/${parsed.username}/status/${parsed.id}`);
    if (!v1.ok) return failure(v1.status);
    raw = v1.json?.tweet ?? v1.json?.status;
  }

  const post = normalizePost(raw);
  if (!post) {
    return NextResponse.json({ error: "That post is unavailable (deleted, suspended or private)." }, { status: 404 });
  }

  // The main post must always show its own author's picture. If the service left it out, or handed
  // back the quoted author's picture instead, take it from the older endpoint's author record.
  if (!post.avatar || (post.quote && post.avatar === post.quote.avatar && post.username !== post.quote.username)) {
    const v1 = await fxJson(`/${post.username || parsed.username}/status/${parsed.id}`);
    const own = v1.ok ? normalizePost(v1.json?.tweet ?? v1.json?.status) : null;
    if (own?.avatar && own.username.toLowerCase() === post.username.toLowerCase()) post.avatar = own.avatar;
  }

  // A reply to someone else: fetch the post(s) above it so the image can show what is being replied
  // to. Replies to your own posts are handled by the thread view instead.
  const parents =
    post.replyingTo && post.replyingTo.toLowerCase() !== post.username.toLowerCase()
      ? await findParents(post, parsed.id)
      : [];

  // A post can only be part of a thread if it continues one of the author's own posts or has replies.
  const maybeThread = post.replyingTo?.toLowerCase() === post.username.toLowerCase() || post.replies > 0;
  const data: Payload = { ...post, maybeThread, parents };
  cache.set(key, data);
  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}
