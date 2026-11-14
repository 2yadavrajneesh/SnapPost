"use client";

import { useRef, useState } from "react";
import { sDel, sGet, sSet, useSessionSnapshot } from "@/lib/session";
import { checkFileSize, LIMITS, plural } from "@/lib/linkdesk/core";
import { getXLSX } from "@/lib/linkdesk/loader";
import { collectLinks, convertWorkbook, type MakerStats } from "@/lib/linkdesk/maker";
import { useLinks } from "@/lib/linkdesk/store";
import { downloadBlob } from "@/lib/export";
import { btnPlain, btnPrimary, Card, Check, Chip, DropZone, useToast } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_ROWS = 200;
const MAX_COLS = 14;

export default function MakerTool({ onSent }: { onSent: () => void }) {
  const L = useLinks();
  const toast = useToast();
  const XL = useRef<any>(null);
  const buf = useRef<ArrayBuffer | null>(null);
  const [name, setName] = useState("");
  const [bare, setBare] = useState(false);
  const [res, setRes] = useState<{ wb: any; stats: MakerStats } | null>(null);
  const [sheet, setSheet] = useState(0);
  const [msg, setMsg] = useState<{ text: string; kind: "" | "warn" | "ok" }>({ text: "", kind: "" });

  // the spreadsheet you opened comes back after a reload
  const restoredM = useSessionSnapshot("linkdesk:maker", { name, bare }, async (v) => {
    setBare(!!v.bare);
    const saved = v.name ? await sGet<{ name: string; bytes: ArrayBuffer }>("linkdesk:maker:file") : undefined;
    if (saved) await loadFile(new File([saved.bytes], saved.name));
  });
  void restoredM;

  /** Reads the saved file again and converts it (needed whenever "also link bare domains" changes). */
  function build(withBare: boolean) {
    if (!buf.current || !XL.current) return;
    const XLSX = XL.current;
    const wb = XLSX.read(buf.current, { type: "array" });
    for (const n of wb.SheetNames) {
      const ref = wb.Sheets[n]?.["!ref"];
      if (ref) {
        const r = XLSX.utils.decode_range(ref);
        if ((r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1) > LIMITS.MAX_CELLS) throw new Error("big");
      }
    }
    const stats = convertWorkbook(wb, withBare);
    setRes({ wb, stats });
    setSheet((s) => (s >= wb.SheetNames.length ? 0 : s));
    setMsg(
      stats.linked === 0
        ? { text: stats.already ? "Every link in this file is already clickable." : "No web addresses were found in this file.", kind: "warn" }
        : { text: stats.already ? `${stats.already} were already clickable and are kept.` : "Opens in Excel with every address clickable.", kind: "" },
    );
  }

  async function loadFile(file: File) {
    const tooBig = checkFileSize(file);
    if (tooBig) return setMsg({ text: tooBig, kind: "warn" });
    try {
      XL.current = await getXLSX();
    } catch {
      return setMsg({ text: "The spreadsheet reader did not load. Reload the page.", kind: "warn" });
    }
    const previous = buf.current;
    try {
      buf.current = await file.arrayBuffer();
      void sSet("linkdesk:maker:file", { name: file.name, bytes: buf.current });
      setName(file.name);
      setSheet(0);
      build(bare);
    } catch (e) {
      buf.current = previous;
      setMsg({ text: e instanceof Error && e.message === "big" ? "That spreadsheet is too large. The limit is 1,000,000 cells." : "That file could not be read. Check that it is a real Excel or CSV file.", kind: "warn" });
    }
  }

  const XLSX = XL.current;
  const links = res && XLSX ? collectLinks(XLSX, res.wb) : [];

  function download() {
    if (!res || !XLSX) return;
    const out = XLSX.write(res.wb, { bookType: "xlsx", type: "array" });
    const base = name.replace(/\.[^.]+$/, "") || "links";
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}-clickable.xlsx`);
    setMsg({ text: `Saved as ${base}-clickable.xlsx`, kind: "ok" });
  }

  function send() {
    if (!links.length) return;
    const r = L.setLinks(links, { name, sample: false });
    toast(`Sent ${plural(links.length - r.skipped, "link")} to batches.`);
    onSent();
  }

  // preview of the current sheet
  const sheetName = res?.wb.SheetNames[sheet];
  const ws = res && sheetName ? res.wb.Sheets[sheetName] : null;
  let table: React.ReactNode = <div className="p-8 text-center text-sm text-stone-500">Your converted sheet will appear here.</div>;
  let caption = "";
  if (res && XLSX) {
    if (!ws || !ws["!ref"]) table = <div className="p-8 text-center text-sm text-stone-500">This sheet is empty.</div>;
    else {
      const rng = XLSX.utils.decode_range(ws["!ref"]);
      const totalR = rng.e.r - rng.s.r + 1;
      const totalC = rng.e.c - rng.s.c + 1;
      const rows = Math.min(totalR, MAX_ROWS);
      const cols = Math.min(totalC, MAX_COLS);
      table = (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-10 border border-stone-200 bg-stone-100" />
              {Array.from({ length: cols }, (_, c) => <th key={c} className="border border-stone-200 bg-stone-100 px-2 py-1 font-semibold text-stone-500">{XLSX.utils.encode_col(rng.s.c + c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r}>
                <th scope="row" className="border border-stone-200 bg-stone-100 px-2 py-1 text-right font-semibold text-stone-500">{rng.s.r + r + 1}</th>
                {Array.from({ length: cols }, (_, c) => {
                  const cell = ws[XLSX.utils.encode_cell({ r: rng.s.r + r, c: rng.s.c + c })];
                  const txt = cell ? (cell.w != null ? cell.w : cell.v != null ? String(cell.v) : "") : "";
                  const isLink = cell?.l?.Target && /^(https?:|mailto:)/i.test(cell.l.Target);
                  return (
                    <td key={c} title={txt} className={`max-w-[16rem] truncate border border-stone-200 px-2 py-1 ${isLink ? "bg-blue-50" : ""}`}>
                      {isLink ? <a href={cell.l.Target} target="_blank" rel="noopener noreferrer" className="text-accent underline">{txt}</a> : txt}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
      caption = `Preview of sheet ${sheetName}. Cells with a blue background are clickable links.${totalR > rows || totalC > cols ? ` Showing ${rows} of ${totalR} rows and ${cols} of ${totalC} columns. The download contains all of them.` : ""}`;
    }
  }

  return (
    <div className="space-y-4">
      <Card step={1} title="Choose your Excel file" chip={name && <Chip>{name}</Chip>}>
        <DropZone accept=".xlsx,.xlsm,.xls,.csv,.ods" title={name ? `${name}. Choose another file to replace it.` : "Drop your Excel file or browse"} note=".xlsx, .xls or .csv. The file stays in your browser and is not uploaded anywhere." onFile={(f) => void loadFile(f)} />
        <Check checked={bare} onChange={(v) => { setBare(v); try { build(v); } catch {} }}>Also link bare domains such as <code>example.com</code></Check>
        <p className="text-[11px] text-stone-500">Only cells that contain nothing but the domain are linked this way. Cell colors and fonts are not carried over.</p>
      </Card>

      <section aria-live="polite" className="border border-stone-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-stone-900">{name}</div>
            <div className="text-xs text-stone-600">
              {res ? `${plural(res.stats.linked, "link")} made clickable${res.wb.SheetNames.length > 1 ? ` across ${plural(res.wb.SheetNames.length, "sheet")}` : ""}` : "No file loaded yet"}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className={btnPlain} disabled={!links.length} onClick={send}>Send to batches</button>
            <button type="button" className={btnPrimary} disabled={!res || res.stats.linked === 0} onClick={download}>Download clickable file</button>
          </div>
        </div>
        <p className={`px-4 pb-3 text-xs ${msg.kind === "warn" ? "font-semibold text-amber-800" : msg.kind === "ok" ? "font-semibold text-emerald-700" : "text-stone-500"}`}>
          {msg.text || "Note: choose an Excel or CSV file above. Every plain-text web address in it becomes a clickable link. Then you can download the new file or send the links to batches."}
        </p>
        {res && (
          <div role="tablist" aria-label="Sheets" className="flex gap-1 overflow-x-auto border-t border-stone-200 bg-stone-50 p-1.5">
            {res.wb.SheetNames.map((n: string, i: number) => (
              <button key={n} type="button" role="tab" aria-selected={i === sheet} onClick={() => setSheet(i)} className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-xs font-medium ${i === sheet ? "bg-white text-stone-900" : "text-stone-500 hover:text-stone-800"}`}>
                {n}
                <span className="bg-stone-200 px-1.5 text-[10px] font-bold">{res.stats.per[i].n}</span>
              </button>
            ))}
          </div>
        )}
        <div className="max-h-[480px] overflow-auto border-t border-stone-200">{table}</div>
        {caption && <p className="border-t border-stone-200 px-4 py-2 text-[11px] text-stone-500">{caption}</p>}
      </section>
    </div>
  );
}
