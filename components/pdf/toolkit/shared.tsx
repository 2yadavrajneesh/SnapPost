"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRightLeft, FilePlus2 } from "lucide-react";
import { Ico } from "@/components/Icons";
import { Card, DropZone, btnPlain, btnPrimary, field } from "@/components/linkdesk/ui";
import { zipFiles } from "@/lib/pdf/browser";
import { sDel, sGet, sSet } from "@/lib/session";
import { TOOLS, currentFile, publish, sendTo, takePending } from "@/lib/pdf/flow";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type PdfDocProxy = import("pdfjs-dist").PDFDocumentProxy;
export const MAX_BYTES = 150 * 1048576;
export const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const sel = field;

export async function openPdfjs(bytes: Uint8Array): Promise<PdfDocProxy> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

export type Source = { name: string; bytes: Uint8Array; doc: PdfDocProxy; count: number; sizes: [number, number][] };

/** Loads one PDF from a file: its bytes, a viewer document and the size of each page. */
export function useSource(key?: string) {
  const [src, setSrc] = useState<Source | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cur = useRef<Source | null>(null);
  const gotPassed = useRef(false);
  const load = useCallback(async (f: File) => {
    setError("");
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return setError("That is not a PDF file.");
    if (f.size > MAX_BYTES) return setError(`That file is larger than ${fmtSize(MAX_BYTES)}.`);
    setLoading(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const doc = await openPdfjs(bytes);
      const sizes: [number, number][] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const v = (await doc.getPage(i)).getViewport({ scale: 1 });
        sizes.push([v.width, v.height]);
      }
      
      const s = { name: f.name, bytes, doc, count: doc.numPages, sizes };
      cur.current = s;
      setSrc(s);
      if (key) void sSet(`editpdf:tool:${key}`, { name: f.name, bytes });
    } catch (e) {
      setError(e instanceof Error && /password/i.test(e.message) ? "This PDF is password protected. Remove the password first." : "That file could not be read as a PDF.");
    } finally {
      setLoading(false);
    }
  }, []);
  const clear = useCallback(() => {
    
    cur.current = null;
    setSrc(null);
    setError("");
  }, []);

  // the open file comes back after a reload
  useEffect(() => {
    if (!key) return;
    let dead = false;
    // a file passed on from another tool takes the place of the saved one
    const passed = takePending(key);
    if (passed) {
      gotPassed.current = true;
      void load(new File([passed.bytes as BlobPart], passed.name, { type: "application/pdf" }));
      return;
    }
    if (gotPassed.current) return; // the effect runs twice in development; the passed file already won
    sGet<{ name: string; bytes: Uint8Array }>(`editpdf:tool:${key}`).then((v) => {
      if (v && !dead && !gotPassed.current) void load(new File([v.bytes as BlobPart], v.name, { type: "application/pdf" }));
    });
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { src, error, setError, loading, load, clear };
}

export function Open({ onFile, loading, error, title = "Drop a PDF here or click to choose" }: { onFile: (f: File) => void; loading: boolean; error: string; title?: string }) {
  return (
    <Card title="Open a PDF">
      <DropZone accept="application/pdf,.pdf" title={loading ? "Reading the PDF…" : title} note={`Works on your device. Nothing is uploaded. Up to ${fmtSize(MAX_BYTES)}.`} onFile={onFile} disabled={loading} />
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <li><b className="text-slate-700">1</b> Choose a PDF</li>
        <li><b className="text-slate-700">2</b> Make your changes</li>
        <li><b className="text-slate-700">3</b> Download the result</li>
      </ol>
      {error && <p role="alert" className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
    </Card>
  );
}

/** A small, lazily drawn picture of one page. `rot` turns it on screen. */
export function Thumb({ doc, index, width = 130, rot = 0, className = "" }: { doc: PdfDocProxy; index: number; width?: number; rot?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.3);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!near || !cv.current) return;
    let dead = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      const page = await doc.getPage(index + 1);
      const v1 = page.getViewport({ scale: 1 });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale: (width / v1.width) * dpr });
      if (dead || !cv.current) return;
      setRatio(v1.height / v1.width);
      cv.current.width = Math.floor(vp.width);
      cv.current.height = Math.floor(vp.height);
      task = page.render({ canvas: cv.current, viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [near, doc, index, width]);
  const turned = rot % 180 !== 0;
  const h = width * ratio;
  const side = turned ? h : width;
  return (
    <div ref={box} className={`relative flex-none overflow-hidden bg-white ${className}`} style={{ width: turned ? h : width, height: turned ? width : h }}>
      <canvas ref={cv} className="absolute left-1/2 top-1/2 bg-white" style={{ width, height: h, transform: `translate(-50%, -50%) rotate(${rot}deg)`, maxWidth: "none" }} />
      <span className="sr-only">{side}</span>
    </div>
  );
}

