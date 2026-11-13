"use client";

import { useEffect, useState } from "react";
import { Card, btnPlain, btnSm } from "@/components/linkdesk/ui";
import { parseRange, pickPages, splitPdf, type SplitMode } from "@/lib/pdf/browser";
import { Field, Finish, Open, Seg, Thumb, asZip, sel, stem, useSource, type Made } from "./shared";

type Mode = SplitMode | "pick";

export default function Split() {
  const { src, error: srcErr, loading, load, clear } = useSource();
  const [mode, setMode] = useState<Mode>("ranges");
  const [spec, setSpec] = useState("");
  const [every, setEvery] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  useEffect(() => { setPicked(new Set()); setMade(null); setSpec(""); }, [src]);

  const preview = (() => {
    if (!src) return "";
    try {
      if (mode === "each") return `${src.count} files, one page each.`;
      if (mode === "every") return `${Math.ceil(src.count / Math.max(1, every))} files.`;
      if (mode === "pick") return picked.size ? `${picked.size} page${picked.size === 1 ? "" : "s"} in one file.` : "";
      const n = spec.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      n.forEach((s) => parseRange(s, src.count));
      return n.length ? `${n.length} file${n.length === 1 ? "" : "s"}.` : "";
    } catch (e) {
      return e instanceof Error ? e.message : "";
    }
  })();

  async function run() {
    if (!src) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "pick") {
        if (!picked.size) throw new Error("Click the pages you want to keep.");
        const idx = [...picked].sort((a, b) => a - b);
        setMade({ name: `${stem(src.name)}-selected.pdf`, bytes: await pickPages(src.bytes, idx), type: "application/pdf", note: `${idx.length} pages.` });
      } else {
        const parts = await splitPdf(src.bytes, mode, mode === "every" ? String(every) : spec, src.count);
        setMade(parts.length === 1 ? { name: `${stem(src.name)}-${parts[0].name}`, bytes: parts[0].bytes, type: "application/pdf", note: "1 file." } : asZip(`${stem(src.name)}-split`, parts.map((p) => ({ name: `${stem(src.name)}-${p.name}`, bytes: p.bytes }))));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!src) return <Open onFile={load} loading={loading} error={srcErr} title="Drop the PDF to split" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card title="How should it be split?" chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {src.count} pages</span>}>
        <Seg<Mode> value={mode} onChange={(m) => { setMode(m); setMade(null); }} options={[{ v: "ranges", l: "By ranges" }, { v: "every", l: "Every N pages" }, { v: "each", l: "Each page" }, { v: "pick", l: "Pick pages" }]} />
        {mode === "ranges" && (
          <Field label="Pages for each file, separated by commas">
            <input className={sel} value={spec} placeholder="1-3, 4-6, 9" onChange={(e) => { setSpec(e.target.value); setMade(null); }} />
            <p className="mt-1 text-[11px] font-normal text-stone-500">Each range becomes its own file. For example 1-3, 4-6, 9 makes three files.</p>
          </Field>
        )}
        {mode === "every" && (
          <Field label="Pages in each file">
            <input type="number" min={1} max={src.count} className={`${sel} max-w-[8rem]`} value={every} onChange={(e) => { setEvery(Math.max(1, Math.floor(Number(e.target.value)) || 1)); setMade(null); }} />
          </Field>
        )}
        {mode === "pick" && (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btnSm} onClick={() => setPicked(new Set(Array.from({ length: src.count }, (_, i) => i)))}>Select all</button>
              <button type="button" className={btnSm} onClick={() => setPicked(new Set())}>Clear</button>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: src.count }, (_, i) => (
                <li key={i}>
                  <button type="button" aria-pressed={picked.has(i)} aria-label={`Page ${i + 1}`} onClick={() => { setMade(null); setPicked((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }} className={`flex w-full flex-col items-center gap-1 border-2 p-1.5 ${picked.has(i) ? "border-accent bg-emerald-50" : "border-stone-200 bg-white"}`}>
                    <Thumb doc={src.doc} index={i} width={90} className="border border-stone-200" />
                    <span className="text-[11px] font-bold text-stone-700">{i + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {preview && <p className="bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-800">{preview}</p>}
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Finish ready busy={busy} label={mode === "pick" ? "Extract pages" : "Split PDF"} onRun={run} made={made} onReset={() => setMade(null)} error={error} hint="More than one file is delivered as a ZIP." />
        <button type="button" className={`${btnPlain} w-full`} onClick={clear}>Start with another PDF</button>
      </aside>
    </div>
  );
}
