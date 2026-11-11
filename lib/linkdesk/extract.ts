/* eslint-disable @typescript-eslint/no-explicit-any */
import { LIMITS } from "./core";
import { loadScript } from "./loader";

const CDN = "https://cdnjs.cloudflare.com/ajax/libs/";
const JSZIP = CDN + "jszip/3.10.1/jszip.min.js";
const PDFJS = CDN + "pdf.js/3.11.174/pdf.min.js";
const PDFWORKER = CDN + "pdf.js/3.11.174/pdf.worker.min.js";

const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const BARE_RE = /(?<![@\w.\/-])(?:[a-z0-9-]+\.)+(?:com|org|net|edu|gov|int|info|news|io|co|in|uk|us|ca|au|de|fr|ac)(?![\w-])(?:\/[^\s<>"'`]*)?/gi;

export type Found = { url: string; label: string; where: string; src: "text" | "link" };
export type ExtractOpts = { dedupe: boolean; repair: boolean; bare: boolean };

function cleanUrl(input: string): string {
  let u = input.replace(/[.,;:!?'"\]}>…”’]+$/, "");
  while (/\)$/.test(u) && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length) u = u.replace(/\)$/, "");
  return u.replace(/[.,;:!?'"\]}>…”’]+$/, "");
}

/** Joins an address that a document wrapped onto the next line. */
function repairLines(lines: string[]): string[] {
  const out: string[] = [];
  lines.forEach((line) => {
    if (out.length) {
      const prev = out[out.length - 1];
      const t = line.trim();
      if (/(?:https?:\/\/|www\.)\S+$/i.test(prev) && prev.length >= 60 && /^\S+$/.test(t) && /[/.\-_=?&%#]/.test(t) && !/^(?:https?:\/\/|www\.)/i.test(t) && !/@/.test(t)) {
        out[out.length - 1] = prev + t;
        return;
      }
    }
    out.push(line);
  });
  return out;
}

/** The words around a link, used as its title. */
function labelFor(line: string, ranges: [number, number][]): string {
  let t = "";
  let pos = 0;
  ranges.forEach((r) => {
    t += line.slice(pos, r[0]) + " ";
    pos = r[1];
  });
  t += line.slice(pos);
  return t.replace(/[()[\]<>]/g, " ").replace(/^[\s\-•*\d.)]+/, "").replace(/[\s:,;\-–—]+$/, "").replace(/\s+/g, " ").trim().slice(0, 90);
}

export function fromText(text: string, where: (lineIndex: number) => string, opts: ExtractOpts): Found[] {
  const out: Found[] = [];
  let lines = text.split(/\r?\n/);
  if (opts.repair) lines = repairLines(lines);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const hits: { s: number; e: number; u: string }[] = [];
    let m: RegExpExecArray | null;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(line))) {
      const u = cleanUrl(m[0]);
      if (u.length > 6) hits.push({ s: m.index, e: m.index + m[0].length, u });
    }
    if (opts.bare) {
      BARE_RE.lastIndex = 0;
      while ((m = BARE_RE.exec(line))) {
        const s0 = m.index;
        const e0 = s0 + m[0].length;
        if (hits.some((h) => s0 < h.e && e0 > h.s)) continue;
        const bu = cleanUrl(m[0]);
        if (bu.length > 3) hits.push({ s: s0, e: e0, u: bu });
      }
    }
    if (!hits.length) return;
    hits.sort((a, b) => a.s - b.s);
    const label = labelFor(line, hits.map((h) => [h.s, h.e] as [number, number]));
    hits.forEach((h) => out.push({ url: /^https?:\/\//i.test(h.u) ? h.u : "https://" + h.u, label, where: where(i), src: "text" }));
  });
  return out;
}

/** Drops repeats (keeping the first title that has any words). */
export function finish(items: Found[], opts: ExtractOpts): Found[] {
  if (!opts.dedupe) return items;
  const seen = new Map<string, number>();
  const out: Found[] = [];
  items.forEach((it) => {
    const k = it.url.toLowerCase().replace(/\/$/, "");
    const at = seen.get(k);
    if (at !== undefined) {
      if (!out[at].label && it.label) out[at].label = it.label;
      return;
    }
    seen.set(k, out.length);
    out.push(it);
  });
  return out;
}

const textOf = (node: Element, tag: string) => Array.from(node.getElementsByTagName(tag)).map((n) => n.textContent ?? "").join("");

/** Word (.docx): clickable words, HYPERLINK fields and addresses typed in the text. */
export async function readDocx(buf: ArrayBuffer, opts: ExtractOpts): Promise<Found[]> {
  await loadScript(JSZIP);
  const zip = await (window as any).JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|footnotes|endnotes|header\d*|footer\d*)\.xml$/.test(n));
  if (Object.keys(zip.files).length > LIMITS.MAX_ZIP_ENTRIES) throw new Error("big");
  if (!names.length) throw new Error("nodoc");
  const all: Found[] = [];
  for (const name of names) {
    const base = name.split("/").pop() as string;
    const relName = `word/_rels/${base}.rels`;
    const [xml, relXml] = await Promise.all([zip.file(name).async("string") as Promise<string>, zip.file(relName) ? (zip.file(relName).async("string") as Promise<string>) : Promise.resolve("")]);
    if (xml.length > LIMITS.MAX_PART_CHARS) throw new Error("big");
    const rels: Record<string, string> = {};
    if (relXml) {
      const rd = new DOMParser().parseFromString(relXml, "application/xml").getElementsByTagName("Relationship");
      for (let i = 0; i < rd.length; i++) rels[rd[i].getAttribute("Id") ?? ""] = rd[i].getAttribute("Target") ?? "";
    }
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const ps = doc.getElementsByTagName("w:p");
    const part = base === "document.xml" ? "Paragraph " : base.replace(".xml", "") + " ";
    for (let p = 0; p < ps.length; p++) {
      const para = ps[p];
      const text = textOf(para, "w:t");
      const where = part + (p + 1);
      if (!text.trim() && !para.getElementsByTagName("w:instrText").length) continue;
      const snippet = text.replace(/\s+/g, " ").trim().slice(0, 90);
      const hl = para.getElementsByTagName("w:hyperlink");
      for (let h = 0; h < hl.length; h++) {
        const tgt = rels[hl[h].getAttribute("r:id") ?? ""] || "";
        if (/^https?:\/\//i.test(tgt)) {
          const lt = textOf(hl[h], "w:t").replace(/\s+/g, " ").trim();
          all.push({ url: tgt, label: lt && !/^(?:https?:\/\/|www\.)/i.test(lt) ? lt.slice(0, 90) : snippet.replace(lt, "").trim().slice(0, 90), where, src: "link" });
        }
      }
      const ins = para.getElementsByTagName("w:instrText");
      for (let q = 0; q < ins.length; q++) {
        const mm = /HYPERLINK\s+"([^"]+)"/i.exec(ins[q].textContent ?? "");
        if (mm && /^https?:\/\//i.test(mm[1])) all.push({ url: mm[1], label: snippet, where, src: "link" });
      }
      all.push(...fromText(text, () => where, opts));
    }
  }
  return all;
}

