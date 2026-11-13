"use client";

import { getXLSX } from "@/lib/linkdesk/loader";
import { readDocx, readPdf } from "@/lib/linkdesk/extract";
import { findTweetLinks } from "@/lib/parse";

/** Reads the text of a file that may hold links: text, CSV, JSON, HTML, a spreadsheet, a Word file or a PDF. */
export async function readLinkFile(f: File): Promise<string> {
  if (/\.(xlsx|xls|xlsm|ods)$/i.test(f.name)) {
    const XLSX = await getXLSX();
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      for (const key of Object.keys(sheet)) {
        if (key[0] === "!") continue;
        const c = sheet[key];
        parts.push(`${c?.l?.Target ?? ""} ${c?.v ?? ""}`);
      }
    }
    return parts.join("\n");
  }
  // Word and PDF: clickable words, link fields and typed addresses are all read
  if (/\.docx$/i.test(f.name) || /\.pdf$/i.test(f.name)) {
    const opts = { dedupe: true, repair: true, bare: true };
    const buf = await f.arrayBuffer();
    const found = /\.pdf$/i.test(f.name) ? (await readPdf(buf, opts)).items : await readDocx(buf, opts);
    return found.map((x) => x.url).join("\n");
  }
  if (/\.(doc|rtf)$/i.test(f.name)) throw new Error("Save it as .docx first.");
  return f.text();
}

/** Tweet links found in a file, in order. */
export async function tweetLinksInFile(f: File): Promise<string[]> {
  return findTweetLinks(await readLinkFile(f));
}
