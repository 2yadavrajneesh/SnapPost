import { NextRequest, NextResponse } from "next/server";
import { parseTweetUrl } from "@/lib/parse";
import { fxJson, makeCache, normalizePost, type FxPost } from "@/lib/fx";

export const runtime = "nodejs";

type Payload = FxPost & { maybeThread: boolean };
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

  // A post can only be part of a thread if it continues one of the author's own posts or has replies.
  const maybeThread = post.replyingTo?.toLowerCase() === post.username.toLowerCase() || post.replies > 0;
  const data: Payload = { ...post, maybeThread };
  cache.set(key, data);
  return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
}
