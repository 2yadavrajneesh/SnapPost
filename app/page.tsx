"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import AppearanceTiles from "@/components/AppearanceTiles";
import Lightbox from "@/components/Lightbox";
import MediaDownload from "@/components/MediaDownload";
import RatioTiles from "@/components/RatioTiles";
import TweetCard, { ALL_INFO, type DisplayInfo } from "@/components/TweetCard";
import { Check, Label, Section, Segmented, Slider, TextField, Toggle } from "@/components/ui";
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
const PAD_Y = 64; // desktop
const PAD_Y_MOBILE = 46; // the mobile viewer is short, so it needs less room // extra top/bottom room for the status chip and the zoom pill
const FORMAT_LABEL = { png: "PNG image", pdf: "PDF document", mp4: "MP4 video" } as const;
const SITE_THEME_KEY = "snappost:siteTheme";

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
    replyingTo: j.replyingTo ?? null,
    parents: Array.isArray(j.parents) ? j.parents : [],
  };
}

export default function Home() {
  const [tweet, setTweet] = useState<TweetData>(DEFAULT_TWEET);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [link, setLink] = useState("");
  const [fetching, setFetching] = useState(false);
  const [hasTweet, setHasTweet] = useState(false); // true once a real tweet was fetched: the sample is never exported
  const [siteTheme, setSiteTheme] = useState<"light" | "dark">("light");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showQuote, setShowQuote] = useState(true);
  const [displayInfo, setDisplayInfo] = useState<DisplayInfo>(ALL_INFO);
  const setInfo = (key: keyof DisplayInfo, v: boolean) => setDisplayInfo((s) => ({ ...s, [key]: v }));
  const [showMedia, setShowMedia] = useState(true);
  const [showParents, setShowParents] = useState(true);
  const [showParentMedia, setShowParentMedia] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

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

  // Light/Dark theme of the website itself (not of the tweet image, which has its own Appearance tile).
  useEffect(() => {
    try {
      if (localStorage.getItem(SITE_THEME_KEY) === "dark") setSiteTheme("dark");
    } catch {
      /* ignore */
    }
  }, []);
  const changeSiteTheme = (th: "light" | "dark") => {
    setSiteTheme(th);
    document.documentElement.dataset.theme = th;
    try {
      localStorage.setItem(SITE_THEME_KEY, th);
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

  // On desktop the preview fills the space under the navbar; on phones it sizes to the post.
  const padTop = isDesktop ? PAD_Y : PAD_Y_MOBILE;
  const padBottom = isDesktop ? PAD_Y : PAD_Y_MOBILE + 16; // room for the zoom pill under the post
  const padY = (padTop + padBottom) / 2;
  // Phones: the viewer grows with the post (width-fit), from a short box for a one-liner up to most of the screen.
  const widthFit = Math.min(1, (stageW - PAD_X * 2) / FRAME_W);
  const availH = isDesktop
    ? stageH
    : Math.max(210, Math.min(Math.round(viewportH * 0.82), Math.ceil(frameH * widthFit + padY * 2)));
  const fitScale = Math.max(
    MIN_ZOOM,
    Math.min(1, (stageW - PAD_X * 2) / FRAME_W, (availH - padY * 2) / frameH),
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
      setHasTweet(true);
      setShowMedia(true);
      setShowParents(true);
      setShowParentMedia(true);
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
    const url = link.trim();
    if (!parseTweetUrl(url) || url === lastFetched.current) return;
    const timer = setTimeout(() => void fetchTweet(url), 350);
    return () => clearTimeout(timer);
  }, [link, fetchTweet]);

  async function pasteLink() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setFetchError("Your clipboard is empty. Copy a tweet link first.");
        return;
      }
      setLink(text);
      setFetchError(null);
      if (parseTweetUrl(text)) void fetchTweet(text); // paste and go
    } catch {
      setFetchError("Couldn't read the clipboard. Allow clipboard access, or paste into the box with Ctrl/Cmd+V.");
    }
  }

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
    if (!node || !hasTweet) return;
    setExporting(true);
    setExportError(null);
    setProgress(null);
    const base = `snappost-${tweet.username || "post"}${showThread ? "-thread" : ""}`;
    try {
      if (format === "mp4") {
        // The whole post as a video: embedded videos play in place, with sound.
        setProgress(0);
        const { blob, ext } = await renderVideo(node, setProgress);
        downloadBlob(blob, `${base}.${ext}`);
      } else {
        const png = await renderPng(node);
        if (format === "png") {
          downloadUrl(png.dataUrl, `${base}.png`);
        } else {
          const blob = await renderPdf(png.dataUrl, node.offsetWidth, node.offsetHeight);
          downloadBlob(blob, `${base}.pdf`);
        }
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
    if (!node || !hasTweet) return;
    setCopyState("working");
    setExportError(null);
    try {
      await copyPngToClipboard(node);
      setCopyState("done");
      setToast("Image copied");
      setTimeout(() => setCopyState("idle"), 2000);
      setTimeout(() => setToast(null), 2400);
    } catch (e) {
      setCopyState("idle");
      setExportError(e instanceof Error ? e.message : "Couldn't copy the image. Try Download instead.");
    }
  }

  function resetAll() {
    setSettings(DEFAULT_SETTINGS);
    setZoom(null);
    setShowQuote(true);
    setShowMedia(true);
    setShowParents(true);
    setShowParentMedia(true);
    setDisplayInfo(ALL_INFO);
  }

  function bestFit() {
    setSettings((s) => ({ ...s, ratio: "auto", padding: DEFAULT_SETTINGS.padding }));
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
  const hasParents = !showThread && !!tweet.parents?.length;
  const hasQuote = showThread ? !!thread?.some((p) => p.quote) : !!tweet.quote;
  const hasPhotos = showThread
    ? !!thread?.some((p) => p.photos.length > 0 || p.quote?.photos.length)
    : tweet.photos.length > 0 || !!tweet.quote?.photos.length;

  const pct = Math.round(scale * 100);
  const frameW = FRAME_W * scale;
  const frameHs = frameH * scale;
  const zoomBtn =
    "flex h-8 w-8 items-center justify-center text-base font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-40";

  const formatPicker = (
  <Segmented
    value={format}
    options={[
      { value: "png", label: "PNG" },
      { value: "pdf", label: "PDF" },
      { value: "mp4", label: "MP4" },
    ]}
    onChange={setFormat}
  />
  );
  const copyButton = (iconOnly = false) => (
  <button
    type="button"
    onClick={copyImage}
    disabled={!hasTweet || exporting || copyState === "working"}
    title={hasTweet ? undefined : "Paste a tweet link first"}
    aria-label="Copy image"
    className={`whitespace-nowrap border border-stone-300 bg-white text-sm font-semibold text-stone-800 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 ${
      iconOnly ? "flex h-12 w-12 flex-none items-center justify-center" : "px-4 py-2"
    }`}
  >
    {iconOnly ? (
      copyState === "done" ? (
        <span aria-hidden="true">✓</span>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="1" />
          <path d="M5 15V5a1 1 0 0 1 1-1h10" />
        </svg>
      )
    ) : copyState === "working" ? (
      "Copying…"
    ) : copyState === "done" ? (
      "Copied ✓"
    ) : (
      "Copy image"
    )}
  </button>
  );
  const downloadButton = (block = false) => (
  <button
    type="button"
    onClick={download}
    disabled={!hasTweet || exporting}
    title={hasTweet ? undefined : "Paste a tweet link first"}
    className={`whitespace-nowrap bg-accent text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 ${
      block ? "h-12 min-w-0 flex-1 px-4" : "px-4 py-2"
    }`}
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
  );

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      {/* Navbar: brand on the left, export controls on the right */}
      <header className="sticky top-0 z-20 border-b border-stone-300 bg-[#faf6f1]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
              <rect width="64" height="64" fill="#1b2420" />
              <path d="M14 26V14h12M38 14h12v12M50 38v12H38M26 50H14V38" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
              <rect x="25" y="25" width="14" height="14" fill="#ea580c" />
            </svg>
            <div>
              <h1 className="text-base font-bold leading-none">SnapPost</h1>
              <div className="mt-1 hidden text-[11px] text-stone-500 sm:block">Screenshot, upgraded. Posts to PNG, PDF &amp; MP4.</div>
            </div>
            <span className="ml-1 bg-stone-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600">
              Beta
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label={siteTheme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              title={siteTheme === "light" ? "Dark theme" : "Light theme"}
              onClick={() => changeSiteTheme(siteTheme === "light" ? "dark" : "light")}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-800 transition hover:bg-stone-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {siteTheme === "light" ? (
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                ) : (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </>
                )}
              </svg>
            </button>
            <div className="hidden items-center gap-2 lg:flex">
              {formatPicker}
              {copyButton()}
              {downloadButton()}
            </div>
          </div>
        </div>
      </header>

      <main className="grid w-full flex-1 lg:min-h-0 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* Controls (scroll on their own on desktop, so the preview never moves) */}
        <aside className="order-2 min-w-0 border-t border-stone-300 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <Section title="Source">
            <div>
              <Label>Tweet link</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void fetchTweet(link)}
                    placeholder="Paste a tweet link…"
                    aria-busy={fetching}
                    className="w-full border border-stone-200 bg-white py-2 pl-3 pr-9 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-200"
                  />
                  {fetching && <span className="snap-spinner absolute right-2.5 top-1/2 -mt-2" aria-hidden="true" />}
                </div>
                <button
                  type="button"
                  onClick={() => void pasteLink()}
                  aria-label="Paste link from clipboard"
                  title="Paste from clipboard"
                  className="flex w-10 flex-none items-center justify-center border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  </svg>
                </button>
              </div>
              {!fetchError && !fetching && link.trim() !== "" && !parseTweetUrl(link.trim()) && (
                <p className="mt-2 text-xs text-stone-500">That doesn&apos;t look like a tweet link yet. Use https://x.com/user/status/123…</p>
              )}
              {fetchError && (
                <p role="alert" className="mt-2 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {fetchError}
                </p>
              )}
            </div>

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
              <label className="flex cursor-pointer items-center gap-2 border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
                <input type="checkbox" checked={showMedia} onChange={(e) => setShowMedia(e.target.checked)} className="h-4 w-4 accent-stone-900" />
                Include media
              </label>
            )}

            {hasQuote && (
              <label className="flex cursor-pointer items-center gap-2 border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
                <input type="checkbox" checked={showQuote} onChange={(e) => setShowQuote(e.target.checked)} className="h-4 w-4 accent-stone-900" />
                Include quoted post <span className="text-stone-400">(detected)</span>
              </label>
            )}

            <MediaDownload key={`${tweet.username}|${tweet.photos[0] ?? ""}|${tweet.video?.sources[0] ?? ""}`} tweet={tweet} />

            <button
              type="button"
              onClick={() => setShowEdit((v) => !v)}
              className="flex w-full items-center justify-between bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200"
              aria-expanded={showEdit}
            >
              Edit details
              <span>{showEdit ? "−" : "+"}</span>
            </button>

            {showEdit && (
              <div className="space-y-3">
                {showThread && (
                  <p className=" bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Edits apply to &ldquo;This tweet&rdquo;. Switch back to see them.
                  </p>
                )}
                <label className="block">
                  <Label>Tweet text</Label>
                  <textarea
                    value={tweet.text}
                    onChange={(e) => setT("text", e.target.value)}
                    rows={4}
                    className="w-full resize-y border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-200"
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
                <div className="space-y-2">
                  <Label>Post details</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Check label="Likes" checked={displayInfo.likes} onChange={(v) => setInfo("likes", v)} />
                    <Check label="Reposts" checked={displayInfo.reposts} onChange={(v) => setInfo("reposts", v)} />
                    <Check label="Comments" checked={displayInfo.replies} onChange={(v) => setInfo("replies", v)} />
                    <Check label="Views" checked={displayInfo.views} onChange={(v) => setInfo("views", v)} />
                    <Check label="Date & time" checked={displayInfo.dateTime} onChange={(v) => setInfo("dateTime", v)} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50">
                    Upload avatar
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onAvatarFile(e.target.files?.[0])} />
                  </label>
                  <div className="flex gap-3 text-xs">
                    {tweet.avatar && (
                      <button type="button" onClick={() => setT("avatar", "")} className="text-stone-500 underline hover:text-stone-900">
                        Remove avatar
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

          {/* Mobile: export controls live under the source, like the reference layout */}
          <div className="space-y-3 border-b border-stone-300 px-5 py-5 lg:hidden">
            {formatPicker}
            <div className="flex gap-2.5">
              {downloadButton(true)}
              {copyButton(true)}
            </div>
          </div>

          {hasParents && (
            <Section title="Reply focus">
              <p className="text-xs text-stone-500">Choose whether to include the parent tweet or tweets above the pasted reply.</p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["Show parent tweet(s)", showParents, false, () => setShowParents(true)],
                    ["Hide parent tweet(s)", !showParents, false, () => setShowParents(false)],
                    ["Show parent media", showParentMedia, true, () => setShowParentMedia(true)],
                    ["Hide parent media", !showParentMedia, true, () => setShowParentMedia(false)],
                  ] as const
                ).map(([label, on, isMedia, act]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    disabled={isMedia && !showParents}
                    onClick={act}
                    className={`min-h-[52px] border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      on ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-200 bg-[#f7f3ee] text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2.5 border-b border-stone-300 px-5 py-5">
            <button
              type="button"
              onClick={bestFit}
              className="flex h-12 items-center justify-center gap-2 border-2 border-[#1b2420] bg-[#f3ecdf] px-4 text-sm font-bold text-[#1b2420] transition hover:bg-[#ece3d2]"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" />
              </svg>
              Best fit
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="flex h-12 items-center justify-center gap-2 border border-stone-200 bg-[#f3ecdf]/60 px-5 text-sm font-semibold text-stone-600 transition hover:bg-[#ece3d2]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              Reset
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
            <Slider label="Text size" value={settings.textSize} min={24} max={64} step={4} suffix="px" lowLabel="Smaller" highLabel="Larger" ticks emphasizeHigh onChange={(v) => set("textSize", v)} />
            <Slider label="Padding" value={settings.padding} min={50} max={150} step={5} suffix="%" lowLabel="Tighter" highLabel="Looser" onChange={(v) => set("padding", v)} />
          </Section>
        </aside>

        {/* Viewer */}
        <div id="canvas" className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div
            className="snap-stage relative flex flex-1 overflow-hidden lg:min-h-0"
            style={isDesktop ? undefined : { height: availH, flex: "none" }}
          >
            <div ref={stageRef} className="relative z-[1] flex flex-1 overflow-auto">
              <div style={{ margin: "auto", padding: `${padTop}px ${PAD_X}px ${padBottom}px`, flex: "none" }}>
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
                        showMedia={showMedia}
                        showParents={showParents}
                        showParentMedia={showParentMedia}
                        displayInfo={displayInfo}
                        onOpenMedia={openMedia}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {fetching && (
              <div role="status" aria-live="polite" className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-4 bg-white/60 backdrop-blur-[2px]">
                <div className="snap-loadbar absolute inset-x-0 top-0 h-[3px]" aria-hidden="true" />
                <span className="snap-spinner snap-spinner-lg" aria-hidden="true" />
                <span className="text-sm font-semibold text-stone-800">Fetching tweet…</span>
              </div>
            )}

            {/* Status chip */}
            <div className="pointer-events-none absolute left-3 top-3 z-[2] flex items-center gap-2 border border-stone-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 backdrop-blur">
              <span className="h-2 w-2 bg-accent" aria-hidden="true" />
              {FORMAT_LABEL[format]} · {zoom === null ? "Fit " : ""}
              {pct}%
            </div>

            {/* Output size + hints */}
            <div className="pointer-events-none absolute right-3 top-3 z-[2] max-w-[50%] text-right text-[11px] tabular-nums text-stone-500">
              {outW} × {outH} px
              {hasPhotos && showMedia && <span className="block font-sans">Click an image to enlarge</span>}
            </div>

            {exportError && (
              <p role="alert" className="absolute left-1/2 top-14 z-[3] max-w-[90%] -translate-x-1/2 bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
                {exportError}
              </p>
            )}

            {/* Floating zoom pill */}
            <div className="absolute bottom-4 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-1 border border-stone-200 bg-white/95 px-1.5 py-1 text-xs backdrop-blur">
              <button type="button" onClick={zoomOut} disabled={scale <= MIN_ZOOM + 0.001} aria-label="Zoom out" className={zoomBtn}>
                −
              </button>
              <button
                type="button"
                onClick={() => setZoom(null)}
                title="Reset to fit"
                aria-live="polite"
                className="w-12 py-1 text-center font-semibold tabular-nums text-stone-700 hover:bg-stone-100"
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

      {toast && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-3 border border-stone-300 bg-[#fffdf8] px-6 py-4 text-base font-semibold text-stone-900 shadow-lg">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M8 12.5l2.7 2.7L16 9.8" />
          </svg>
          {toast}
        </div>
      )}

      {lightbox && <Lightbox images={lightbox.images} index={lightbox.index} onIndex={setMediaIndex} onClose={closeMedia} />}
    </div>
  );
}
