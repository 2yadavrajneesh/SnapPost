import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Only proxy images from known tweet CDNs (prevents use as an open proxy / SSRF).
const ALLOWED_HOSTS = ["twimg.com", "fxtwitter.com", "fixupx.com"];
const MAX_BYTES = 12 * 1024 * 1024;

function isAllowed(u: URL) {
  if (u.protocol !== "https:") return false;
  return ALLOWED_HOSTS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!isAllowed(target)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      headers: { "User-Agent": "SnapPost/0.1" },
    });
    if (!upstream.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 });

    const type = upstream.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) {
      return NextResponse.json({ error: "Not an image" }, { status: 415 });
    }

    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }

    return new Response(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image" }, { status: 502 });
  }
}
