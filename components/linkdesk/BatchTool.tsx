"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ico } from "@/components/Icons";
import { host, LIMITS, checkFileSize, looksLikeUrl, plural, type RawLink } from "@/lib/linkdesk/core";
import { getXLSX } from "@/lib/linkdesk/loader";
import { useLinks } from "@/lib/linkdesk/store";
import { btn, btnPlain, btnPrimary, btnSm, btnIcon, Card, Check, Chip, DropZone, field, useCopy, useToast } from "./ui";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sheet = { ws: any; rows: any[][]; range: any };

const PAGE = 150;
const PRESETS = [10, 20, 30, 50];

function bestLabel(row: any[], urlCol: number, labelChoice: string, r: number): string {
  if (labelChoice !== "none") {
    const v = String(row[parseInt(labelChoice, 10)] ?? "").trim();
    if (v) return v;
  }
  for (let i = 0; i < row.length; i++) {
    if (i === urlCol) continue;
    const s = String(row[i] ?? "").trim();
    if (s && !looksLikeUrl(s)) return s;
  }
  return `Row ${r + 1}`;
}

const SAMPLE: [string, string][] = [
  ["Google Search", "https://www.google.com"], ["Wikipedia", "https://en.wikipedia.org"], ["GitHub Explore", "https://github.com/explore"],
  ["Stack Overflow", "https://stackoverflow.com/questions"], ["MDN Web Docs", "https://developer.mozilla.org"], ["Hacker News", "https://news.ycombinator.com"],
  ["Product Hunt", "https://www.producthunt.com"], ["Tailwind CSS Docs", "https://tailwindcss.com/docs"], ["SheetJS", "https://sheetjs.com"],
  ["npm Registry", "https://www.npmjs.com"], ["Cloudflare Radar", "https://radar.cloudflare.com"], ["Internet Archive", "https://archive.org"],
  ["W3C", "https://www.w3.org"], ["Python Docs", "https://docs.python.org/3/"], ["Rust Language", "https://www.rust-lang.org"],
  ["Go Dev", "https://go.dev"], ["TypeScript Handbook", "https://www.typescriptlang.org/docs/"], ["React Docs", "https://react.dev"],
  ["Vue Guide", "https://vuejs.org/guide/introduction.html"], ["Svelte", "https://svelte.dev"],
];

