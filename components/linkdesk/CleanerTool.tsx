"use client";

import { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/Icons";
import { sDel, sGet, sSet, useSessionSnapshot } from "@/lib/session";
import { checkFileSize, LIMITS, plural } from "@/lib/linkdesk/core";
import { cleanText, workbookText, type CleanItem, type CleanOpts, type QueryMode, type Rejected } from "@/lib/linkdesk/clean";
import { getXLSX } from "@/lib/linkdesk/loader";
import { useLinks } from "@/lib/linkdesk/store";
import { downloadBlob } from "@/lib/export";
import { btnPlain, btnPrimary, btnSm, btnIcon, Card, Check, Chip, DropZone, field, useCopy, useToast } from "./ui";

const PAGE = 300;

type Inbox = { text: string; name: string; n: number } | null;
type Flags = { wrap: boolean; dedupe: boolean; bare: boolean; anchor: boolean; slash: boolean; https: boolean };

/** One probe: does the website answer at all? (Browsers cannot read the answer, so this only shows reachability.) */
async function probe(url: string): Promise<"ok" | "bad"> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ac.signal });
    return "ok";
  } catch {
    return "bad";
  } finally {
    clearTimeout(t);
  }
}

export default function CleanerTool({ inbox, onSent }: { inbox: Inbox; onSent: () => void }) {
  const L = useLinks();
  const toast = useToast();
  const copy = useCopy();
  const [text, setText] = useState("");
  const [query, setQuery] = useState<QueryMode>("smart");
  const [flags, setFlags] = useState<Flags>({ wrap: true, dedupe: true, bare: true, anchor: false, slash: false, https: false });
  const [items, setItems] = useState<CleanItem[]>([]);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [dups, setDups] = useState(0);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [fileTitle, setFileTitle] = useState("");

  useSessionSnapshot("linkdesk:cleaner", { text, query, flags, items, rejected, dups, name, fileTitle }, (v) => {
    setText(v.text ?? "");
    setQuery(v.query ?? "smart");
    if (v.flags) setFlags(v.flags);
    setItems(v.items ?? []);
    setRejected(v.rejected ?? []);
    setDups(v.dups ?? 0);
    setName(v.name ?? "");
    setFileTitle(v.fileTitle ?? "");
  });
  const fileText = useRef<{ text: string; name: string } | null>(null);
  const token = useRef(0);

  const optsOf = (q: QueryMode, f: Flags): CleanOpts => ({ query: q, track: q !== "keep", ...f });

  function process(body: string, label: string, q = query, f = flags) {
    token.current++;
    const r = cleanText(body, optsOf(q, f));
    setItems(r.items);
    setRejected(r.rejected);
    setDups(r.dups);
    setNote(r.note);
    setBusy("");
    setName(label);
    setLimit(PAGE);
  }

  // text typed or pasted is cleaned a moment after the last key
  useEffect(() => {
    if (fileText.current) return;
    const t = setTimeout(() => process(text, text.trim() ? "Pasted text" : ""), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // links handed over from another tool (Extract links -> Clean these links)
  useEffect(() => {
    if (!inbox) return;
    fileText.current = null;
    setFileTitle("");
    setText(inbox.text);
    process(inbox.text, inbox.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox?.n]);

  const rerun = (q: QueryMode, f: Flags) => {
    if (fileText.current) process(fileText.current.text, fileText.current.name, q, f);
    else process(text, text.trim() ? "Pasted text" : "", q, f);
  };
  const setFlag = (k: keyof Flags, v: boolean) => {
    const f = { ...flags, [k]: v };
    setFlags(f);
    rerun(query, f);
  };

  async function readFile(file: File) {
    const tooBig = checkFileSize(file);
    if (tooBig) return toast(tooBig, "warn");
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    try {
      let body: string;
      if (/^(xlsx|xls|ods)$/.test(ext)) {
        const XLSX = await getXLSX();
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        for (const n of wb.SheetNames) {
          const ref = wb.Sheets[n]?.["!ref"];
          if (ref) {
            const r = XLSX.utils.decode_range(ref);
            if ((r.e.r - r.s.r + 1) * (r.e.c - r.s.c + 1) > LIMITS.MAX_CELLS) throw new Error("big");
          }
        }
        body = workbookText(wb);
      } else body = await file.text();
      fileText.current = { text: body, name: file.name };
      setFileTitle(file.name);
      setText("");
      process(body, file.name);
    } catch (err) {
      toast(err instanceof Error && err.message === "big" ? "That spreadsheet is too large. The limit is 1,000,000 cells." : "That file could not be read.", "warn");
    }
  }

  /* reachability check: six at a time */
  async function runCheck() {
    if (!items.length) return;
    const my = ++token.current;
    setBusy("Testing your connection...");
    setNote("");
    if ((await probe("https://www.gstatic.com/generate_204")) !== "ok") {
      if (my !== token.current) return;
      setBusy("");
      setNote("Link checking is not available here because the page cannot reach other websites. Try it on your own site (for example on Vercel).");
      return;
    }
    const mixed = (it: CleanItem) => location.protocol === "https:" && /^http:/i.test(it.url);
    const next = items.map((it) => ({ ...it, state: (mixed(it) ? "unknown" : "") as CleanItem["state"] }));
    setItems(next);
    const list = next.filter((it) => !mixed(it));
    let i = 0;
    let done = 0;
    const worker = async () => {
      while (i < list.length && my === token.current) {
        const it = list[i++];
        it.state = await probe(it.url);
        done++;
        setBusy(`Checking ${done} of ${list.length}...`);
        if (done % 5 === 0) setItems([...next]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, list.length) }, worker));
    if (my !== token.current) return;
    setItems([...next]);
    setBusy("");
    const bad = next.filter((it) => it.state === "bad").length;
    setNote((bad ? `${plural(bad, "link")} did not respond. ` : "Every site responded. ") + 'A site that responds can still show "page not found" for a specific page, because browsers do not let a page read that.');
  }

  const hasBad = items.some((i) => i.state === "bad");

  async function downloadXlsx() {
    if (!items.length) return;
    let XLSX;
    try {
      XLSX = await getXLSX();
    } catch {
      return toast("The spreadsheet writer did not load. Try again.", "warn");
    }
    const aoa: (string | number)[][] = [["#", "Original", "Clean link", "What was removed", "Responds"], ...items.map((it, i) => [i + 1, it.orig, it.url, it.changes.join("; "), it.state === "ok" ? "Yes" : it.state === "bad" ? "No" : ""])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    items.forEach((it, i) => {
      const c = ws["C" + (i + 2)];
      if (c) c.l = { Target: it.url, Tooltip: it.url };
    });
    ws["!cols"] = [{ wch: 5 }, { wch: 60 }, { wch: 60 }, { wch: 36 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clean links");
    const base = name.replace(/\.[^.]+$/, "") || "links";
    downloadBlob(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}-clean.xlsx`);
    toast(`Saved ${base}-clean.xlsx`);
  }

  function send() {
    const r = L.setLinks(items.map((it, i) => ({ url: it.url, label: `Clean link ${i + 1}`, row: i + 1 })), { name, sample: false });
    toast(`Sent ${plural(items.length - r.skipped, "link")} to batches.`);
    onSent();
  }

  const n = items.length;
  const changed = items.filter((i) => i.changes.length).length;
  const bits = [`${changed} cleaned`, `${n - changed} already clean`];
  if (dups) bits.push(`${plural(dups, "duplicate")} removed`);
  if (rejected.length) bits.push(`${rejected.length} rejected`);
  const shown = items.slice(0, limit);
  const has = n > 0;
  const copyAll = () => void copy(items.map((i) => i.url).join("\n"), `Copied ${plural(n, "link")}.`);

  return (
    <div className="space-y-4">
      <Card step={1} title="Paste messy links" chip={name && <Chip>{name}</Chip>}>
        <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        <label className="flex flex-col text-xs font-medium text-stone-600">
          One link per line, or any text that contains links
          <textarea
            value={text}
            onChange={(e) => {
              fileText.current = null;
              setFileTitle("");
              setText(e.target.value);
            }}
            spellCheck={false}
            placeholder={"Paste your links here, one per line.\n\nNote: tracking codes and redirect wrappers are removed, and so is everything after the ? when the page does not need it."}
            className="mt-1 h-40 w-full lg:flex-1 lg:min-h-[200px] resize-y border border-stone-300 bg-white p-2.5 font-mono text-xs text-stone-800 outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        <div className="flex flex-col gap-3">
          <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-stone-400 lg:hidden">or</div>
          <div className="lg:flex-1 [&>label]:h-full [&>label]:justify-center">
            <DropZone accept=".txt,.csv,.md,.html,.htm,.xlsx,.xls,.ods" title={fileTitle ? `${fileTitle}. Choose another file to replace it.` : "Drop a spreadsheet or text file or browse"} note=".xlsx, .xls, .csv, .txt, .md, .html. The file stays in your browser." onFile={(f) => void readFile(f)} />
          </div>
        </div>
      </div>
        <p role="note" className="text-[11px] text-stone-500">Maximum file size is 100 MB per file.</p>
        <label className="block text-xs font-medium text-stone-600">
          Everything after the ? in a link
          <select
            value={query}
            onChange={(e) => {
              const q = e.target.value as QueryMode;
              setQuery(q);
              rerun(q, flags);
            }}
            className={`${field} mt-1`}
          >
            <option value="smart">Remove it unless the page needs it (recommended)</option>
            <option value="all">Always remove it</option>
            <option value="tracking">Remove tracking codes only</option>
            <option value="keep">Keep it all</option>
          </select>
          <span className="mt-1 block text-[11px] font-normal text-stone-500">Example: x.com/user/status/123?a=abc becomes x.com/user/status/123. Search pages, YouTube videos and .php or .aspx pages keep what they need.</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check checked={flags.wrap} onChange={(v) => setFlag("wrap", v)}>Unwrap redirect links (Google, Facebook, Outlook)</Check>
          <Check checked={flags.dedupe} onChange={(v) => setFlag("dedupe", v)}>Remove duplicates</Check>
          <Check checked={flags.bare} onChange={(v) => setFlag("bare", v)}>Also clean bare domains such as <code>example.com</code></Check>
          <Check checked={flags.anchor} onChange={(v) => setFlag("anchor", v)}>Remove <code>#anchors</code></Check>
          <Check checked={flags.slash} onChange={(v) => setFlag("slash", v)}>Remove trailing slash</Check>
          <Check checked={flags.https} onChange={(v) => setFlag("https", v)}>Change <code>http</code> to <code>https</code></Check>
        </div>
      </Card>

      <section aria-live="polite" className="border border-stone-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-stone-900">{name}</div>
            <div className="text-xs text-stone-600">{n || rejected.length ? plural(n, "clean link") : "No links yet"}</div>
            {(n > 0 || rejected.length > 0) && <div className="text-[11px] text-stone-500">{bits.join(". ")}.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPlain} disabled={!has || !!busy} onClick={() => (hasBad ? (setItems((l) => l.filter((it) => it.state !== "bad")), setNote("Links with no response were removed.")) : void runCheck())}>
              {hasBad ? "Remove no-response links" : "Check they respond"}
            </button>
            <button type="button" className={btnPlain} disabled={!has} onClick={copyAll}><Ico n="copy" />Copy links</button>
            <button type="button" className={btnPlain} disabled={!has} onClick={() => void downloadXlsx()}><Ico n="sheet" />Download .xlsx</button>
            <button type="button" className={btnPrimary} disabled={!has} onClick={send}>Send to batches</button>
          </div>
        </div>
        {busy && <div className="border-t border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-600">{busy}</div>}
        {note && <div className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">{note}</div>}
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Original</th><th className="px-3 py-2">Clean link</th><th className="px-3 py-2">What was removed</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {!has ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-stone-500">Note: paste messy links above or add a file. Your clean links appear here, with tracking codes, redirect wrappers and garbage lines removed.</td></tr>
              ) : (
                shown.map((it, i) => (
                  <tr key={i} className="border-t border-stone-200 align-top">
                    <td className="px-3 py-2 tabular-nums text-stone-500">{i + 1}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-stone-500" title={it.orig}>{it.orig}</td>
                    <td className="max-w-[20rem] truncate px-3 py-2"><a href={it.url} target="_blank" rel="noopener noreferrer" title={it.url} className="text-accent hover:underline">{it.url}</a></td>
                    <td className="px-3 py-2">
                      {it.changes.length ? (
                        <span className="flex flex-wrap gap-1">{it.changes.map((c) => <span key={c} className="bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">{c}</span>)}</span>
                      ) : (
                        <span className="text-stone-400">No change</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {it.state === "ok" ? <span className="border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">Responds</span> : it.state === "bad" ? <span className="border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">No response</span> : it.state === "unknown" ? <span title="This page is on https and cannot test http links" className="text-[10px] font-semibold text-stone-500">Can&apos;t check</span> : <span className="text-stone-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex gap-1">
                        <button title="Copy" type="button" className={btnIcon} aria-label="Copy this link" onClick={() => void copy(it.url, "Copied the link.")}><Ico n="copy" /></button>
                        <button title="Remove" type="button" className={btnIcon} aria-label="Remove this link" onClick={() => setItems((l) => l.filter((_, k) => k !== i))}><Ico n="x" /></button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {has && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-4 py-2 text-[11px] text-stone-500">
              <span>Showing {shown.length} of {n}. &quot;Responds&quot; means the website answered. It does not prove the exact page exists.</span>
              {n > shown.length && <button type="button" className={btnSm} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, n - shown.length)} more</button>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-xs text-stone-600">Finished cleaning? Take all the links with you.</span>
              <span className="flex gap-2">
                <button type="button" className={btnPlain} onClick={copyAll}><Ico n="copy" />Copy all links</button>
                <button type="button" className={btnPrimary} onClick={() => void downloadXlsx()}><Ico n="sheet" />Download Excel (.xlsx)</button>
              </span>
            </div>
          </>
        )}
        {rejected.length > 0 && (
          <details className="border-t border-stone-200 px-4 py-3 text-xs">
            <summary className="cursor-pointer font-semibold text-stone-700">{plural(rejected.length, "line")} removed as garbage</summary>
            <ul className="mt-2 space-y-1">
              {rejected.slice(0, 200).map((r, i) => (
                <li key={i} className="flex justify-between gap-3 text-stone-600"><span className="min-w-0 truncate">{r.orig.slice(0, 160)}</span><span className="flex-none text-stone-400">{r.reason}</span></li>
              ))}
              {rejected.length > 200 && <li className="text-stone-400">And {rejected.length - 200} more</li>}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
