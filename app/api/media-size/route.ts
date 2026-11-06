import { NextRequest, NextResponse } from "next/server";
import { isAllowedMediaUrl } from "@/lib/media-hosts";

export const runtime = "nodejs";

/** Reports the byte size of a remote media file (HEAD, or a 1-byte ranged GET as fallback). */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  let target: URL;
  try {
    target = new URL(raw || "");
  } catch {
    return NextResponse.json({ error: "Bad url" }, { status: 400 });
  }
  if (!isAllowedMediaUrl(target)) return NextResponse.json({ error: "Host not allowed" }, { status: 403 });

  const headers = { "user-agent": "Mozilla/5.0 SnapPost" };
  const opts = { redirect: "error" as const, signal: AbortSignal.timeout(8000) };
  let bytes = 0;
  try {
    const h = await fetch(target, { ...opts, method: "HEAD", headers });
    bytes = Number(h.headers.get("content-length")) || 0;
  } catch {
    /* try the ranged GET */
  }
  if (!bytes) {
    try {
      const r = await fetch(target, { ...opts, headers: { ...headers, range: "bytes=0-0" } });
      const total = /\/(\d+)\s*$/.exec(r.headers.get("content-range") || "");
      bytes = total ? Number(total[1]) : r.status === 200 ? Number(r.headers.get("content-length")) || 0 : 0;
      await r.body?.cancel();
    } catch {
      /* unknown size */
    }
  }
  return NextResponse.json({ bytes }, { headers: { "cache-control": "public, max-age=3600" } });
}