export default function BatchTool({ active }: { active: boolean }) {
  const L = useLinks();
  const toast = useToast();
  const copy = useCopy();

  // spreadsheet being read
  const wb = useRef<any>(null);
  const XL = useRef<any>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [cols, setCols] = useState<{ i: number; name: string }[]>([]);
  const [urlChoice, setUrlChoice] = useState("auto");
  const [labelChoice, setLabelChoice] = useState("none");

  // table + launching
  const [status, setStatus] = useState<"all" | "pending" | "opened">("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [manual, setManual] = useState<number[]>([]);
  const [manualTotal, setManualTotal] = useState(0);
  const [resetArmed, setResetArmed] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [append, setAppend] = useState(false);
  const manualRef = useRef<HTMLElement>(null);

  const { items, size } = L;
  const total = items.length;
  const nBatches = Math.ceil(total / size);
  const start = (b: number) => (b - 1) * size;
  const batchItems = (b: number) => items.slice(start(b), start(b) + size);
  const nextBatch = useMemo(() => {
    for (let b = 1; b <= nBatches; b++) if (items.slice((b - 1) * size, b * size).some((i) => !i.opened)) return b;
    return 0;
  }, [items, size, nBatches]);
  const opened = items.filter((i) => i.opened).length;
  const pct = total ? Math.round((opened / total) * 100) : 0;

  // new list or size => the one-by-one panel no longer matches
  useEffect(() => setManual([]), [size, total]);

  /* ----- reading a spreadsheet ----- */
  const readSheet = (name: string): Sheet | null => {
    const ws = wb.current?.Sheets?.[name];
    if (!ws || !XL.current) return null;
    return { ws, rows: XL.current.utils.sheet_to_json(ws, { header: 1, defval: "", blankrows: true }), range: ws["!ref"] ? XL.current.utils.decode_range(ws["!ref"]) : null };
  };

  function extract(name: string, uChoice: string, lChoice: string, fileName: string) {
    const sh = readSheet(name);
    if (!sh) return;
    const XLSX = XL.current;
    const out: RawLink[] = [];
    sh.rows.forEach((row, r) => {
      if (!row || !row.length) return;
      const take = (c: number) => {
        let url = "";
        if (sh.range) {
          const obj = sh.ws[XLSX.utils.encode_cell({ r: sh.range.s.r + r, c: sh.range.s.c + c })];
          const t = obj?.l?.Target ? String(obj.l.Target).trim() : "";
          if (t && (/^https?:\/\//i.test(t) || looksLikeUrl(t))) url = t;
        }
        const text = String(row[c] ?? "").trim();
        if (!url && looksLikeUrl(text)) url = text;
        if (url) out.push({ url, label: bestLabel(row, c, lChoice, r), row: r + 1 });
      };
      if (uChoice === "auto") row.forEach((_, c) => take(c));
      else take(parseInt(uChoice, 10));
    });
    const res = L.setLinks(out, { name: fileName, sample: false });
    setBatchFilter("all");
    setLimit(PAGE);
    if (out.length - res.skipped > 0) toast(`Found ${plural(Math.min(out.length - res.skipped, LIMITS.MAX_LINKS), "link")} in ${plural(Math.ceil(Math.min(out.length - res.skipped, LIMITS.MAX_LINKS) / size), "batch")} of ${size}.`);
    else toast("No links found. Try a different link column.", "warn");
    if (res.skipped) toast(`${plural(res.skipped, "row")} skipped because the link had no http or https prefix.`, "warn");
    if (res.capped) toast(`Only the first ${LIMITS.MAX_LINKS.toLocaleString()} links were kept.`, "warn");
  }

  function pickSheet(name: string, fileName: string) {
    const sh = readSheet(name);
    if (!sh) return;
    if (!sh.rows.length) {
      toast("That worksheet is empty.", "warn");
      return;
    }
    const maxCols = sh.rows.reduce((m, r) => Math.max(m, r.length), 0);
    const first = sh.rows[0] ?? [];
    const list: { i: number; name: string }[] = [];
    let best = -1;
    let bestCount = 0;
    for (let c = 0; c < maxCols; c++) {
      const head = String(first[c] ?? "").trim();
      let count = 0;
      for (let r = 0; r < Math.min(sh.rows.length, 50); r++) if (looksLikeUrl(String(sh.rows[r]?.[c] ?? "").trim())) count++;
      if (count > bestCount) {
        bestCount = count;
        best = c;
      }
      list.push({ i: c, name: `Column ${XL.current.utils.encode_col(c)}${head ? ": " + head.slice(0, 26) : ""}` });
    }
    const u = best !== -1 && bestCount >= 2 ? String(best) : "auto";
    setSheetName(name);
    setCols(list);
    setUrlChoice(u);
    setLabelChoice("none");
    extract(name, u, "none", L.source?.name ?? fileName);
  }

  async function readFile(file: File) {
    const tooBig = checkFileSize(file);
    if (tooBig) return toast(tooBig, "warn");
    try {
      XL.current = await getXLSX();
    } catch {
      return toast("The spreadsheet reader did not load. Use Paste links instead.", "warn");
    }
    try {
      const book = XL.current.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
      for (const n of book.SheetNames) {
        const ref = book.Sheets[n]?.["!ref"];
        if (ref) {
          const r = XL.current.utils.decode_range(ref);
          if ((r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1) > LIMITS.MAX_CELLS) throw new Error("big");
        }
      }
      wb.current = book;
      setSheets(book.SheetNames);
      pickSheet(book.SheetNames[0], file.name);
    } catch (err) {
      wb.current = null;
      setSheets([]);
      setCols([]);
      toast(err instanceof Error && err.message === "big" ? "That spreadsheet is too large. The limit is 1,000,000 cells." : "That file could not be read. Use a valid .xlsx, .xls or .csv file.", "warn");
    }
  }

  const forgetSheet = () => {
    wb.current = null;
    setSheets([]);
    setCols([]);
  };

  function loadSample() {
    forgetSheet();
    const raw: RawLink[] = [];
    for (let i = 1; i <= 45; i++) {
      const b = SAMPLE[(i - 1) % SAMPLE.length];
      raw.push({ label: `${b[0]} (row ${i})`, url: `${b[1]}${b[1].includes("?") ? "&" : "?"}item=${i}`, row: i });
    }
    L.setLinks(raw, { name: "Sample list", sample: true });
  }

  function importPasted() {
    let txt = pasteText;
    if (txt.length > LIMITS.MAX_TEXT) {
      txt = txt.slice(0, LIMITS.MAX_TEXT);
      toast("The pasted text was very long. Only the first 2 million characters were read.", "warn");
    }
    const add: RawLink[] = [];
    txt.split(/\r?\n/).forEach((line, idx) => {
      const parts = line.split("\t").map((s) => s.trim()).filter(Boolean);
      let url = "";
      let label = "";
      parts.forEach((p) => {
        if (!url && looksLikeUrl(p)) url = p;
        else if (!label) label = p;
      });
      if (url) add.push({ url, label: label || `Pasted row ${idx + 1}`, row: idx + 1 });
    });
    if (!add.length) return toast("No links found in the pasted text.", "warn");
    const doAppend = append && total > 0 && !L.source?.sample;
    forgetSheet();
    L.setLinks(doAppend ? L.raw.concat(add) : add, { name: "Pasted links", sample: false }, doAppend);
    setPasteText("");
    setPasteOpen(false);
    toast(`Imported ${plural(add.length, "link")}.`);
  }

  /* ----- launching ----- */
  function launch(indices: number[], label: string) {
    if (!indices.length) return;
    const done: number[] = [];
    let blocked: number[] = [];
    for (let k = 0; k < indices.length; k++) {
      let w: Window | null = null;
      try {
        w = window.open(items[indices[k]].url, "_blank");
      } catch {}
      if (w) {
        try {
          w.opener = null;
        } catch {}
        done.push(indices[k]);
      } else {
        blocked = indices.slice(k);
        break;
      }
    }
    L.markOpened(done);
    setManual(blocked);
    setManualTotal(blocked.length);
    if (blocked.length) {
      toast(done.length ? `Opened ${done.length}. The browser blocked the other ${blocked.length}.` : "The browser blocked the new tabs. Use the list below.", "warn");
      setTimeout(() => manualRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }), 50);
    } else toast(`${label}: opened ${plural(done.length, "tab")}.`);
  }
  const pendingIndices = (b: number) => {
    const s = start(b);
    const out: number[] = [];
    batchItems(b).forEach((it, i) => !it.opened && out.push(s + i));
    if (!out.length) batchItems(b).forEach((_, i) => out.push(s + i));
    return out;
  };
  const openNext = () => {
    if (!total) return;
    if (!nextBatch) return toast("Every batch is open. Reset the status to start again.");
    launch(pendingIndices(nextBatch), `Batch ${nextBatch}`);
  };

  // Alt + O opens the next batch while this tool is showing
  const openNextRef = useRef(openNext);
  openNextRef.current = openNext;
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openNextRef.current();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [active]);

  const resetAll = () => {
    L.setOpened(items.map((_, i) => i), false);
    setManual([]);
    toast("All links are pending again.");
  };

  const reportText = () =>
    ["#\tBatch\tTitle\tURL\tStatus\tOpened at", ...items.map((it, i) => [i + 1, `Batch ${Math.floor(i / size) + 1}`, it.label.replace(/\t/g, " "), it.url, it.opened ? "Opened" : "Pending", it.at ?? ""].join("\t"))].join("\n");

  /* ----- table ----- */
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { it: (typeof items)[number]; idx: number; b: number }[] = [];
    items.forEach((it, idx) => {
      const b = Math.floor(idx / size) + 1;
      if (status === "pending" && it.opened) return;
      if (status === "opened" && !it.opened) return;
      if (batchFilter !== "all" && String(b) !== batchFilter) return;
      if (q && !it.url.toLowerCase().includes(q) && !it.label.toLowerCase().includes(q)) return;
      out.push({ it, idx, b });
    });
    return out;
  }, [items, size, status, batchFilter, query]);
  const shown = rows.slice(0, limit);
  const bf = batchFilter !== "all" && Number(batchFilter) > nBatches ? "all" : batchFilter;

  const nb = nextBatch;
  const nbItems = nb ? batchItems(nb) : [];
  const pend = nbItems.filter((i) => !i.opened);
  const hosts = [...new Set(pend.map((i) => host(i.url)))];
  const manualCur = manual.length ? items[manual[0]] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-stone-500">Load a list of links, then open them in batches of 10 to 100 tabs, with progress saved in this browser.</p>
        <div className="flex gap-2">
          <button type="button" className={btnPlain} onClick={() => setPasteOpen(true)}><Ico n="clipboard" />Paste links</button>
          <button type="button" className={btnPlain} onClick={() => (total ? void copy(reportText(), "Copied the status report. Paste it into Excel or Sheets.") : toast("Load some links first.", "warn"))}>
            Copy report
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card step={1} title="Load links" chip={L.source && <Chip>{L.source.sample ? "Sample data" : L.source.name}</Chip>}>
          <p className="text-[11px] leading-snug text-stone-500">Your list and progress are saved in this browser, so a reload keeps them. They stay until you press Reset, and clear themselves after 7 days without use.</p>
          <DropZone accept=".xlsx,.xls,.csv,.txt" title="Drop a spreadsheet or browse" note=".xlsx, .xls or .csv. Links are found in any column." onFile={(f) => void readFile(f)} />
          {sheets.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-[11px] font-medium text-stone-600">
                Worksheet
                <select className={`${field} mt-1`} value={sheetName} onChange={(e) => pickSheet(e.target.value, L.source?.name ?? "")}>
                  {sheets.map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-medium text-stone-600">
                Link column
                <select className={`${field} mt-1`} value={urlChoice} onChange={(e) => (setUrlChoice(e.target.value), extract(sheetName, e.target.value, labelChoice, L.source?.name ?? ""))}>
                  <option value="auto">Find links in every column</option>
                  {cols.map((c) => <option key={c.i} value={c.i}>{c.name}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-medium text-stone-600">
                Title column
                <select className={`${field} mt-1`} value={labelChoice} onChange={(e) => (setLabelChoice(e.target.value), extract(sheetName, urlChoice, e.target.value, L.source?.name ?? ""))}>
                  <option value="none">First text column</option>
                  {cols.map((c) => <option key={c.i} value={c.i}>{c.name}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-stone-600">{total ? <><b>{total}</b> links in <b>{nBatches}</b> {nBatches === 1 ? "batch" : "batches"}</> : "No links loaded yet."}</p>
            <button type="button" onClick={loadSample} className="text-xs font-semibold text-accent hover:underline">Use sample list</button>
          </div>
        </Card>

        <Card step={2} title="Launch" chip={<Chip>{size} per batch</Chip>}>
          {!total ? (
            <p className="text-sm text-stone-500">Load a spreadsheet, paste links, or use the sample list to get started.</p>
          ) : !nb ? (
            <div className="space-y-3">
              <div className="text-sm font-bold text-emerald-700">All {total} links opened</div>
              <p className="text-[11px] text-stone-500">Reset the status to run through the list again.</p>
              <button type="button" className={btnPlain} onClick={resetAll}>Start over</button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Next up</div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-2xl font-extrabold text-stone-900">Batch {nb}</span>
                  <span className="text-xs text-stone-500">of {nBatches} · links {start(nb) + 1} to {start(nb) + nbItems.length}</span>
                </div>
                <p className="mt-1 truncate text-xs text-stone-600">{hosts.slice(0, 4).join(", ")}{hosts.length > 4 ? ` and ${hosts.length - 4} more` : ""}</p>
              </div>
              <button type="button" className={`${btnPrimary} h-11 w-full text-sm`} onClick={openNext}>Open {plural(pend.length, "tab")}</button>
              <p className="text-[11px] text-stone-500">Shortcut <kbd className="border border-stone-300 px-1">Alt</kbd> + <kbd className="border border-stone-300 px-1">O</kbd>. Allow pop-ups for this page if only one tab opens.</p>
            </div>
          )}
          {total > 0 && (
            <div>
              <div className="h-2 bg-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex gap-4 text-[11px] text-stone-600">
                <span><b>{opened}</b> opened</span><span><b>{total - opened}</b> left</span><span><b>{pct}%</b> done</span>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-stone-200 pt-3">
            <div role="group" aria-label="Links per batch" className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-stone-600">Per batch</span>
              <button type="button" className={btnSm} aria-label="Fewer links per batch" onClick={() => L.setSize(size - 1)}>−</button>
              <input type="number" min={1} max={100} value={size} aria-label="Links per batch" onChange={(e) => L.setSize(Number(e.target.value))} className="h-8 w-14 border border-stone-300 bg-white text-center text-xs font-semibold" />
              <button type="button" className={btnSm} aria-label="More links per batch" onClick={() => L.setSize(size + 1)}>+</button>
            </div>
            <div className="flex gap-1">
              {PRESETS.map((n) => (
                <button key={n} type="button" aria-pressed={size === n} onClick={() => L.setSize(n)} className={`h-8 min-w-9 border px-2 text-[11px] font-semibold ${size === n ? "border-transparent bg-accent text-white" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"}`}>{n}</button>
              ))}
            </div>
            <Check checked={L.auto} onChange={L.setAuto}>Add <code>https://</code></Check>
            <Check checked={L.dedupe} onChange={L.setDedupe}>Remove duplicates</Check>
            <button
              type="button"
              className={`${btnSm} sm:ml-auto ${resetArmed ? "!border-red-600 !bg-red-600 !text-white" : ""}`}
              disabled={!total && size === 20 && L.auto && !L.dedupe}
              title="Clear the saved list and put every setting back to its default"
              onClick={() => {
                if (total && !resetArmed) {
                  setResetArmed(true);
                  setTimeout(() => setResetArmed(false), 3500);
                  return;
                }
                setResetArmed(false);
                forgetSheet();
                L.resetSession();
                toast("Session reset. The list and settings are cleared.");
              }}
            >
              {resetArmed ? "Click again to reset" : "Reset"}
            </button>
          </div>
        </Card>
      </div>

      {manualCur && (
        <section ref={manualRef} aria-live="polite" className="space-y-3 border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold">One link per click</h2>
            <span className="text-xs font-semibold">{manualTotal - manual.length} of {manualTotal} opened</span>
          </div>
          <div className="h-2 bg-amber-200"><div className="h-full bg-amber-600" style={{ width: `${Math.round(((manualTotal - manual.length) / manualTotal) * 100)}%` }} /></div>
          <p className="text-xs">New tabs are blocked in this view, so a batch opens one link at a time. Press the button, then come back for the next one. For all tabs at once, allow pop-ups for this site.</p>
          <div className="space-y-1 bg-white p-3 text-stone-800">
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Next link</div>
            <div className="truncate text-sm font-semibold">{manualCur.label}</div>
            <div className="truncate text-xs text-stone-500">{manualCur.url}</div>
            <a href={manualCur.url} target="_blank" rel="noopener noreferrer" onClick={() => (L.markOpened([manual[0]]), setManual((m) => m.slice(1)))} className={`${btnPrimary} mt-2 h-10`}>Open this link</a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSm} onClick={() => setManual((m) => [...m.slice(1), m[0]])}>Skip</button>
            <button title="Copy remaining" aria-label="Copy remaining" type="button" className={btnIcon} onClick={() => void copy(manual.map((i) => items[i].url).join("\n"), `Copied ${plural(manual.length, "link")}.`)}><Ico n="copy" /></button>
            <button type="button" className={btnSm} onClick={() => setManual([])}>Close</button>
          </div>
        </section>
      )}

      {total > 0 && (
        <section>
          <h2 className="text-sm font-bold text-stone-900">Batches</h2>
          <p className="mb-3 text-xs text-stone-500">Each square is one link. Filled squares have been opened.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: nBatches }, (_, k) => k + 1).map((b) => {
              const sl = batchItems(b);
              const done = sl.filter((i) => i.opened).length;
              const finished = done === sl.length;
              const isNext = b === nb;
              return (
                <article key={b} className={`border p-3 ${isNext ? "border-accent bg-white" : "border-stone-300 bg-white"} ${finished ? "opacity-70" : ""}`}>
                  <div className="flex items-center justify-between text-xs">
                    <b className="text-stone-900">Batch {b}</b>
                    {finished ? <span className="font-bold text-emerald-700">Done</span> : isNext ? <span className="font-bold text-accent">Next</span> : null}
                  </div>
                  <div className="mt-0.5 flex justify-between text-[11px] text-stone-500"><span>Links {start(b) + 1} to {start(b) + sl.length}</span><span>{done}/{sl.length}</span></div>
                  <div className="my-2.5 flex flex-wrap gap-[3px]" aria-hidden="true">
                    {sl.map((i, k) => <i key={k} className={`h-2.5 w-2.5 border ${i.opened ? "border-accent bg-accent" : "border-stone-300 bg-stone-100"}`} />)}
                  </div>
                  <div className="flex gap-1.5">
                    <button type="button" className={isNext ? `${btnSm} flex-1 border-transparent bg-accent text-white hover:brightness-110` : `${btnSm} flex-1`} onClick={() => launch(pendingIndices(b), `Batch ${b}`)}>
                      {finished ? "Open again" : `Open ${plural(sl.length - done, "tab")}`}
                    </button>
                    <button type="button" className={btnIcon} aria-label={`Copy links in batch ${b}`} title="Copy links" onClick={() => void copy(sl.map((x) => x.url).join("\n"), `Copied the links in batch ${b}.`)}><Ico n="copy" /></button>
                    {done > 0 && (
                      <button type="button" className={btnIcon} aria-label={`Mark batch ${b} as unopened`} title="Mark as unopened" onClick={() => (L.setOpened(sl.map((_, i) => start(b) + i), false), toast(`Batch ${b} is pending again.`))}><Ico n="undo" /></button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="border border-stone-300 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 p-3">
          <h2 className="mr-auto text-sm font-bold text-stone-900">Links</h2>
          <div role="group" aria-label="Filter by status" className="flex h-9 items-stretch gap-1 bg-stone-100 p-1">
            {(["all", "pending", "opened"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={status === f} onClick={() => (setStatus(f), setLimit(PAGE))} className={`px-2.5 py-1 text-xs font-medium capitalize ${status === f ? "bg-white text-stone-900" : "text-stone-500 hover:text-stone-800"}`}>{f}</button>
            ))}
          </div>
          <div className="relative">
            <select aria-label="Filter by batch" value={bf} onChange={(e) => (setBatchFilter(e.target.value), setLimit(PAGE))} className={`${field} h-9 !w-auto cursor-pointer appearance-none !py-0 !pl-3 !pr-8`}>
              <option value="all">All batches</option>
              {Array.from({ length: nBatches }, (_, k) => k + 1).map((b) => <option key={b} value={b}>Batch {b} ({start(b) + 1} to {Math.min(b * size, total)})</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2.5 top-1/2 -mt-[5px] text-stone-500" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
          </div>
          <button type="button" className={`${btnSm} !h-9`} disabled={!total} onClick={resetAll}><Ico n="reset" />Reset status</button>
          <button
            type="button"
            disabled={!total}
            className={`${btnSm} !h-9 ${clearArmed ? "!border-red-600 !bg-red-600 !text-white" : "!text-red-700"}`}
            onClick={() => {
              if (!clearArmed) {
                setClearArmed(true);
                setTimeout(() => setClearArmed(false), 3500);
                return;
              }
              setClearArmed(false);
              forgetSheet();
              L.clear();
              toast("Cleared the list.");
            }}
          >
            {clearArmed ? "Click again to confirm" : "Clear all"}
          </button>
          <input type="search" value={query} onChange={(e) => (setQuery(e.target.value), setLimit(PAGE))} placeholder="Search title or link" aria-label="Search links" className={`${field} h-9 !w-48 !py-0`} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Batch</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Link</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {!total ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-stone-500">No links loaded.</td></tr>
              ) : !shown.length ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-stone-500">No links match this filter.</td></tr>
              ) : (
                shown.map(({ it, idx, b }) => (
                  <tr key={idx} className={`border-t border-stone-200 ${it.opened ? "bg-stone-50 text-stone-500" : ""}`}>
                    <td className="px-3 py-2 tabular-nums text-stone-500">{idx + 1}</td>
                    <td className="px-3 py-2"><span className="bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold">B{b}</span></td>
                    <td className="max-w-[14rem] truncate px-3 py-2" title={it.label}>{it.label}</td>
                    <td className="max-w-[22rem] truncate px-3 py-2">
                      <a href={it.url} target="_blank" rel="noopener noreferrer" title={it.url} onClick={() => L.markOpened([idx])} className="text-accent hover:underline">{it.url}</a>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" aria-label="Toggle status" onClick={() => L.setOpened([idx], !it.opened)} className={`border px-2 py-0.5 text-[11px] font-semibold ${it.opened ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-stone-300 bg-white text-stone-600"}`}>
                        {it.opened ? `Opened${it.at ? " " + it.at : ""}` : "Pending"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex gap-1">
                        <button title="Copy" type="button" className={btnIcon} aria-label="Copy link" onClick={() => void copy(it.url, "Copied the link.")}><Ico n="copy" /></button>
                        <button title="Remove" type="button" className={btnIcon} aria-label="Remove link" onClick={() => (L.removeAt(idx), setManual([]))}><Ico n="x" /></button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 p-3 text-xs text-stone-500">
            <span>Showing {shown.length} of {rows.length} {rows.length === 1 ? "link" : "links"}</span>
            <span className="flex items-center gap-3">
              {rows.length > shown.length && <button type="button" className={btnSm} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, rows.length - shown.length)} more</button>}
            </span>
          </div>
        )}
      </section>

      {pasteOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={(e) => e.target === e.currentTarget && setPasteOpen(false)} onKeyDown={(e) => e.key === "Escape" && setPasteOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="ld-paste" className="w-full max-w-lg space-y-3 border border-stone-300 bg-white p-5">
            <h2 id="ld-paste" className="text-sm font-bold text-stone-900"><Ico n="clipboard" />Paste links</h2>
            <p className="text-[11px] text-stone-500">Copy a column from Excel, Numbers or Google Sheets and paste it here, one link per line. A title in the same row is kept.</p>
            <textarea autoFocus value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={"https://example.com/page-1\nhttps://example.com/page-2\nanthropic.com"} className="h-44 w-full resize-y border border-stone-300 bg-white p-2.5 font-mono text-xs" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Check checked={append} onChange={setAppend}>Add to current list</Check>
              <div className="flex gap-2">
                <button type="button" className={btn + " border-stone-300 bg-white text-stone-800 hover:bg-stone-100"} onClick={() => setPasteOpen(false)}>Cancel</button>
                <button type="button" className={btnPrimary} onClick={importPasted}>Import links</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
