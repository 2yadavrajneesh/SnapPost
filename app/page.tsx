"use client";

import SiteHeader from "@/components/SiteHeader";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import AppearanceTiles, { FONT_LABELS } from "@/components/AppearanceTiles";
import Lightbox from "@/components/Lightbox";
import ScrollTop from "@/components/ScrollTop";
import HighlightEditor from "@/components/HighlightEditor";
import MediaDownload from "@/components/MediaDownload";
import type { Highlight } from "@/lib/highlight";
import RatioTiles from "@/components/RatioTiles";
import TweetCard, { ALL_INFO, FONT_STACKS, type DisplayInfo, type Redact } from "@/components/TweetCard";
import { Check, CollapsibleSection, Label, Section, Segmented, Slider, TextField, Toggle } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { copyPngToClipboard, downloadBlob, downloadUrl, renderPdf, renderPdfPages, renderPng, renderVideo, zipFiles } from "@/lib/export";
import { parseTweetUrl } from "@/lib/parse";
import { PAGE_SIZES, type PageSizeId } from "@/lib/paper";
import {
  ACCENTS,
  BACKGROUNDS,
  DEFAULT_SETTINGS,
  DEFAULT_TWEET,
  FRAME_MARGIN,
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

const MIN_ZOOM = 0.04;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const PAD_X = 44; // breathing room around the card inside the viewer (room for the viewfinder brackets)
const PAD_Y = 64; // desktop
const PAD_Y_MOBILE = 46; // the mobile viewer is short, so it needs less room // extra top/bottom room for the status chip and the zoom pill
const FORMAT_LABEL = { png: "PNG image", pdf: "PDF document", mp4: "MP4 video" } as const;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toTweet(j: any): TweetData {
  const ts = typeof j.timestamp === "number" ? j.timestamp : Date.now();
  return {
    name: j.name,
    username: j.username,
    avatar: j.avatar,
    verified: j.verified,
    verifiedType: j.verifiedType === "gold" || j.verifiedType === "gray" ? j.verifiedType : "blue",
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
  const [slide, setSlide] = useState(0); // current carousel slide
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const NO_REDACT: Redact = { name: false, avatar: false, media: false };
  const [redact, setRedact] = useState<Redact>(NO_REDACT);

  const [lightbox, setLightbox] = useState<{ images: string[]; index: number } | null>(null);

  const [format, setFormat] = useState<Format>("png");
  const [pdfSize, setPdfSize] = useState<PageSizeId | "fit">("fit");
  const [pdfOrient, setPdfOrient] = useState<"auto" | "portrait" | "landscape">("auto");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "working" | "done">("idle");

  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastFetched = useRef("");
  const reqId = useRef(0);
  const linkInput = useRef<HTMLInputElement>(null);
  const [frameH, setFrameH] = useState(600);
  const [stageW, setStageW] = useState(800);
  const [stageH, setStageH] = useState(600);
  const [viewportH, setViewportH] = useState(800);
  const [isDesktop, setIsDesktop] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to window

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const setT = <K extends keyof TweetData>(key: K, value: TweetData[K]) => setTweet((t) => ({ ...t, [key]: value }));
  const setCount = (key: "replies" | "reposts" | "likes" | "views", v: string) => {
    const digits = v.replace(/[^\d]/g, "");
    const n = Math.max(0, Math.floor(Number(digits) || 0));
    if (key === "views") setTweet((t) => ({ ...t, views: n, viewsLabel: /^0\d/.test(digits) ? digits : undefined })); // keep leading zeros as typed
    else setT(key, n);
  };

  const showThread = shot === "thread" && !!thread && thread.length > 1;
  const carousel = shot === "carousel" && !!thread && thread.length > 1;
  const slideCount = carousel ? thread!.length : 0;
  const slideAt = Math.min(slide, Math.max(0, slideCount - 1));
  // A carousel slide is one post of the thread shown as a card of its own.
  const cardTweet: TweetData = carousel
    ? { ...tweet, ...toTweet(thread![slideAt]), parents: [] }
    : tweet;

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
  const padBottom = isDesktop ? PAD_Y : PAD_Y_MOBILE;
  const padY = (padTop + padBottom) / 2;
  // Phones: the viewer grows with the post (width-fit), from a short box for a one-liner up to most of the screen.
  const padX = isDesktop ? PAD_X : 20;
  const widthFit = Math.min(1, (stageW - padX * 2) / FRAME_W);
  const availH = isDesktop
    ? stageH
    : Math.max(210, Math.min(Math.round(viewportH * (showThread ? 0.8 : 0.72)), Math.ceil(frameH * widthFit + padY * 2)));
  // Desktop fits a whole post in the viewer. Phones, and full threads, fit the width so text stays
  // readable, and a tall post scrolls inside the viewer.
  const fitScale = Math.max(
    MIN_ZOOM,
    // A thread is long: fit its width so it stays readable and scroll down; + / − then enlarge or shrink it.
    isDesktop && !showThread ? Math.min(widthFit, (availH - padY * 2) / frameH) : widthFit,
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
      setHighlights([]);
      setRedact({ name: false, avatar: false, media: false });
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
    const base = `snappost-${tweet.username || "post"}${showThread ? "-thread" : carousel ? "-carousel" : ""}`;
    try {
      if (carousel) {
        if (format === "mp4") throw new Error("A carousel exports as PNG (ZIP of slides) or PDF. Pick one of those.");
        // Render each slide in turn, then put the viewer back where it was.
        const keep = slideAt;
        const shots: { dataUrl: string; pageW: number; pageH: number }[] = [];
        for (let i = 0; i < slideCount; i++) {
          flushSync(() => setSlide(i));
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          await new Promise((r) => setTimeout(r, 120)); // let the slide's images settle
          const r = await renderPng(node);
          shots.push({ dataUrl: r.dataUrl, pageW: node.offsetWidth, pageH: node.offsetHeight });
          setProgress((i + 1) / slideCount);
        }
        flushSync(() => setSlide(keep));
        const pad = String(slideCount).length;
        if (format === "png") {
          const zip = await zipFiles(shots.map((s, i) => ({ name: `${base}-${String(i + 1).padStart(pad, "0")}.png`, dataUrl: s.dataUrl })));
          downloadBlob(zip, `${base}.zip`);
        } else {
          downloadBlob(await renderPdfPages(shots.map((s) => ({ dataUrl: s.dataUrl, w: s.pageW, h: s.pageH })), { size: pdfSize, orientation: pdfOrient }), `${base}.pdf`);
        }
        return;
      }
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
          const blob = await renderPdf(png.dataUrl, node.offsetWidth, node.offsetHeight, { size: pdfSize, orientation: pdfOrient });
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
      // The browser won't put images on the clipboard (or blocked it): save the PNG instead so the
      // click still gives the person their image.
      try {
        const png = await renderPng(node);
        downloadUrl(png.dataUrl, `snappost-${tweet.username || "post"}.png`);
        setToast("Couldn't copy here, so the image was downloaded");
        setTimeout(() => setToast(null), 3200);
      } catch {
        setExportError(e instanceof Error ? e.message : "Couldn't copy the image. Try Download instead.");
      }
    }
  }

  // Ctrl/Cmd + Shift + C copies the image from anywhere on the page.
  const copyRef = useRef(copyImage);
  copyRef.current = copyImage;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void copyRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function resetAll() {
    setSettings(DEFAULT_SETTINGS);
    setZoom(null);
    setShowQuote(true);
    setShowMedia(true);
    setShowParents(true);
    setShowParentMedia(true);
    setDisplayInfo(ALL_INFO);
  }

  /** Clears the link, the fetched post and every setting so a different link can be pasted. */
  function startOver() {
    reqId.current++; // drop any fetch still in flight
    lastFetched.current = "";
    setLink("");
    setTweet(DEFAULT_TWEET);
    setHighlights([]);
    setRedact({ name: false, avatar: false, media: false });
    setHasTweet(false);
    setFetching(false);
    setFetchError(null);
    setExportError(null);
    setThread(null);
    setThreadState("idle");
    setShot("single");
    setSlide(0);
    setShowEdit(false);
    setFormat("png");
    resetAll();
    linkInput.current?.focus();
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

  const listMode = showThread || carousel;
  const posts: PostData[] = listMode && thread ? thread : [];
  const hasMedia = listMode
    ? posts.some((p) => p.photos.length > 0 || p.video || p.quote?.photos.length || p.quote?.video)
    : tweet.photos.length > 0 || !!tweet.video || !!tweet.quote?.photos.length || !!tweet.quote?.video;
  const hasParents = !showThread && !!tweet.parents?.length;
  const hasQuote = listMode ? !!thread?.some((p) => p.quote) : !!tweet.quote;
  const hasPhotos = listMode
    ? !!thread?.some((p) => p.photos.length > 0 || p.quote?.photos.length)
    : tweet.photos.length > 0 || !!tweet.quote?.photos.length;

  const pct = Math.round(scale * 100);
  const frameW = FRAME_W * scale;
  const frameHs = frameH * scale;
  const hideDetails = (
    <div className="space-y-3 border-t border-stone-200 pt-3">
      <div className="text-xs font-bold text-stone-700">Hide details</div>
      <Toggle label="Name and handle" checked={redact.name} onChange={(v) => setRedact((r) => ({ ...r, name: v }))} />
      <Toggle label="Profile picture" checked={redact.avatar} onChange={(v) => setRedact((r) => ({ ...r, avatar: v }))} />
      {(tweet.photos.length > 0 || tweet.video) && (
        <Toggle label="Photos and video (blurred)" checked={redact.media} onChange={(v) => setRedact((r) => ({ ...r, media: v }))} />
      )}
      <p className="text-[11px] text-stone-500">Hidden details are blurred or removed in the downloaded image too.</p>
    </div>
  );
  const zoomBtn =
    "flex h-9 w-9 lg:h-8 lg:w-8 items-center justify-center text-base font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-40";
  const slideNav = carousel ? (
    <div className="flex items-center border border-stone-300 bg-white/95 text-xs font-semibold text-stone-800 shadow-sm">
      <button type="button" aria-label="Previous slide" disabled={slideAt === 0} onClick={() => setSlide(slideAt - 1)} className="h-9 w-9 text-base hover:bg-stone-100 disabled:opacity-40 lg:h-8 lg:w-8">
        ‹
      </button>
      <span className="min-w-[64px] px-1 text-center tabular-nums" aria-live="polite">
        {slideAt + 1} / {slideCount}
      </span>
      <button type="button" aria-label="Next slide" disabled={slideAt >= slideCount - 1} onClick={() => setSlide(slideAt + 1)} className="h-9 w-9 text-base hover:bg-stone-100 disabled:opacity-40 lg:h-8 lg:w-8">
        ›
      </button>
    </div>
  ) : null;
  const zoomPill = (
    <div className="flex items-center gap-1 border border-stone-300 bg-white/95 px-1 py-0.5 text-xs">
      <button type="button" onClick={zoomOut} disabled={scale <= MIN_ZOOM + 0.001} aria-label="Zoom out" className={zoomBtn}>
        −
      </button>
      <button type="button" onClick={() => setZoom(null)} title="Reset to fit" aria-live="polite" className="w-12 py-1.5 text-center font-semibold tabular-nums text-stone-700 hover:bg-stone-100">
        {pct}%
      </button>
      <button type="button" onClick={zoomIn} disabled={scale >= MAX_ZOOM - 0.001} aria-label="Zoom in" className={zoomBtn}>
        +
      </button>
    </div>
  );


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
  const pdfOptions = format === "pdf" && (
    <div className="space-y-2 border border-stone-200 bg-white p-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">PDF page</div>
      <label className="block text-xs font-medium text-stone-600">
        Page size
        <select value={pdfSize} onChange={(e) => setPdfSize(e.target.value as PageSizeId | "fit")} className="mt-1 h-9 w-full border border-stone-300 bg-white px-2 text-xs text-stone-800">
          <option value="fit">Same shape as the picture</option>
          {PAGE_SIZES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      {pdfSize !== "fit" && (
        <div>
          <Label>Orientation</Label>
          <Segmented value={pdfOrient} onChange={setPdfOrient} options={[{ value: "auto", label: "Auto" }, { value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]} />
          <p className="mt-1 text-[11px] text-stone-500">{pdfOrient === "auto" ? "Each page turns to suit its picture." : "The picture is centred and scaled to fit the page."}</p>
        </div>
      )}
    </div>
  );
  const copyButton = (iconOnly = false) => (
  <button
    type="button"
    onClick={copyImage}
    disabled={!hasTweet || exporting || copyState === "working"}
    title={hasTweet ? "Copy image (Ctrl/Cmd + Shift + C)" : "Paste a tweet link first"}
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
      <SiteHeader />

      <main className="grid w-full flex-1 lg:min-h-0 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* Controls (scroll on their own on desktop, so the preview never moves) */}
        <aside className="order-2 min-w-0 border-t border-stone-300 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <Section title="Source">
            <div>
              <Label>Tweet link</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={linkInput}
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
                <button
                  type="button"
                  onClick={startOver}
                  aria-label="Start over with a different link"
                  title="Start over"
                  className="flex w-10 flex-none items-center justify-center border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
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

            {/* desktop: format, copy and download sit right under the link (phones have their own bar at the bottom) */}
            <div className="hidden space-y-2 lg:block">
              {formatPicker}
              {pdfOptions}
              <div className="flex gap-2 [&>button:last-child]:flex-1">
                {copyButton()}
                {downloadButton()}
              </div>
            </div>

            {threadState === "checking" && <p className="text-xs text-stone-500">Checking for a thread…</p>}
            {thread && (
              <div>
                <Label>Screenshot</Label>
                <Segmented
                  value={shot}
                  options={[
                    { value: "single", label: "This tweet" },
                    { value: "thread", label: `Thread (${thread.length})` },
                    { value: "carousel", label: `Carousel (${thread.length})` },
                  ]}
                  onChange={(v) => {
                    setShot(v);
                    setSlide(0);
                    setZoom(null);
                  }}
                />
                <p className="mt-1.5 text-[11px] text-stone-500">
                  {shot === "carousel"
                    ? "One slide per post. PNG downloads as a ZIP of slides, PDF as one page per slide."
                    : shot === "thread"
                      ? "The whole thread in one image."
                      : "This tweet is part of a thread."}
                </p>
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
                    onChange={(e) => {
                      setT("text", e.target.value);
                      setHighlights([]); // ranges no longer match the edited text
                    }}
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
                  <TextField label="Views" value={tweet.viewsLabel ?? tweet.views} onChange={(v) => setCount("views", v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Time" value={tweet.time} onChange={(v) => setT("time", v)} />
                  <TextField label="Date" value={tweet.date} onChange={(v) => setT("date", v)} />
                </div>
                <Toggle label="Verified badge" checked={tweet.verified} onChange={(v) => setT("verified", v)} />
                {tweet.verified && (
                  <Segmented
                    value={tweet.verifiedType ?? "blue"}
                    onChange={(v) => setT("verifiedType", v)}
                    options={[
                      { value: "blue", label: "Blue" },
                      { value: "gold", label: "Gold" },
                      { value: "gray", label: "Grey" },
                    ]}
                  />
                )}
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
            {pdfOptions}
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
                <rect x="8" y="8" width="8" height="8" rx="1" />
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

          <CollapsibleSection title="Output ratio">
            <RatioTiles value={showThread ? "auto" : settings.ratio} onChange={(v) => set("ratio", v)} disabled={showThread} />
            {showThread && <p className="text-[11px] text-stone-500">A full thread always uses Auto size. Switch to Carousel to pick a ratio.</p>}
            {!showThread && settings.ratio !== "auto" && (
              <p className="text-[11px] text-stone-500">The full post stays visible; content scales to fit. Click the selected tile again for Auto.</p>
            )}
          </CollapsibleSection>

          {!showThread && (
            <CollapsibleSection title={!listMode && tweet.text ? "Highlight & redact" : "Redact"}>
              {!listMode && tweet.text ? (
                <HighlightEditor text={tweet.text} highlights={highlights} onChange={setHighlights} redactExtra={hideDetails} />
              ) : (
                hideDetails
              )}
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Appearance">
            <AppearanceTiles settings={settings} onChange={set} />
          </CollapsibleSection>

          <CollapsibleSection title="Layout">
            <Slider label="Text size" value={settings.textSize} min={24} max={64} step={4} suffix="px" lowLabel="Smaller" highLabel="Larger" ticks emphasizeHigh onChange={(v) => set("textSize", v)} />
            <Slider label="Padding" value={settings.padding} min={50} max={150} step={5} suffix="%" lowLabel="Tighter" highLabel="Looser" onChange={(v) => set("padding", v)} />
          </CollapsibleSection>

          <CollapsibleSection title="More styles">
            <div>
              <Label>Background</Label>
              <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Background">
                {BACKGROUNDS.map((b) => (
                  <button key={b.id} type="button" role="radio" aria-checked={settings.bg === b.id} aria-label={b.label} title={b.label} onClick={() => set("bg", b.id)} className={`flex h-9 items-center justify-center rounded-md border-2 transition ${settings.bg === b.id ? "border-[#1b2420] ring-2 ring-white" : "border-stone-300"}`} style={{ background: b.id === "none" ? "#f4efe8" : b.css }}>
                    {b.id === "none" && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#44403c" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M6.3 6.3l11.4 11.4" /></svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <Slider label="Margin" value={settings.margin ?? Math.round((settings.style === "minimal" && settings.bg === "none" && settings.shadow === "none" ? 96 : 72) * (settings.padding / 100))} min={FRAME_MARGIN.min} max={FRAME_MARGIN.max} step={4} suffix="px" lowLabel="Tighter" highLabel="Roomier" onChange={(v) => set("margin", v)} />
            <div>
              <Label>Shadow</Label>
              <Segmented value={settings.shadow} onChange={(v) => set("shadow", v)} options={[{ value: "none", label: "None" }, { value: "soft", label: "Soft" }, { value: "lifted", label: "Lifted" }]} />
              {settings.shadow !== "none" && settings.margin !== null && settings.margin < 40 && <p className="mt-1 text-[11px] text-stone-500">Give the shadow room: raise the margin so it is not cut off.</p>}
            </div>
            <div>
              <Label>Font</Label>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Font">
                {(Object.keys(FONT_LABELS) as Settings["font"][]).map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={settings.font === f} onClick={() => set("font", f)} style={{ fontFamily: FONT_STACKS[f] }} className={`border px-2 py-3 text-sm font-semibold transition ${settings.font === f ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-200 bg-[#f4efe8] text-stone-700 hover:bg-[#ece6dc]"}`}>
                    {FONT_LABELS[f]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Accent</Label>
              <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
                {ACCENTS.map((a) => (
                  <button key={a.value} type="button" role="radio" aria-checked={settings.accent === a.value} aria-label={a.label} title={a.label} onClick={() => set("accent", a.value)} className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition ${settings.accent === a.value ? "border-[#1b2420] ring-2 ring-white" : "border-transparent"}`} style={{ background: a.value }}>
                    {settings.accent === a.value && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-stone-500">Colours the bird logo, the blue verified badge and the &quot;Replying to&quot; name.</p>
            </div>
          </CollapsibleSection>
        </aside>

        {/* Viewer */}
        <div id="canvas" className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div
            className="snap-stage relative flex flex-1 overflow-hidden lg:min-h-0"
            style={isDesktop ? undefined : { height: availH, flex: "none" }}
          >
            <div ref={stageRef} className="relative z-[1] flex flex-1 overflow-auto">
              <div style={{ margin: "auto", padding: `${padTop}px ${padX}px ${padBottom}px`, flex: "none" }}>
                {/* Viewfinder brackets around the post */}
                <div style={{ position: "relative", width: frameW, height: frameHs }}>
                  {(["tl", "tr", "bl", "br"] as const).map((c) => (
                    <span key={c} aria-hidden="true" className={`snap-bracket snap-bracket-${c}`} />
                  ))}
                  <div style={{ width: frameW, height: frameHs, position: "relative", overflow: "hidden", borderRadius: 0 }}>
                    <div style={{ position: "absolute", top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      <TweetCard
                        ref={frameRef}
                        tweet={cardTweet}
                        settings={showThread ? { ...settings, ratio: "auto" } : settings}
                        maxFit={carousel ? 1 : undefined}
                        highlights={listMode ? undefined : highlights}
                        redact={showThread ? undefined : redact}
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
              {hasPhotos && showMedia && <span className="hidden font-sans sm:block">Click an image to enlarge</span>}
            </div>

            {carousel && <div className="absolute bottom-4 left-3 z-[3] hidden lg:block">{slideNav}</div>}

            {exportError && (
              <p role="alert" className="absolute left-1/2 top-14 z-[3] max-w-[90%] -translate-x-1/2 bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
                {exportError}
              </p>
            )}

            <ScrollTop target={stageRef} />

            {/* Desktop: floating zoom pill */}
            <div className="absolute bottom-4 left-1/2 z-[2] hidden -translate-x-1/2 lg:block">{zoomPill}</div>
          </div>

          {/* Phones and tablets: slide and zoom controls sit right under the viewer */}
          <div className="flex items-center justify-between gap-2 border-b border-stone-300 px-3 py-2 lg:hidden">
            {carousel ? slideNav : <span />}
            {zoomPill}
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
