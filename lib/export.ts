import { PAGE_SIZES, type PageSizeId } from "./paper";
import { toPng } from "html-to-image";
import { videoSrc } from "./format";
import { MAX_EXPORT_WIDTH } from "./types";

/**
 * Renders the frame to a high-resolution PNG data URL (width capped at MAX_EXPORT_WIDTH).
 * With `forVideo`, the poster and play badge are left out, because the real video is drawn there.
 */
export async function renderPng(
  node: HTMLElement,
  opts: { forVideo?: boolean; maxWidth?: number } = {},
): Promise<{ dataUrl: string; width: number; height: number }> {
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const pixelRatio = (opts.maxWidth ?? MAX_EXPORT_WIDTH) / w;
  // includeQueryParams: every proxied image shares the path /api/image-proxy and differs only by its
  // ?url=… query. Without it html-to-image treats them as one image and reuses the first for all
  // (e.g. the quoted author's picture showing up on the main post).
  // <video> elements can't be captured from another origin, so they're skipped: the poster image
  // (and play badge) rendered underneath them in the card is what ends up in the exported file.
  const skip = (n: Node) =>
    n instanceof HTMLElement && (n.hasAttribute("data-no-export") || (opts.forVideo === true && n.hasAttribute("data-video-ui")));
  const toOpts = { pixelRatio, width: w, height: h, cacheBust: false, includeQueryParams: true, filter: (n: Node) => n.nodeName !== "VIDEO" && !skip(n) };

  // Some browsers (notably Safari) miss images on the first pass, so warm up once.
  await toPng(node, toOpts);
  const dataUrl = await toPng(node, toOpts);
  return { dataUrl, width: Math.round(w * pixelRatio), height: Math.round(h * pixelRatio) };
}

/** Copies the rendered card to the clipboard as a PNG image. */
export async function copyPngToClipboard(node: HTMLElement): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("Copying images isn't supported in this browser. Use Download instead.");
  }
  // Passing a promise keeps the user-gesture valid while the image renders (needed by Safari).
  const blob = renderPng(node)
    .then((r) => fetch(r.dataUrl))
    .then((r) => r.blob());
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  downloadUrl(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadUrl(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Wraps the PNG in a single-page PDF sized to the card's logical dimensions. */
export async function renderPdf(dataUrl: string, w: number, h: number, layout?: PdfLayout): Promise<Blob> {
  return renderPdfPages([{ dataUrl, w, h }], layout);
}

/** One PDF with a page per image (carousel slides); each page has its own slide's size. */
export type PdfLayout = { size: PageSizeId | "fit"; orientation: "auto" | "portrait" | "landscape" };

/**
 * One image per page. With size "fit" each page is as big as its image (the default). With a paper size
 * (A4, Letter, ...) the picture is centred on that page and scaled to fit inside a small margin, in the
 * orientation chosen, or in whichever suits each picture when the orientation is "auto".
 */
export async function renderPdfPages(pages: { dataUrl: string; w: number; h: number }[], layout?: PdfLayout): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  if (!layout || layout.size === "fit") {
    // "fit" pages take the picture's own shape; the orientation choice only matters for paper sizes
    const own = (p: { w: number; h: number }) => (p.w >= p.h ? "landscape" : "portrait") as "landscape" | "portrait";
    const pdf = new jsPDF({ orientation: own(pages[0]), unit: "px", format: [pages[0].w, pages[0].h], hotfixes: ["px_scaling"], compress: true });
    pages.forEach((p, i) => {
      if (i > 0) pdf.addPage([p.w, p.h], own(p));
      pdf.addImage(p.dataUrl, "PNG", 0, 0, p.w, p.h, undefined, "FAST");
    });
    return pdf.output("blob");
  }
  const sz = PAGE_SIZES.find((x) => x.id === layout.size) ?? PAGE_SIZES[0];
  const dims = (p: { w: number; h: number }) => {
    const land = layout.orientation === "landscape" || (layout.orientation === "auto" && p.w >= p.h);
    return { land, W: land ? sz.h : sz.w, H: land ? sz.w : sz.h };
  };
  const first = dims(pages[0]);
  const pdf = new jsPDF({ orientation: first.land ? "landscape" : "portrait", unit: "mm", format: [sz.w, sz.h], compress: true });
  const M = 10;
  pages.forEach((p, i) => {
    const d = dims(p);
    if (i > 0) pdf.addPage([sz.w, sz.h], d.land ? "landscape" : "portrait");
    const k = Math.min((d.W - 2 * M) / p.w, (d.H - 2 * M) / p.h);
    const w = p.w * k;
    const h = p.h * k;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, d.W, d.H, "F");
    pdf.addImage(p.dataUrl, "PNG", (d.W - w) / 2, (d.H - h) / 2, w, h, undefined, "FAST");
  });
  return pdf.output("blob");
}

