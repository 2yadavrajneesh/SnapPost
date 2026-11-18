"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, ListChecks, Plus, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Ico } from "@/components/Icons";
import { Card, btnPlain, btnSm, btnIcon, useToast } from "@/components/linkdesk/ui";
import { loadDoc, mergePdfs } from "@/lib/pdf/browser";
import { sDel, sGet, sSet } from "@/lib/session";
import { Finish, MAX_BYTES, Thumb, fmtSize, openPdfjs, type Made, type PdfDocProxy } from "./shared";

/** pick: the 0-based pages to take from this file, or null for all of them. */
type F = { id: number; name: string; bytes: Uint8Array; pages: number; pick?: number[] | null };

/** "1-3, 5, 8-" -> 0-based page numbers (only pages that exist). */
function parseRange(text: string, total: number): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)-(\d*)$/.exec(part);
    if (m) {
      const a = m[1] ? Number(m[1]) : 1;
      const z = m[2] ? Number(m[2]) : total;
      for (let n = Math.max(1, Math.min(a, z)); n <= Math.min(total, Math.max(a, z)); n++) out.add(n - 1);
    } else if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((x, y) => x - y);
}
const countOf = (f: F) => (f.pick ? f.pick.length : f.pages);
let uid = 0;

export default function Merge() {
  const toast = useToast();
  const [files, setFiles] = useState<F[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Record<number, PdfDocProxy>>({});
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const saved = useRef(new Set<number>());
  // the list of files comes back after a reload
  useEffect(() => {
    let dead = false;
    sGet<{ id: number; name: string; bytes: Uint8Array; pages: number }[]>("editpdf:merge:files").then((v) => {
      if (!dead && v?.length) {
        uid = Math.max(uid, ...v.map((x) => x.id));
        v.forEach((x) => saved.current.add(x.id));
        setFiles(v);
      }
      if (!dead) setRestored(true);
    });
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (!restored) return;
    if (files.length) void sSet("editpdf:merge:files", files);
    else void sDel("editpdf:merge:files");
  }, [files, restored]);

  // a viewer document for each file, so the cards can show the first page
  useEffect(() => {
    let dead = false;
    for (const f of files) {
      if (docs[f.id]) continue;
      void openPdfjs(f.bytes).then((d) => { if (!dead) setDocs((c) => (c[f.id] ? c : { ...c, [f.id]: d })); }).catch(() => {});
    }
    return () => { dead = true; };
  }, [files, docs]);

  async function add(list: FileList | File[]) {
    setError("");
    setMade(null);
    const msgs: string[] = [];
    const next: F[] = [];
    for (const f of Array.from(list)) {
      if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { msgs.push(`${f.name} is not a PDF.`); continue; }
      if (f.size > MAX_BYTES) { msgs.push(`${f.name} is too large.`); continue; }
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const d = await loadDoc(bytes, f.name);
        next.push({ id: ++uid, name: f.name, bytes, pages: d.getPageCount() });
      } catch (e) {
        msgs.push(e instanceof Error ? e.message : `${f.name} could not be read.`);
      }
    }
    setFiles((c) => [...c, ...next]);
    if (msgs.length) setError(msgs.slice(0, 3).join(" "));
  }
  const move = (i: number, d: number) => {
    setMade(null);
    setFiles((c) => {
      const a = [...c];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });
  };
  const drop = (to: number) => {
    if (drag == null || drag === to) return;
    setMade(null);
    setFiles((c) => {
      const a = [...c];
      const [m] = a.splice(drag, 1);
      a.splice(to, 0, m);
      return a;
    });
  };
  /** Take pages from..to of a file (1-based); leave one end null to keep the current value. */
  const setRange = (f: F, from: number | null, to: number | null) => {
    const lo = f.pick?.length ? Math.min(...f.pick) + 1 : 1;
    const hi = f.pick?.length ? Math.max(...f.pick) + 1 : f.pages;
    const a = Math.max(1, Math.min(f.pages, Math.floor(from ?? lo) || 1));
    const z = Math.max(a, Math.min(f.pages, Math.floor(to ?? hi) || f.pages));
    setPick(f.id, a === 1 && z === f.pages ? null : Array.from({ length: z - a + 1 }, (_, k) => a - 1 + k));
  };
  const setPick = (id: number, pick: number[] | null) => { setMade(null); setFiles((c) => c.map((f) => (f.id === id ? { ...f, pick } : f))); };
  const total = useMemo(() => files.reduce((n, f) => n + countOf(f), 0), [files]);
  async function run() {
    setBusy(true);
    setError("");
    try {
      const bytes = await mergePdfs(files.map((f) => ({ name: f.name, bytes: f.bytes, pick: f.pick })));
      setMade({ name: "merged.pdf", bytes, type: "application/pdf", note: `${files.length} files, ${total} pages.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card title="Add the PDFs to join" chip={files.length ? <span className="text-[11px] font-semibold text-stone-600">{files.length} added · {total} pages</span> : undefined}>
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center gap-1 border-2 border-dashed px-4 py-7 text-center ${over ? "border-accent bg-white" : "border-stone-300 bg-stone-50 hover:bg-white"}`}
        >
          <input ref={input} type="file" hidden multiple accept="application/pdf,.pdf" onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = ""; }} />
          <strong className="text-sm text-stone-900">Drop PDFs here or click to choose</strong>
          <small className="text-[11px] text-stone-500">Joined in the order shown below. Works on your device.</small>
        </label>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSm} onClick={() => { setMade(null); setFiles((c) => [...c].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))); }}>Sort by name</button>
            <button title="Remove all" aria-label="Remove all" type="button" className={btnIcon} onClick={() => { const prev = files; const prevMade = made; setFiles([]); setMade(null); toast(`Removed ${prev.length} ${prev.length === 1 ? "file" : "files"}.`, "ok", { label: "Undo", run: () => { setFiles(prev); setMade(prevMade); } }); }}><Ico n="trash" /></button>
          </div>
        )}
        {files.length > 0 && <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {files.map((f, i) => (
            <li
              key={f.id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => { e.preventDefault(); setHover(i); }}
              onDragEnd={() => { setDrag(null); setHover(null); }}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(i); setDrag(null); setHover(null); }}
              className={`group relative flex min-w-0 cursor-grab flex-col border bg-white shadow-sm transition active:cursor-grabbing ${drag === i ? "opacity-40" : ""} ${hover === i && drag != null && drag !== i ? "border-accent ring-2 ring-accent/40" : "border-stone-200 hover:border-stone-300 hover:shadow-md"}`}
            >
              <div className="relative flex h-40 items-center justify-center overflow-hidden bg-stone-100 p-2">
                <span className="absolute left-2 top-2 z-10 flex h-6 min-w-6 items-center justify-center bg-[#1b2420] px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <button type="button" title="Choose pages" aria-label={`Choose pages of ${f.name}`} onClick={() => setPicking(f.id)} className="flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm hover:bg-stone-50 hover:text-stone-900"><ListChecks size={14} /></button>
                  <button type="button" title="Remove" aria-label={`Remove ${f.name}`} onClick={() => { setMade(null); setFiles((c) => c.filter((x) => x.id !== f.id)); }} className="flex size-7 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-600"><X size={14} /></button>
                </div>
                {docs[f.id] ? <div className="pointer-events-none"><Thumb doc={docs[f.id]} index={f.pick?.[0] ?? 0} width={96} /></div> : <FileText size={32} className="text-stone-300" />}
                {f.pick && <span className="absolute bottom-2 left-2 z-10 bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700 shadow-sm">{f.pick.length} of {f.pages} pages</span>}
              </div>
              <div className="min-w-0 border-t border-stone-200 px-2.5 py-2">
                <div className="truncate text-xs font-semibold text-stone-800" title={f.name}>{f.name}</div>
                <button type="button" onClick={() => setPicking(f.id)} className="mt-0.5 text-[11px] text-stone-500 hover:text-stone-900 hover:underline">
                  {f.pick ? `${f.pick.length} of ${f.pages} pages` : `${f.pages} page${f.pages === 1 ? "" : "s"}`} · {fmtSize(f.bytes.length)}
                </button>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-stone-600" onMouseDown={(e) => e.stopPropagation()}>
                  From
                  <input type="number" min={1} max={f.pages} inputMode="numeric" aria-label={`First page of ${f.name}`} className="h-7 w-12 min-w-0 border border-stone-300 bg-white px-1 text-xs" value={f.pick && f.pick.length ? Math.min(...f.pick) + 1 : 1} onChange={(e) => setRange(f, Number(e.target.value), null)} />
                  to
                  <input type="number" min={1} max={f.pages} inputMode="numeric" aria-label={`Last page of ${f.name}`} className="h-7 w-12 min-w-0 border border-stone-300 bg-white px-1 text-xs" value={f.pick && f.pick.length ? Math.max(...f.pick) + 1 : f.pages} onChange={(e) => setRange(f, null, Number(e.target.value))} />
                </div>
              </div>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => input.current?.click()} className="flex h-full min-h-48 w-full flex-col items-center justify-center gap-1.5 border-2 border-dashed border-stone-300 bg-stone-50 text-xs font-semibold text-stone-600 transition hover:bg-white">
              <Plus size={22} /> Add PDFs
            </button>
          </li>
        </ul>}
        {files.length > 1 && <p className="text-[11px] text-stone-500">Drag the cards to change the order. Use the checklist button on a card to take only some of its pages.</p>}
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Finish ready={files.length >= 1 && total > 0 && files.every((f) => countOf(f) > 0) && (files.length >= 2 || files.some((f) => f.pick))} busy={busy} label="Merge PDFs" onRun={run} made={made} onReset={() => setMade(null)} error={error} hint={files.length < 2 && !files.some((f) => f.pick) ? "Add at least two PDFs, or one PDF and choose some of its pages." : undefined} />
        {files.length > 0 && <button type="button" className={`${btnPlain} w-full`} onClick={() => input.current?.click()}>Add more files</button>}
      </aside>
      <PagePicker file={files.find((f) => f.id === picking) ?? null} doc={picking != null ? docs[picking] : undefined} onClose={() => setPicking(null)} onChange={(pick) => picking != null && setPick(picking, pick)} />
    </div>
  );
}

