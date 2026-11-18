"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, btnPlain } from "@/components/linkdesk/ui";
import { SwitchRow } from "@/components/ui";
import { addPageNumbers, numberCol, numberLabel, type NumberOpts } from "@/lib/pdf/browser";
import { Field, Finish, Open, PosGrid, Thumb, sel, stem, useSource, type Made, SendMenu } from "./shared";

const MARGINS = { small: 18, rec: 36, big: 60 } as const;

export default function Numbers() {
  const { src, error: srcErr, loading, load, clear } = useSource("numbers");
  const [o, setO] = useState({ pos: 8, facing: false, cover: false, margin: "rec" as keyof typeof MARGINS, first: 1, from: 1, to: 1, text: "n" as NumberOpts["text"], font: "Helvetica" as NumberOpts["font"], size: 12, bold: false, italic: false, color: "#111111" });
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

  // preview: page 1 (single) or a two-page spread (facing) and where the number lands on each page
  const [pw, ph] = src.sizes[0];
  const W = o.facing ? 250 : 330;
  const k = W / pw;
  const m = MARGINS[o.margin] * k;
  const fs = o.size * k;
  const lastN = o.first + Math.max(0, Math.min(o.to, src.count) - o.from);
  const badge = (pageNo: number): CSSProperties => {
    const col = numberCol(o, pageNo);
    const row = Math.floor(o.pos / 3);
    const st: CSSProperties = { position: "absolute", fontSize: fs, lineHeight: 1, whiteSpace: "nowrap", color: o.color, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? "italic" : "normal", fontFamily: o.font === "Times" ? "Times New Roman, serif" : o.font === "Courier" ? "Courier New, monospace" : "Helvetica, Arial, sans-serif" };
    if (col === 0) st.left = m; else if (col === 2) st.right = m; else { st.left = "50%"; st.transform = "translateX(-50%)"; }
    if (row === 0) st.top = m; else if (row === 2) st.bottom = m; else { st.top = "50%"; st.transform = `${st.transform ?? ""} translateY(-50%)`; }
    return st;
  };
  const PreviewPage = ({ index }: { index: number }) => {
    if (index < 0 || index >= src.count) return <div style={{ width: W, height: ph * k }} className="border border-dashed border-stone-300 bg-stone-50" aria-hidden="true" />;
    const pageNo = index + 1;
    const on = pageNo >= o.from && pageNo <= o.to;
    return (
      <div className="relative shadow ring-1 ring-stone-300" style={{ width: W, height: ph * k }}>
        <Thumb doc={src.doc} index={index} width={W} />
        {on && <span style={badge(pageNo)}>{numberLabel(o.text, o.first + (pageNo - o.from), lastN)}</span>}
      </div>
    );
  };
  // facing: with a cover, page 1 sits alone on the right; without one, pages 1 and 2 face each other
  const spread = o.cover ? [-1, 0] : [0, 1];

  const modes = [
    { v: false, l: "Single page", icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /></svg> },
    { v: true, l: "Facing pages", icon: <svg width="34" height="28" viewBox="0 0 30 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h10v16H3zM17 4h10v16H17z" /></svg> },
  ];
  const sub = "text-[11px] font-bold uppercase tracking-wide text-stone-500";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
      <Card title="Page number options" chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {src.count} pages</span>}>
        <div className="space-y-2">
          <div className={sub}>Page mode</div>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((mo) => (
              <button key={String(mo.v)} type="button" aria-pressed={o.facing === mo.v} onClick={() => set("facing", mo.v)} className={`flex flex-col items-center gap-2 border px-3 py-4 text-sm font-semibold transition ${o.facing === mo.v ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}>
                {mo.icon}
                {mo.l}
              </button>
            ))}
          </div>
          {o.facing && (
            <>
              <SwitchRow label="First page is a cover page" checked={!!o.cover} onChange={(v) => set("cover", v)} />
              <p className="text-[11px] text-stone-500">Numbers sit on the outer edge of each spread, so they land in the right place when printed two-sided.</p>
            </>
          )}
        </div>

        <div className="space-y-2 border-t border-stone-200 pt-4">
          <div className={sub}>Where</div>
          <div className="flex flex-wrap items-start gap-6">
            <Field label="Position"><PosGrid value={o.pos} onChange={(v) => set("pos", v)} /></Field>
            <Field label="Margin" className="min-w-[10rem] flex-1">
              <NativeSelect className={sel} value={o.margin} onChange={(e) => set("margin", e.target.value as keyof typeof MARGINS)}>
                <option value="small">Small</option><option value="rec">Recommended</option><option value="big">Big</option>
              </NativeSelect>
            </Field>
          </div>
        </div>

        <div className="space-y-3 border-t border-stone-200 pt-4">
          <div className={sub}>Numbering</div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="First number"><input type="number" className={sel} value={o.first} onChange={(e) => set("first", Math.floor(Number(e.target.value)) || 1)} /></Field>
            <Field label="From page"><input type="number" min={1} max={src.count} className={sel} value={o.from} onChange={(e) => set("from", Math.max(1, Math.floor(Number(e.target.value)) || 1))} /></Field>
            <Field label="To page"><input type="number" min={1} max={src.count} className={sel} value={o.to} onChange={(e) => set("to", Math.min(src.count, Math.floor(Number(e.target.value)) || src.count))} /></Field>
          </div>
          <Field label="Text">
            <NativeSelect className={sel} value={o.text} onChange={(e) => set("text", e.target.value as NumberOpts["text"])}>
              <option value="n">Only the page number (recommended)</option>
              <option value="page-n">Page n</option>
              <option value="page-n-of-N">Page n of N</option>
              <option value="n-of-N">n of N</option>
            </NativeSelect>
          </Field>
        </div>

        <div className="space-y-3 border-t border-stone-200 pt-4">
          <div className={sub}>Look</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Font"><NativeSelect className={sel} value={o.font} onChange={(e) => set("font", e.target.value as NumberOpts["font"])}><option>Helvetica</option><option>Times</option><option>Courier</option></NativeSelect></Field>
            <Field label="Size"><input type="number" min={6} max={72} className={sel} value={o.size} onChange={(e) => set("size", Math.min(72, Math.max(6, Number(e.target.value) || 12)))} /></Field>
            <Field label="Colour"><input type="color" className="h-8 w-full border border-stone-300 bg-white" value={o.color} onChange={(e) => set("color", e.target.value)} /></Field>
            <Field label="Style">
              <div className="flex gap-1">
                <button type="button" aria-pressed={o.bold} aria-label="Bold" onClick={() => set("bold", !o.bold)} className={`h-8 flex-1 border text-xs font-bold ${o.bold ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>B</button>
                <button type="button" aria-pressed={o.italic} aria-label="Italic" onClick={() => set("italic", !o.italic)} className={`h-8 flex-1 border text-xs italic ${o.italic ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>I</button>
              </div>
            </Field>
          </div>
        </div>
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title={o.facing ? "Preview, first spread" : "Preview, page 1"}>
          <div className="flex justify-center overflow-x-auto bg-stone-100 p-6">
            {o.facing ? (
              <div className="flex">{spread.map((ix) => <div key={ix}>{PreviewPage({ index: ix })}</div>)}</div>
            ) : (
              PreviewPage({ index: 0 })
            )}
          </div>
        </Card>
        <Finish from="numbers" ready busy={busy} label="Add page numbers" onRun={run} made={made} onReset={() => setMade(null)} error={error} />
        <SendMenu from="numbers" file={src ? { name: src.name, bytes: src.bytes } : null} />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
