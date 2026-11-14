"use client";

import { useEffect, useState } from "react";
import { Card, btnPlain, btnSm } from "@/components/linkdesk/ui";
import { organizePdf, rotatePdf } from "@/lib/pdf/browser";
import { Finish, Open, Thumb, stem, useSource, type Made } from "./shared";

type P = { id: number; src: number; rot: number };
let uid = 0;

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
            <>
              <span className="text-[11px] font-semibold text-stone-600">All pages:</span>
              <button type="button" className={btnSm} onClick={() => turnAll(-90)}>↺ Left</button>
              <button type="button" className={btnSm} onClick={() => turnAll(90)}>↻ Right</button>
              <button type="button" className={btnSm} onClick={() => turnAll(180)}>180°</button>
            </>
          )}
          <button type="button" className={btnSm} onClick={() => setPages(Array.from({ length: src.count }, (_, i) => ({ id: ++uid, src: i, rot: 0 })))}>Reset</button>
          <button type="button" className={btnSm} onClick={() => { clear(); }}>Choose another file</button>
        </div>
        <p className="text-[11px] text-stone-500">{mode === "rotate" ? "Use the arrows under a page to turn just that page." : "Drag pages to reorder them, or use the buttons under each page."}</p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {pages.map((p, i) => (
            <li
              key={p.id}
              draggable={mode === "organize"}
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={() => { drop(i); setDrag(null); setOver(null); }}
              className={`flex flex-col items-center gap-1.5 border bg-stone-50 p-2 ${over === i && drag != null ? "border-accent" : "border-stone-200"}`}
            >
              <div className="flex h-40 w-full items-center justify-center overflow-hidden">
                {p.src < 0 ? <div className="flex h-36 w-28 items-center justify-center border border-dashed border-stone-400 bg-white text-[11px] text-stone-500">Blank page</div> : <Thumb doc={src.doc} index={p.src} width={p.rot % 180 ? 100 : 110} rot={p.rot} className="border border-stone-300" />}
              </div>
              <span className="text-[11px] font-bold text-stone-700">{i + 1}{p.src >= 0 && p.src !== i ? <span className="font-normal text-stone-500"> (was {p.src + 1})</span> : null}</span>
              <div className="flex flex-wrap justify-center gap-1">
                <button type="button" className={btnSm} aria-label={`Turn page ${i + 1} left`} onClick={() => turn(p.id, -90)}>↺</button>
                <button type="button" className={btnSm} aria-label={`Turn page ${i + 1} right`} onClick={() => turn(p.id, 90)}>↻</button>
                {mode === "organize" && (
                  <>
                    <button type="button" className={btnSm} aria-label={`Move page ${i + 1} earlier`} disabled={i === 0} onClick={() => shift(i, -1)}>←</button>
                    <button type="button" className={btnSm} aria-label={`Move page ${i + 1} later`} disabled={i === pages.length - 1} onClick={() => shift(i, 1)}>→</button>
                    <button type="button" className={btnSm} title="Copy this page" aria-label={`Copy page ${i + 1}`} onClick={() => dup(p.id)}>⧉</button>
                    <button type="button" className={btnSm} title="Add a blank page after" aria-label={`Add blank page after ${i + 1}`} onClick={() => blank(p.id)}>＋</button>
                    <button type="button" className={btnSm} title="Delete" aria-label={`Delete page ${i + 1}`} onClick={() => del(p.id)}>✕</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        {!pages.length && <p className="text-xs text-stone-500">No pages left. Press Reset to bring them back.</p>}
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Finish ready={pages.length > 0 && changed} busy={busy} label={mode === "rotate" ? "Rotate PDF" : "Save organized PDF"} onRun={run} made={made} onReset={() => setMade(null)} error={error} hint={!changed ? "Make a change first." : undefined} />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
