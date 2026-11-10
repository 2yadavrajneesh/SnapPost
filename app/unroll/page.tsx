"use client";

import { useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Label, Section, Segmented } from "@/components/ui";
import { downloadBlob } from "@/lib/export";
import { parseTweetUrl } from "@/lib/parse";
import { PAGE_SIZES, PAPER_THEMES, renderPagesPdf, type Orientation, type PageSizeId } from "@/lib/paper";
import { Pages, PrintPages, Reading } from "@/components/ThreadView";
import { compact, formatDate, formatTime, proxied } from "@/lib/format";
import type { PostData } from "@/lib/types";

type Thread = { posts: PostData[]; isThread: boolean; link: string };

const btn =
  "inline-flex items-center justify-center border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50";

const handle = (p: PostData) => `@${p.username}`;

/** Plain-text version: a header line, then every post numbered "1/N". */
function toText(t: Thread, o: { numbers: boolean; media: boolean }): string {
  const a = t.posts[0];
  const n = t.posts.length;
  const lines = [`Thread by ${a.name} (${handle(a)}) · ${n} post${n === 1 ? "" : "s"}`, t.link, ""];
  t.posts.forEach((p, i) => {
    lines.push(o.numbers && n > 1 ? `${i + 1}/${n}` : "", p.text.trim());
    if (o.media) {
      p.photos.forEach((u) => lines.push(u));
      if (p.video) lines.push(`[Video] ${p.video.sources[0] ?? p.video.hls ?? ""}`.trim());
    }
    lines.push("");
  });
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim() + "\n";
}

