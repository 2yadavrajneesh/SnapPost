"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Copy, FilePlus2, RotateCcw, RotateCw, Trash2, Undo2 } from "lucide-react";
import { Card, btnPlain, btnSm } from "@/components/linkdesk/ui";
import { organizePdf, rotatePdf } from "@/lib/pdf/browser";
import { Finish, Open, SendMenu, Thumb, stem, useSource, type Made } from "./shared";

type P = { id: number; src: number; rot: number };
let uid = 0;
const tool = "flex h-8 flex-1 items-center justify-center text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent";

/** Shared by Organize (reorder, delete, duplicate, add blank pages) and Rotate (turn pages one by one). */
export default function Organize({ mode }: { mode: "organize" | "rotate" }) {
  const { src, error: srcErr, loading, load, clear } = useSource(mode);
  const [pages, setPages] = useState<P[]>([]);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);

  useEffect(() => {
    setPages(src ? Array.from({ length: src.count }, (_, i) => ({ id: ++uid, src: i, rot: 0 })) : []);
    setMade(null);
  }, [src]);
  const touch = (fn: (l: P[]) => P[]) => {
    setMade(null);
    setPages(fn);
  };
  const turn = (id: number, d: number) => touch((l) => l.map((p) => (p.id === id ? { ...p, rot: (((p.rot + d) % 360) + 360) % 360 } : p)));
  const turnAll = (d: number) => touch((l) => l.map((p) => ({ ...p, rot: (((p.rot + d) % 360) + 360) % 360 })));
  const del = (id: number) => touch((l) => l.filter((p) => p.id !== id));
  const dup = (id: number) => touch((l) => l.flatMap((p) => (p.id === id ? [p, { ...p, id: ++uid }] : [p])));
  const blank = (id: number) => touch((l) => l.flatMap((p) => (p.id === id ? [p, { id: ++uid, src: -1, rot: 0 }] : [p])));
  const shift = (i: number, d: number) =>
    touch((l) => {
      const a = [...l];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  const drop = (to: number) => {
    if (drag == null || drag === to) return;
    touch((l) => {
      const a = [...l];
      const [m] = a.splice(drag, 1);
      a.splice(to, 0, m);
      return a;
    });
  };

  async function run() {
    if (!src) return;
    setBusy(true);
    setError("");
    try {
      const bytes =
        mode === "rotate"
          ? await rotatePdf(src.bytes, Object.fromEntries(pages.map((p) => [p.src, p.rot])))
          : await organizePdf(src.bytes, pages.map((p) => ({ src: p.src, rot: p.rot })));
      setMade({ name: `${stem(src.name)}-${mode === "rotate" ? "rotated" : "organized"}.pdf`, bytes, type: "application/pdf", note: `${pages.length} page${pages.length === 1 ? "" : "s"}.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!src) return <Open onFile={load} loading={loading} error={srcErr} title={mode === "rotate" ? "Drop the PDF to rotate" : "Drop the PDF to organize"} />;
  const changed = mode === "rotate" ? pages.some((p) => p.rot) : pages.length !== src.count || pages.some((p, i) => p.src !== i || p.rot);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card title={mode === "rotate" ? "Rotate pages" : "Organize pages"} chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {pages.length} page{pages.length === 1 ? "" : "s"}</span>}>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "rotate" && (
            <div className="flex items-center gap-1 border border-stone-200 bg-white p-1">
              <span className="px-2 text-[11px] font-semibold text-stone-600">All pages</span>
              <button type="button" className={tool} onClick={() => turnAll(-90)} title="Turn all left" aria-label="Turn all pages left"><RotateCcw size={16} /></button>
              <button type="button" className={tool} onClick={() => turnAll(90)} title="Turn all right" aria-label="Turn all pages right"><RotateCw size={16} /></button>
              <button type="button" className={`${tool} w-auto px-2 text-[11px] font-bold`} onClick={() => turnAll(180)} title="Turn all upside down">180°</button>
            </div>
          )}
          <button type="button" className={`${btnSm} inline-flex items-center gap-1.5`} disabled={!changed} onClick={() => setPages(Array.from({ length: src.count }, (_, i) => ({ id: ++uid, src: i, rot: 0 })))}>
            <Undo2 size={14} /> Reset pages
          </button>
          <span className="ml-auto text-[11px] text-stone-500">{mode === "rotate" ? "Turn pages one by one with the buttons under each page." : "Drag a page to reorder it, or use the arrows."}</span>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {pages.map((p, i) => (
            <li
              key={p.id}
              draggable={mode === "organize"}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={() => { drop(i); setDrag(null); setOver(null); }}
              className={`group relative flex min-w-0 flex-col border bg-white shadow-sm transition ${drag === i ? "opacity-40" : ""} ${over === i && drag != null && drag !== i ? "border-accent ring-2 ring-accent/40" : "border-stone-200 hover:border-stone-300 hover:shadow-md"} ${mode === "organize" ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <div className="relative flex h-44 w-full items-center justify-center overflow-hidden bg-stone-100 p-2">
                <span className="absolute left-2 top-2 z-10 flex h-6 min-w-6 items-center justify-center bg-[#1b2420] px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                {mode === "organize" && (
                  <button type="button" title="Delete this page" aria-label={`Delete page ${i + 1}`} onClick={() => del(p.id)} className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                )}
                {p.src < 0 ? <div className="flex h-36 w-28 items-center justify-center border border-dashed border-stone-400 bg-white text-[11px] text-stone-500">Blank page</div> : <Thumb doc={src.doc} index={p.src} width={p.rot % 180 ? 100 : 110} rot={p.rot} className="border border-stone-300" />}
                {p.src >= 0 && p.src !== i && <span className="absolute bottom-2 left-2 z-10 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm">was {p.src + 1}</span>}
                {p.rot !== 0 && <span className="absolute bottom-2 right-2 z-10 bg-white/90 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 shadow-sm">{p.rot}°</span>}
              </div>
              <div className="flex items-center justify-between gap-0.5 border-t border-stone-200 p-1">
                <button type="button" className={tool} title="Turn left" aria-label={`Turn page ${i + 1} left`} onClick={() => turn(p.id, -90)}><RotateCcw size={16} /></button>
                <button type="button" className={tool} title="Turn right" aria-label={`Turn page ${i + 1} right`} onClick={() => turn(p.id, 90)}><RotateCw size={16} /></button>
                {mode === "organize" && (
                  <>
                    <span className="mx-0.5 h-5 w-px bg-stone-200" aria-hidden="true" />
                    <button type="button" className={tool} title="Move earlier" aria-label={`Move page ${i + 1} earlier`} disabled={i === 0} onClick={() => shift(i, -1)}><ArrowLeft size={16} /></button>
                    <button type="button" className={tool} title="Move later" aria-label={`Move page ${i + 1} later`} disabled={i === pages.length - 1} onClick={() => shift(i, 1)}><ArrowRight size={16} /></button>
                    <span className="mx-0.5 h-5 w-px bg-stone-200" aria-hidden="true" />
                    <button type="button" className={tool} title="Copy this page" aria-label={`Copy page ${i + 1}`} onClick={() => dup(p.id)}><Copy size={16} /></button>
                    <button type="button" className={tool} title="Add a blank page after" aria-label={`Add blank page after ${i + 1}`} onClick={() => blank(p.id)}><FilePlus2 size={16} /></button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!pages.length && <p className="text-xs text-stone-500">No pages left. Press Reset to bring them back.</p>}
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Finish from={mode} ready={pages.length > 0 && changed} busy={busy} label={mode === "rotate" ? "Rotate PDF" : "Save organized PDF"} onRun={run} made={made} onReset={() => setMade(null)} error={error} hint={!changed ? "Make a change first." : undefined} />
        <SendMenu from={mode} file={src ? { name: src.name, bytes: src.bytes } : null} />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
