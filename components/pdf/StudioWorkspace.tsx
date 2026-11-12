"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, btnPlain, btnPrimary, btnSm, useCopy } from "@/components/linkdesk/ui";
import { analyze, deleteResult, downloadHref, estimateSize, getConfig, runTool, uploadFile, type Analysis, type PdfConfig, type RunResult, type Uploaded } from "@/lib/pdf/client";

type PdfDocProxy = import("pdfjs-dist").PDFDocumentProxy;
type Item = { uid: number; src: number; rot: 0 | 90 | 180 | 270; w: number; h: number };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n > 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
let seq = 0;

function Thumb({ doc, src, rot, w, h }: { doc: PdfDocProxy | null; src: number; rot: number; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near || !doc || src < 0 || drawn) return;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let dead = false;
    (async () => {
      const page = await doc.getPage(src + 1);
      if (dead || !ref.current) return;
      const vp = page.getViewport({ scale: 220 / Math.max(w, h) });
      ref.current.width = Math.floor(vp.width);
      ref.current.height = Math.floor(vp.height);
      task = page.render({ canvas: ref.current, viewport: vp });
      await task.promise.then(() => !dead && setDrawn(true)).catch(() => {});
    })();
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [near, doc, src, w, h, drawn]);
  const BW = 132;
  const BH = 150;
  const turned = rot === 90 || rot === 270;
  const aw = turned ? h : w;
  const ah = turned ? w : h;
  const s = Math.min(BW / aw, BH / ah);
  return (
    <div ref={box} className="relative mx-auto overflow-visible bg-stone-100" style={{ width: BW, height: BH }}>
      <div className="absolute left-1/2 top-1/2 bg-white shadow" style={{ width: w * s, height: h * s, transform: `translate(-50%, -50%) rotate(${rot}deg)`, transition: "transform .15s" }}>
        <canvas ref={ref} className="block h-full w-full" style={{ display: src < 0 ? "none" : "block" }} />
        {src < 0 && <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-stone-400" style={{ transform: `rotate(${-rot}deg)` }}>Blank</span>}
      </div>
    </div>
  );
}