/** PDF: addresses in the text plus link annotations, with the words under each annotation as its title. */
export async function readPdf(buf: ArrayBuffer, opts: ExtractOpts): Promise<{ items: Found[]; chars: number; pages: number }> {
  await loadScript(PDFWORKER);
  await loadScript(PDFJS);
  const lib = (window as any).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFWORKER;
  const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const all: Found[] = [];
  let chars = 0;
  const last = Math.min(pdf.numPages, LIMITS.MAX_PDF_PAGES);
  for (let n = 1; n <= last; n++) {
    const page = await pdf.getPage(n);
    const [content, annots] = await Promise.all([page.getTextContent(), page.getAnnotations()]);
    const items: any[] = content.items;
    let text = "";
    items.forEach((it) => {
      text += it.str;
      chars += it.str.trim().length;
      text += it.hasEOL ? "\n" : it.str && !/\s$/.test(it.str) ? " " : "";
    });
    all.push(...fromText(text, () => `Page ${n}`, opts));
    (annots as any[]).forEach((a) => {
      if (a.subtype !== "Link" || !a.url || !/^https?:\/\//i.test(a.url) || !a.rect) return;
      const x1 = Math.min(a.rect[0], a.rect[2]) - 2;
      const x2 = Math.max(a.rect[0], a.rect[2]) + 2;
      const y1 = Math.min(a.rect[1], a.rect[3]) - 2;
      const y2 = Math.max(a.rect[1], a.rect[3]) + 2;
      let lab = items
        .filter((it) => {
          const x = it.transform[4];
          const y = it.transform[5];
          return x >= x1 && x <= x2 && y >= y1 && y <= y2 && it.str.trim();
        })
        .map((it) => it.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (/^(?:https?:\/\/|www\.)/i.test(lab)) lab = "";
      all.push({ url: a.url, label: lab.slice(0, 90), where: `Page ${n}`, src: "link" });
    });
  }
  return { items: all, chars, pages: pdf.numPages };
}
