"use client";

import { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/Icons";
import { Card, btnPlain, btnSm, btnIcon, useToast } from "@/components/linkdesk/ui";
import { loadDoc, mergePdfs } from "@/lib/pdf/browser";
import { sDel, sGet, sSet } from "@/lib/session";
import { Finish, MAX_BYTES, fmtSize, type Made } from "./shared";

type F = { id: number; name: string; bytes: Uint8Array; pages: number };
let uid = 0;

export default function Merge() {
  const toast = useToast();
  const [files, setFiles] = useState<F[]>([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<Made | null>(null);
  const input = useRef<HTMLInputElement>(null);
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
  async function run() {
    setBusy(true);
    setError("");
    try {
      const bytes = await mergePdfs(files);
      setMade({ name: "merged.pdf", bytes, type: "application/pdf", note: `${files.length} files, ${files.reduce((n, f) => n + f.pages, 0)} pages.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card title="Add the PDFs to join" chip={files.length ? <span className="text-[11px] font-semibold text-stone-600">{files.length} added · {files.reduce((n, f) => n + f.pages, 0)} pages</span> : undefined}>
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
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li key={f.id} className="flex items-center gap-2 border border-stone-200 bg-white p-2.5">
              <span className="bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-stone-800">{f.name}</span>
              <span className="text-[11px] text-stone-500">{f.pages} p · {fmtSize(f.bytes.length)}</span>
              <button type="button" className={btnSm} aria-label={`Move ${f.name} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className={btnSm} aria-label={`Move ${f.name} later`} disabled={i === files.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className={btnSm} aria-label={`Remove ${f.name}`} onClick={() => { setMade(null); setFiles((c) => c.filter((x) => x.id !== f.id)); }}>✕</button>
            </li>
          ))}
        </ul>
      </Card>
      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Finish ready={files.length >= 2} busy={busy} label="Merge PDFs" onRun={run} made={made} onReset={() => setMade(null)} error={error} hint={files.length < 2 ? "Add at least two PDFs." : undefined} />
        <button type="button" className={`${btnPlain} w-full`} onClick={() => input.current?.click()}>Add more files</button>
      </aside>
    </div>
  );
}
