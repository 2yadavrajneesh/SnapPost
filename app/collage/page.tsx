"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CollageFrame, { type FrameLook, type Item } from "@/components/collage/CollageFrame";
import type { CardStyle } from "@/components/collage/CollageCard";
import ScrollTop from "@/components/ScrollTop";
import SiteHeader from "@/components/SiteHeader";
import { CollapsibleSection, Label, Section, Segmented, Slider, Toggle } from "@/components/ui";
import { BACKGROUNDS, CANVASES, FRAME_W, MAX_TWEETS, type CanvasKey, type LastRow, type LayoutMode } from "@/lib/collage";
import { downloadBlob, renderPdf, renderPng } from "@/lib/export";
import { parseTweetUrl } from "@/lib/parse";
import type { PostData } from "@/lib/types";

type Entry = { key: string; id: string; url: string; status: "loading" | "ok" | "error"; post?: PostData; error?: string };

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
  const [card, setCard] = useState<CardStyle>({ theme: "light", corners: "soft", logo: "x", textSize: 24, stats: true, media: true, dateTime: true, border: true });
  const [shadow, setShadow] = useState(false);
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
    const tokens = raw.split(/[\s,]+/).filter(Boolean);
    const have = new Set(entries.map((e) => e.id));
    const fresh: Entry[] = [];
    let bad = 0;
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
  const items: Item[] = useMemo(() => entries.filter((e) => e.status === "ok" && e.post).map((e) => ({ key: e.key, post: e.post as PostData })), [entries]);
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
      const base = `collage-${items.length}-tweets`;
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
          <Section title="Tweets">
            <div>
              <Label>Paste tweet links, one per line</Label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && submit()}
                placeholder={"https://x.com/user/status/123…\nhttps://x.com/user/status/456…"}
                aria-label="Tweet links"
                className="h-28 w-full resize-y border border-stone-200 bg-white p-2.5 font-mono text-xs outline-none focus:border-[color:var(--accent)]"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" className={`${btnPrimary} flex-1`} disabled={!text.trim() || entries.length >= MAX_TWEETS} onClick={submit}>Add tweets</button>
                <button type="button" onClick={() => void pasteClipboard()} aria-label="Paste links from clipboard" title="Paste from clipboard" className={`${btnPlain} w-10 px-0`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
                </button>
                <button type="button" onClick={() => (setEntries([]), setNatural({}))} disabled={!entries.length} aria-label="Remove all tweets" title="Start over" className={`${btnPlain} w-10 px-0`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500">{entries.length} of {MAX_TWEETS} tweets{loading ? ` · loading ${loading}…` : ""}{failed ? ` · ${failed} failed` : ""}</p>
            </div>

            {entries.length > 0 && (
              <ol className="space-y-1.5" aria-label="Tweets in the collage">
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
                      {e.status === "ok" && e.post ? (
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
                    <button type="button" className={iconBtn} aria-label={`Move tweet ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
                    <button type="button" className={iconBtn} aria-label={`Move tweet ${i + 1} down`} disabled={i === entries.length - 1} onClick={() => move(i, i + 1)}>↓</button>
                    <button type="button" className={iconBtn} aria-label={`Remove tweet ${i + 1}`} onClick={() => remove(e.key)}>×</button>
                  </li>
                ))}
              </ol>
            )}
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
                  <Label>Incomplete last row</Label>
                  <Segmented value={lastRow} onChange={setLastRow} options={[{ value: "center", label: "Centred" }, { value: "left", label: "Left" }]} />
                </div>
              </>
            )}
            <Slider label="Gap between tweets" value={gap} min={8} max={80} step={4} suffix="px" lowLabel="Tight" highLabel="Airy" onChange={setGap} />
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
              <Label>Logo</Label>
              <Segmented value={card.logo} onChange={(v) => setCard({ ...card, logo: v })} options={[{ value: "x", label: "X" }, { value: "bird", label: "Bird" }, { value: "none", label: "None" }]} />
            </div>
            <Slider label="Text size" value={card.textSize} min={18} max={32} step={2} suffix="px" lowLabel="Smaller" highLabel="Larger" onChange={(v) => setCard({ ...card, textSize: v })} />
            <div className="space-y-2">
              <Toggle label="Show pictures and video" checked={card.media} onChange={(v) => setCard({ ...card, media: v })} />
              <Toggle label="Show likes, reposts and replies" checked={card.stats} onChange={(v) => setCard({ ...card, stats: v })} />
              <Toggle label="Show time and date" checked={card.dateTime} onChange={(v) => setCard({ ...card, dateTime: v })} />
              <Toggle label="Card outline" checked={card.border} onChange={(v) => setCard({ ...card, border: v })} />
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
                    <div className="mb-1 text-base font-bold text-stone-900">{loading ? "Loading your tweets…" : "Make a tweet collage"}</div>
                    {loading ? "They appear here as soon as they load." : `Paste up to ${MAX_TWEETS} tweet links on the left. They are arranged into a clean, even grid you can download as a PNG or PDF.`}
                  </div>
                ) : (
                  <div style={{ width: FRAME_W * scale, height: frameH * scale }} className="mx-auto shadow-lg">
                    <div style={{ width: FRAME_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                      <CollageFrame ref={frame} items={items} natural={natural} onNatural={onNatural} mode={mode} cols={cols} ratio={CANVASES[canvas].ratio} lastRow={lastRow} style={card} look={look} />
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
