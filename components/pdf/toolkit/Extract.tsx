"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Layers, ListChecks, Plus, Rows3, Scissors, X } from "lucide-react";
import { Card, btnPlain } from "@/components/linkdesk/ui";
import { SwitchRow } from "@/components/ui";
import { parseRange, pickPages } from "@/lib/pdf/browser";
import { useCurrentFile } from "@/lib/pdf/flow";
import { Field, Finish, Open, Thumb, asZip, sel, stem, useSource, type Made, ToolActions } from "./shared";

type Range = { id: number; from: number; to: number };
let uid = 0;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const seq = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a - 1 + i); // 1-based a..b -> 0-based indices

/** Pull pages out of a PDF: by page ranges (your own or every N pages), or one by one. */
export default function Extract() {
  const { src, error: srcErr, loading, load, clear } = useSource("extract");
  const [tab, setTab] = useState<"range" | "pages">("range");
  const [rmode, setRmode] = useState<"custom" | "fixed">("custom");
  const [pmode, setPmode] = useState<"all" | "select">("select");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [every, setEvery] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [text, setText] = useState("");
  const [joinRanges, setJoinRanges] = useState(false);
  const [joinPages, setJoinPages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);

  useEffect(() => {
    setRanges(src ? [{ id: ++uid, from: 1, to: src.count }] : []);
    setPicked(new Set());
    setText("");
    setMade(null);
  }, [src]);

  const touch = () => setMade(null);
  const count = src?.count ?? 0;
  const patch = (id: number, p: Partial<Range>) => { touch(); setRanges((l) => l.map((r) => (r.id === id ? { ...r, ...p } : r))); };

  // what will be made: a list of named groups of 0-based pages
  const plan = useMemo(() => {
  if (!src) return { groups: [] as { name: string; idx: number[] }[], one: false };
    const s = stem(src.name);
    if (tab === "range" && rmode === "custom") {
      const g = ranges.map((r) => ({ name: `${s}-pages-${r.from}-${r.to}.pdf`, idx: seq(r.from, r.to) }));
      return joinRanges ? { groups: [{ name: `${s}-extracted.pdf`, idx: g.flatMap((x) => x.idx) }], one: true } : { groups: g, one: g.length === 1 };
    }
    if (tab === "range") {
      const n = Math.max(1, every);
      const g = Array.from({ length: Math.ceil(count / n) }, (_, i) => ({ name: `${s}-part-${i + 1}.pdf`, idx: seq(i * n + 1, Math.min(count, (i + 1) * n)) }));
      return { groups: g, one: g.length === 1 };
    }
    if (pmode === "all") return { groups: seq(1, count).map((i) => ({ name: `${s}-page-${i + 1}.pdf`, idx: [i] })), one: count === 1 };
    const idx = [...picked].sort((a, b) => a - b);
    if (joinPages) return { groups: idx.length ? [{ name: `${s}-selected.pdf`, idx }] : [], one: true };
    return { groups: idx.map((i) => ({ name: `${s}-page-${i + 1}.pdf`, idx: [i] })), one: idx.length === 1 };
  }, [src, tab, rmode, pmode, ranges, every, picked, joinRanges, joinPages, count]);

  const files = plan.groups.length;
  const pagesTotal = plan.groups.reduce((n, g) => n + g.idx.length, 0);
  const summary = !files ? "" : `${files} PDF${files === 1 ? "" : "s"} will be created, ${pagesTotal} page${pagesTotal === 1 ? "" : "s"} in all.`;

  async function run() {
    if (!src) return;
    setBusy(true);
    setError("");
    try {
      if (!plan.groups.length) throw new Error(tab === "pages" ? "Click the pages you want to extract." : "Add at least one page range.");
      if (plan.groups.some((g) => !g.idx.length)) throw new Error("A range has no pages. Check the from and to numbers.");
      const parts = [];
      for (const g of plan.groups) parts.push({ name: g.name, bytes: await pickPages(src.bytes, g.idx) });
      setMade(parts.length === 1 ? { name: parts[0].name, bytes: parts[0].bytes, type: "application/pdf", note: `${parts[0] && plan.groups[0].idx.length} page${plan.groups[0].idx.length === 1 ? "" : "s"}.` } : asZip(`${stem(src.name)}-extracted`, parts));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useCurrentFile(async () => src ? { name: src.name, bytes: src.bytes } : null);
  if (!src) return <Open onFile={load} loading={loading} error={srcErr} title="Drop the PDF to extract pages from" />;

  const Tile = ({ on, icon, label, onClick }: { on: boolean; icon: ReactNode; label: string; onClick: () => void }) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={`flex flex-col items-center gap-1.5 border px-3 py-3 text-sm font-semibold transition ${on ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"}`}>
      {icon}
      {label}
    </button>
  );
  const Chip = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button type="button" aria-pressed={on} onClick={onClick} className={`h-9 flex-1 border px-3 text-xs font-semibold transition ${on ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"}`}>{label}</button>
  );
  const sub = "text-[11px] font-bold uppercase tracking-wide text-stone-500";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card title="Extract pages" chip={<span className="text-[11px] font-semibold text-stone-600">{src.name} · {count} pages</span>}>
        <div className="grid grid-cols-2 gap-2">
          <Tile on={tab === "range"} onClick={() => { setTab("range"); touch(); }} label="By range" icon={<Scissors size={24} />} />
          <Tile on={tab === "pages"} onClick={() => { setTab("pages"); touch(); }} label="By page" icon={<Layers size={24} />} />
        </div>

        {tab === "range" && (
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <div className={sub}>Range mode</div>
            <div className="flex gap-2">
              <Chip on={rmode === "custom"} label="Custom ranges" onClick={() => { setRmode("custom"); touch(); }} />
              <Chip on={rmode === "fixed"} label="Every N pages" onClick={() => { setRmode("fixed"); touch(); }} />
            </div>
            {rmode === "custom" ? (
              <>
                <ul className="space-y-3">
                  {ranges.map((r, i) => {
                    const idx = seq(r.from, r.to);
                    return (
                      <li key={r.id} className="space-y-2 border border-stone-200 bg-white p-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <span className="pb-2 text-xs font-bold text-stone-800">Range {i + 1}</span>
                          <Field label="From page"><input type="number" min={1} max={count} className={`${sel} w-24`} value={r.from} onChange={(e) => { const v = clamp(Math.floor(Number(e.target.value)) || 1, 1, count); patch(r.id, { from: v, to: Math.max(r.to, v) }); }} /></Field>
                          <Field label="To page"><input type="number" min={1} max={count} className={`${sel} w-24`} value={r.to} onChange={(e) => { const v = clamp(Math.floor(Number(e.target.value)) || 1, 1, count); patch(r.id, { to: v, from: Math.min(r.from, v) }); }} /></Field>
                          {ranges.length > 1 && (
                            <button type="button" title="Remove this range" aria-label={`Remove range ${i + 1}`} onClick={() => { touch(); setRanges((l) => l.filter((x) => x.id !== r.id)); }} className="ml-auto mb-0.5 flex size-8 items-center justify-center border border-stone-200 text-stone-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"><X size={15} /></button>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 overflow-hidden bg-stone-100 p-2">
                          {idx.slice(0, 6).map((p) => <div key={p} className="pointer-events-none flex-none"><Thumb doc={src.doc} index={p} width={56} className="border border-stone-200" /></div>)}
                          {idx.length > 6 && <span className="flex-none px-2 text-xs font-semibold text-stone-500">+{idx.length - 6} more</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => { touch(); const last = ranges[ranges.length - 1]; const from = last ? Math.min(count, last.to + 1) : 1; setRanges((l) => [...l, { id: ++uid, from, to: count }]); }} className={`${btnPlain} inline-flex items-center gap-1.5`}><Plus size={15} /> Add range</button>
                <SwitchRow label="Merge all ranges into one PDF" checked={joinRanges} onChange={(v) => { setJoinRanges(v); touch(); }} />
              </>
            ) : (
              <Field label="Pages in each file">
                <input type="number" min={1} max={count} className={`${sel} max-w-[8rem]`} value={every} onChange={(e) => { setEvery(clamp(Math.floor(Number(e.target.value)) || 1, 1, count)); touch(); }} />
                <p className="mt-1 text-[11px] font-normal text-stone-500">A {count}-page PDF becomes {Math.ceil(count / Math.max(1, every))} files of {every} page{every === 1 ? "" : "s"} each.</p>
              </Field>
            )}
          </div>
        )}

        {tab === "pages" && (
          <div className="space-y-3 border-t border-stone-200 pt-4">
            <div className={sub}>Extract mode</div>
            <div className="flex gap-2">
              <Chip on={pmode === "select"} label="Select pages" onClick={() => { setPmode("select"); touch(); }} />
              <Chip on={pmode === "all"} label="Extract all pages" onClick={() => { setPmode("all"); touch(); }} />
            </div>
            {pmode === "select" ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {[["All", () => seq(1, count)], ["None", () => []], ["Odd", () => seq(1, count).filter((i) => i % 2 === 0)], ["Even", () => seq(1, count).filter((i) => i % 2 === 1)]].map(([l, f]) => (
                    <button key={l as string} type="button" className="h-8 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50" onClick={() => { touch(); setPicked(new Set((f as () => number[])())); }}>{l as string}</button>
                  ))}
                  <form className="ml-auto flex min-w-[12rem] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); try { const r = parseRange(text, count); setPicked(new Set(r)); touch(); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Check the page numbers."); } }}>
                    <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 1-3, 5, 8-" aria-label="Pages to select" className="h-8 min-w-0 flex-1 border border-stone-300 bg-white px-2 text-xs" />
                    <button type="submit" className="h-8 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50">Select</button>
                  </form>
                </div>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: count }, (_, i) => (
                    <li key={i}>
                      <button type="button" aria-pressed={picked.has(i)} aria-label={`Page ${i + 1}`} onClick={() => { touch(); setPicked((c) => { const n = new Set(c); if (n.has(i)) n.delete(i); else n.add(i); return n; }); }} className={`relative flex w-full flex-col items-center gap-1 border p-1.5 transition ${picked.has(i) ? "border-[#1b2420] bg-white ring-1 ring-[#1b2420]" : "border-stone-200 bg-stone-100 opacity-70 hover:opacity-100"}`}>
                        <span className={`absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center text-[11px] font-bold ${picked.has(i) ? "bg-[#1b2420] text-white" : "bg-white text-transparent ring-1 ring-stone-300"}`}>✓</span>
                        <div className="pointer-events-none"><Thumb doc={src.doc} index={i} width={84} /></div>
                        <span className="text-[11px] font-bold text-stone-700">{i + 1}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <SwitchRow label="Merge the selected pages into one PDF" checked={joinPages} onChange={(v) => { setJoinPages(v); touch(); }} />
              </>
            ) : (
              <p className="flex items-start gap-2 border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900"><Rows3 size={16} className="mt-0.5 flex-none" /> Every page becomes its own PDF. {count} PDF{count === 1 ? "" : "s"} will be created and delivered as one ZIP.</p>
            )}
          </div>
        )}
        {summary && <p className="flex items-center gap-2 bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-800"><ListChecks size={15} /> {summary}</p>}
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Finish from="extract" extra={<ToolActions from="extract" file={src ? { name: src.name, bytes: src.bytes } : null} onClear={clear} />} ready={files > 0} busy={busy} label="Extract pages" onRun={run} made={made} onReset={() => setMade(null)} error={error} hint="More than one file is delivered as a ZIP." />
      </aside>
    </div>
  );
}
