import { isAllowedMediaUrl } from "@/lib/media-hosts";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Streams a video from X's CDN through our own origin, with HTTP Range support so seeking works.
 * Playing it same-origin avoids hotlink/Referer/CORS problems that stop <video> loading directly.
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return Response.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!isAllowedMediaUrl(target)) return Response.json({ error: "Host not allowed" }, { status: 403 });

  const headers: Record<string, string> = { "User-Agent": "SnapPost/0.2", Accept: "*/*" };
  const range = req.headers.get("range");
  if (range) headers.Range = range;

  try {
    const upstream = await fetch(target, { headers, redirect: "error", signal: req.signal });
    if (!upstream.ok) return Response.json({ error: "Upstream error" }, { status: 502 });

    const type = upstream.headers.get("content-type") ?? "";
    if (type && !/^(video\/|application\/octet-stream|binary\/)/i.test(type)) {
      return Response.json({ error: "Not a video" }, { status: 415 });
    }

    const out = new Headers();
    out.set("Content-Type", type && !type.startsWith("application/") ? type : "video/mp4");
    out.set("Accept-Ranges", "bytes");
    for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Cache-Control", "public, max-age=3600");
    const dl = new URL(req.url).searchParams.get("download");
    if (dl) out.set("Content-Disposition", `attachment; filename="${dl.replace(/[^\w.\- ]/g, "_").slice(0, 120)}"`);

    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ error: "Could not fetch video" }, { status: 502 });
  }
}
