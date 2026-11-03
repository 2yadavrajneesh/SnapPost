import { NextRequest, NextResponse } from "next/server";
import { parseTweetUrl } from "@/lib/parse";

export const runtime = "nodejs";

type Cached = { at: number; data: unknown };
const cache = new Map<string, Cached>();
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE = 200;

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_QUOTE_DEPTH = 2;

/** First playable video (or GIF, which X serves as MP4) on a post, with its thumbnail and size. */
function pickVideo(tweet: any) {
  const media = tweet.media ?? {};
  const list: any[] = media.videos?.length
    ? media.videos
    : (media.all ?? []).filter((m: any) => m?.type === "video" || m?.type === "gif");
  const v = list[0];
  if (!v || typeof v.url !== "string" || !v.url) return null;
  // A plain <video> can only play MP4; other formats (e.g. HLS) fall back to the thumbnail.
  if (v.format && !String(v.format).includes("mp4")) return null;
  return {
    url: v.url as string,
    poster: typeof v.thumbnail_url === "string" ? (v.thumbnail_url as string) : null,
    width: Number(v.width) || 16,
    height: Number(v.height) || 9,
    gif: v.type === "gif",
  };
}

function clean(tweet: any, depth = 0): any {
  const author = tweet.author ?? {};
  const photo = tweet.media?.photos?.[0]?.url as string | undefined;
  const videoThumb = tweet.media?.videos?.[0]?.thumbnail_url as string | undefined;
  const avatar = typeof author.avatar_url === "string" ? author.avatar_url.replace("_normal.", "_400x400.") : "";
  const timestamp = tweet.created_timestamp
    ? Number(tweet.created_timestamp) * 1000
    : tweet.created_at
      ? Date.parse(tweet.created_at) || null
      : null;

  return {
    id: String(tweet.id ?? ""),
    text: String(tweet.text ?? ""),
    name: String(author.name ?? author.screen_name ?? ""),
    username: String(author.screen_name ?? ""),
    avatar,
    verified: Boolean(author.verified ?? author.verification?.verified ?? false),
    timestamp: timestamp ?? (depth === 0 ? Date.now() : null),
    replies: Number(tweet.replies ?? 0),
    reposts: Number(tweet.retweets ?? 0),
    likes: Number(tweet.likes ?? 0),
    views: Number(tweet.views ?? 0),
    image: photo ?? videoThumb ?? null,
    video: pickVideo(tweet),
    quote: tweet.quote && depth < MAX_QUOTE_DEPTH ? clean(tweet.quote, depth + 1) : null,
  };
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const parsed = parseTweetUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "That doesn't look like a valid tweet link. Use a link like https://x.com/user/status/123…" },
      { status: 400 },
    );
  }

  const key = `${parsed.username.toLowerCase()}/${parsed.id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.data, { headers: { "X-Cache": "HIT" } });
  }

  try {
    const res = await fetch(`https://api.fxtwitter.com/${parsed.username}/status/${parsed.id}`, {
      headers: { "User-Agent": "SnapPost/0.1 (+tweet-to-image tool)", Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (res.status === 404) {
      return NextResponse.json(
        { error: "Tweet not found. It may be deleted, or the account may be private." },
        { status: 404 },
      );
    }
    if (res.status === 429) {
      return NextResponse.json(
        { error: "The tweet service is rate-limiting requests. Wait a moment, or edit the details by hand." },
        { status: 429 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `The tweet service returned an error (${res.status}). You can still edit the details by hand.` },
        { status: 502 },
      );
    }

    const json = await res.json();
    if (!json?.tweet) {
      return NextResponse.json({ error: "No tweet data came back for that link." }, { status: 404 });
    }

    const data = clean(json.tweet);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), data });
    return NextResponse.json(data, { headers: { "X-Cache": "MISS" } });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json(
      {
        error: timedOut
          ? "The tweet service took too long to respond. Try again, or edit the details by hand."
          : "Couldn't reach the tweet service. You can still edit the details by hand.",
      },
      { status: 504 },
    );
  }
}
