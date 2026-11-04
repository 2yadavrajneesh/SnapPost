"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import AppearanceTiles from "@/components/AppearanceTiles";
import Lightbox from "@/components/Lightbox";
import RatioTiles from "@/components/RatioTiles";
import TweetCard from "@/components/TweetCard";
import { Label, Section, Segmented, Slider, TextField, Toggle } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { copyPngToClipboard, downloadBlob, downloadUrl, renderPdf, renderPng, renderVideo } from "@/lib/export";
import { parseTweetUrl } from "@/lib/parse";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TWEET,
  FRAME_W,
  MAX_EXPORT_WIDTH,
  RATIOS,
  type PostData,
  type RatioKey,
  type Settings,
  type ShotMode,
  type TweetData,
} from "@/lib/types";

type Format = "png" | "pdf" | "mp4";
type ThreadState = "idle" | "checking" | "found" | "none";

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const PAD_X = 44; // breathing room around the card inside the viewer (room for the viewfinder brackets)
const PAD_Y = 64; // extra top/bottom room for the status chip and the zoom pill
const FORMAT_LABEL = { png: "PNG image", pdf: "PDF document", mp4: "MP4 video" } as const;
const AUTO_FETCH_KEY = "snappost:autoFetch";

/* eslint-disable @typescript-eslint/no-explicit-any */
function toTweet(j: any): TweetData {
  const ts = typeof j.timestamp === "number" ? j.timestamp : Date.now();
  return {
    name: j.name,
    username: j.username,
    avatar: j.avatar,
    verified: j.verified,
    text: j.text,
    time: formatTime(ts),
    date: formatDate(ts),
    replies: j.replies,
    reposts: j.reposts,
    likes: j.likes,
    views: j.views,
    photos: j.photos ?? [],
    video: j.video ?? null,
    quote: j.quote ?? null,
  };
}

