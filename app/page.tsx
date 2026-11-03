"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import TweetCard from "@/components/TweetCard";
import { Label, Section, Segmented, Slider, TextField, Toggle } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { copyPngToClipboard, downloadBlob, downloadUrl, renderPdf, renderPng, renderVideo } from "@/lib/export";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TWEET,
  FRAME_W,
  MAX_EXPORT_WIDTH,
  RATIOS,
  type RatioKey,
  type Settings,
  type TweetData,
} from "@/lib/types";

type Format = "png" | "pdf" | "mp4";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const STAGE_PAD = 8; // breathing room around the card inside the preview window

export default function Home() {
  const [tweet, setTweet] = useState<TweetData>(DEFAULT_TWEET);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const [format, setFormat] = useState<Format>("png");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "working" | "done">("idle");

  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [frameH, setFrameH] = useState(600);
  const [stageW, setStageW] = useState(800);
  const [stageH, setStageH] = useState(600);
  const [viewportH, setViewportH] = useState(800);
  const [isDesktop, setIsDesktop] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to window

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const setT = <K extends keyof TweetData>(key: K, value: TweetData[K]) => setTweet((t) => ({ ...t, [key]: value }));
  const setCount = (key: "replies" | "reposts" | "likes" | "views", v: string) =>
    setT(key, Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, "")) || 0)));

  // Re-measure after every render (cheap; setState bails out when unchanged)...
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    setFrameH(el.offsetHeight);
    setOverflow(el.scrollHeight > el.clientHeight + 2);
  });

  // ...and whenever the frame resizes on its own, e.g. when avatars or images finish loading.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setFrameH(el.offsetHeight);
      setOverflow(el.scrollHeight > el.clientHeight + 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track the preview window size so "fit" always shows the whole card.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setStageW(el.clientWidth);
      setStageH(el.clientHeight);
      setViewportH(window.innerHeight);
      setIsDesktop(mq.matches);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // On desktop the preview fills the space under the navbar; on phones it gets 70% of the screen height.
  const availH = isDesktop ? stageH : Math.round(viewportH * 0.7);
  const fitScale = Math.max(
    MIN_ZOOM,
    Math.min(1, (stageW - STAGE_PAD * 2) / FRAME_W, (availH - STAGE_PAD * 2) / frameH),
  );
  const scale = zoom ?? fitScale;
  const zoomIn = () => setZoom(Math.min(MAX_ZOOM, scale * ZOOM_STEP));
  const zoomOut = () => setZoom(Math.max(MIN_ZOOM, scale / ZOOM_STEP));
  const outW = MAX_EXPORT_WIDTH;
  const outH = Math.round((frameH / FRAME_W) * MAX_EXPORT_WIDTH);

  async function fetchTweet() {
    if (!link.trim()) {
      setFetchError("Paste a tweet link first.");
      return;
    }
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/tweet?url=${encodeURIComponent(link.trim())}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't fetch that tweet.");
      setTweet({
        name: j.name,
        username: j.username,
        avatar: j.avatar,
        verified: j.verified,
        text: j.text,
        time: formatTime(j.timestamp),
        date: formatDate(j.timestamp),
        replies: j.replies,
        reposts: j.reposts,
        likes: j.likes,
        views: j.views,
        image: j.image,
        video: j.video ?? null,
        quote: j.quote ?? null,
      });
      setZoom(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Couldn't fetch that tweet.");
    } finally {
      setFetching(false);
    }
  }

  function onAvatarFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setT("avatar", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function download() {
    const node = frameRef.current;
    if (!node) return;
    setExporting(true);
    setExportError(null);
    setProgress(null);
    const base = `snappost-${tweet.username || "post"}`;
    try {
      const png = await renderPng(node);
      if (format === "png") {
        downloadUrl(png.dataUrl, `${base}.png`);
      } else if (format === "pdf") {
        const blob = await renderPdf(png.dataUrl, node.offsetWidth, node.offsetHeight);
        downloadBlob(blob, `${base}.pdf`);
      } else {
        setProgress(0);
        const { blob, ext } = await renderVideo(png.dataUrl, setProgress);
        downloadBlob(blob, `${base}.${ext}`);
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

  async function copyImage() {
    const node = frameRef.current;
    if (!node) return;
    setCopyState("working");
    setExportError(null);
    try {
      await copyPngToClipboard(node);
      setCopyState("done");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (e) {
      setCopyState("idle");
      setExportError(e instanceof Error ? e.message : "Couldn't copy the image. Try Download instead.");
    }
  }

  function bestFit() {
    setSettings((s) => ({ ...s, ratio: "auto", padding: 100 }));
    setZoom(null);
  }

  const ratioOptions = (Object.keys(RATIOS) as RatioKey[]).map((k) => ({
    value: k,
    label: RATIOS[k].label,
    title: RATIOS[k].note,
  }));

  const zoomBtn =
    "h-8 w-8 rounded-lg border border-stone-200 bg-white text-base font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40";
  const pillBtn =
    "rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40";

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      {/* Navbar: brand on the left, export controls on the right */}
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#faf6f1]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white shadow-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
              </svg>
            </span>
            <div>
              <div className="text-base font-bold leading-none">SnapPost</div>
              <div className="mt-1 text-[11px] text-stone-500">Posts to polished images</div>
            </div>
            <span className="ml-1 rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600">
              Beta
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={format}
              options={[
                { value: "png", label: "PNG" },
                { value: "pdf", label: "PDF" },
                { value: "mp4", label: "MP4" },
              ]}
              onChange={setFormat}
            />
            <button
              type="button"
              onClick={copyImage}
              disabled={exporting || copyState === "working"}
              className="whitespace-nowrap rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-800 shadow-sm transition hover:bg-stone-50 disabled:opacity-60"
            >
              {copyState === "working" ? "Copying…" : copyState === "done" ? "Copied ✓" : "Copy image"}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={exporting}
              className="whitespace-nowrap rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
            >
              {exporting
                ? progress !== null
                  ? `Recording ${Math.round(progress * 100)}%`
                  : "Rendering…"
                : format === "png"
                  ? "Download image"
                  : format === "pdf"
                    ? "Download PDF"
                    : "Download video"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] flex-1 gap-4 px-4 pb-5 pt-4 sm:px-6 lg:min-h-0 lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* Controls (scroll on their own on desktop, so the preview never moves) */}
        <aside className="order-2 min-w-0 space-y-3 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:pb-2 lg:pr-1">
          <Section title="Source">
            <div>
              <Label>Tweet link</Label>
              <div className="flex gap-2">
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchTweet()}
                  placeholder="https://x.com/user/status/123…"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-200"
                />
                <button
                  type="button"
                  onClick={fetchTweet}
                  disabled={fetching}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60"
                >
                  {fetching ? "Fetching…" : "Fetch"}
                </button>
              </div>
              {fetchError && (
                <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {fetchError}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowEdit((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200"
              aria-expanded={showEdit}
            >
              Edit details
              <span>{showEdit ? "−" : "+"}</span>
            </button>

            {showEdit && (
              <div className="space-y-3">
                <label className="block">
                  <Label>Tweet text</Label>
                  <textarea
                    value={tweet.text}
                    onChange={(e) => setT("text", e.target.value)}
                    rows={4}
                    className="w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-200"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Display name" value={tweet.name} onChange={(v) => setT("name", v)} />
                  <TextField label="Username" prefix="@" value={tweet.username} onChange={(v) => setT("username", v.replace(/^@/, ""))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Replies" value={tweet.replies} onChange={(v) => setCount("replies", v)} />
                  <TextField label="Reposts" value={tweet.reposts} onChange={(v) => setCount("reposts", v)} />
                  <TextField label="Likes" value={tweet.likes} onChange={(v) => setCount("likes", v)} />
                  <TextField label="Views" value={tweet.views} onChange={(v) => setCount("views", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Time" value={tweet.time} onChange={(v) => setT("time", v)} />
                  <TextField label="Date" value={tweet.date} onChange={(v) => setT("date", v)} />
                </div>
                <Toggle label="Verified badge" checked={tweet.verified} onChange={(v) => setT("verified", v)} />
                <div className="flex items-center justify-between gap-3">
                  <label className="cursor-pointer rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
                    Upload avatar
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarFile(e.target.files?.[0])} />
                  </label>
                  <div className="flex gap-3 text-xs">
                    {tweet.avatar && (
                      <button type="button" onClick={() => setT("avatar", "")} className="text-stone-500 underline hover:text-stone-900">
                        Remove avatar
                      </button>
                    )}
                    {(tweet.image || tweet.video) && (
                      <button
                        type="button"
                        onClick={() => setTweet((t) => ({ ...t, image: null, video: null }))}
                        className="text-stone-500 underline hover:text-stone-900"
                      >
                        Remove media
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Output ratio">
            <Segmented wrap value={settings.ratio} options={ratioOptions} onChange={(v) => set("ratio", v)} />
          </Section>

          <Section title="Appearance">
            <div>
              <Label>Theme</Label>
              <Segmented
                value={settings.theme}
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
                onChange={(v) => set("theme", v)}
              />
            </div>
            <div>
              <Label>Style</Label>
              <Segmented
                value={settings.style}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "minimal", label: "Minimalist" },
                ]}
                onChange={(v) => set("style", v)}
              />
            </div>
            <div>
              <Label>Corners</Label>
              <Segmented
                value={settings.corners}
                options={[
                  { value: "sharp", label: "Sharp" },
                  { value: "soft", label: "Soft" },
                  { value: "round", label: "Round" },
                ]}
                onChange={(v) => set("corners", v)}
              />
            </div>
            <div>
              <Label>Font</Label>
              <Segmented
                value={settings.font}
                options={[
                  { value: "sans", label: "Sans" },
                  { value: "rounded", label: "Rounded" },
                  { value: "serif", label: "Serif" },
                ]}
                onChange={(v) => set("font", v)}
              />
            </div>
            <div>
              <Label>Logo</Label>
              <Segmented
                value={settings.logo}
                options={[
                  { value: "x", label: "X (new)" },
                  { value: "bird", label: "Bird (old)" },
                  { value: "none", label: "None" },
                ]}
                onChange={(v) => set("logo", v)}
              />
            </div>
          </Section>

          <Section title="Layout">
            <Slider label="Text size" value={settings.textSize} min={24} max={64} suffix="px" onChange={(v) => set("textSize", v)} />
            <Slider label="Padding" value={settings.padding} min={50} max={150} step={5} suffix="%" onChange={(v) => set("padding", v)} />
            <div className="flex gap-2">
              <button type="button" onClick={bestFit} className={`flex-1 ${pillBtn}`}>
                Best fit
              </button>
              <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)} className={`flex-1 ${pillBtn}`}>
                Reset
              </button>
            </div>
          </Section>
        </aside>

        {/* Preview */}
        <div id="canvas" className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div className="flex flex-1 flex-col rounded-2xl border border-stone-200 bg-white/70 p-3 shadow-sm lg:min-h-0 sm:p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                <h1 className="text-lg font-bold tracking-tight">Screenshot, upgraded.</h1>
                <p className="text-xs tabular-nums text-stone-500">
                  PNG up to {outW} × {outH} px
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <button type="button" onClick={zoomOut} disabled={scale <= MIN_ZOOM + 0.001} aria-label="Zoom out" className={zoomBtn}>
                  −
                </button>
                <span className="w-12 text-center tabular-nums text-stone-600" aria-live="polite">
                  {Math.round(scale * 100)}%
                </span>
                <button type="button" onClick={zoomIn} disabled={scale >= MAX_ZOOM - 0.001} aria-label="Zoom in" className={zoomBtn}>
                  +
                </button>
                <button type="button" onClick={() => setZoom(null)} disabled={zoom === null} className={`ml-1 ${pillBtn}`}>
                  Fit
                </button>
                <button type="button" onClick={() => setZoom(1)} className={pillBtn}>
                  100%
                </button>
              </div>
            </div>

            {exportError && (
              <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                {exportError}
              </p>
            )}
            {overflow && (
              <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                The content is taller than this ratio and will be cropped. Try a smaller text size, less padding, or a taller ratio.
              </p>
            )}

            <div
              ref={stageRef}
              className="flex min-h-[240px] flex-1 overflow-auto rounded-xl bg-[repeating-conic-gradient(#efe9e1_0%_25%,#f7f3ee_0%_50%)] bg-[length:20px_20px] lg:min-h-0"
              style={isDesktop ? undefined : { height: availH, flex: "none" }}
            >
              <div style={{ margin: "auto", padding: STAGE_PAD, flex: "none" }}>
                <div style={{ width: FRAME_W * scale, height: frameH * scale, position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                    <TweetCard ref={frameRef} tweet={tweet} settings={settings} />
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-stone-400">
              Not affiliated with X Corp. Tweets belong to their authors — only capture posts you have the right to share.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
