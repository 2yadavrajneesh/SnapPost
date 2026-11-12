"use client";

import { useEffect, useRef, useState } from "react";
import { Card, btnPlain, btnPrimary, btnSm, field, useCopy } from "@/components/linkdesk/ui";
import { deleteResult, downloadHref, getConfig, runTool, uploadFile, type PdfConfig, type RunResult } from "@/lib/pdf/client";
import type { PdfTool } from "@/lib/pdf/tools";

type Item = { id: number; file: File };
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
let seq = 0;

export default function ToolWorkspace({ tool }: { tool: PdfTool }) {
  const [cfg, setCfg] = useState<PdfConfig | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [opts, setOpts] = useState<Record<string, string | number | boolean>>(() => Object.fromEntries(tool.options.map((o) => [o.id, o.default])));
  const [busy, setBusy] = useState<"" | "upload" | "process">("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const copy = useCopy();

  useEffect(() => {
    getConfig().then(setCfg).catch(() => setError("Could not reach the server."));
  }, []);

  const max = cfg?.maxFileBytes ?? 25 * 1048576;
  const limit = tool.multiple ? (cfg?.maxFiles ?? 20) : 1;

  function add(list: FileList | File[]) {
    setError("");
    setResult(null);
    const next: Item[] = [];
    for (const f of Array.from(list)) {
      const okType = tool.kind === "pdf" ? /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) : /^image\//.test(f.type);
      if (!okType) {
        setError(`${f.name} is not a ${tool.kind === "pdf" ? "PDF" : "supported image"}.`);
        continue;
      }
      if (f.size > max) {
        setError(`${f.name} is larger than ${size(max)}.`);
        continue;
      }
      next.push({ id: ++seq, file: f });
    }
    setItems((cur) => (tool.multiple ? [...cur, ...next].slice(0, limit) : next.slice(0, 1)));
  }
  const move = (i: number, d: number) =>
    setItems((cur) => {
      const a = [...cur];
      const j = i + d;
      if (j < 0 || j >= a.length) return a;
      [a[i], a[j]] = [a[j], a[i]];
      return a;
    });

  async function run() {
    setError("");
    setResult(null);
    try {
      setBusy("upload");
      setPct(0);
      const done = [];
      for (let i = 0; i < items.length; i++) done.push(await uploadFile(items[i].file, cfg?.mode ?? "off", (p) => setPct(Math.round(((i + p / 100) / items.length) * 100))));
      setBusy("process");
      setResult(await runTool(tool.id, done, opts));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }
  function reset() {
    if (result) deleteResult(result.url);
    setItems([]);
    setResult(null);
    setError("");
  }

  const visible = tool.options.filter((o) => !o.showIf || String(opts[o.showIf.id]) === o.showIf.value);
  const ready = items.length >= tool.min && !busy && cfg?.mode !== "off";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card step={1} title={tool.multiple ? "Add your files" : "Add your file"} chip={items.length ? <span className="text-[11px] font-semibold text-stone-600">{items.length} added</span> : undefined}>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 border-2 border-dashed px-4 py-8 text-center transition ${over ? "border-accent bg-white" : "border-stone-300 bg-stone-50 hover:bg-white"}`}
          >
            <input ref={input} type="file" hidden multiple={tool.multiple} accept={tool.accept} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ""; }} />
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>
            <strong className="text-sm text-stone-900">Drop {tool.multiple ? "files" : "a file"} here, or click to choose</strong>
            <small className="text-[11px] text-stone-500">Up to {size(max)} each{tool.multiple ? `, ${limit} files at most` : ""}</small>
          </label>
          {items.length > 0 && (
            <ul className="mt-3 divide-y divide-stone-200 border border-stone-200 bg-white">
              {items.map((it, i) => (
                <li key={it.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                  <span className="w-5 text-stone-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-stone-800">{it.file.name}</span>
                  <span className="text-stone-500">{size(it.file.size)}</span>
                  {tool.multiple && (
                    <>
                      <button type="button" className={btnSm} onClick={() => move(i, -1)} disabled={i === 0 || !!busy} aria-label="Move up">↑</button>
                      <button type="button" className={btnSm} onClick={() => move(i, 1)} disabled={i === items.length - 1 || !!busy} aria-label="Move down">↓</button>
                    </>
                  )}
                  <button type="button" className={btnSm} onClick={() => setItems((c) => c.filter((x) => x.id !== it.id))} disabled={!!busy} aria-label={`Remove ${it.file.name}`}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {visible.length > 0 && (
          <Card step={2} title="Options">
            <div className="grid gap-3 sm:grid-cols-2">
              {visible.map((o) => (
                <label key={o.id} className="block text-xs font-semibold text-stone-700">
                  {o.type === "checkbox" ? null : o.label}
                  {o.type === "select" ? (
                    <select className={`${field} mt-1`} value={String(opts[o.id])} onChange={(e) => setOpts({ ...opts, [o.id]: e.target.value })}>
                      {o.choices?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  ) : o.type === "checkbox" ? (
                    <span className="flex items-center gap-2"><input type="checkbox" checked={!!opts[o.id]} onChange={(e) => setOpts({ ...opts, [o.id]: e.target.checked })} />{o.label}</span>
                  ) : (
                    <input className={`${field} mt-1`} type={o.type === "number" ? "number" : o.type === "password" ? "password" : "text"} autoComplete={o.type === "password" ? "new-password" : "off"} min={o.min} max={o.max} placeholder={o.placeholder} value={String(opts[o.id])} onChange={(e) => setOpts({ ...opts, [o.id]: o.type === "number" ? Number(e.target.value) : e.target.value })} />
                  )}
                  {o.help && <small className="mt-1 block font-normal text-stone-500">{o.help}</small>}
                </label>
              ))}
            </div>
          </Card>
        )}
      </div>

      <aside className="space-y-4 self-start lg:sticky lg:top-0">
        <Card title={result ? "Your file is ready" : "Run"}>
          {cfg?.mode === "off" && <p className="mb-3 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">File storage is not set up on this site yet.</p>}
          {!result && (
            <button type="button" className={`${btnPrimary} w-full`} disabled={!ready} onClick={run}>
              {busy === "upload" ? `Uploading ${pct}%` : busy === "process" ? "Working on it…" : tool.action}
            </button>
          )}
          {!result && items.length < tool.min && <p className="mt-2 text-[11px] text-stone-500">Add {tool.min - items.length} more file{tool.min - items.length > 1 ? "s" : ""} to continue.</p>}
          {error && <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
          {result && (
            <div className="space-y-2">
              <p className="truncate text-xs font-semibold text-stone-800">{result.name}</p>
              <p className="text-[11px] text-stone-500">{size(result.size)}. The link works for about {cfg?.ttlMinutes ?? 30} minutes, then the file is deleted.</p>
              <a className={`${btnPrimary} w-full`} href={downloadHref(result.url)} download={result.name}>Download</a>
              <button type="button" className={`${btnPlain} w-full`} onClick={() => copy(result.url, "Link copied.")}>Copy link</button>
              <button type="button" className={`${btnPlain} w-full`} onClick={reset}>Delete now and start over</button>
            </div>
          )}
        </Card>
        <p className="px-1 text-[11px] leading-relaxed text-stone-500">Your files are processed on the server and removed right after. Results are deleted automatically after {cfg?.ttlMinutes ?? 30} minutes.</p>
      </aside>
    </div>
  );
}
