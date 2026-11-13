"use client";

import { useEffect, useState } from "react";
import { Card, btnPlain } from "@/components/linkdesk/ui";
import { addPageNumbers, numberLabel, type NumberOpts } from "@/lib/pdf/browser";
import { Field, Finish, Open, PosGrid, Seg, Thumb, sel, stem, useSource, type Made } from "./shared";

const MARGINS = { small: 18, rec: 36, big: 60 } as const;

export default function Numbers() {
  const { src, error: srcErr, loading, load, clear } = useSource();
  const [o, setO] = useState({ pos: 8, facing: false, margin: "rec" as keyof typeof MARGINS, first: 1, from: 1, to: 1, text: "n" as NumberOpts["text"], font: "Helvetica" as NumberOpts["font"], size: 12, bold: false, italic: false, color: "#111111" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  useEffect(() => { if (src) setO((c) => ({ ...c, from: 1, to: src.count })); setMade(null); }, [src]);
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => { setMade(null); setO((c) => ({ ...c, [k]: v })); };

  async function run() {
    if (!src) return;
    setBusy(true);
    setError("");
    try {
      const bytes = await addPageNumbers(src.bytes, { ...o, margin: MARGINS[o.margin] });
      setMade({ name: `${stem(src.name)}-numbered.pdf`, bytes, type: "application/pdf", note: `Numbers added to pages ${o.from} to ${Math.min(o.to, src.count)}.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  if (!src) return <Open onFile={load} loading={loading} error={srcErr} title="Drop the PDF to number" />;

  // preview: the first page and where the number lands on it
  const [pw, ph] = src.sizes[0];
  const W = 190;
  const k = W / pw;
  const label = numberLabel(o.text, o.first, o.first + Math.max(0, o.to - o.from));
  const col = o.pos % 3;
  const row = Math.floor(o.pos / 3);
  const m = MARGINS[o.margin] * k;
  const fs = o.size * k;
  const style: React.CSSProperties = { position: "absolute", fontSize: fs, lineHeight: 1, whiteSpace: "nowrap", color: o.color, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal", fontFamily: o.font === "Times" ? "Times New Roman, serif" : o.font === "Courier" ? "Courier New, monospace" : "Arial, sans-serif" };
  if (col === 0) style.left = m; else if (col === 2) style.right = m; else { style.left = "50%"; style.transform = "translateX(-50%)"; }
  if (row === 0) style.top = m; else if (row === 2) style.bottom = m; else { style.top = "50%"; style.transform = `${style.transform ?? ""} translateY(-50%)`; }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="Page number options" chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {src.count} pages</span>}>
        <Field label="Page mode"><Seg value={o.facing ? "f" : "s"} onChange={(v) => set("facing", v === "f")} options={[{ v: "s", l: "Single page" }, { v: "f", l: "Facing pages" }]} /></Field>
        <div className="flex flex-wrap items-start gap-6">
          <Field label="Position"><PosGrid value={o.pos} onChange={(v) => set("pos", v)} /></Field>
          <Field label="Margin" className="min-w-[10rem] flex-1">
            <select className={sel} value={o.margin} onChange={(e) => set("margin", e.target.value as keyof typeof MARGINS)}>
              <option value="small">Small</option><option value="rec">Recommended</option><option value="big">Big</option>
            </select>
          </Field>
        </div>
        {o.facing && <p className="text-[11px] text-stone-500">Facing pages: on even pages the number moves to the opposite side, so numbers sit on the outer edge when printed two-sided.</p>}
        <div className="grid grid-cols-3 gap-3">
          <Field label="First number"><input type="number" className={sel} value={o.first} onChange={(e) => set("first", Math.floor(Number(e.target.value)) || 1)} /></Field>
          <Field label="From page"><input type="number" min={1} max={src.count} className={sel} value={o.from} onChange={(e) => set("from", Math.max(1, Math.floor(Number(e.target.value)) || 1))} /></Field>
          <Field label="To page"><input type="number" min={1} max={src.count} className={sel} value={o.to} onChange={(e) => set("to", Math.min(src.count, Math.floor(Number(e.target.value)) || src.count))} /></Field>
        </div>
        <Field label="Text">
          <select className={sel} value={o.text} onChange={(e) => set("text", e.target.value as NumberOpts["text"])}>
            <option value="n">Only the page number (recommended)</option>
            <option value="page-n">Page n</option>
            <option value="page-n-of-N">Page n of N</option>
            <option value="n-of-N">n of N</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Font"><select className={sel} value={o.font} onChange={(e) => set("font", e.target.value as NumberOpts["font"])}><option>Helvetica</option><option>Times</option><option>Courier</option></select></Field>
          <Field label="Size"><input type="number" min={6} max={72} className={sel} value={o.size} onChange={(e) => set("size", Math.min(72, Math.max(6, Number(e.target.value) || 12)))} /></Field>
          <Field label="Colour"><input type="color" className="h-8 w-full border border-stone-300 bg-white" value={o.color} onChange={(e) => set("color", e.target.value)} /></Field>
          <Field label="Style">
            <div className="flex gap-1">
              <button type="button" aria-pressed={o.bold} onClick={() => set("bold", !o.bold)} className={`h-8 flex-1 border text-xs font-bold ${o.bold ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>B</button>
              <button type="button" aria-pressed={o.italic} onClick={() => set("italic", !o.italic)} className={`h-8 flex-1 border text-xs italic ${o.italic ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>I</button>
            </div>
          </Field>
        </div>
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title="Preview, page 1">
          <div className="mx-auto" style={{ width: W }}>
            <div className="relative shadow ring-1 ring-stone-300" style={{ width: W, height: ph * k }}>
              <Thumb doc={src.doc} index={0} width={W} />
              {o.from <= 1 && o.to >= 1 && <span style={style}>{label}</span>}
            </div>
          </div>
        </Card>
        <Finish ready busy={busy} label="Add page numbers" onRun={run} made={made} onReset={() => setMade(null)} error={error} />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
