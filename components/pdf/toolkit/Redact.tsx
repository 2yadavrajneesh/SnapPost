"use client";

import { useEffect, useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Ico } from "@/components/Icons";
import { Slider } from "@/components/ui";
import { Card, btnPlain, btnSm, btnIcon, useToast } from "@/components/linkdesk/ui";
import { assembleRedacted } from "@/lib/pdf/browser";
import { Field, Finish, Open, sel, stem, useSource, type Made, type PdfDocProxy, type Source } from "./shared";

type Box = { id: number; page: number; u: number; v: number; w: number; h: number; fill: string; strength: number };
let uid = 0;
const HANDLES: [string, number, number, string][] = [
  ["nw", 0, 0, "nwse-resize"], ["n", 0.5, 0, "ns-resize"], ["ne", 1, 0, "nesw-resize"], ["e", 1, 0.5, "ew-resize"],
  ["se", 1, 1, "nwse-resize"], ["s", 0.5, 1, "ns-resize"], ["sw", 0, 1, "nesw-resize"], ["w", 0, 0.5, "ew-resize"],
];
const COLOURS: [string, string][] = [
  ["#000000", "Black"], ["#ffffff", "White"], ["#6b7280", "Grey"], ["#dc2626", "Red"], ["#ea580c", "Orange"],
  ["#fde047", "Yellow (highlighter)"], ["#86efac", "Green"], ["#67e8f9", "Cyan"], ["#93c5fd", "Blue"], ["#f9a8d4", "Pink"],
];
/** A dot colour that shows on top of a swatch. */
const ink = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150 ? "#111" : "#fff";
};
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function RedactPage({ doc, index, size, width, boxes, sel: selected, onAdd, onSelect, onChange }: { doc: PdfDocProxy; index: number; size: [number, number]; width: number; boxes: Box[]; sel: number | null; onAdd: (b: Omit<Box, "id" | "fill" | "strength">) => void; onSelect: (id: number | null) => void ; onChange: (id: number, patch: Partial<Omit<Box, "id" | "page">>) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(index < 2);
  const [draft, setDraft] = useState<{ u: number; v: number; w: number; h: number } | null>(null);
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

  /** Drag a box to move it, or one of its handles to resize it. */
  const grab = (e: React.PointerEvent, b: Box, mode: string) => {
    const r = wrap.current!.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const o = { u: b.u, v: b.v, w: b.w, h: b.h };
    const MIN = 0.01;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      if (mode === "move") {
        onChange(b.id, { u: Math.min(1 - o.w, Math.max(0, o.u + dx)), v: Math.min(1 - o.h, Math.max(0, o.v + dy)) });
        return;
      }
      let l = o.u, t = o.v, rt = o.u + o.w, bt = o.v + o.h;
      if (mode.includes("w")) l = Math.min(rt - MIN, Math.max(0, o.u + dx));
      if (mode.includes("e")) rt = Math.max(l + MIN, Math.min(1, rt + dx));
      if (mode.includes("n")) t = Math.min(bt - MIN, Math.max(0, o.v + dy));
      if (mode.includes("s")) bt = Math.max(t + MIN, Math.min(1, bt + dy));
      onChange(b.id, { u: l, v: t, w: rt - l, h: bt - t });
    };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

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
        <div
          key={b.id}
          onPointerDown={(e) => { e.stopPropagation(); onSelect(b.id); grab(e, b, "move"); }}
          className={`absolute ${selected === b.id ? "cursor-move outline outline-2 outline-red-500" : "cursor-pointer"}`}
          style={{ left: `${b.u * 100}%`, top: `${b.v * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, touchAction: "none", background: b.fill, opacity: b.strength / 100 }}
        >
          {selected === b.id && HANDLES.map(([k, x, y, cur]) => (
            <span
              key={k}
              onPointerDown={(e) => { e.stopPropagation(); grab(e, b, k); }}
              className="absolute size-3 border border-red-500 bg-white"
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%, -50%)", cursor: cur, touchAction: "none" }}
            />
          ))}
        </div>
      ))}
      {draft && <div className="pointer-events-none absolute bg-black/50 outline outline-1 outline-red-500" style={{ left: `${draft.u * 100}%`, top: `${draft.v * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}
      <span className="pointer-events-none absolute -bottom-4 right-0 text-[10px] font-semibold text-stone-500">{index + 1}</span>
    </div>
  );
}

export default function Redact() {
  const toast = useToast();
  const { src, error: srcErr, loading, load, clear } = useSource("redact");
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [fill, setFill] = useState("#000000");
  const [strength, setStrength] = useState(35); // cover intensity, per cent
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

  const change = (id: number, patch: Partial<Omit<Box, "id" | "page">>) => { setMade(null); setBoxes((l) => l.map((b) => (b.id === id ? { ...b, ...patch } : b))); };
  const add = (b: Omit<Box, "id" | "fill" | "strength">) => { setMade(null); const id = ++uid; setBoxes((l) => [...l, { ...b, id, fill, strength }]); setSelected(id); };
  const chosen = boxes.find((b) => b.id === selected) ?? null;
  // picking a box shows its own colour and intensity in the panel
  useEffect(() => { if (chosen) { setFill(chosen.fill); setStrength(chosen.strength); } }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickFill = (hex: string) => { setFill(hex); setMade(null); if (selected != null) change(selected, { fill: hex }); };
  const pickStrength = (v: number) => { setStrength(v); setMade(null); if (selected != null) change(selected, { strength: v }); };
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
        for (const b of boxes.filter((x) => x.page === p)) { g.fillStyle = b.fill; g.globalAlpha = b.strength / 100; g.fillRect(b.u * c.width, b.v * c.height, b.w * c.width, b.h * c.height); }
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
        <p className="text-[11px] text-stone-500">Drag on a page to draw a box. Drag a box to move it, pull its handles to resize it, and press Delete to remove it.</p>
        <div ref={area} className="max-h-[75vh] overflow-y-auto bg-stone-200 p-3">
          {src.sizes.map((s, i) => <RedactPage key={i} doc={src.doc} index={i} size={s} width={width} boxes={boxes.filter((b) => b.page === i)} sel={selected} onAdd={add} onSelect={setSelected} onChange={change} />)}
        </div>
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title="Cover colour">
          <p className="text-[11px] text-stone-500">{chosen ? "Changing the box you selected. Click empty space to change the colour for new boxes." : "New boxes use this colour. Click a box to give it its own."}</p>
          <div role="radiogroup" aria-label="Cover colour" className="grid grid-cols-5 gap-2">
            {COLOURS.map(([hex, name]) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={fill.toLowerCase() === hex}
                aria-label={name}
                title={name}
                onClick={() => pickFill(hex)}
                className={`flex aspect-square items-center justify-center border transition ${fill.toLowerCase() === hex ? "border-stone-900 ring-2 ring-stone-900 ring-offset-1" : "border-stone-300 hover:border-stone-500"}`}
                style={{ background: hex }}
              >
                {fill.toLowerCase() === hex && <span className="size-2 rounded-full" style={{ background: ink(hex) }} />}
              </button>
            ))}
          </div>
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-stone-700">
            Custom colour
            <input type="color" className="h-8 w-16 border border-stone-300 bg-white" value={fill} onChange={(e) => pickFill(e.target.value)} />
          </label>
          <Slider label="Intensity" value={strength} min={10} max={100} step={5} suffix="%" lowLabel="See-through" highLabel="Solid" onChange={pickStrength} />
          {(chosen ? chosen.strength : strength) < 100 && <p className="text-[11px] text-amber-700">Below 100% the covered text can still be read through the colour. Use it as a highlighter, and keep 100% to truly hide something.</p>}
          <div className="flex items-center justify-between text-xs font-semibold text-stone-700">
            <span>{boxes.length} area{boxes.length === 1 ? "" : "s"} marked</span>
            <button title="Clear all" aria-label="Clear all" type="button" className={btnIcon} disabled={!boxes.length} onClick={() => { const prev = boxes; setBoxes([]); setSelected(null); setMade(null); toast(`Cleared ${prev.length} ${prev.length === 1 ? "box" : "boxes"}.`, "ok", { label: "Undo", run: () => setBoxes(prev) }); }}><Ico n="trash" /></button>
          </div>
        </Card>
        <Finish ready={boxes.length > 0} busy={busy} label="Apply redaction" onRun={run} made={made} onReset={() => setMade(null)} error={error} hint="Pages with boxes become pictures, so the covered text is truly removed. Other pages stay unchanged." />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