export default function Home() {
  const [tweet, setTweet] = useState<TweetData>(DEFAULT_TWEET);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [link, setLink] = useState("");
  const [autoFetch, setAutoFetch] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showQuote, setShowQuote] = useState(true);
  const [displayInfo, setDisplayInfo] = useState({ likes: true, reposts: true, replies: true, dateTime: true, views: true });
  const [showMedia, setShowMedia] = useState(true);

  const [thread, setThread] = useState<PostData[] | null>(null);
  const [threadState, setThreadState] = useState<ThreadState>("idle");
  const [shot, setShot] = useState<ShotMode>("single");

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const [format, setFormat] = useState<Format>("png");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "working" | "done">("idle");

  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastFetched = useRef("");
  const reqId = useRef(0);
  const [frameH, setFrameH] = useState(600);
  const [stageW, setStageW] = useState(800);
  const [stageH, setStageH] = useState(600);
  const [viewportH, setViewportH] = useState(800);
  const [isDesktop, setIsDesktop] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to window

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const setT = <K extends keyof TweetData>(key: K, value: TweetData[K]) => setTweet((t) => ({ ...t, [key]: value }));
  const setCount = (key: "replies" | "reposts" | "likes" | "views", v: string) =>
    setT(key, Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, "")) || 0)));

  const showThread = shot === "thread" && !!thread && thread.length > 1;

  // Remember the Auto fetch choice between visits.
  useEffect(() => {
    try {
      const v = localStorage.getItem(AUTO_FETCH_KEY);
      if (v !== null) setAutoFetch(v === "1");
    } catch {
      /* storage unavailable: keep the default */
    }
  }, []);
  const changeAutoFetch = (v: boolean) => {
    setAutoFetch(v);
    try {
      localStorage.setItem(AUTO_FETCH_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // Re-measure the card after every render (cheap; setState bails out when unchanged)...
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (el) setFrameH(el.offsetHeight);
  });

  // ...and whenever it resizes on its own, e.g. when photos or avatars finish loading.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameH(el.offsetHeight));
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
    Math.min(1, (stageW - PAD_X * 2) / FRAME_W, (availH - PAD_Y * 2) / frameH),
  );
  const scale = zoom ?? fitScale;
  const zoomIn = () => setZoom(Math.min(MAX_ZOOM, scale * ZOOM_STEP));
  const zoomOut = () => setZoom(Math.max(MIN_ZOOM, scale / ZOOM_STEP));
  const outW = MAX_EXPORT_WIDTH;
  const outH = Math.round((frameH / FRAME_W) * MAX_EXPORT_WIDTH);

  const fetchTweet = useCallback(async (raw: string) => {
    const url = raw.trim();
    if (!url) {
      setFetchError("Paste a tweet link first.");
      return;
    }
    const id = ++reqId.current;
    lastFetched.current = url;
    setFetching(true);
    setFetchError(null);
    setThread(null);
    setThreadState("idle");
    setShot("single");
    try {
      const res = await fetch(`/api/tweet?url=${encodeURIComponent(url)}`);
      const j = await res.json();
      if (id !== reqId.current) return; // a newer fetch has started
      if (!res.ok) throw new Error(j.error || "Couldn't fetch that tweet.");
      setTweet(toTweet(j));
      setShowMedia(true);
      setShowQuote(true); // quote tweets are detected automatically; untick the checkbox to hide one
      setZoom(null);

      // Thread detection runs in the background so the tweet itself shows up straight away.
      if (j.maybeThread) {
        setThreadState("checking");
        try {
          const tr = await fetch(`/api/thread?url=${encodeURIComponent(url)}`);
          const tj = await tr.json();
          if (id !== reqId.current) return;
          if (Array.isArray(tj.posts) && tj.posts.length >= 2) {
            setThread(tj.posts);
            setThreadState("found");
          } else {
            setThreadState("none");
          }
        } catch {
          if (id === reqId.current) setThreadState("none");
        }
      } else {
        setThreadState("none");
      }
    } catch (e) {
      if (id === reqId.current) setFetchError(e instanceof Error ? e.message : "Couldn't fetch that tweet.");
    } finally {
      if (id === reqId.current) setFetching(false);
    }
  }, []);

  // Auto fetch: as soon as the box holds a valid tweet link, load it (after a short pause for typing).
  useEffect(() => {
    if (!autoFetch) return;
    const url = link.trim();
    if (!parseTweetUrl(url) || url === lastFetched.current) return;
    const timer = setTimeout(() => void fetchTweet(url), 350);
    return () => clearTimeout(timer);
  }, [link, autoFetch, fetchTweet]);

  function onMediaFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the selected image."));
      reader.readAsDataURL(file);
    }))).then((images) => {
      setShowMedia(true);
      setTweet((current) => ({ ...current, photos: [...current.photos, ...images] }));
    })
      .catch(() => setFetchError("Could not add one or more images."));
  }

  function onAvatarFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setT("avatar", String(reader.result));
    reader.readAsDataURL(file);
  }

  const openMedia = useCallback((images: string[], index: number) => setLightbox({ images, index }), []);
  const closeMedia = useCallback(() => setLightbox(null), []);
  const setMediaIndex = useCallback((index: number) => setLightbox((l) => (l ? { ...l, index } : l)), []);

  async function download() {
    const node = frameRef.current;
    if (!node) return;
    setExporting(true);
    setExportError(null);
    setProgress(null);
    const base = `snappost-${tweet.username || "post"}${showThread ? "-thread" : ""}`;
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

  const posts: PostData[] = showThread && thread ? thread : [];
  const hasMedia = showThread
    ? posts.some((p) => p.photos.length > 0 || p.video || p.quote?.photos.length || p.quote?.video)
    : tweet.photos.length > 0 || !!tweet.video || !!tweet.quote?.photos.length || !!tweet.quote?.video;
  const hasQuote = showThread ? !!thread?.some((p) => p.quote) : !!tweet.quote;
  const hasPhotos = showThread
    ? !!thread?.some((p) => p.photos.length > 0 || p.quote?.photos.length)
    : tweet.photos.length > 0 || !!tweet.quote?.photos.length;

  const pct = Math.round(scale * 100);
  const frameW = FRAME_W * scale;
  const frameHs = frameH * scale;
  const zoomBtn =
    "flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-40";

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
              <h1 className="text-base font-bold leading-none">SnapPost</h1>
              <div className="mt-1 text-[11px] text-stone-500">Screenshot, upgraded.</div>
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
                  onKeyDown={(e) => e.key === "Enter" && void fetchTweet(link)}
                  placeholder="https://x.com/user/status/123…"
                  className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-200"
                />
                <button
                  type="button"
                  onClick={() => void fetchTweet(link)}
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

            <Toggle label="Auto fetch when a link is pasted" checked={autoFetch} onChange={changeAutoFetch} />

            {threadState === "checking" && <p className="text-xs text-stone-500">Checking for a thread…</p>}
            {thread && (
              <div>
                <Label>Screenshot</Label>
                <Segmented
                  value={shot}
                  options={[
                    { value: "single", label: "This tweet" },
                    { value: "thread", label: `Full thread (${thread.length})` },
                  ]}
                  onChange={setShot}
                />
                <p className="mt-1.5 text-[11px] text-stone-500">This tweet is part of a thread.</p>
              </div>
            )}

            {hasMedia && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
                <input type="checkbox" checked={showMedia} onChange={(e) => setShowMedia(e.target.checked)} className="h-4 w-4 accent-stone-900" />
                Include media
              </label>
            )}

            {hasQuote && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
                <input type="checkbox" checked={showQuote} onChange={(e) => setShowQuote(e.target.checked)} className="h-4 w-4 accent-stone-900" />
                Include quoted post <span className="text-stone-400">(detected)</span>
              </label>
            )}

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
                {showThread && (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Edits apply to &ldquo;This tweet&rdquo;. Switch back to see them.
                  </p>
                )}
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
                <div className="space-y-2 rounded-xl border border-stone-200 p-3">
                  <Label>Show in post</Label>
                  <Toggle label="Likes" checked={displayInfo.likes} onChange={(v) => setDisplayInfo((s) => ({ ...s, likes: v }))} />
                  <Toggle label="Reposts" checked={displayInfo.reposts} onChange={(v) => setDisplayInfo((s) => ({ ...s, reposts: v }))} />
                  <Toggle label="Comments" checked={displayInfo.replies} onChange={(v) => setDisplayInfo((s) => ({ ...s, replies: v }))} />
                  <Toggle label="Date & time" checked={displayInfo.dateTime} onChange={(v) => setDisplayInfo((s) => ({ ...s, dateTime: v }))} />
                  <Toggle label="Views" checked={displayInfo.views} onChange={(v) => setDisplayInfo((s) => ({ ...s, views: v }))} />
                </div>
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
                    {hasMedia && (
                      <button type="button" onClick={() => setShowMedia((v) => !v)} className="text-stone-500 underline hover:text-stone-900">
                        {showMedia ? "Remove media" : "Add media back"}
                      </button>
                    )}
                    <label className="cursor-pointer text-stone-500 underline hover:text-stone-900">
                      Upload media
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onMediaFiles(e.target.files)} />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <button type="button" onClick={bestFit} className="flex items-center justify-center gap-2 rounded-xl border border-stone-500 bg-[#faf7f2] px-3 py-3 text-sm font-semibold text-stone-800 hover:bg-stone-100">
              <span aria-hidden="true">✣</span> Best fit
            </button>
            <button type="button" onClick={() => { setSettings(DEFAULT_SETTINGS); setZoom(null); setShowQuote(true); setDisplayInfo({ likes: true, reposts: true, replies: true, dateTime: true, views: true }); }} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-[#faf7f2] px-3 py-3 text-sm font-medium text-stone-700 hover:bg-stone-100">
              <span aria-hidden="true">↻</span> Reset
            </button>
          </div>
          <Section title="Output ratio">
            <RatioTiles value={settings.ratio} onChange={(v) => set("ratio", v)} />
            {settings.ratio !== "auto" && (
              <p className="text-[11px] text-stone-500">The full post stays visible; content scales to fit. Click the selected tile again for Auto.</p>
            )}
          </Section>

          <Section title="Appearance">
            <AppearanceTiles settings={settings} onChange={set} />
          </Section>

          <Section title="Layout">
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
            <Slider label="Text size" value={settings.textSize} min={24} max={64} suffix="px" onChange={(v) => set("textSize", v)} />
            <Slider label="Padding" value={settings.padding} min={50} max={150} step={5} suffix="%" onChange={(v) => set("padding", v)} />
          </Section>
        </aside>

        {/* Viewer */}
        <div id="canvas" className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div
            className="snap-stage relative flex min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-stone-200 shadow-sm lg:min-h-0"
            style={isDesktop ? undefined : { height: availH, flex: "none" }}
          >
            <div ref={stageRef} className="relative z-[1] flex flex-1 overflow-auto">
              <div style={{ margin: "auto", padding: `${PAD_Y}px ${PAD_X}px`, flex: "none" }}>
                {/* Viewfinder brackets around the post */}
                <div style={{ position: "relative", width: frameW, height: frameHs }}>
                  {(["tl", "tr", "bl", "br"] as const).map((c) => (
                    <span key={c} aria-hidden="true" className={`snap-bracket snap-bracket-${c}`} />
                  ))}
                  <div style={{ width: frameW, height: frameHs, position: "relative", overflow: "hidden", borderRadius: 0 }}>
                    <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      <TweetCard
                        ref={frameRef}
                        tweet={tweet}
                        settings={settings}
                        thread={showThread ? thread : null}
                        showQuote={showQuote}
                        displayInfo={displayInfo}
                        onOpenMedia={openMedia}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Status chip */}
            <div className="pointer-events-none absolute left-3 top-3 z-[2] flex items-center gap-2 rounded-full border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
              {FORMAT_LABEL[format]} · {zoom === null ? "Fit " : ""}
              {pct}%
            </div>

            {/* Output size + hints */}
            <div className="pointer-events-none absolute right-3 top-3 z-[2] max-w-[50%] text-right text-[11px] tabular-nums text-stone-500">
              {outW} × {outH} px
              {hasPhotos && showMedia && <span className="block font-sans">Click an image to enlarge</span>}
            </div>

            {exportError && (
              <p role="alert" className="absolute left-1/2 top-14 z-[3] max-w-[90%] -translate-x-1/2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
                {exportError}
              </p>
            )}

            {/* Floating zoom pill */}
            <div className="absolute bottom-4 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-1 rounded-full border border-stone-200 bg-white/95 px-1.5 py-1 text-xs shadow-md backdrop-blur">
              <button type="button" onClick={zoomOut} disabled={scale <= MIN_ZOOM + 0.001} aria-label="Zoom out" className={zoomBtn}>
                −
              </button>
              <button
                type="button"
                onClick={() => setZoom(null)}
                title="Reset to fit"
                aria-live="polite"
                className="w-12 rounded-full py-1 text-center font-semibold tabular-nums text-stone-700 hover:bg-stone-100"
              >
                {pct}%
              </button>
              <button type="button" onClick={zoomIn} disabled={scale >= MAX_ZOOM - 0.001} aria-label="Zoom in" className={zoomBtn}>
                +
              </button>
            </div>
          </div>
        </div>
      </main>

      {lightbox && <Lightbox images={lightbox.images} index={lightbox.index} onIndex={setMediaIndex} onClose={closeMedia} />}
    </div>
  );
}