/** Bundles files into a ZIP (PNGs are already compressed, so they are stored as they are). */
export async function zipFiles(files: { name: string; dataUrl: string }[]): Promise<Blob> {
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = new Uint8Array(await (await fetch(f.dataUrl)).arrayBuffer());
  const zipped = zipSync(entries, { level: 0 });
  return new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], { type: "application/zip" });
}

const MAX_VIDEO_SECONDS = 180;
const VIDEO_WIDTH = 1080;

type VideoSlot = { el: HTMLVideoElement; x: number; y: number; w: number; h: number; r: number };

/**
 * Loads a private copy of a video so it can be drawn into the recording. Phones ignore preload and
 * only start fetching on play(), so we "prime" it with a muted play/pause instead of waiting for
 * data that would never arrive.
 */
const loadVideo = (src: string) =>
  new Promise<HTMLVideoElement | null>((resolve) => {
    const v = document.createElement("video");
    v.playsInline = true;
    v.muted = true; // muted playback is always allowed, which is what lets us prime it
    v.preload = "auto";
    v.src = src;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      v.onloadeddata = v.oncanplay = v.onerror = null;
      if (!ok) return resolve(null);
      v.pause();
      v.currentTime = 0;
      v.muted = false; // sound goes into the recording only (see renderVideo)
      resolve(v);
    };
    const timer = setTimeout(() => finish(v.readyState >= 2), 25_000);
    v.onloadeddata = () => finish(true);
    v.oncanplay = () => finish(true);
    v.onerror = () => finish(false);
    v.load();
    v.play().catch(() => undefined); // starts the download on browsers that wait for play()
  });

/** A video URL we can draw to a canvas: same-origin (our /api/video proxy), never a cross-origin CDN link. */
const sameOriginVideo = (src: string): string | null => {
  try {
    const u = new URL(src, location.href);
    if (/\.m3u8(\?|$)/i.test(u.pathname)) return null; // HLS playlists can't be loaded this way
    return u.origin === location.origin ? u.href : videoSrc(u.href);
  } catch {
    return null;
  }
};

/** Finds every playable <video> in the card, with its position inside the frame (output pixels). */
async function collectVideoSlots(node: HTMLElement, scale: number): Promise<VideoSlot[]> {
  const nodeRect = node.getBoundingClientRect();
  const k = (node.offsetWidth / (nodeRect.width || 1)) * scale; // preview zoom -> output pixels
  const slots: VideoSlot[] = [];
  for (const live of Array.from(node.querySelectorAll("video"))) {
    const src = sameOriginVideo(live.currentSrc || live.src);
    const box = live.parentElement;
    if (!src || !box) continue;
    const el = await loadVideo(src); // a private copy, so the preview player and its sound are untouched
    if (!el) continue;
    const r = box.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(box).borderTopLeftRadius) || 0;
    el.loop = false;
    slots.push({ el, x: (r.left - nodeRect.left) * k, y: (r.top - nodeRect.top) * k, w: r.width * k, h: r.height * k, r: radius * scale });
  }
  return slots;
}