export default function StudioWorkspace() {
  const [cfg, setCfg] = useState<PdfConfig | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PdfDocProxy | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [past, setPast] = useState<Item[][]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [up, setUp] = useState<Uploaded | null>(null);
  const [an, setAn] = useState<Analysis | null>(null);
  const [anState, setAnState] = useState<"" | "work" | "fail">("");
  const [busy, setBusy] = useState<"" | "upload" | "process">("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [over, setOver] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const copy = useCopy();

  useEffect(() => {
    getConfig().then(setCfg).catch(() => {});
  }, []);

  async function open(f: File) {
    setError("");
    setResult(null);
    if (!/\.pdf$/i.test(f.name) && !/pdf$/i.test(f.type)) return setError("Please choose a PDF file.");
    const max = cfg?.maxFileBytes ?? 100 * 1048576;
    if (f.size > max) return setError(`That file is larger than ${size(max)}.`);
    setLoading(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const d = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      if (d.numPages > 500) throw new Error("big");
      const list: Item[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const v = (await d.getPage(i)).getViewport({ scale: 1 });
        list.push({ uid: ++seq, src: i - 1, rot: 0, w: v.width, h: v.height });
      }
      setDoc(d);
      setFile(f);
      setItems(list);
      setPast([]);
      setSel(new Set());
      setUp(null);
      setAn(null);
      setAnState("work");
      // measure the file on the server in the background, for the size estimate
      if (cfg?.mode && cfg.mode !== "off") {
        uploadFile(f, cfg.mode)
          .then(async (u) => {
            setUp(u);
            setAn(await analyze(u.url));
            setAnState("");
          })
          .catch(() => setAnState("fail"));
      } else setAnState("fail");
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(name === "PasswordException" ? "This PDF is password protected. Remove the password with Unlock PDF first." : e instanceof Error && e.message === "big" ? "Page Studio handles up to 500 pages. Split the file first." : "That file could not be opened as a PDF.");
    } finally {
      setLoading(false);
    }
  }

  const commit = (next: Item[]) => {
    setPast((p) => [...p.slice(-39), itemsRef.current]);
    setItems(next);
    setResult(null);
  };
  const undo = () =>
    setPast((p) => {
      if (!p.length) return p;
      setItems(p[p.length - 1]);
      setSel(new Set());
      return p.slice(0, -1);
    });
  const toggle = (uid: number, multi: boolean) =>
    setSel((s) => {
      const n = new Set(multi ? s : []);
      if (s.has(uid) && (multi || s.size === 1)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  const picked = items.filter((i) => sel.has(i.uid));
  const target = (fn: (i: Item) => Item | null) => commit(items.flatMap((i) => (sel.has(i.uid) ? (fn(i) ? [fn(i)!] : []) : [i])));
  const rotate = (d: number, uids?: Set<number>) => commit(items.map((i) => ((uids ?? sel).has(i.uid) ? { ...i, rot: ((((i.rot + d) % 360) + 360) % 360) as Item["rot"] } : i)));
  const remove = (uids?: Set<number>) => {
    const u = uids ?? sel;
    commit(items.filter((i) => !u.has(i.uid)));
    setSel(new Set());
  };
  const duplicate = (uids?: Set<number>) => {
    const u = uids ?? sel;
    commit(items.flatMap((i) => (u.has(i.uid) ? [i, { ...i, uid: ++seq }] : [i])));
  };
  const addBlank = () => {
    const at = items.reduce((m, i, k) => (sel.has(i.uid) ? k : m), items.length - 1);
    const ref = items[Math.max(0, at)] ?? { w: 595, h: 842, rot: 0 };
    const turned = ref.rot === 90 || ref.rot === 270;
    const b: Item = { uid: ++seq, src: -1, rot: 0, w: turned ? ref.h : ref.w, h: turned ? ref.w : ref.h };
    commit([...items.slice(0, at + 1), b, ...items.slice(at + 1)]);
  };
  const keepOnly = () => {
    commit(items.filter((i) => sel.has(i.uid)));
    setSel(new Set());
  };
  const move = (from: number, to: number) => {
    const group = sel.has(items[from].uid) ? items.filter((i) => sel.has(i.uid)) : [items[from]];
    const ids = new Set(group.map((g) => g.uid));
    const rest = items.filter((i) => !ids.has(i.uid));
    const before = items.slice(0, to).filter((i) => !ids.has(i.uid)).length;
    commit([...rest.slice(0, before), ...group, ...rest.slice(before)]);
  };
  const step = (k: number, d: number) => {
    const to = k + d;
    if (to < 0 || to >= items.length) return;
    const a = [...items];
    [a[k], a[to]] = [a[to], a[k]];
    commit(a);
  };

  const estimate = useMemo(() => (an ? estimateSize(an, items.filter((i) => i.src >= 0).map((i) => i.src), items.filter((i) => i.src < 0).length) : null), [an, items]);
  const changed = useMemo(() => items.length !== (doc?.numPages ?? 0) || items.some((it, k) => it.src !== k || it.rot !== 0), [items, doc]);

  async function save() {
    if (!file) return;
    setError("");
    setResult(null);
    const ops = items.map((i) => (i.src < 0 ? { src: -1, w: Math.round(i.w), h: Math.round(i.h) } : { src: i.src, rot: i.rot }));
    const run = async (u: Uploaded) => runTool("page-studio", [u], { ops });
    try {
      setBusy("process");
      let u = up;
      if (!u) {
        setBusy("upload");
        u = await uploadFile(file, cfg?.mode ?? "off", setPct);
        setBusy("process");
      }
      try {
        setResult(await run(u));
      } catch (e) {
        if (!(e instanceof Error) || !/gone|not valid/i.test(e.message)) throw e;
        setBusy("upload");
        const again = await uploadFile(file, cfg?.mode ?? "off", setPct);
        setBusy("process");
        setResult(await run(again));
      }
      setUp(null); // the server removes the upload after a save
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  if (!doc || !file) {
    return (
      <Card title="Open a PDF">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) open(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 border-2 border-dashed px-4 py-12 text-center transition ${over ? "border-accent bg-white" : "border-stone-300 bg-stone-50 hover:bg-white"}`}
        >
          <input type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { if (e.target.files?.[0]) open(e.target.files[0]); e.target.value = ""; }} />
          <strong className="text-sm text-stone-900">{loading ? "Opening…" : "Drop a PDF here, or click to choose"}</strong>
          <small className="text-[11px] text-stone-500">Pages show as thumbnails you can drag. Up to {size(cfg?.maxFileBytes ?? 100 * 1048576)} and 500 pages.</small>
        </label>
        {error && <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
      </Card>
    );
  }

  const none = sel.size === 0;
  const orig = file.size;
  const diff = estimate != null ? Math.round(((estimate - orig) / orig) * 100) : null;
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1.5 border border-stone-300 bg-white/95 p-2.5 backdrop-blur">
        <button type="button" className={btnSm} onClick={() => rotate(-90)} disabled={none}>↺ Turn left</button>
        <button type="button" className={btnSm} onClick={() => rotate(90)} disabled={none}>↻ Turn right</button>
        <button type="button" className={btnSm} onClick={() => duplicate()} disabled={none}>Copy</button>
        <button type="button" className={btnSm} onClick={() => remove()} disabled={none || sel.size >= items.length}>Delete</button>
        <button type="button" className={btnSm} onClick={keepOnly} disabled={none || sel.size >= items.length}>Keep only these</button>
        <button type="button" className={btnSm} onClick={addBlank}>Add blank page</button>
        <span className="mx-1 h-6 w-px bg-stone-300" />
        <button type="button" className={btnSm} onClick={() => setSel(new Set(items.map((i) => i.uid)))}>Select all</button>
        <button type="button" className={btnSm} onClick={() => setSel(new Set())} disabled={none}>Clear</button>
        <button type="button" className={btnSm} onClick={() => commit([...items].reverse())}>Reverse</button>
        <button type="button" className={btnSm} onClick={undo} disabled={!past.length}>Undo</button>
        <span className="ml-auto text-[11px] font-semibold text-stone-500">{none ? "Click pages to select them. Drag to move." : `${sel.size} selected`}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_270px]">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" onDragOver={(e) => e.preventDefault()}>
          {items.map((it, k) => {
            const on = sel.has(it.uid);
            return (
              <li
                key={it.uid}
                draggable
                onDragStart={(e) => { setDrag(k); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(k)); }}
                onDragOver={(e) => { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDrop(e.clientX > r.left + r.width / 2 ? k + 1 : k); }}
                onDrop={(e) => { e.preventDefault(); if (drag != null && drop != null) move(drag, drop); setDrag(null); setDrop(null); }}
                onDragEnd={() => { setDrag(null); setDrop(null); }}
                className={`relative border bg-white p-1.5 transition ${on ? "border-accent ring-2 ring-[color:var(--accent)]" : "border-stone-300"} ${drag === k ? "opacity-40" : ""}`}
              >
                {drop === k && drag != null && <span className="absolute -left-2 bottom-0 top-0 w-1 bg-accent" />}
                {drop === k + 1 && drop === items.length && drag != null && <span className="absolute -right-2 bottom-0 top-0 w-1 bg-accent" />}
                <button type="button" onClick={(e) => toggle(it.uid, e.ctrlKey || e.metaKey || e.shiftKey || sel.size > 0)} className="block w-full cursor-grab text-left" aria-pressed={on} aria-label={`Page ${k + 1}${it.src < 0 ? " (blank)" : ""}`}>
                  <Thumb doc={doc} src={it.src} rot={it.rot} w={it.w} h={it.h} />
                </button>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="min-w-[22px] bg-stone-800 px-1 text-center text-[11px] font-bold leading-5 text-white">{k + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-stone-500">{it.src < 0 ? "blank" : it.src + 1 !== k + 1 ? `was ${it.src + 1}` : ""}{it.rot ? ` · ${it.rot}°` : ""}</span>
                  <button type="button" className={btnSm} style={{ height: 24, padding: "0 6px" }} onClick={() => step(k, -1)} disabled={k === 0} aria-label="Move earlier">←</button>
                  <button type="button" className={btnSm} style={{ height: 24, padding: "0 6px" }} onClick={() => step(k, 1)} disabled={k === items.length - 1} aria-label="Move later">→</button>
                  <button type="button" className={btnSm} style={{ height: 24, padding: "0 6px" }} onClick={() => rotate(90, new Set([it.uid]))} aria-label="Turn right">↻</button>
                  <button type="button" className={btnSm} style={{ height: 24, padding: "0 6px" }} onClick={() => remove(new Set([it.uid]))} disabled={items.length < 2} aria-label="Delete page">✕</button>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="space-y-3 self-start lg:sticky lg:top-[72px]">
          <Card title="File size">
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between"><dt className="text-stone-500">Now</dt><dd className="font-bold text-stone-900">{size(orig)}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">After your changes</dt><dd className="font-bold text-stone-900">{estimate != null ? `about ${size(estimate)}` : anState === "work" ? "measuring…" : "not available"}</dd></div>
              {diff != null && changed && <div className="flex justify-between"><dt className="text-stone-500">Change</dt><dd className={`font-bold ${diff <= 0 ? "text-emerald-700" : "text-amber-700"}`}>{diff > 0 ? "+" : ""}{diff}%</dd></div>}
              <div className="flex justify-between"><dt className="text-stone-500">Pages</dt><dd className="font-bold text-stone-900">{doc.numPages} → {items.length}</dd></div>
            </dl>
            {an?.partial && <p className="mt-2 text-[11px] text-amber-800">This file is complex, so the estimate is rough.</p>}
            {anState === "fail" && <p className="mt-2 text-[11px] text-stone-500">The size could not be estimated for this file. Saving still works.</p>}
            {!an && anState === "work" && <p className="mt-2 text-[11px] text-stone-500">Measuring each page on the server. You can keep working.</p>}
          </Card>
          <Card title={result ? "Your PDF is ready" : "Save"}>
            {!result && (
              <button type="button" className={`${btnPrimary} w-full`} disabled={!changed || !!busy || cfg?.mode === "off" || !items.length} onClick={save}>
                {busy === "upload" ? `Uploading ${pct}%` : busy === "process" ? "Saving…" : "Save PDF"}
              </button>
            )}
            {!result && !changed && <p className="mt-2 text-[11px] text-stone-500">Make a change to save.</p>}
            {error && <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
            {result && (
              <div className="space-y-2">
                <p className="truncate text-xs font-semibold text-stone-800">{result.name}</p>
                <p className="bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-800">
                  Actual size {size(result.size)}{estimate != null ? `. We estimated about ${size(estimate)}` : ""}.
                </p>
                <p className="text-[11px] text-stone-500">The link works for about {cfg?.ttlMinutes ?? 30} minutes, then the file is deleted.</p>
                <a className={`${btnPrimary} w-full`} href={downloadHref(result.url)} download={result.name}>Download</a>
                <button type="button" className={`${btnPlain} w-full`} onClick={() => copy(result.url, "Link copied.")}>Copy link</button>
                <button type="button" className={`${btnPlain} w-full`} onClick={() => { deleteResult(result.url); setResult(null); }}>Keep editing</button>
              </div>
            )}
            <button type="button" className={`${btnPlain} mt-2 w-full`} onClick={() => { if (result) deleteResult(result.url); setDoc(null); setFile(null); setItems([]); setResult(null); setError(""); }}>Open another PDF</button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
