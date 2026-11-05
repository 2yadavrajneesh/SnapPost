import { NextRequest, NextResponse } from "next/server";
import { isAllowedMediaUrl } from "@/lib/media-hosts";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024; // original-resolution photos can be several MB

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!isAllowedMediaUrl(target)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
      headers: { "User-Agent": "SnapPost/0.2" },
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

    const dl = req.nextUrl.searchParams.get("download");
    return new Response(buf, {
      headers: {
        ...(dl ? { "Content-Disposition": `attachment; filename="${dl.replace(/[^\w.\- ]/g, "_").slice(0, 120)}"` } : {}),
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not fetch image" }, { status: 502 });
  }
}
