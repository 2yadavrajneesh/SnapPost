"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sDel, sGet, sSet, useSessionSnapshot } from "@/lib/session";
import { Card, btnPlain, btnPrimary, btnSm, field, useCopy } from "@/components/linkdesk/ui";
import NewsPreview from "./NewsPreview";
import { TITLE_STYLES } from "@/lib/pdf/newsLayout";
import { deleteResult, downloadHref, getConfig, runTool, uploadFile, type PdfConfig, type RunResult } from "@/lib/pdf/client";

type Item = { id: number; file: File; url: string; caption: string; source: string; nw: number; nh: number; dx: number; dy: number; page: number };
type Settings = { title: string; footer: string; layout: string; orient: string; header: string; theme: string; numbers: boolean; trim: boolean; splitTall: boolean; titleStyle: string; showDate: boolean };
const KEY = "clipbook:news:v1";
const DEFAULTS: Settings = { title: "Daily News Update", footer: "", layout: "auto", orient: "portrait", header: "every", theme: "navy", numbers: true, trim: true, splitTall: true, titleStyle: "classic", showDate: true };
const today = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
let seq = 0;

const LAYOUTS = [
  { v: "auto", l: "Auto (fits by shape)" },
  { v: "1", l: "One per page" },
  { v: "2across", l: "Two side by side" },
  { v: "2down", l: "Two stacked" },
  { v: "4", l: "Four per page" },
];

