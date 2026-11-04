import { toPng } from "html-to-image";
import { MAX_EXPORT_WIDTH } from "./types";

/** Renders the frame to a high-resolution PNG data URL (width capped at MAX_EXPORT_WIDTH). */
export async function renderPng(node: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  const pixelRatio = MAX_EXPORT_WIDTH / w;
  // <video> elements can't be captured from another origin, so they're skipped: the poster image
  // (and play badge) rendered underneath them in the card is what ends up in the exported file.
  const opts = { pixelRatio, width: w, height: h, cacheBust: false, filter: (n: Node) => n.nodeName !== "VIDEO" };

  // Some browsers (notably Safari) miss images on the first pass, so warm up once.
  await toPng(node, opts);
  const dataUrl = await toPng(node, opts);
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
export async function renderPdf(dataUrl: string, w: number, h: number): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: w >= h ? "landscape" : "portrait",
    unit: "px",
    format: [w, h],
    hotfixes: ["px_scaling"],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, w, h, undefined, "FAST");
  return pdf.output("blob");
}

/**
 * Builds a short video (fade-in + slow zoom) by animating the PNG on a canvas and
 * recording it with MediaRecorder. Produces MP4 where the browser supports it
 * (Chrome, Edge, Safari) and falls back to WebM (Firefox).
 */
export async function renderVideo(
  dataUrl: string,
  onProgress: (fraction: number) => void,
  durationMs = 5000,
): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Video export isn't supported in this browser.");
  }

  const img = new Image();
  img.src = dataUrl;
  await img.decode();

  const W = 1080;
  const H = Math.max(2, Math.round((W * img.height) / img.width / 2) * 2); // even dimensions for H.264
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a drawing surface for the video.");

  const candidates = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("This browser can't record video. Try Chrome, Edge or Safari.");

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const finished = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(";")[0] }));
  });

  const draw = (t: number) => {
    const fade = Math.min(1, t / 0.15);
    const zoom = 1 + 0.04 * t;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -W / 2, -H / 2, W, H);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  draw(0);
  recorder.start();
  const start = performance.now();

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      draw(t);
      onProgress(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await finished;
  return { blob, ext: mime.startsWith("video/mp4") ? "mp4" : "webm" };
}
