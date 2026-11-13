"use client";

import { useEffect, useRef, useState } from "react";
import { checkFileSize, LIMITS, plural } from "@/lib/linkdesk/core";
import { getXLSX } from "@/lib/linkdesk/loader";
import { finish, fromText, readDocx, readPdf, type ExtractOpts, type Found } from "@/lib/linkdesk/extract";
import { useLinks } from "@/lib/linkdesk/store";
import { downloadBlob } from "@/lib/export";
import { btnPlain, btnPrimary, btnSm, Card, Check, Chip, DropZone, useCopy, useToast } from "./ui";

const PAGE = 300;

export default function ExtractTool({ onSent, onClean }: { onSent: () => void; onClean?: (text: string, name: string) => void }) {
  const L = useLinks();
  const toast = useToast();
  const copy = useCopy();
  const [text, setText] = useState("");
  const [opts, setOpts] = useState<ExtractOpts>({ dedupe: true, repair: true, bare: false });
  const [items, setItems] = useState<Found[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const file = useRef<File | null>(null);
  const job = useRef(0);

  function show(list: Found[], label: string, n = "") {
    let out = list;
    let nt = n;
    if (out.length > LIMITS.MAX_LINKS) {
      out = out.slice(0, LIMITS.MAX_LINKS);
      nt = (nt ? nt + " " : "") + `Only the first ${LIMITS.MAX_LINKS.toLocaleString()} links are kept.`;
    }
    setItems(out);
    setName(label);
    setNote(nt);
    setBusy("");
    setLimit(PAGE);
  }

  function runText(t: string, o: ExtractOpts) {
    let body = t;
    let cut = "";
    if (body.length > LIMITS.MAX_TEXT) {
      body = body.slice(0, LIMITS.MAX_TEXT);
      cut = "The text was very long. Only the first 2 million characters were read.";
    }
    show(finish(fromText(body, (i) => `Line ${i + 1}`, o), o), body.trim() ? "Pasted text" : "", cut);
  }

  async function runFile(f: File, o: ExtractOpts) {
    const tooBig = checkFileSize(f);
    if (tooBig) return toast(tooBig, "warn");
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (ext === "doc") return toast("Old .doc files are not supported. Save it as .docx or PDF and try again.", "warn");
    file.current = f;
    const id = ++job.current;
    setBusy(`Reading ${f.name}...`);
    try {
      let found: Found[];
      let n = "";
      if (ext === "docx") found = await readDocx(await f.arrayBuffer(), o);
      else if (ext === "pdf") {
        const r = await readPdf(await f.arrayBuffer(), o);
        found = r.items;
        n = (r.pages > LIMITS.MAX_PDF_PAGES ? `Only the first ${LIMITS.MAX_PDF_PAGES} of ${r.pages} pages were read. ` : "") + (r.chars < 20 ? "This PDF has no selectable text. It is probably a scan, so no links can be read from it." : "Long addresses in PDFs can break at line ends. Check the list before you rely on it.");
      } else found = fromText(await f.text(), (i) => `Line ${i + 1}`, o);
      if (id !== job.current) return;
      setText("");
      show(finish(found, o), f.name, n);
    } catch (err) {
      if (id !== job.current) return;
      setBusy("");
      toast(err instanceof Error && err.message === "big" ? "That document is too large or complex to read safely." : ext === "docx" ? "That Word file could not be read. Check that it is a .docx file." : ext === "pdf" ? "That PDF could not be read. Check that the file is not damaged or locked." : "That file could not be read.", "warn");
    }
  }

  // typing or pasting re-reads the text a moment after the last key
  useEffect(() => {
    if (file.current) return;
    const t = setTimeout(() => runText(text, opts), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const setOpt = (k: keyof ExtractOpts, v: boolean) => {
    const next = { ...opts, [k]: v };
    setOpts(next);
    if (file.current) void runFile(file.current, next);
    else runText(text, next);
  };

  async function downloadXlsx() {
    if (!items.length) return;
    let XLSX;
    try {
      XLSX = await getXLSX();
    } catch {
      return toast("The spreadsheet writer did not load. Try again.", "warn");
    }
    const aoa: (string | number)[][] = [["#", "Found in", "Title", "Link"], ...items.map((it, i) => [i + 1, it.where, it.label, it.url])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    items.forEach((it, i) => {
      const c = ws["D" + (i + 2)];
      if (c) c.l = { Target: it.url, Tooltip: it.url };
    });
    ws["!cols"] = [{ wch: 5 }, { wch: 14 }, { wch: 44 }, { wch: 70 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Links");
    const base = name.replace(/\.[^.]+$/, "") || "links";
    downloadBlob(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}-links.xlsx`);
    toast(`Saved ${base}-links.xlsx`);
  }

  function send() {
    const r = L.setLinks(items.map((it, i) => ({ url: it.url, label: it.label || it.where, row: i + 1 })), { name, sample: false });
    toast(`Sent ${plural(items.length - r.skipped, "link")} to batches.`);
    onSent();
  }

  const n = items.length;
  const clickable = items.filter((i) => i.src === "link").length;
  const shown = items.slice(0, limit);
  const has = n > 0;

  return (
    <div className="space-y-4">
      <Card step={1} title="Paste text or add a document" chip={name && <Chip>{name}</Chip>}>
        <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        <label className="flex flex-col text-xs font-medium text-stone-600">
          Paste text from a syllabus, article, email or notes
          <textarea
            value={text}
            onChange={(e) => {
              file.current = null;
              setText(e.target.value);
            }}
            spellCheck={false}
            placeholder={"Paste your text here, such as a syllabus, article, email or notes.\n\nNote: every web address in it is listed below, so you can copy it, download it or send it to batches."}
            className="mt-1 h-40 w-full lg:flex-1 lg:min-h-[200px] resize-y border border-stone-300 bg-white p-2.5 font-mono text-xs text-stone-800 outline-none focus:border-[color:var(--accent)]"
          />
        </label>
        <div className="flex flex-col gap-3">
          <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-stone-400 lg:hidden">or</div>
          <div className="lg:flex-1 [&>label]:h-full [&>label]:justify-center">
            <DropZone accept=".docx,.pdf,.txt,.md,.csv,.html,.htm" title={file.current ? `${file.current.name}. Choose another file to replace it.` : "Drop a Word or PDF file or browse"} note=".docx, .pdf, .txt, .md, .html. The file stays in your browser." onFile={(f) => void runFile(f, opts)} />
          </div>
        </div>
      </div>
        <p role="note" className="text-[11px] text-stone-500">Maximum file size is 100 MB per file.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Check checked={opts.dedupe} onChange={(v) => setOpt("dedupe", v)}>Remove duplicates</Check>
          <Check checked={opts.repair} onChange={(v) => setOpt("repair", v)}>Join links split across lines</Check>
          <Check checked={opts.bare} onChange={(v) => setOpt("bare", v)}>Also find bare domains such as <code>example.com</code></Check>
        </div>
      </Card>

      <section aria-live="polite" className="border border-stone-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-stone-900">{name}</div>
            <div className="text-xs text-stone-600">{!name ? "No links yet" : `${plural(n, "link")} found${clickable && n ? ` (${clickable} from clickable text)` : ""}`}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onClean && <button type="button" className={btnPlain} disabled={!has} onClick={() => onClean(items.map((i) => i.url).join("\n"), name)}>Clean these links</button>}
            <button type="button" className={btnPlain} disabled={!has} onClick={() => void copy(items.map((i) => i.url).join("\n"), `Copied ${plural(n, "link")}.`)}>Copy links</button>
            <button type="button" className={btnPlain} disabled={!has} onClick={() => void downloadXlsx()}>Download .xlsx</button>
            <button type="button" className={btnPrimary} disabled={!has} onClick={send}>Send to batches</button>
          </div>
        </div>
        {busy && <div className="border-t border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-600">{busy}</div>}
        {note && <div className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900">{note}</div>}
        <div className="overflow-x-auto border-t border-stone-200">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Found in</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Link</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Remove</th></tr>
            </thead>
            <tbody>
              {!has ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-stone-500">
                    {busy ? "Reading the document..." : name ? "No links found. Check that the text contains web addresses, or try another file." : "Note: paste text above or add a Word or PDF file. Every web address in it, including links hidden behind clickable words, appears here."}
                  </td>
                </tr>
              ) : (
                shown.map((it, i) => (
                  <tr key={i} className="border-t border-stone-200">
                    <td className="px-3 py-2 tabular-nums text-stone-500">{i + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-stone-500">{it.where}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2" title={it.label}>{it.label}</td>
                    <td className="max-w-[24rem] truncate px-3 py-2"><a href={it.url} target="_blank" rel="noopener noreferrer" title={it.url} className="text-accent hover:underline">{it.url}</a></td>
                    <td className="px-3 py-2"><span className={`px-1.5 py-0.5 text-[10px] font-bold ${it.src === "link" ? "bg-blue-100 text-blue-800" : "bg-stone-100 text-stone-600"}`}>{it.src === "link" ? "Clickable" : "Text"}</span></td>
                    <td className="px-3 py-2 text-right"><button type="button" className={btnSm} aria-label="Remove this link" onClick={() => setItems((l) => l.filter((_, k) => k !== i))}>Remove</button></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {has && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-4 py-2 text-[11px] text-stone-500">
            <span>Showing {shown.length} of {n}. &quot;Clickable&quot; links were attached to words in the document. &quot;Text&quot; links were written out as addresses.</span>
            {n > shown.length && <button type="button" className={btnSm} onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, n - shown.length)} more</button>}
          </div>
        )}
      </section>
    </div>
  );
}