/** Markdown version with the author as the title and images inline. */
function toMarkdown(t: Thread, o: { numbers: boolean; media: boolean }): string {
  const a = t.posts[0];
  const n = t.posts.length;
  const out = [`# Thread by ${a.name} (${handle(a)})`, "", `[Original post](${t.link}) · ${n} post${n === 1 ? "" : "s"}`, ""];
  t.posts.forEach((p, i) => {
    if (o.numbers && n > 1) out.push(`**${i + 1}/${n}**`, "");
    out.push(p.text.trim(), "");
    if (o.media) {
      p.photos.forEach((u) => out.push(`![](${u})`, ""));
      if (p.video) out.push(`[Video](${p.video.sources[0] ?? p.video.hls ?? ""})`, "");
    }
  });
  return out.join("\n").trim() + "\n";
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function save(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Unroller() {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [numbers, setNumbers] = useState(true);
  const [media, setMedia] = useState(true);
  const [stats, setStats] = useState(false);
  const [notice, setNotice] = useState("");
  const [size, setSize] = useState<PageSizeId>("a4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [printing, setPrinting] = useState(false); // true while the PDF is being drawn (videos show as pictures)
  const [view, setView] = useState<"pages" | "reading">("pages");
  const [stageW, setStageW] = useState(700);
  const stage = useRef<HTMLDivElement>(null);
  const printRoot = useRef<HTMLDivElement>(null);
  const theme = PAPER_THEMES[0];
  const reqId = useRef(0);
  const lastFetched = useRef("");
  const linkInput = useRef<HTMLInputElement>(null);
  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(""), 2200);
  };

  async function unroll(raw = link) {
    const url = raw.trim();
    if (!url) return;
    lastFetched.current = url;
    const id = ++reqId.current;
    setBusy(true);
    setError(null);
    try {
      const tr = await fetch(`/api/thread?url=${encodeURIComponent(url)}`);
      const tj = await tr.json();
      if (!tr.ok) throw new Error(tj.error || "Couldn't fetch that thread.");
      if (id !== reqId.current) return;
      if (Array.isArray(tj.posts) && tj.posts.length >= 2) {
        setThread({ posts: tj.posts, isThread: true, link: url });
        return;
      }
      // Not a thread (or none detected): show the single post so the page is still useful.
      const pr = await fetch(`/api/tweet?url=${encodeURIComponent(url)}`);
      const pj = await pr.json();
      if (!pr.ok) throw new Error(pj.error || "Couldn't fetch that post.");
      if (id !== reqId.current) return;
      setThread({ posts: [pj as PostData], isThread: false, link: url });
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }

  const opts = { numbers, media };

  // Auto fetch: as soon as the box holds a valid tweet link, unroll it (after a short pause for typing).
  useEffect(() => {
    const url = link.trim();
    if (!parseTweetUrl(url) || url === lastFetched.current) return;
    const timer = setTimeout(() => void unroll(url), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  async function pasteLink() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setError("Your clipboard is empty. Copy a tweet link first.");
        return;
      }
      setLink(text);
      setError(null);
    } catch {
      setError("Couldn't read the clipboard. Allow clipboard access, or paste into the box with Ctrl/Cmd+V.");
    }
  }

  function startOver() {
    reqId.current += 1; // ignore anything still loading
    lastFetched.current = "";
    setLink("");
    setThread(null);
    setError(null);
    setBusy(false);
    linkInput.current?.focus();
  }

  useEffect(() => {
    if (window.innerWidth < 1024) setView("reading"); // phones: pages are too small to read
  }, []);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setStageW(Math.max(200, el.clientWidth - (window.innerWidth < 640 ? 32 : 64)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function downloadPdf() {
    if (!thread) return;
    setPrinting(true);
    try {
      // Wait for the off-screen pages to mount, shrink to fit and load their pictures.
      await new Promise((r) => setTimeout(r, 400));
      const root = printRoot.current;
      const nodes = root ? Array.from(root.querySelectorAll<HTMLElement>("[data-page]")) : [];
      await Promise.all(
        Array.from(root?.querySelectorAll("img") ?? []).map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = () => r(null); }))),
      );
      await new Promise((r) => setTimeout(r, 150));
      const { blob, pages } = await renderPagesPdf(nodes, { size, orientation });
      downloadBlob(blob, `${base}-${size}-${orientation}.pdf`);
      flash(`PDF saved · ${pages} page${pages === 1 ? "" : "s"}`);
    } catch {
      flash("Couldn't make the PDF");
    } finally {
      setPrinting(false);
    }
  }
  const a = thread?.posts[0];
  const base = a ? `thread-${a.username}-${a.id}` : "thread";

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style={{ ["--accent" as string]: "#0f766e" }}>
      <SiteHeader />

      <main className="grid w-full flex-1 lg:min-h-0 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="order-2 min-w-0 border-t border-stone-300 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <Section title="Source">
            <div>
              <Label>Link to any post in the thread (loads automatically)</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={linkInput}
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void unroll()}
                    placeholder="Paste a tweet link…"
                    aria-busy={busy}
                    className="w-full border border-stone-200 bg-white py-2 pl-3 pr-9 text-sm outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"
                  />
                  {busy && <span className="snap-spinner absolute right-2.5 top-1/2 -mt-2" aria-hidden="true" />}
                </div>
                <button
                  type="button"
                  onClick={() => void pasteLink()}
                  aria-label="Paste link from clipboard"
                  title="Paste from clipboard"
                  className="flex w-10 flex-none items-center justify-center border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={startOver}
                  aria-label="Start over with a different link"
                  title="Start over"
                  className="flex w-10 flex-none items-center justify-center border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
              {!error && !busy && link.trim() !== "" && !parseTweetUrl(link.trim()) && (
                <p className="mt-2 text-xs text-stone-500">That doesn&apos;t look like a tweet link yet. Use https://x.com/user/status/123…</p>
              )}
              {error && (
                <p role="alert" className="mt-2 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}
              {thread && !thread.isThread && <p className="mt-2 text-xs text-stone-500">This post isn&apos;t part of a thread, so only one post is shown.</p>}
            </div>
          </Section>

          <Section title="Display">
            {[
              ["Number the posts (1/n)", numbers, setNumbers],
              ["Show photos and videos", media, setMedia],
              ["Show likes, reposts and views", stats, setStats],
            ].map(([label, val, setter]) => (
              <label key={label as string} className="flex cursor-pointer items-center gap-2 border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
                <input type="checkbox" checked={val as boolean} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} className="h-4 w-4 accent-stone-900" />
                {label as string}
              </label>
            ))}
          </Section>

          <Section title="Page">
            <div>
              <Label>Page size</Label>
              <div className="relative">
                <select aria-label="Page size" value={size} onChange={(e) => setSize(e.target.value as PageSizeId)} className="w-full appearance-none border border-stone-300 bg-white py-2 pl-2.5 pr-8 text-xs font-medium text-stone-800">
                  {PAGE_SIZES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label} ({z.w} × {z.h} mm)
                    </option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2.5 top-1/2 -mt-[5px]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
            <div>
              <Label>Orientation</Label>
              <Segmented
                value={orientation}
                onChange={setOrientation}
                options={[
                  { value: "portrait", label: "Portrait (vertical)" },
                  { value: "landscape", label: "Landscape" },
                ]}
              />
            </div>
            <div>
              <Label>Preview</Label>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "pages", label: "Pages (print layout)" },
                  { value: "reading", label: "Reading" },
                ]}
              />
            </div>
            <p className="text-[11px] leading-snug text-stone-500">Each post gets its own page, so nothing is cut when you print. A post taller than the page is scaled down to fit.</p>
          </Section>

          <Section title="Save">
            <button type="button" disabled={!thread || printing} onClick={() => void downloadPdf()} className="w-full bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
              {printing ? "Making PDF…" : "Download PDF"}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={btn} disabled={!thread} onClick={async () => thread && flash((await copy(toText(thread, opts))) ? "Text copied" : "Copy failed")}>
                Copy as text
              </button>
              <button type="button" className={btn} disabled={!thread} onClick={async () => thread && flash((await copy(toMarkdown(thread, opts))) ? "Markdown copied" : "Copy failed")}>
                Copy Markdown
              </button>
              <button type="button" className={btn} disabled={!thread} onClick={() => thread && save(`${base}.txt`, toText(thread, opts), "text/plain;charset=utf-8")}>
                Download .txt
              </button>
              <button type="button" className={btn} disabled={!thread} onClick={() => thread && save(`${base}.md`, toMarkdown(thread, opts), "text/markdown;charset=utf-8")}>
                Download .md
              </button>
            </div>
            <div className="h-4 text-xs font-medium text-emerald-700" aria-live="polite">
              {notice}
            </div>
          </Section>
        </aside>

        <div className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div className="snap-stage relative flex max-h-[72vh] flex-1 overflow-hidden lg:max-h-none lg:min-h-0">
            <div ref={stage} className="relative z-[1] flex flex-1 overflow-auto px-4 py-6 sm:px-8">
              <div className="mx-auto w-full">
                {!thread ? (
                  <div className="mx-auto max-w-[640px] border border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
                    <div className="mb-1 text-base font-bold text-stone-900">Unroll a thread</div>
                    Paste a link to any post of a thread and press Unroll. You get every post in order, ready to read, copy or download.
                  </div>
                ) : view === "pages" ? (
                  <Pages posts={thread.posts} size={size} orientation={orientation} theme={theme} o={{ numbers, media, stats, printing: false }} containerWidth={stageW} />
                ) : (
                  <Reading posts={thread.posts} theme={theme} o={{ numbers, media, stats, printing: false }} width={orientation === "landscape" ? 900 : 640} />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      {printing && thread && (
        <div ref={printRoot}>
          <PrintPages posts={thread.posts} size={size} orientation={orientation} theme={theme} o={{ numbers, media, stats, printing: true }} />
        </div>
      )}
    </div>
  );
}
