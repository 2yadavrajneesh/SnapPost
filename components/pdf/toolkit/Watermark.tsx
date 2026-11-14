"use client";

import { useEffect, useState } from "react";
import { Card, btnPlain } from "@/components/linkdesk/ui";
import { addWatermark, textMark } from "@/lib/pdf/browser";
import { Field, Finish, Open, PosGrid, Seg, Thumb, sel, stem, useSource, type Made } from "./shared";

const FONTS = ["Arial", "Times New Roman", "Courier New", "Georgia", "Verdana", "Noto Sans Devanagari"];

async function pictureFile(f: File): Promise<{ bytes: Uint8Array; png: boolean; w: number; h: number; url: string }> {
  const bmp = await createImageBitmap(f);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/png"));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), png: true, w: c.width, h: c.height, url: c.toDataURL("image/png") };
}

export default function Watermark() {
  const { src, error: srcErr, loading, load, clear } = useSource("watermark");
  const [kind, setKind] = useState<"text" | "image">("text");
  const [text, setText] = useState("CONFIDENTIAL");
  const [font, setFont] = useState("Arial");
  const [size, setSize] = useState(60);
  const [bold, setBold] = useState(true);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [color, setColor] = useState("#cc0000");
  const [pic, setPic] = useState<Awaited<ReturnType<typeof pictureFile>> | null>(null);
  const [picSize, setPicSize] = useState(40);
  const [pos, setPos] = useState(4);
  const [mosaic, setMosaic] = useState(false);
  const [opacity, setOpacity] = useState(0.5);
  const [rotation, setRotation] = useState(45);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [below, setBelow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const [prev, setPrev] = useState<{ url: string; w: number; h: number } | null>(null);
  useEffect(() => { if (src) { setFrom(1); setTo(src.count); } setMade(null); }, [src]);

  // a picture of the text, used for the preview and the PDF
  useEffect(() => {
    let dead = false;
    (async () => {
      if (kind === "image") return setPrev(pic ? { url: pic.url, w: pic.w, h: pic.h } : null);
      if (!text.trim()) return setPrev(null);
      const t = await textMark(text, { family: font, size, bold, italic, underline, color });
      if (dead) return;
      const url = URL.createObjectURL(new Blob([t.png as BlobPart], { type: "image/png" }));
      setPrev((old) => { if (old?.url.startsWith("blob:")) URL.revokeObjectURL(old.url); return { url, w: t.w, h: t.h }; });
    })();
    return () => { dead = true; };
  }, [kind, text, font, size, bold, italic, underline, color, pic]);

  async function run() {
    if (!src) return;
    setBusy(true);
    setError("");
    try {
      let mark: { png: Uint8Array; w: number; h: number };
      let fit: number | undefined;
      if (kind === "text") {
        if (!text.trim()) throw new Error("Type the watermark text first.");
        mark = await textMark(text, { family: font, size, bold, italic, underline, color });
      } else {
        if (!pic) throw new Error("Choose a picture first.");
        mark = { png: pic.bytes, w: pic.w, h: pic.h };
        fit = picSize / 100;
      }
      const bytes = await addWatermark(src.bytes, { image: mark.png, png: true, w: mark.w, h: mark.h, pos, mosaic, opacity, rotation, from, to, below, fit });
      setMade({ name: `${stem(src.name)}-watermarked.pdf`, bytes, type: "application/pdf", note: `Watermark added to pages ${from} to ${Math.min(to, src.count)}.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  const touch = <T,>(fn: (v: T) => void) => (v: T) => { setMade(null); fn(v); };

  if (!src) return <Open onFile={load} loading={loading} error={srcErr} title="Drop the PDF to watermark" />;

  const W = 210;
  const [pw, ph] = src.sizes[0];
  const k = W / pw;
  const mw = prev ? (kind === "image" ? (picSize / 100) * pw : prev.w) : 0;
  const mh = prev ? (kind === "image" ? (mw * prev.h) / prev.w : prev.h) : 0;
  const markStyle = (cx: number, cy: number): React.CSSProperties => ({ position: "absolute", left: cx * k - (mw * k) / 2, top: cy * k - (mh * k) / 2, width: mw * k, height: mh * k, opacity, transform: `rotate(${-rotation}deg)`, pointerEvents: "none" });
  const marks: [number, number][] = [];
  if (mosaic) {
    const gx = mw * 1.5 + 30, gy = mh * 2.4 + 40;
    let r = 0;
    for (let y = gy / 2; y < ph + gy / 2; y += gy, r++) for (let x = r % 2 ? gx / 2 : 0; x < pw + gx; x += gx) marks.push([x, y]);
  } else {
    const c = pos % 3, r = Math.floor(pos / 3), pad = 24;
    marks.push([c === 0 ? pad + mw / 2 : c === 1 ? pw / 2 : pw - pad - mw / 2, r === 0 ? pad + mh / 2 : r === 1 ? ph / 2 : ph - pad - mh / 2]);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="Watermark options" chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {src.count} pages</span>}>
        <Seg value={kind} onChange={touch(setKind)} options={[{ v: "text", l: "Place text" }, { v: "image", l: "Place image" }]} />
        {kind === "text" ? (
          <>
            <Field label="Text (any language)"><textarea rows={2} className={sel} value={text} maxLength={120} onChange={(e) => touch(setText)(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Font"><select className={sel} value={font} onChange={(e) => touch(setFont)(e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select></Field>
              <Field label="Size"><input type="number" min={8} max={300} className={sel} value={size} onChange={(e) => touch(setSize)(Math.min(300, Math.max(8, Number(e.target.value) || 60)))} /></Field>
              <Field label="Colour"><input type="color" className="h-8 w-full border border-stone-300 bg-white" value={color} onChange={(e) => touch(setColor)(e.target.value)} /></Field>
              <Field label="Style">
                <div className="flex gap-1">
                  {([["B", bold, setBold, "font-bold"], ["I", italic, setItalic, "italic"], ["U", underline, setUnderline, "underline"]] as const).map(([l, v, fn, cls]) => (
                    <button key={l} type="button" aria-pressed={v} aria-label={l === "B" ? "Bold" : l === "I" ? "Italic" : "Underline"} onClick={() => touch(fn)(!v)} className={`h-8 flex-1 border text-xs ${cls} ${v ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white"}`}>{l}</button>
                  ))}
                </div>
              </Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Picture (PNG, JPG or WebP)">
              <input type="file" accept="image/png,image/jpeg,image/webp" className={sel} onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setMade(null); setPic(await pictureFile(f)); setError(""); } catch { setError("That picture could not be read."); } }} />
            </Field>
            <Field label={`Size: ${picSize}% of the page width`}><input type="range" min={5} max={100} value={picSize} onChange={(e) => touch(setPicSize)(Number(e.target.value))} className="w-full" /></Field>
          </>
        )}
        <div className="flex flex-wrap items-start gap-6">
          <Field label="Position"><PosGrid value={pos} onChange={touch(setPos)} disabled={mosaic} /></Field>
          <label className="mt-6 flex items-center gap-2 text-xs font-semibold text-stone-700"><input type="checkbox" checked={mosaic} onChange={(e) => touch(setMosaic)(e.target.checked)} />Mosaic (repeat across the page)</label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Transparency">
            <select className={sel} value={opacity} onChange={(e) => touch(setOpacity)(Number(e.target.value))}>
              <option value={1}>No transparency</option><option value={0.75}>25%</option><option value={0.5}>50%</option><option value={0.25}>75%</option>
            </select>
          </Field>
          <Field label="Rotation">
            <select className={sel} value={rotation} onChange={(e) => touch(setRotation)(Number(e.target.value))}>
              <option value={0}>Do not rotate</option><option value={45}>45°</option><option value={-45}>−45°</option><option value={90}>90°</option><option value={180}>180°</option><option value={270}>270°</option>
            </select>
          </Field>
          <Field label="From page"><input type="number" min={1} max={src.count} className={sel} value={from} onChange={(e) => touch(setFrom)(Math.max(1, Math.floor(Number(e.target.value)) || 1))} /></Field>
          <Field label="To page"><input type="number" min={1} max={src.count} className={sel} value={to} onChange={(e) => touch(setTo)(Math.min(src.count, Math.floor(Number(e.target.value)) || src.count))} /></Field>
        </div>
        <Field label="Layer"><Seg value={below ? "b" : "o"} onChange={(v) => touch(setBelow)(v === "b")} options={[{ v: "o", l: "Over the PDF content" }, { v: "b", l: "Below the PDF content" }]} /></Field>
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title="Preview, page 1">
          <div className="mx-auto" style={{ width: W }}>
            <div className="relative overflow-hidden shadow ring-1 ring-stone-300" style={{ width: W, height: ph * k }}>
              {below && prev && from <= 1 && to >= 1 && marks.map(([x, y], i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={prev.url} alt="" style={markStyle(x, y)} />)}
              <Thumb doc={src.doc} index={0} width={W} className={below ? "mix-blend-multiply" : ""} />
              {!below && prev && from <= 1 && to >= 1 && marks.map(([x, y], i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={prev.url} alt="" style={markStyle(x, y)} />)}
            </div>
          </div>
        </Card>
        <Finish ready busy={busy} label="Add watermark" onRun={run} made={made} onReset={() => setMade(null)} error={error} />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