/**
 * Records the whole card as a video: the post is drawn exactly as in the viewer and each embedded
 * video plays in its place (with its sound). Posts without video get a short fade-in animation.
 * Produces MP4 where the browser can record it (Chrome, Edge, Safari) and WebM otherwise (Firefox).
 */
export async function renderVideo(
  node: HTMLElement,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video export isn't supported in this browser.");
  }

  const scale = VIDEO_WIDTH / node.offsetWidth;
  const slots = await collectVideoSlots(node, scale);
  if (!slots.length && node.querySelector("video")) {
    // Don't quietly hand back a still picture when the post has a video: say what went wrong.
    throw new Error("Couldn't load the video for recording. Wait for it to appear in the preview, then try again.");
  }
  const png = await renderPng(node, { forVideo: slots.length > 0, maxWidth: VIDEO_WIDTH });

  const img = new Image();
  img.src = png.dataUrl;
  await img.decode();

  const W = VIDEO_WIDTH;
  const H = Math.max(2, Math.round((W * img.height) / img.width / 2) * 2); // even dimensions for H.264
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a drawing surface for the video.");

  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("This browser can't record video. Try Chrome, Edge or Safari.");

  const stream = canvas.captureStream(30);

  // Route the videos' sound into the recording (and not to the speakers).
  let audio: AudioContext | null = null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AC && slots.length) {
      audio = new AC();
      const dest = audio.createMediaStreamDestination();
      for (const s of slots) audio.createMediaElementSource(s.el).connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }
  } catch {
    /* no sound: the picture is still recorded */
  }

  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
  });

  const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.closePath();
  };

  const drawVideos = () => {
    for (const s of slots) {
      const vw = s.el.videoWidth;
      const vh = s.el.videoHeight;
      ctx.save();
      roundRect(s.x, s.y, s.w, s.h, s.r);
      ctx.clip();
      ctx.fillStyle = "#000";
      ctx.fillRect(s.x, s.y, s.w, s.h);
      if (vw && vh) {
        const f = Math.min(s.w / vw, s.h / vh); // "contain": the whole video stays visible
        ctx.drawImage(s.el, s.x + (s.w - vw * f) / 2, s.y + (s.h - vh * f) / 2, vw * f, vh * f);
      }
      ctx.restore();
    }
  };

  const drawFrame = (fade: number) => {
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#faf6f1";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fade;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.globalAlpha = 1;
    drawVideos();
  };

  drawFrame(slots.length ? 1 : 0);
  recorder.start();

  if (slots.length) {
    const longest = Math.min(MAX_VIDEO_SECONDS, Math.max(...slots.map((s) => s.el.duration || 0)));
    for (const s of slots) {
      try {
        s.el.currentTime = 0;
        await s.el.play();
      } catch {
        try {
          s.el.muted = true; // autoplay with sound was refused: keep the picture, lose the sound
          await s.el.play();
        } catch {
          /* leave this one on its first frame */
        }
      }
    }
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        drawFrame(1);
        const elapsed = (now - start) / 1000;
        onProgress(Math.min(1, elapsed / (longest || 1)));
        const allDone = slots.every((s) => s.el.ended || s.el.paused);
        if (allDone || elapsed > longest + 1) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    drawFrame(1);
    await new Promise((r) => setTimeout(r, 150)); // let the last frame reach the recorder
  } else {
    const durationMs = 5000;
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        const fade = Math.min(1, t / 0.15);
        const zoom = 1 + 0.04 * t;
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#faf6f1";
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = fade;
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(zoom, zoom);
        ctx.drawImage(img, -W / 2, -H / 2, W, H);
        ctx.restore();
        ctx.globalAlpha = 1;
        onProgress(t);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  slots.forEach((s) => {
    s.el.pause();
    s.el.removeAttribute("src");
    s.el.load();
  });
  void audio?.close();
  const blob = await finished;
  return { blob, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}
