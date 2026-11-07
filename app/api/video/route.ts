import { isAllowedMediaUrl } from "@/lib/media-hosts";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB } from "@/lib/limits";

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

    // Downloads (not in-page playback) are capped so the site is not used as a large-file downloader.
    const dl = new URL(req.url).searchParams.get("download");
    let body: ReadableStream<Uint8Array> | null = upstream.body;
    if (dl) {
      const total = Number(/\/(\d+)\s*$/.exec(upstream.headers.get("content-range") ?? "")?.[1]) || Number(upstream.headers.get("content-length")) || 0;
      if (total > MAX_VIDEO_BYTES) {
        await upstream.body?.cancel();
        return Response.json({ error: `Video is larger than the ${MAX_VIDEO_MB} MB download limit` }, { status: 413 });
      }
      if (body && !total) {
        // Size unknown: stop the stream once it passes the limit.
        let sent = 0;
        body = body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, ctl) {
              sent += chunk.byteLength;
              if (sent > MAX_VIDEO_BYTES) ctl.error(new Error("limit"));
              else ctl.enqueue(chunk);
            },
          }),
        );
      }
    }

    const out = new Headers();
    out.set("Content-Type", type && !type.startsWith("application/") ? type : "video/mp4");
    out.set("Accept-Ranges", "bytes");
    for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("Cache-Control", "public, max-age=3600");
    if (dl) out.set("Content-Disposition", `attachment; filename="${dl.replace(/[^\w.\- ]/g, "_").slice(0, 120)}"`);

    return new Response(body as BodyInit | null, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ error: "Could not fetch video" }, { status: 502 });
  }
}