/** Downloads bytes as a file. */
export function save(name: string, bytes: Uint8Array, type = "application/pdf") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type Made = { name: string; bytes: Uint8Array; type: string; note: string };
export const asZip = (base: string, parts: { name: string; bytes: Uint8Array }[]): Made => ({ name: `${base}.zip`, bytes: zipFiles(parts), type: "application/zip", note: `${parts.length} files in one ZIP.` });
export const stem = (n: string) => n.replace(/\.[^.]+$/, "") || "file";

/** The result box: a button to run, then the finished file to download. */
export function Finish({ ready, busy, label, onRun, made, onReset, error, hint, extra }: { extra?: ReactNode; from?: string;  ready: boolean; busy: boolean; label: string; onRun: () => void; made: Made | null; onReset: () => void; error: string; hint?: ReactNode }) {
  // the newest version is what "Return to <tool>" brings back
  useEffect(() => { if (made && made.type === "application/pdf") publish({ name: made.name, bytes: made.bytes }); }, [made]);
  return (
    <Card title={made ? "Your file is ready" : "Create the file"}>
      {!made && (
        <button type="button" className={`${btnPrimary} w-full ${busy ? "btn-busy" : ""}`} disabled={!ready || busy} onClick={onRun}>
          {busy ? "Working…" : label}
        </button>
      )}
      {!made && hint && <p className="text-[11px] text-stone-500">{hint}</p>}
      {error && <p role="alert" className="bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
      {made && (
        <div className="space-y-2">
          <p className="truncate text-xs font-semibold text-stone-800">{made.name}</p>
          <p className="bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-800">{made.note} {fmtSize(made.bytes.length)}.</p>
          <button type="button" className={`${btnPrimary} w-full`} onClick={() => save(made.name, made.bytes, made.type)}><Ico n="download" />Download</button>
          <button type="button" className={`${btnPlain} w-full`} onClick={onReset}>Change something and redo</button>
        </div>
      )}
      {extra}
    </Card>
  );
}

/** 3 x 3 position picker, like the one in other PDF tools. */
export function PosGrid({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Position on the page" className={`grid h-[84px] w-[84px] grid-cols-3 grid-rows-3 gap-px border border-stone-300 bg-stone-300 ${disabled ? "opacity-40" : ""}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={`Position ${i + 1}`} disabled={disabled} onClick={() => onChange(i)} className={`flex items-center justify-center ${value === i ? "bg-red-100" : "bg-white hover:bg-stone-100"}`}>
          {value === i && <span className="h-3 w-3 rounded-full bg-red-600" />}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-xs font-semibold text-stone-700 ${className}`}>{label}<div className="mt-1">{children}</div></label>;
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; l: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 bg-stone-100 p-1">
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)} className={`flex-1 px-2 py-1.5 text-xs font-semibold transition ${value === o.v ? "bg-white text-stone-900 shadow-sm ring-1 ring-stone-300" : "text-stone-600 hover:bg-white/60"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

/** Pass the open file to another EditPDF tool. Come back from there with the banner at the top. */
export function SendMenu({ from, file, label = "Send to tool" }: { from: string; file: { name: string; bytes: Uint8Array } | null; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={!file} className={`${btnPlain} flex w-full items-center justify-center gap-2`}><ArrowRightLeft size={15} />{label}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="text-[11px] font-normal text-stone-500">Opens this file there. Apply your changes first to keep them.</DropdownMenuLabel>
        {TOOLS.filter((t) => t.id !== from).map((t) => (
          <DropdownMenuItem key={t.id} onSelect={async () => { const f = (await currentFile()) ?? file; if (f) sendTo(from, t.id, f); }}>{t.label}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The two actions under "Create the file": pass the PDF to another tool, or start over with a new one. */
export function ToolActions({ from, file, onClear }: { from: string; file: { name: string; bytes: Uint8Array } | null; onClear: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-stone-200 pt-3">
      <SendMenu from={from} file={file} />
      <button type="button" className={`${btnPlain} flex w-full items-center justify-center gap-2`} onClick={onClear}><FilePlus2 size={15} />New PDF</button>
    </div>
  );
}