export default function NewsWorkspace() {
  const [cfg, setCfg] = useState<PdfConfig | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [s, setS] = useState<Settings>(DEFAULTS);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "process">("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [over, setOver] = useState(false);
  const copy = useCopy();
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    getConfig().then(setCfg).catch(() => setError("Could not reach the server."));
    setDate(today());
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) setS({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch {}
    return () => itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url));
  }, []);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS((cur) => {
      const next = { ...cur, [k]: v };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  // The pictures themselves are kept as files (one entry each); the rest is a small list of notes about them.
  const stored = useRef(new Set<number>());
  const meta = items.map((i) => ({ id: i.id, name: i.file.name, type: i.file.type, mod: i.file.lastModified, caption: i.caption, source: i.source, dx: i.dx, dy: i.dy, page: i.page, nw: i.nw, nh: i.nh }));
  const restored = useSessionSnapshot("clipbook:state", { meta, date: "" }, async (v) => {
    const out: Item[] = [];
    for (const m of v.meta ?? []) {
      const blob = await sGet<Blob>(`clipbook:file:${m.id}`);
      if (!blob) continue;
      const f = new File([blob], m.name, { type: m.type, lastModified: m.mod });
      stored.current.add(m.id);
      seq = Math.max(seq, m.id);
      out.push({ id: m.id, file: f, url: URL.createObjectURL(f), caption: m.caption, source: m.source, nw: m.nw, nh: m.nh, dx: m.dx, dy: m.dy, page: m.page });
    }
    setItems(out);
  });
  useEffect(() => {
    if (!restored) return;
    const now = new Set(items.map((i) => i.id));
    items.forEach((i) => {
      if (!stored.current.has(i.id)) {
        stored.current.add(i.id);
        void sSet(`clipbook:file:${i.id}`, i.file);
      }
    });
    [...stored.current].forEach((id) => {
      if (!now.has(id)) {
        stored.current.delete(id);
        void sDel(`clipbook:file:${id}`);
      }
    });
  }, [items, restored]);

  const maxImg = cfg?.maxImageBytes ?? 25 * 1048576;
  const limit = cfg?.maxFiles ?? 60;

  const add = useCallback(
    (list: FileList | File[]) => {
      setError("");
      setResult(null);
      const msgs: string[] = [];
      const next: Item[] = [];
      for (const f of Array.from(list)) {
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
          msgs.push(`${f.name || "A file"} is not a JPG, PNG or WebP picture.`);
          continue;
        }
        if (f.size > maxImg) {
          msgs.push(`${f.name} is larger than ${size(maxImg)}.`);
          continue;
        }
        const item: Item = { id: ++seq, file: f, url: URL.createObjectURL(f), caption: "", source: "", nw: 0, nh: 0, dx: 0, dy: 0, page: 0 };
        const im = new Image();
        im.onload = () => setItems((c) => c.map((x) => (x.id === item.id ? { ...x, nw: im.naturalWidth, nh: im.naturalHeight } : x)));
        im.src = item.url;
        next.push(item);
      }
      setItems((cur) => {
        const room = limit - cur.length;
        if (next.length > room) {
          msgs.push(`Only ${limit} screenshots fit in one PDF. Extra ones were left out.`);
          next.slice(room).forEach((i) => URL.revokeObjectURL(i.url));
        }
        return [...cur, ...next.slice(0, Math.max(0, room))];
      });
      if (msgs.length) setError(msgs.slice(0, 3).join(" "));
    },
    [maxImg, limit],
  );

  // pasting screenshots straight from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        add(files.map((f, i) => (f.name && f.name !== "image.png" ? f : new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }))));
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [add]);

  const update = (id: number, patch: Partial<Item>) => setItems((c) => c.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const move = (i: number, d: number) =>
    setItems((c) => {
      const a = [...c];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  const remove = (id: number) =>
    setItems((c) => {
      c.find((i) => i.id === id && URL.revokeObjectURL(i.url));
      return c.filter((i) => i.id !== id);
    });
  const [sortKey, setSortKey] = useState<"name" | "time" | "size">("name");
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [big, setBig] = useState(false);
  const sortBy = (dir: "up" | "down") =>
    setItems((c) => {
      const cmp = (a: Item, b: Item) => (sortKey === "name" ? a.file.name.localeCompare(b.file.name, undefined, { numeric: true }) : sortKey === "time" ? a.file.lastModified - b.file.lastModified : a.file.size - b.file.size);
      return [...c].sort((a, b) => (dir === "up" ? cmp(a, b) : cmp(b, a)));
    });
  const reverse = () => setItems((c) => [...c].reverse());
  const dropOn = (to: number) => {
    if (dragFrom == null || dragFrom === to) return;
    setItems((c) => {
      const a = [...c];
      const [m] = a.splice(dragFrom, 1);
      a.splice(to, 0, m);
      return a;
    });
  };
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setBig(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);
  const moveBy = (id: number, dx: number, dy: number) => update(id, { dx, dy });
  const sendTo = (id: number, page: number) => update(id, { page, dx: 0, dy: 0 });
  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    if (result) deleteResult(result.url);
    setItems([]);
    setResult(null);
    setError("");
  };

  async function run() {
    setError("");
    setResult(null);
    try {
      setBusy("upload");
      setPct(0);
      const done = [];
      for (let i = 0; i < items.length; i++) done.push(await uploadFile(items[i].file, cfg?.mode ?? "off", (p) => setPct(Math.round(((i + p / 100) / items.length) * 100))));
      setBusy("process");
      setResult(await runTool("news-pdf", done, { ...s, date, items: items.map((i) => ({ caption: i.caption, source: i.source, dx: i.dx, dy: i.dy, page: i.page })) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const ready = items.length > 0 && !busy && cfg?.mode !== "off";
  const sel = `${field}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Card step={1} title="Add screenshots" chip={items.length ? <span className="text-[11px] font-semibold text-stone-600">{items.length} added</span> : undefined}>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 border-2 border-dashed px-4 py-8 text-center transition ${over ? "border-accent bg-white" : "border-stone-300 bg-stone-50 hover:bg-white"}`}
          >
            <input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
            <strong className="text-sm text-stone-900">Drop screenshots here, click to choose, or paste with Ctrl+V</strong>
            <small className="text-[11px] text-stone-500">Up to {limit} pictures, {size(maxImg)} each. Very long screenshots are split across pages automatically.</small>
          </label>
          {items.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-stone-600">Sort by</span>
              <select aria-label="Sort by" className="h-8 border border-stone-300 bg-white px-2 text-[11px] font-semibold text-stone-800" value={sortKey} onChange={(e) => setSortKey(e.target.value as "name" | "time" | "size")}>
                <option value="name">Name</option>
                <option value="time">Date / time</option>
                <option value="size">File size</option>
              </select>
              <button type="button" className={btnSm} onClick={() => sortBy("up")} disabled={!!busy} title="Smallest, oldest or A first">↑ Increasing</button>
              <button type="button" className={btnSm} onClick={() => sortBy("down")} disabled={!!busy} title="Largest, newest or Z first">↓ Decreasing</button>
              <button type="button" className={btnSm} onClick={reverse} disabled={!!busy}>Reverse</button>
              <button type="button" className={btnSm} onClick={clearAll} disabled={!!busy}>Remove all</button>
            </div>
          )}
          {items.length > 1 && <p className="mt-3 text-[11px] text-stone-500">Drag a picture onto another to change the order, or use the arrows.</p>}
          {items.length > 0 && (
            <ul className="mt-1 grid gap-3 sm:grid-cols-2">
              {items.map((it, i) => (
                <li
                  key={it.id}
                  draggable={!busy}
                  onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                  onDragOver={(e) => { if (dragFrom != null) { e.preventDefault(); setDragOver(i); } }}
                  onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOn(i); setDragFrom(null); setDragOver(null); }}
                  onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  className={`flex cursor-grab gap-3 border bg-white p-2.5 active:cursor-grabbing ${dragOver === i && dragFrom !== i ? "border-accent ring-2 ring-accent/30" : "border-stone-200"} ${dragFrom === i ? "opacity-50" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" draggable={false} className="h-24 w-20 flex-none border border-stone-200 bg-stone-50 object-contain" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="select-none text-stone-400" title="Drag to move" aria-hidden="true">⠿</span>
                      <span className="bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-stone-500">{it.file.name} · {size(it.file.size)}{it.file.lastModified ? ` · ${new Date(it.file.lastModified).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</span>
                      <button type="button" className={btnSm} onClick={() => move(i, -1)} disabled={i === 0 || !!busy} aria-label="Move earlier">↑</button>
                      <button type="button" className={btnSm} onClick={() => move(i, 1)} disabled={i === items.length - 1 || !!busy} aria-label="Move later">↓</button>
                      <button type="button" className={btnSm} onClick={() => remove(it.id)} disabled={!!busy} aria-label={`Remove picture ${i + 1}`}>✕</button>
                    </div>
                    <input className={sel} placeholder="Source, e.g. The Hindu" maxLength={60} value={it.source} onChange={(e) => update(it.id, { source: e.target.value })} />
                    <input className={sel} placeholder="Caption or headline (optional)" maxLength={400} value={it.caption} onChange={(e) => update(it.id, { caption: e.target.value })} />
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-stone-600">
                      <label className="flex items-center gap-1.5">Go to page
                        <input type="number" min={1} max={200} inputMode="numeric" placeholder="auto" aria-label={`Page number for picture ${i + 1}`} className="w-16 border border-stone-200 bg-white px-1.5 py-1 text-xs" value={it.page || ""} onChange={(e) => update(it.id, { page: Math.max(0, Math.min(200, Math.floor(Number(e.target.value)) || 0)), dx: 0, dy: 0 })} />
                      </label>
                      {(it.dx !== 0 || it.dy !== 0 || it.page > 0) && <button type="button" className={btnSm} onClick={() => update(it.id, { dx: 0, dy: 0, page: 0 })}>Reset position</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card step={2} title="Page set-up">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-stone-700">Report title
              <input className={`${sel} mt-1`} value={s.title} maxLength={90} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-stone-700">Date shown on the page
              <input className={`${sel} mt-1`} value={date} maxLength={60} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-stone-700">Screenshots per page
              <select className={`${sel} mt-1`} value={s.layout} onChange={(e) => set("layout", e.target.value)}>{LAYOUTS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}</select>
            </label>
            <label className="block text-xs font-semibold text-stone-700">Page direction
              <select className={`${sel} mt-1`} value={s.orient} onChange={(e) => set("orient", e.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>
            </label>
            <label className="block text-xs font-semibold text-stone-700">Title on
              <select className={`${sel} mt-1`} value={s.header} onChange={(e) => set("header", e.target.value)}><option value="every">Every page</option><option value="first">First page only</option><option value="none">No title</option></select>
            </label>
            <label className="block text-xs font-semibold text-stone-700">Title style
              <select className={`${sel} mt-1`} value={s.titleStyle} onChange={(e) => set("titleStyle", e.target.value)}>{TITLE_STYLES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</select>
            </label>
            <label className="block text-xs font-semibold text-stone-700">Accent colour
              <select className={`${sel} mt-1`} value={s.theme} onChange={(e) => set("theme", e.target.value)}><option value="navy">Navy</option><option value="red">Red</option><option value="green">Green</option><option value="black">Black</option></select>
            </label>
            <label className="block text-xs font-semibold text-stone-700 sm:col-span-2">Footer text (optional)
              <input className={`${sel} mt-1`} value={s.footer} maxLength={90} placeholder="Compiled by the media desk" onChange={(e) => set("footer", e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-stone-700">
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.showDate} onChange={(e) => set("showDate", e.target.checked)} />Show the date</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.numbers} onChange={(e) => set("numbers", e.target.checked)} />Number the clippings</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.trim} onChange={(e) => set("trim", e.target.checked)} />Trim blank borders</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={s.splitTall} onChange={(e) => set("splitTall", e.target.checked)} />Split very long screenshots</label>
          </div>
          <p className="mt-2 text-[11px] text-stone-500">Your settings are remembered on this device, so tomorrow only the pictures and date need changing.</p>
        </Card>
      </div>

      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title={result ? "Your PDF is ready" : "Make the PDF"}>
          {cfg?.mode === "off" && <p className="mb-3 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">File storage is not set up on this site yet.</p>}
          {!result && (
            <button type="button" className={`${btnPrimary} w-full`} disabled={!ready} onClick={run}>
              {busy === "upload" ? `Uploading ${pct}%` : busy === "process" ? "Building the PDF…" : "Make PDF"}
            </button>
          )}
          {!result && !items.length && <p className="mt-2 text-[11px] text-stone-500">Add at least one screenshot to continue.</p>}
          {error && <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
          {result && (
            <div className="space-y-2">
              <p className="truncate text-xs font-semibold text-stone-800">{result.name}</p>
              {result.note && <p className="bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-800">{result.note}</p>}
              <p className="text-[11px] text-stone-500">{size(result.size)}. The link works for about {cfg?.ttlMinutes ?? 30} minutes, then the file is deleted.</p>
              <a className={`${btnPrimary} w-full`} href={downloadHref(result.url)} download={result.name}>Download</a>
              <button type="button" className={`${btnPlain} w-full`} onClick={() => copy(result.url, "Link copied.")}>Copy link</button>
              <button type="button" className={`${btnPlain} w-full`} onClick={() => { deleteResult(result.url); setResult(null); }}>Change something and rebuild</button>
              <button type="button" className={`${btnPlain} w-full`} onClick={clearAll}>Delete and start a new day</button>
            </div>
          )}
        </Card>
        <Card title="Live PDF preview" chip={<button type="button" onClick={() => setBig(true)} disabled={!items.length} aria-label="Enlarge the preview" title="Enlarge to see the whole PDF" className="ml-auto flex h-7 w-7 items-center justify-center border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:opacity-40"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg></button>}>
          <div className="max-h-[62vh] overflow-y-auto bg-stone-200 p-2.5">
            <NewsPreview items={items} s={s} date={s.showDate ? date : ""} onMove={moveBy} onSend={sendTo} />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-stone-500">Drag a picture to place it anywhere, or drop it on another page to send it there. Same page layout as the final file. The PDF also trims blank borders if that option is on, so spacing can differ slightly.</p>
        </Card>
        <p className="px-1 text-[11px] leading-relaxed text-stone-500">Screenshots are processed on the server and removed right after. Hindi and English text are both supported in titles and captions.</p>
      </aside>
      {big && (
        <div role="dialog" aria-modal="true" aria-label="Full PDF preview" className="fixed inset-0 z-50 flex flex-col bg-black/75" onClick={() => setBig(false)}>
          <div className="flex items-center justify-between px-4 py-2 text-white" onClick={(e) => e.stopPropagation()}>
            <span className="text-sm font-semibold">PDF preview · drag a picture to place it, or drop it on another page</span>
            <button type="button" onClick={() => setBig(false)} className="border border-white/50 px-3 py-1 text-xs font-semibold hover:bg-white/10">Close ✕</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto max-w-[860px]">
              <NewsPreview items={items} s={s} date={s.showDate ? date : ""} onMove={moveBy} onSend={sendTo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
