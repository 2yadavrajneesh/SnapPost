"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CollageFrame, { type FrameLook, type Item, type Picture } from "@/components/collage/CollageFrame";
import { BORDERS, type BorderKind, type CardStyle } from "@/components/collage/CollageCard";
import ScrollTop from "@/components/ScrollTop";
import SiteHeader from "@/components/SiteHeader";
import { CollapsibleSection, Label, Section, Segmented, Slider, Toggle } from "@/components/ui";
import { BACKGROUNDS, CANVASES, FRAME_W, MAX_TWEETS, type CanvasKey, type LastRow, type LayoutMode } from "@/lib/collage";
import { downloadBlob, renderPdf, renderPng } from "@/lib/export";
import { findTweetLinks, parseTweetUrl } from "@/lib/parse";
import { readLinkFile } from "@/lib/linkfile";
import type { PostData } from "@/lib/types";

type Entry = { key: string; id: string; url: string; status: "loading" | "ok" | "error"; post?: PostData; image?: Picture; label?: string; error?: string };

const MAX_PICTURE_BYTES = 25 * 1024 * 1024;
const MAX_SIDE = 1800;

/** Reads a picture file, scales it down to a sensible size and returns it as a data URL. */
async function readPicture(file: File): Promise<Picture> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not a picture.`);
  if (file.size > MAX_PICTURE_BYTES) throw new Error(`${file.name} is over 25 MB.`);
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error(`${file.name} could not be opened.`));
      i.src = url;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const png = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
    return { src: c.toDataURL(png ? "image/png" : "image/jpeg", 0.92), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const CONCURRENCY = 3;
const btn = "inline-flex h-9 items-center justify-center gap-1.5 border px-3 text-xs font-semibold transition disabled:opacity-40";
const btnPrimary = `${btn} border-transparent bg-accent text-white hover:brightness-110`;
const btnPlain = `${btn} border-stone-300 bg-white text-stone-800 hover:bg-stone-100`;
const iconBtn = "flex h-7 w-7 flex-none items-center justify-center border border-stone-200 bg-white text-stone-600 transition hover:bg-stone-100 disabled:opacity-30";

export default function CollageMaker() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState("");
  const [natural, setNatural] = useState<Record<string, number>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const [overDrop, setOverDrop] = useState(false);

  // layout
  const [mode, setMode] = useState<LayoutMode>("grid");
  const [cols, setCols] = useState(0);
  const [canvas, setCanvas] = useState<CanvasKey>("auto");
  const [lastRow, setLastRow] = useState<LastRow>("center");
  const [gap, setGap] = useState(28);
  const [pad, setPad] = useState(56);
  // style
  const [bgId, setBgId] = useState("cream");
  const [customBg, setCustomBg] = useState("#f4d8e6");
  const [card, setCard] = useState<CardStyle>({ theme: "light", corners: "soft", logo: "x", textSize: 24, stats: true, media: true, dateTime: true, border: "thin", borderColor: "auto" });
  const [shadow, setShadow] = useState(false);
  const [crop, setCrop] = useState(false);
  const [headText, setHeadText] = useState("");
  const [headSize, setHeadSize] = useState(44);
  const [headDark, setHeadDark] = useState(true);
  const [classic, setClassic] = useState(false);
  const before = useRef<null | { mode: LayoutMode; cols: number; canvas: CanvasKey; lastRow: LastRow; gap: number; pad: number; bgId: string; customBg: string; card: CardStyle; shadow: boolean; crop: boolean; headDark: boolean; headSize: number }>(null);
  // export
  const [format, setFormat] = useState<"png" | "pdf">("png");
  const [quality, setQuality] = useState<1 | 2>(1);
  const [exporting, setExporting] = useState(false);

  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(900);
  const inflight = useRef(new Set<string>());
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(""), 2600);
  };

  /* ----- loading tweets (three at a time) ----- */
  useEffect(() => {
    const room = CONCURRENCY - inflight.current.size;
    if (room <= 0) return;
    entries
      .filter((e) => e.status === "loading" && !inflight.current.has(e.key))
      .slice(0, room)
      .forEach((e) => {
        inflight.current.add(e.key);
        (async () => {
          try {
            const r = await fetch(`/api/tweet?url=${encodeURIComponent(e.url)}`);
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "Couldn't fetch that tweet.");
            setEntries((l) => l.map((x) => (x.key === e.key ? { ...x, status: "ok", post: j as PostData } : x)));
          } catch (err) {
            setEntries((l) => l.map((x) => (x.key === e.key ? { ...x, status: "error", error: err instanceof Error ? err.message : "Couldn't fetch that tweet." } : x)));
          } finally {
            inflight.current.delete(e.key);
          }
        })();
      });
  }, [entries]);

  function addLinks(raw: string) {
    // find tweet links anywhere in the text, so notes, CSV rows or whole web pages work too
    const tokens = findTweetLinks(raw);
    const stray = tokens.length === 0 && raw.trim().length > 0;
    const have = new Set(entries.map((e) => e.id));
    const fresh: Entry[] = [];
    let bad = stray ? 1 : 0;
    let dup = 0;
    for (const t of tokens) {
      const p = parseTweetUrl(t);
      if (!p) {
        bad++;
        continue;
      }
      if (have.has(p.id)) {
        dup++;
        continue;
      }
      have.add(p.id);
      fresh.push({ key: `${p.id}-${Date.now()}-${fresh.length}`, id: p.id, url: `https://x.com/${p.username}/status/${p.id}`, status: "loading" });
    }
    const room = MAX_TWEETS - entries.length;
    const take = fresh.slice(0, Math.max(0, room));
    if (take.length) setEntries((l) => [...l, ...take]);
    const bits: string[] = [];
    if (take.length) bits.push(`Added ${take.length} ${take.length === 1 ? "tweet" : "tweets"}`);
    if (fresh.length > take.length) bits.push(`only ${MAX_TWEETS} tweets fit in one collage`);
    if (dup) bits.push(`${dup} already added`);
    if (bad) bits.push(`${bad} not a tweet link`);
    if (bits.length) flash(bits.join(". ") + ".");
    return take.length > 0 || dup > 0;
  }

  async function addFiles(list: FileList | File[]) {
    const all = Array.from(list);
    const pics = all.filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(f.name));
    const docs = all.filter((f) => !pics.includes(f));
    const bits: string[] = [];
    // files with links inside: find the tweet links automatically and load them
    const found: string[] = [];
    for (const f of docs) {
      try {
        const links = findTweetLinks(await readLinkFile(f));
        if (!links.length) bits.push(`No tweet links found in ${f.name}`);
        else {
          found.push(...links);
          bits.push(`Found ${links.length} ${links.length === 1 ? "link" : "links"} in ${f.name}`);
        }
      } catch {
        bits.push(`${f.name} could not be read`);
      }
    }
    if (found.length) addLinks(found.join("\n"));
    if (pics.length) {
      const room = MAX_TWEETS - entries.length;
      if (room <= 0) bits.push(`Only ${MAX_TWEETS} items fit in one collage`);
      else {
        const take = pics.slice(0, room);
        const fresh: Entry[] = [];
        let bad = 0;
        for (const f of take) {
          try {
            const image = await readPicture(f);
            fresh.push({ key: `file-${Date.now()}-${fresh.length}-${Math.random().toString(36).slice(2, 6)}`, id: f.name, url: "", status: "ok", image, label: f.name });
          } catch {
            bad++;
          }
        }
        if (fresh.length) setEntries((l) => [...l, ...fresh].slice(0, MAX_TWEETS));
        if (fresh.length) bits.push(`Added ${fresh.length} ${fresh.length === 1 ? "picture" : "pictures"}`);
        if (pics.length > take.length) bits.push(`only ${MAX_TWEETS} items fit in one collage`);
        if (bad) bits.push(`${bad} could not be read`);
      }
    }
    if (bits.length) flash(bits.join(". ") + ".");
  }

  // pasting a picture (Ctrl+V) anywhere on the page adds it too
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
        return;
      }
      // pasted text with tweet links is added straight away, unless you are typing in a box
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (findTweetLinks(text).length) {
        e.preventDefault();
        addLinks(text);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  const submit = () => {
    if (!text.trim()) return;
    if (addLinks(text)) setText("");
  };

  async function pasteClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) addLinks(t);
    } catch {
      flash("Paste with Ctrl+V or long-press, then press Add");
    }
  }

  /** One click for the look of the sample collage: tidy grey page, white cells, a title on top, tweets filling each cell. */
  function classicLook() {
    if (classic) {
      // switching it off puts every setting back as it was before
      const b = before.current;
      setMode(b?.mode ?? "grid");
      setCols(b?.cols ?? 0);
      setCanvas(b?.canvas ?? "auto");
      setLastRow(b?.lastRow ?? "center");
      setGap(b?.gap ?? 28);
      setPad(b?.pad ?? 56);
      setBgId(b?.bgId ?? "cream");
      setCustomBg(b?.customBg ?? "#f4d8e6");
      setCard(b?.card ?? { theme: "light", corners: "soft", logo: "x", textSize: 24, stats: true, media: true, dateTime: true, border: "thin", borderColor: "auto" });
      setShadow(b?.shadow ?? false);
      setCrop(b?.crop ?? false);
      setHeadDark(b?.headDark ?? true);
      setHeadSize(b?.headSize ?? 44);
      setClassic(false);
      flash("Classic grid look is off. Your earlier layout is back.");
      return;
    }
    before.current = { mode, cols, canvas, lastRow, gap, pad, bgId, customBg, card, shadow, crop, headDark, headSize };
    setClassic(true);
    setMode("grid");
    setCols(3);
    setCanvas("portrait");
    setLastRow("center");
    setGap(10);
    setPad(10);
    setBgId("custom");
    setCustomBg("#ececec");
    setCard({ theme: "light", corners: "sharp", logo: "x", textSize: 24, stats: false, media: true, dateTime: false, border: "none", borderColor: "auto" });
    setShadow(false);
    setCrop(false); // whole tweet: text and media shrink to fit, nothing is cut off
    setHeadDark(true);
    setHeadSize(44);
    setHeadText((t) => t || "My collage title");
    flash("Applied the classic grid look. Change the title on the left.");
  }

  const retry = (key: string) => setEntries((l) => l.map((e) => (e.key === key ? { ...e, status: "loading", error: undefined } : e)));
  const remove = (key: string) => setEntries((l) => l.filter((e) => e.key !== key));
  const move = (from: number, to: number) =>
    setEntries((l) => {
      if (to < 0 || to >= l.length || from === to) return l;
      const c = [...l];
      const [m] = c.splice(from, 1);
      c.splice(to, 0, m);
      return c;
    });

  /* ----- the picture ----- */
  const items: Item[] = useMemo(() => entries.filter((e) => e.status === "ok" && (e.post || e.image)).map((e) => ({ key: e.key, post: e.post, image: e.image })), [entries]);
  const onNatural = useCallback((key: string, h: number) => setNatural((m) => (m[key] === h ? m : { ...m, [key]: h })), []);
  const bg = bgId === "custom" ? customBg : (BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[1]).css;
  const look: FrameLook = { background: bg, gap, pad, cellRadius: card.corners === "sharp" ? 0 : card.corners === "soft" ? 24 : 44, shadow };

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaW(el.clientWidth));
    ro.observe(el);
    setAreaW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, Math.max(0.1, areaW / FRAME_W));
  const [frameH, setFrameH] = useState(900);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFrameH(el.offsetHeight));
    ro.observe(el);
    setFrameH(el.offsetHeight);
    return () => ro.disconnect();
  }, [items.length]);

  async function download() {
    const node = frame.current;
    if (!node || !items.length) return;
    setExporting(true);
    try {
      // let every picture finish loading first
      await Promise.all(Array.from(node.querySelectorAll("img")).map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = () => r(null); }))));
      const r = await renderPng(node, { maxWidth: FRAME_W * quality });
      const slug = headText.trim().replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
      const base = slug ? `collage-${slug}` : `collage-${items.length}-${items.length === 1 ? "item" : "items"}`;
      if (format === "pdf") downloadBlob(await renderPdf(r.dataUrl, r.width, r.height), `${base}.pdf`);
      else {
        const blob = await (await fetch(r.dataUrl)).blob();
        downloadBlob(blob, `${base}.png`);
      }
      flash(`Saved ${base}.${format}`);
    } catch {
      flash("Couldn't create the picture. Try again, or use a smaller size.");
    } finally {
      setExporting(false);
    }
  }

  const loading = entries.filter((e) => e.status === "loading").length;
  const failed = entries.filter((e) => e.status === "error").length;

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style={{ ["--accent" as string]: "#be185d" }}>
      <SiteHeader />
      <main className="grid w-full flex-1 lg:min-h-0 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="order-2 min-w-0 border-t border-stone-300 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <Section title="Tweets and pictures">
            <div>
              <Label>Paste tweet links, one per line</Label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && submit()}
                onPaste={(e) => {
                  // links pasted into the box are recognised and added at once
                  const t = e.clipboardData.getData("text");
                  if (findTweetLinks(t).length) {
                    e.preventDefault();
                    addLinks(t);
                  }
                }}
                placeholder={"https://x.com/user/status/123…\nhttps://x.com/user/status/456…"}
                aria-label="Tweet links"
                className="h-28 w-full resize-y border border-stone-200 bg-white p-2.5 font-mono text-xs outline-none focus:border-[color:var(--accent)]"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" className={`${btnPrimary} flex-1`} disabled={!text.trim() || entries.length >= MAX_TWEETS} onClick={submit}>Add links</button>
                <button type="button" onClick={() => void pasteClipboard()} aria-label="Paste links from clipboard" title="Paste from clipboard" className={`${btnPlain} w-10 px-0`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
                </button>
                <button type="button" onClick={() => (setEntries([]), setNatural({}))} disabled={!entries.length} aria-label="Remove everything" title="Start over" className={`${btnPlain} w-10 px-0`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                </button>
              </div>
              <input ref={fileInput} type="file" accept="image/*,.txt,.csv,.tsv,.json,.md,.html,.htm,.xml,.docx,.pdf,.xlsx,.xls,.xlsm,.ods" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
              <div
                onDragOver={(e) => { e.preventDefault(); setOverDrop(true); }}
                onDragLeave={() => setOverDrop(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
                  else addLinks(e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text"));
                  setOverDrop(false);
                }}
                className={`mt-2 flex flex-col items-center gap-1 border-2 border-dashed px-3 py-3 text-center transition ${overDrop ? "border-accent bg-pink-50" : "border-stone-300 bg-white"}`}
              >
                <button type="button" className={`${btnPlain} w-full`} disabled={entries.length >= MAX_TWEETS} onClick={() => fileInput.current?.click()}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                  Upload files
                </button>
                <span className="text-[11px] text-stone-500">Pictures, or a Word, PDF, text, CSV, HTML or Excel file with links: tweet links inside are found for you. Drop files here or paste with Ctrl+V.</span>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500">{entries.length} of {MAX_TWEETS} items{loading ? ` · loading ${loading}…` : ""}{failed ? ` · ${failed} failed` : ""}</p>
            </div>

            {entries.length > 0 && (
              <ol className="space-y-1.5" aria-label="Items in the collage">
                {entries.map((e, i) => (
                  <li
                    key={e.key}
                    draggable
                    onDragStart={() => (dragFrom.current = i)}
                    onDragOver={(ev) => (ev.preventDefault(), setDragOver(i))}
                    onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
                    onDrop={(ev) => {
                      ev.preventDefault();
                      if (dragFrom.current !== null) move(dragFrom.current, i);
                      dragFrom.current = null;
                      setDragOver(null);
                    }}
                    onDragEnd={() => (dragFrom.current = null, setDragOver(null))}
                    className={`flex items-center gap-2 border bg-white p-1.5 ${dragOver === i ? "border-accent" : "border-stone-200"}`}
                  >
                    <span className="w-5 flex-none cursor-grab text-center text-[11px] font-bold text-stone-400" title="Drag to reorder">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      {e.status === "ok" && e.image ? (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.image.src} alt="" className="h-8 w-8 flex-none border border-stone-200 object-cover" />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-stone-800">{e.label}</div>
                            <div className="text-[11px] text-stone-500">Uploaded picture</div>
                          </div>
                        </div>
                      ) : e.status === "ok" && e.post ? (
                        <>
                          <div className="truncate text-xs font-semibold text-stone-800">{e.post.name} <span className="font-normal text-stone-500">@{e.post.username}</span></div>
                          <div className="truncate text-[11px] text-stone-500">{e.post.text || (e.post.photos.length ? "Photo" : e.post.video ? "Video" : "")}</div>
                        </>
                      ) : e.status === "loading" ? (
                        <div className="flex items-center gap-2 text-xs text-stone-500"><span className="snap-spinner" aria-hidden="true" />Loading… <span className="truncate">{e.id}</span></div>
                      ) : (
                        <div role="alert" className="text-[11px] text-red-700">{e.error} <button type="button" onClick={() => retry(e.key)} className="font-semibold underline">Retry</button></div>
                      )}
                    </div>
                    <button type="button" className={iconBtn} aria-label={`Move item ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                    <button type="button" className={iconBtn} aria-label={`Move item ${i + 1} down`} disabled={i === entries.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                    <button type="button" className={iconBtn} aria-label={`Remove item ${i + 1}`} onClick={() => remove(e.key)}>×</button>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          <Section title="Title and look">
            <div>
              <Label>Title on top (optional)</Label>
              <input value={headText} onChange={(e) => setHeadText(e.target.value)} maxLength={120} placeholder="e.g. Sonia Gandhi - Belonging: A Journey of Love" aria-label="Collage title" className="h-9 w-full border border-stone-200 bg-white px-2.5 text-xs outline-none focus:border-[color:var(--accent)]" />
            </div>
            {headText.trim() && (
              <>
                <Slider label="Title size" value={headSize} min={28} max={80} step={2} suffix="px" lowLabel="Small" highLabel="Large" onChange={setHeadSize} />
                <div>
                  <Label>Title colour</Label>
                  <Segmented value={headDark ? "dark" : "light"} onChange={(v) => setHeadDark(v === "dark")} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} />
                </div>
              </>
            )}
            <button type="button" role="switch" aria-checked={classic} className={`${btnPlain} w-full ${classic ? "!border-[#1b2420] !bg-[#1b2420] !text-white" : ""}`} onClick={classicLook}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
              {classic ? "Classic grid look (title + 3 columns): ON. Click to deselect" : "Use the classic grid look (title + 3 columns)"}
            </button>
          </Section>

          <CollapsibleSection title="Layout">
            <div>
              <Label>Style</Label>
              <Segmented value={mode} onChange={setMode} options={[{ value: "grid", label: "Even grid" }, { value: "masonry", label: "Masonry" }]} />
              <p className="mt-1 text-[11px] text-stone-500">{mode === "grid" ? "Every tweet gets a cell of the same size. Tall tweets shrink to fit." : "Tweets keep their own height and fill the columns. The picture height fits the content."}</p>
            </div>
            <div>
              <Label>Columns</Label>
              <Segmented value={String(cols)} onChange={(v) => setCols(Number(v))} wrap options={[{ value: "0", label: "Auto" }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))]} />
            </div>
            {mode === "grid" && (
              <>
                <div>
                  <Label>Picture shape</Label>
                  <Segmented value={canvas} onChange={setCanvas} wrap options={(Object.keys(CANVASES) as CanvasKey[]).map((k) => ({ value: k, label: `${CANVASES[k].label} ${CANVASES[k].ratio ? CANVASES[k].note : ""}`.trim() }))} />
                </div>
                <div>
                  <Label>Tweet in each cell</Label>
                  <Segmented value={crop ? "fill" : "whole"} onChange={(v) => setCrop(v === "fill")} options={[{ value: "whole", label: "Whole tweet" }, { value: "fill", label: "Fill width" }]} />
                  <p className="mt-1 text-[11px] text-stone-500">{crop ? "Each tweet is as wide as its cell. Very tall ones are cut off at the bottom." : "Tall tweets shrink so the whole tweet shows."}</p>
                </div>
                <div>
                  <Label>Incomplete last row</Label>
                  <Segmented value={lastRow} onChange={setLastRow} options={[{ value: "center", label: "Centred" }, { value: "left", label: "Left" }]} />
                </div>
              </>
            )}
            <Slider label="Gap between items" value={gap} min={8} max={80} step={4} suffix="px" lowLabel="Tight" highLabel="Airy" onChange={setGap} />
            <Slider label="Outer margin" value={pad} min={0} max={160} step={8} suffix="px" lowLabel="None" highLabel="Wide" onChange={setPad} />
          </CollapsibleSection>

          <CollapsibleSection title="Style">
            <div>
              <Label>Background</Label>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Background">
                {BACKGROUNDS.map((b) => (
                  <button key={b.id} type="button" role="radio" aria-checked={bgId === b.id} aria-label={b.label} title={b.label} onClick={() => setBgId(b.id)} className={`h-9 border-2 ${bgId === b.id ? "border-accent" : "border-stone-300"}`} style={{ background: b.css }} />
                ))}
                <label title="Custom colour" className={`relative flex h-9 cursor-pointer items-center justify-center border-2 text-[10px] font-bold ${bgId === "custom" ? "border-accent" : "border-stone-300"}`} style={{ background: customBg }}>
                  <input type="color" value={customBg} aria-label="Custom background colour" onChange={(e) => (setCustomBg(e.target.value), setBgId("custom"))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  <span className="bg-white/80 px-1 text-stone-800">+</span>
                </label>
              </div>
            </div>
            <div>
              <Label>Tweet cards</Label>
              <Segmented value={card.theme} onChange={(v) => setCard({ ...card, theme: v })} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
            </div>
            <div>
              <Label>Corners</Label>
              <Segmented value={card.corners} onChange={(v) => setCard({ ...card, corners: v })} options={[{ value: "sharp", label: "Sharp" }, { value: "soft", label: "Soft" }, { value: "round", label: "Round" }]} />
            </div>
            <div>
              <Label>Card border</Label>
              <Segmented value={card.border} onChange={(v) => setCard({ ...card, border: v })} wrap options={(Object.keys(BORDERS) as BorderKind[]).map((k) => ({ value: k, label: BORDERS[k].label }))} />
              {card.border !== "none" && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Border colour">
                  {[["auto", "Auto"], ["#111111", "Black"], ["#ffffff", "White"], ["#be185d", "Pink"], ["#1d9bf0", "Blue"], ["#d4a017", "Gold"]].map(([v, name]) => (
                    <button key={v} type="button" role="radio" aria-checked={card.borderColor === v} aria-label={name} title={name} onClick={() => setCard({ ...card, borderColor: v })} className={`h-7 min-w-7 border-2 px-1 text-[10px] font-bold ${card.borderColor === v ? "border-accent" : "border-stone-300"}`} style={v === "auto" ? undefined : { background: v }}>
                      {v === "auto" ? "Auto" : ""}
                    </button>
                  ))}
                  <label title="Custom colour" className={`relative flex h-7 w-7 cursor-pointer items-center justify-center border-2 text-[10px] font-bold ${!["auto", "#111111", "#ffffff", "#be185d", "#1d9bf0", "#d4a017"].includes(card.borderColor) ? "border-accent" : "border-stone-300"}`} style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}>
                    <input type="color" aria-label="Custom border colour" value={card.borderColor === "auto" ? "#888888" : card.borderColor} onChange={(e) => setCard({ ...card, borderColor: e.target.value })} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                  </label>
                </div>
              )}
            </div>
            <div>
              <Label>Logo</Label>
              <Segmented value={card.logo} onChange={(v) => setCard({ ...card, logo: v })} options={[{ value: "x", label: "X" }, { value: "bird", label: "Bird" }, { value: "none", label: "None" }]} />
            </div>
            <Slider label="Text size" value={card.textSize} min={18} max={32} step={2} suffix="px" lowLabel="Smaller" highLabel="Larger" onChange={(v) => setCard({ ...card, textSize: v })} />
            <div className="space-y-2">
              <Toggle label="Show pictures and video" checked={card.media} onChange={(v) => setCard({ ...card, media: v })} />
              <Toggle label="Show likes, reposts and replies" checked={card.stats} onChange={(v) => setCard({ ...card, stats: v })} />
              <Toggle label="Show time and date" checked={card.dateTime} onChange={(v) => setCard({ ...card, dateTime: v })} />
              <Toggle label="Soft shadow" checked={shadow} onChange={setShadow} />
            </div>
          </CollapsibleSection>

          <Section title="Save">
            <div>
              <Label>Format</Label>
              <Segmented value={format} onChange={setFormat} options={[{ value: "png", label: "PNG image" }, { value: "pdf", label: "PDF document" }]} />
            </div>
            <div>
              <Label>Size</Label>
              <Segmented value={String(quality)} onChange={(v) => setQuality(Number(v) as 1 | 2)} options={[{ value: "1", label: `Standard ${FRAME_W}px` }, { value: "2", label: `High ${FRAME_W * 2}px` }]} />
            </div>
            <button type="button" className={`${btnPrimary} h-11 w-full text-sm`} disabled={!items.length || exporting || loading > 0} onClick={() => void download()}>
              {exporting ? "Creating…" : loading ? "Loading tweets…" : `Download ${format.toUpperCase()}`}
            </button>
            {!items.length && <p className="text-[11px] text-stone-500">Add at least one tweet to download a collage.</p>}
          </Section>
        </aside>

        <div className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div className="collage-stage relative flex max-h-[72vh] flex-1 overflow-hidden lg:max-h-none lg:min-h-0">
            <div ref={stage} className="relative z-[1] flex-1 overflow-auto px-4 py-6 sm:px-8">
              <div ref={area} className="mx-auto w-full max-w-[1100px]">
                {!items.length ? (
                  <div className="border border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
                    <div className="mb-1 text-base font-bold text-stone-900">{loading ? "Loading your tweets…" : "Make a collage"}</div>
                    {loading ? "They appear here as soon as they load." : `Paste tweet links or upload pictures on the left, up to ${MAX_TWEETS} in all. They are arranged into a clean, even grid you can download as a PNG or PDF.`}
                  </div>
                ) : (
                  <div style={{ width: FRAME_W * scale, height: frameH * scale }} className="mx-auto shadow-lg">
                    <div style={{ width: FRAME_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      <CollageFrame ref={frame} items={items} natural={natural} onNatural={onNatural} mode={mode} cols={cols} ratio={CANVASES[canvas].ratio} lastRow={lastRow} style={card} look={look} crop={crop} heading={{ text: headText, size: headSize, color: headDark ? "#111111" : "#ffffff" }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <ScrollTop target={stage} />
            {notice && (
              <div role="status" className="absolute bottom-4 left-1/2 z-[6] max-w-[90%] -translate-x-1/2 bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow">{notice}</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