/** Choose which pages of one file go into the merged PDF. */
function PagePicker({ file, doc, onClose, onChange }: { file: F | null; doc?: PdfDocProxy; onClose: () => void; onChange: (pick: number[] | null) => void }) {
  const [text, setText] = useState("");
  useEffect(() => { setText(""); }, [file?.id]);
  if (!file) return <Sheet open={false} onOpenChange={() => {}}><SheetContent side="right" className="hidden" /></Sheet>;
  const chosen = new Set(file.pick ?? Array.from({ length: file.pages }, (_, i) => i));
  const set = (list: number[]) => onChange(list.length === file.pages ? null : list);
  const toggle = (i: number) => {
    const n = new Set(chosen);
    if (n.has(i)) n.delete(i); else n.add(i);
    set([...n].sort((a, b) => a - b));
  };
  const all = Array.from({ length: file.pages }, (_, i) => i);
  const quick = "h-8 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50";
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 bg-[#faf6f1] p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-stone-300 p-4">
          <SheetTitle className="truncate pr-8 text-base">{file.name}</SheetTitle>
          <SheetDescription>{chosen.size} of {file.pages} pages will be added. Tap a page to include or skip it.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 border-b border-stone-300 p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={quick} onClick={() => onChange(null)}>All</button>
            <button type="button" className={quick} onClick={() => set([])}>None</button>
            <button type="button" className={quick} onClick={() => set(all.filter((i) => i % 2 === 0))}>Odd</button>
            <button type="button" className={quick} onClick={() => set(all.filter((i) => i % 2 === 1))}>Even</button>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const r = parseRange(text, file.pages); if (r.length) set(r); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Pages, e.g. 1-3, 5, 8-" aria-label="Pages to add" className="h-8 min-w-0 flex-1 border border-stone-300 bg-white px-2 text-xs" />
            <button type="submit" className={quick}>Use these pages</button>
          </form>
        </div>
        <div className="grid flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-4 sm:grid-cols-4">
          {all.map((i) => (
            <button key={i} type="button" aria-pressed={chosen.has(i)} onClick={() => toggle(i)} className={`relative flex flex-col items-center gap-1 border p-1.5 transition ${chosen.has(i) ? "border-[#1b2420] bg-white ring-1 ring-[#1b2420]" : "border-stone-200 bg-stone-100 opacity-60 hover:opacity-100"}`}>
              <span className={`absolute left-1.5 top-1.5 z-10 flex size-5 items-center justify-center text-[11px] font-bold ${chosen.has(i) ? "bg-[#1b2420] text-white" : "bg-white text-stone-500 ring-1 ring-stone-300"}`}>{chosen.has(i) ? "✓" : ""}</span>
              <div className="pointer-events-none flex h-24 items-center justify-center overflow-hidden">{doc ? <Thumb doc={doc} index={i} width={64} /> : null}</div>
              <span className="text-[11px] font-semibold text-stone-700">{i + 1}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-stone-300 p-4">
          <button type="button" onClick={onClose} className="h-10 w-full bg-[#1b2420] text-sm font-semibold text-white hover:opacity-90">Done</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
