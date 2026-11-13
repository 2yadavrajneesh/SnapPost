"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, btnPlain, btnPrimary, btnSm, field, useCopy } from "@/components/linkdesk/ui";
import { deleteResult, downloadHref, getConfig, runTool, uploadFile, type PdfConfig, type RunResult } from "@/lib/pdf/client";

type Item = { id: number; file: File; url: string; caption: string; source: string };
type Settings = { title: string; footer: string; layout: string; orient: string; header: string; theme: string; numbers: boolean; trim: boolean; splitTall: boolean };
const KEY = "clipbook:news:v1";
const DEFAULTS: Settings = { title: "Daily News Update", footer: "", layout: "auto", orient: "portrait", header: "every", theme: "navy", numbers: true, trim: true, splitTall: true };
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
        next.push({ id: ++seq, file: f, url: URL.createObjectURL(f), caption: "", source: "" });
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
  const sortBy = (how: "name" | "time") => setItems((c) => [...c].sort((a, b) => (how === "name" ? a.file.name.localeCompare(b.file.name, undefined, { numeric: true }) : a.file.lastModified - b.file.lastModified)));
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
      setResult(await runTool("news-pdf", done, { ...s, date, items: items.map((i) => ({ caption: i.caption, source: i.source })) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  const ready = items.length > 0 && !busy && cfg?.mode !== "off";
  const sel = `${field}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
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
              <button type="button" className={btnSm} onClick={() => sortBy("name")} disabled={!!busy}>Sort by name</button>
              <button type="button" className={btnSm} onClick={() => sortBy("time")} disabled={!!busy}>Oldest first</button>
              <button type="button" className={btnSm} onClick={clearAll} disabled={!!busy}>Remove all</button>
            </div>
          )}
          {items.length > 0 && (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {items.map((it, i) => (
                <li key={it.id} className="flex gap-3 border border-stone-200 bg-white p-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" className="h-24 w-20 flex-none border border-stone-200 bg-stone-50 object-contain" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-stone-500">{it.file.name} · {size(it.file.size)}</span>
                      <button type="button" className={btnSm} onClick={() => move(i, -1)} disabled={i === 0 || !!busy} aria-label="Move earlier">↑</button>
                      <button type="button" className={btnSm} onClick={() => move(i, 1)} disabled={i === items.length - 1 || !!busy} aria-label="Move later">↓</button>
                      <button type="button" className={btnSm} onClick={() => remove(it.id)} disabled={!!busy} aria-label={`Remove picture ${i + 1}`}>✕</button>
                    </div>
                    <input className={sel} placeholder="Source, e.g. The Hindu" maxLength={60} value={it.source} onChange={(e) => update(it.id, { source: e.target.value })} />
                    <input className={sel} placeholder="Caption or headline (optional)" maxLength={400} value={it.caption} onChange={(e) => update(it.id, { caption: e.target.value })} />
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
            <label className="block text-xs font-semibold text-stone-700">Accent colour
              <select className={`${sel} mt-1`} value={s.theme} onChange={(e) => set("theme", e.target.value)}><option value="navy">Navy</option><option value="red">Red</option><option value="green">Green</option><option value="black">Black</option></select>
            </label>
            <label className="block text-xs font-semibold text-stone-700 sm:col-span-2">Footer text (optional)
              <input className={`${sel} mt-1`} value={s.footer} maxLength={90} placeholder="Compiled by the media desk" onChange={(e) => set("footer", e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-stone-700">
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
        <p className="px-1 text-[11px] leading-relaxed text-stone-500">Screenshots are processed on the server and removed right after. Hindi and English text are both supported in titles and captions.</p>
      </aside>
    </div>
  );
}
