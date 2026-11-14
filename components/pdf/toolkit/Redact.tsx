"use client";

import { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/Icons";
import { Card, btnPlain, btnSm, btnIcon } from "@/components/linkdesk/ui";
import { assembleRedacted } from "@/lib/pdf/browser";
import { Field, Finish, Open, sel, stem, useSource, type Made, type PdfDocProxy, type Source } from "./shared";

type Box = { id: number; page: number; u: number; v: number; w: number; h: number };
let uid = 0;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function RedactPage({ doc, index, size, width, boxes, sel: selected, onAdd, onSelect }: { doc: PdfDocProxy; index: number; size: [number, number]; width: number; boxes: Box[]; sel: number | null; onAdd: (b: Omit<Box, "id">) => void; onSelect: (id: number | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(index < 2);
  const [draft, setDraft] = useState<Omit<Box, "id" | "page"> | null>(null);
  const height = (width * size[1]) / size[0];
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "700px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near || !cv.current) return;
    let dead = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(index + 1);
      const vp = page.getViewport({ scale: (width / size[0]) * Math.min(2, window.devicePixelRatio || 1) });
      if (dead || !cv.current) return;
      cv.current.width = Math.floor(vp.width);
      cv.current.height = Math.floor(vp.height);
      task = page.render({ canvas: cv.current, viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => { dead = true; task?.cancel(); };
  }, [near, doc, index, width, size]);

  const down = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    const u0 = clamp((e.clientX - r.left) / r.width);
    const v0 = clamp((e.clientY - r.top) / r.height);
    onSelect(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => {
      const u1 = clamp((ev.clientX - r.left) / r.width);
      const v1 = clamp((ev.clientY - r.top) / r.height);
      setDraft({ u: Math.min(u0, u1), v: Math.min(v0, v1), w: Math.abs(u1 - u0), h: Math.abs(v1 - v0) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      const u1 = clamp((ev.clientX - r.left) / r.width);
      const v1 = clamp((ev.clientY - r.top) / r.height);
      const b = { u: Math.min(u0, u1), v: Math.min(v0, v1), w: Math.abs(u1 - u0), h: Math.abs(v1 - v0) };
      setDraft(null);
      if (b.w > 0.006 && b.h > 0.004) onAdd({ page: index, ...b });
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };
  return (
    <div ref={wrap} data-redact-page={index} className="relative mx-auto mb-4 select-none bg-white shadow-md" style={{ width, height }}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 cursor-crosshair" style={{ touchAction: "none" }} onPointerDown={down} />
      {boxes.map((b) => (
        <div key={b.id} onPointerDown={(e) => { e.stopPropagation(); onSelect(b.id); }} className={`absolute cursor-pointer bg-black/80 ${selected === b.id ? "outline outline-2 outline-red-500" : ""}`} style={{ left: `${b.u * 100}%`, top: `${b.v * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }} />
      ))}
      {draft && <div className="pointer-events-none absolute bg-black/50 outline outline-1 outline-red-500" style={{ left: `${draft.u * 100}%`, top: `${draft.v * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}
      <span className="pointer-events-none absolute -bottom-4 right-0 text-[10px] font-semibold text-stone-500">{index + 1}</span>
    </div>
  );
}

/** Finds a word or phrase on every page and returns boxes over each hit. */
async function findBoxes(src: Source, term: string): Promise<Omit<Box, "id">[]> {
  const pdfjs = await import("pdfjs-dist");
  const out: Omit<Box, "id">[] = [];
  const needle = term.toLowerCase();
  for (let p = 0; p < src.count; p++) {
    const page = await src.doc.getPage(p + 1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!("str" in it) || !it.str) continue;
      const hay = it.str.toLowerCase();
      const tx = pdfjs.Util.transform(vp.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]) || it.height;
      const total = it.str.length;
      for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
        const x0 = tx[4] + (it.width * at) / total;
        const w = (it.width * needle.length) / total;
        out.push({ page: p, u: clamp((x0 - 1.5) / vp.width), v: clamp((tx[5] - fh * 0.86) / vp.height), w: Math.min(1, (w + 3) / vp.width), h: Math.min(1, (fh * 1.1) / vp.height) });
      }
    }
  }
  return out;
}

export default function Redact() {
  const { src, error: srcErr, loading, load, clear } = useSource("redact");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState("");
  const [fill, setFill] = useState("#000000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const [width, setWidth] = useState(560);
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => { setBoxes([]); setMade(null); }, [src]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(260, Math.min(760, el.clientWidth - 8))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === "Delete" || e.key === "Backspace") && selected != null && !(e.target instanceof HTMLInputElement)) { setBoxes((l) => l.filter((b) => b.id !== selected)); setSelected(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const add = (b: Omit<Box, "id">) => { setMade(null); setBoxes((l) => [...l, { ...b, id: ++uid }]); };
  async function search() {
    if (!src || term.trim().length < 2) return setFound("Type at least two characters.");
    setFound("Searching…");
    try {
      const hits = await findBoxes(src, term.trim());
      setFound(hits.length ? `${hits.length} match${hits.length === 1 ? "" : "es"} marked. Check them, then create the file.` : "No match. Scanned pages have no searchable text. Draw boxes by hand instead.");
      setMade(null);
      setBoxes((l) => [...l, ...hits.map((h) => ({ ...h, id: ++uid }))]);
    } catch {
      setFound("Could not search this file.");
    }
  }

  async function run() {
    if (!src) return;
    setBusy(true);
    setError("");
    try {
      const flat = new Map<number, { jpg: Uint8Array; w: number; h: number }>();
      const pages = [...new Set(boxes.map((b) => b.page))];
      for (const p of pages) {
        const page = await src.doc.getPage(p + 1);
        const v1 = page.getViewport({ scale: 1 });
        const sc = Math.min(2.4, 3200 / Math.max(v1.width, v1.height));
        const vp = page.getViewport({ scale: sc });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        await page.render({ canvas: c, viewport: vp }).promise;
        const g = c.getContext("2d")!;
        g.fillStyle = fill;
        for (const b of boxes.filter((x) => x.page === p)) g.fillRect(b.u * c.width, b.v * c.height, b.w * c.width, b.h * c.height);
        const blob: Blob = await new Promise((r) => c.toBlob((x) => r(x!), "image/jpeg", 0.9));
        flat.set(p, { jpg: new Uint8Array(await blob.arrayBuffer()), w: v1.width, h: v1.height });
      }
      const bytes = await assembleRedacted(src.bytes, flat);
      setMade({ name: `${stem(src.name)}-redacted.pdf`, bytes, type: "application/pdf", note: `${boxes.length} area${boxes.length === 1 ? "" : "s"} redacted on ${pages.length} page${pages.length === 1 ? "" : "s"}. Those pages are now pictures, so the hidden text cannot be copied or recovered.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  if (!src) return <Open onFile={load} loading={loading} error={srcErr} title="Drop the PDF to redact" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="Mark what to hide" chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {src.count} pages</span>}>
        <p className="text-[11px] text-stone-500">Drag on a page to draw a box. Click a box and press Delete to remove it.</p>
        <div ref={area} className="max-h-[75vh] overflow-y-auto bg-stone-200 p-3">
          {src.sizes.map((s, i) => <RedactPage key={i} doc={src.doc} index={i} size={s} width={width} boxes={boxes.filter((b) => b.page === i)} sel={selected} onAdd={add} onSelect={setSelected} />)}
        </div>
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title="Find and mark text">
          <Field label="Word or phrase">
            <div className="flex gap-2">
              <input className={sel} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} placeholder="a name, number…" />
              <button type="button" className={btnSm} onClick={() => void search()}>Mark all</button>
            </div>
          </Field>
          {found && <p className="text-[11px] text-stone-600" aria-live="polite">{found}</p>}
          <Field label="Cover colour"><select className={sel} value={fill} onChange={(e) => setFill(e.target.value)}><option value="#000000">Black</option><option value="#ffffff">White</option><option value="#6b7280">Grey</option></select></Field>
          <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
            <span>{boxes.length} area{boxes.length === 1 ? "" : "s"} marked</span>
            <button title="Clear all" aria-label="Clear all" type="button" className={btnIcon} disabled={!boxes.length} onClick={() => { setBoxes([]); setSelected(null); setMade(null); }}><Ico n="trash" /></button>
          </div>
        </Card>
        <Finish ready={boxes.length > 0} busy={busy} label="Apply redaction" onRun={run} made={made} onReset={() => setMade(null)} error={error} hint="Pages with boxes become pictures, so the covered text is truly removed. Other pages stay unchanged." />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
