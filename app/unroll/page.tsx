"use client";

import { useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { CollapsibleSection, Label, Section, Segmented, Slider } from "@/components/ui";
import { downloadBlob } from "@/lib/export";
import { parseTweetUrl } from "@/lib/parse";
import { DEFAULT_LABEL_STRENGTH, LABEL_COLORS, LABEL_PRESETS, NUM_FORMATS, PAGE_SIZES, PAPER_THEMES, renderPagesPdf, type NumFormat, type NumPos, type Orientation, type PageLabel, type PageSizeId } from "@/lib/paper";
import NumPosPicker from "@/components/NumPosPicker";
import ScrollTop from "@/components/ScrollTop";
import HighlightEditor from "@/components/HighlightEditor";
import { addHighlight, HIGHLIGHT_COLORS, offsetIn, REDACT_STYLES, removeHighlight, type HighlightStyle } from "@/lib/highlight";
import { NO_REDACT, Pages, PrintPages, Reading, type Redact } from "@/components/ThreadView";
import { type Highlight } from "@/lib/highlight";
import { compact, formatDate, formatTime, proxied } from "@/lib/format";
import type { PostData } from "@/lib/types";

type Thread = { posts: PostData[]; isThread: boolean; link: string };

const btn =
  "inline-flex items-center justify-center border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50";

const handle = (p: PostData) => `@${p.username}`;

type ExportOpts = { numbers: boolean; media: boolean; hl: Record<number, Highlight[]>; redact: Redact };

/** Hidden ranges (bar / blur) become block characters, so the real words never reach a text export. */
function mask(text: string, list: Highlight[] | undefined): string {
  if (!list?.length) return text;
  let out = "";
  let at = 0;
  for (const h of list) {
    if (h.style !== "bar" && h.style !== "blur") continue;
    out += text.slice(at, h.start) + text.slice(h.start, h.end).replace(/\S/gu, "█");
    at = h.end;
  }
  return out + text.slice(at);
}

/** Plain-text version: a header line, then every post numbered "1/N". */
function toText(t: Thread, o: ExportOpts): string {
  const a = t.posts[0];
  const n = t.posts.length;
  const who = o.redact.name ? "[hidden]" : `${a.name} (${handle(a)})`;
  const lines = [`Thread by ${who} · ${n} post${n === 1 ? "" : "s"}`, ...(o.redact.name ? [] : [t.link]), ""];
  t.posts.forEach((p, i) => {
    lines.push(o.numbers && n > 1 ? `${i + 1}/${n}` : "", mask(p.text, o.hl[i]).trim());
    if (o.media && !o.redact.media) {
      p.photos.forEach((u) => lines.push(u));
      if (p.video) lines.push(`[Video] ${p.video.sources[0] ?? p.video.hls ?? ""}`.trim());
    }
    lines.push("");
  });
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim() + "\n";
}

/** Markdown version with the author as the title and images inline. */
function toMarkdown(t: Thread, o: ExportOpts): string {
  const a = t.posts[0];
  const n = t.posts.length;
  const out = o.redact.name
    ? [`# Thread (author hidden)`, "", `${n} post${n === 1 ? "" : "s"}`, ""]
    : [`# Thread by ${a.name} (${handle(a)})`, "", `[Original post](${t.link}) · ${n} post${n === 1 ? "" : "s"}`, ""];
  t.posts.forEach((p, i) => {
    if (o.numbers && n > 1) out.push(`**${i + 1}/${n}**`, "");
    out.push(mask(p.text, o.hl[i]).trim(), "");
    if (o.media && !o.redact.media) {
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
  const [fontSize, setFontSize] = useState(16);
  const [numPos, setNumPos] = useState<NumPos>("bottom");
  const [numFormat, setNumFormat] = useState<NumFormat>("of");
  const [label, setLabel] = useState<PageLabel | null>(null);
  const [hl, setHl] = useState<Record<number, Highlight[]>>({});
  const [redact, setRedact] = useState<Redact>(NO_REDACT);
  const [editIdx, setEditIdx] = useState(0);
  // Marking straight on the pages: the selected words, the style, and the earlier states for Undo.
  const [pageSel, setPageSel] = useState<{ post: number; start: number; end: number } | null>(null);
  const [markStyle, setMarkStyle] = useState<"marker" | "underline">("marker");
  const [markHist, setMarkHist] = useState<Record<number, Highlight[]>[]>([]);
  // A post that is not part of a thread waits here until the user agrees to continue with just that post.
  const [pending, setPending] = useState<Thread | null>(null);
  const [view, setView] = useState<"pages" | "reading">("pages");
  const [stageW, setStageW] = useState(700);
  const stage = useRef<HTMLDivElement>(null);
  const printRoot = useRef<HTMLDivElement>(null);
  const [themeId, setThemeId] = useState(PAPER_THEMES[0].id);
  const theme = PAPER_THEMES.find((t) => t.id === themeId) ?? PAPER_THEMES[0];
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
    setPending(null);
    setError(null);
    setPending(null);
    try {
      const tr = await fetch(`/api/thread?url=${encodeURIComponent(url)}`);
      const tj = await tr.json();
      if (!tr.ok) throw new Error(tj.error || "Couldn't fetch that thread.");
      if (id !== reqId.current) return;
      if (Array.isArray(tj.posts) && tj.posts.length >= 2) {
        setHl({});
        setEditIdx(0);
        setThread({ posts: tj.posts, isThread: true, link: url });
        return;
      }
      // No thread found: load the single post, but ask before showing it.
      const pr = await fetch(`/api/tweet?url=${encodeURIComponent(url)}`);
      const pj = await pr.json();
      if (!pr.ok) throw new Error(pj.error || "Couldn't fetch that post.");
      if (id !== reqId.current) return;
      setThread(null);
      setPending({ posts: [pj as PostData], isThread: false, link: url });
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }

  const opts: ExportOpts = { numbers, media, hl, redact };

  function continueSingle() {
    if (!pending) return;
    setHl({});
    setEditIdx(0);
    setThread(pending);
    setPending(null);
  }

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
    setPending(null);
    setPending(null);
    setHl({});
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

  useEffect(() => {
    setMarkHist([]);
    setPageSel(null);
  }, [thread]);

  useEffect(() => {
    const onSel = () => {
      const root = stage.current;
      const s = window.getSelection();
      if (!root || !s || s.rangeCount === 0 || s.isCollapsed) return;
      const r = s.getRangeAt(0);
      const host = (n: Node) => (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement))?.closest<HTMLElement>("[data-post]") ?? null;
      const a = host(r.startContainer);
      const b = host(r.endContainer);
      if (!a || a !== b || !root.contains(a)) return;
      const x = offsetIn(a, r.startContainer, r.startOffset);
      const y = offsetIn(a, r.endContainer, r.endOffset);
      const [start, end] = x <= y ? [x, y] : [y, x];
      const post = Number(a.dataset.post);
      if (end > start) setPageSel((c) => (c && c.post === post && c.start === start && c.end === end ? c : { post, start, end }));
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  function markPage(color: string, style: HighlightStyle) {
    if (!pageSel) return;
    const { post, start, end } = pageSel;
    setMarkHist((h) => [...h.slice(-49), hl]);
    setHl((prev) => ({ ...prev, [post]: addHighlight(prev[post] ?? [], { start, end, color, style }) }));
    setPageSel(null);
    window.getSelection()?.removeAllRanges();
  }
  function unmarkPage() {
    if (!pageSel) return;
    const { post, start, end } = pageSel;
    setMarkHist((h) => [...h.slice(-49), hl]);
    setHl((prev) => ({ ...prev, [post]: removeHighlight(prev[post] ?? [], start, end) }));
    setPageSel(null);
    window.getSelection()?.removeAllRanges();
  }
  function undoMark() {
    const prev = markHist[markHist.length - 1];
    if (!prev) return;
    setMarkHist((h) => h.slice(0, -1));
    setHl(prev);
    setPageSel(null);
  }
  const keepSel = (e: React.SyntheticEvent) => e.preventDefault();

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
  const vo = (printing: boolean) => ({ numbers, media, stats, printing, numPos, numFormat, label, hl, redact, pick: !printing, fontSize });
  const a = thread?.posts[0];
  const base = a && !redact.name ? `thread-${a.username}-${a.id}` : "thread-redacted";

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
              {thread && !thread.isThread && <p className="mt-2 text-xs text-stone-500">Showing a single post, because no thread was found.</p>}
            </div>
          </Section>

          <CollapsibleSection title="Display">
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
            <Slider label="Text size" value={fontSize} min={12} max={28} step={1} suffix="px" lowLabel="Smaller" highLabel="Larger" onChange={setFontSize} />
          </CollapsibleSection>

          <CollapsibleSection title="Page">
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
              <Label>Page theme</Label>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Page theme">
                {PAPER_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={themeId === t.id}
                    onClick={() => setThemeId(t.id)}
                    className={`flex flex-col items-center gap-1 border px-1 py-1.5 text-[10px] font-semibold ${themeId === t.id ? "border-accent text-accent" : "border-stone-300 text-stone-600"}`}
                  >
                    <span className="block h-6 w-full border" style={{ background: t.bg, borderColor: t.line, color: t.fg }}>
                      <span className="block px-1 text-[9px] leading-[22px]">Aa</span>
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Page number position</Label>
              <NumPosPicker value={numPos} onChange={setNumPos} />
            </div>
            <div>
              <Label>Page number format</Label>
              <Segmented value={numFormat} onChange={setNumFormat} wrap options={NUM_FORMATS} />
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
            <p className="text-[11px] leading-snug text-stone-500">Posts share a page when they fit together at full size, numbered and joined by a dotted line. A post that needs a whole page gets one, and a post taller than the page is scaled down to fit.</p>
          </CollapsibleSection>

          <CollapsibleSection title="Marker & redact">
            {!thread ? (
              <p className="text-[11px] text-stone-500">Load a thread first, then pick a post and select its words to highlight or hide them.</p>
            ) : (
              <>
                <div>
                  <Label>Post to edit</Label>
                  <div className="relative">
                  <select
                    aria-label="Post to edit"
                    value={Math.min(editIdx, thread.posts.length - 1)}
                    onChange={(e) => setEditIdx(Number(e.target.value))}
                    className="w-full appearance-none truncate border border-stone-300 bg-white py-2 pl-2.5 pr-8 text-xs font-medium text-stone-800"
                  >
                    {thread.posts.map((p, i) => (
                      <option key={i} value={i}>
                        {i + 1}/{thread.posts.length} · {p.text.replace(/\s+/g, " ").slice(0, 38)}
                      </option>
                    ))}
                  </select>
                  <svg className="pointer-events-none absolute right-2.5 top-1/2 -mt-[5px]" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  </div>
                </div>
                <HighlightEditor
                  key={editIdx}
                  text={thread.posts[Math.min(editIdx, thread.posts.length - 1)].text}
                  highlights={hl[editIdx] ?? []}
                  onChange={(h) => setHl((prev) => ({ ...prev, [editIdx]: h }))}
                  redactExtra={
                    <div className="space-y-2 border-t border-stone-200 pt-3">
                      <Label>Hide details</Label>
                      {(
                        [
                          ["name", "Name and handle"],
                          ["avatar", "Profile picture"],
                          ["media", "Photos and videos"],
                        ] as const
                      ).map(([k, text]) => (
                        <label key={k} className="flex cursor-pointer items-center gap-2 border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700">
                          <input type="checkbox" checked={redact[k]} onChange={(e) => setRedact((r) => ({ ...r, [k]: e.target.checked }))} className="h-4 w-4 accent-stone-900" />
                          {text}
                        </label>
                      ))}
                      <p className="text-[11px] leading-snug text-stone-500">Hidden names, handles and bars are also removed from the copied and downloaded text.</p>
                    </div>
                  }
                />
              </>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Background label">
            <p className="text-[11px] leading-snug text-stone-500">Adds a light tint and a faint diagonal label behind the text of every page, for example Confidential. The text stays easy to read.</p>
            <div className="flex flex-wrap gap-1.5">
              {LABEL_PRESETS.map((p) => (
                <button
                  key={p.text}
                  type="button"
                  onClick={() => setLabel((l) => ({ text: p.text, color: p.color, strength: l?.strength ?? DEFAULT_LABEL_STRENGTH }))}
                  aria-pressed={label?.text === p.text}
                  className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold transition ${label?.text === p.text ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}`}
                >
                  <span className="h-2.5 w-2.5" style={{ background: p.color }} />
                  {p.text}
                </button>
              ))}
            </div>
            <div>
              <Label>Label text (edit or type your own)</Label>
              <input
                value={label?.text ?? ""}
                maxLength={40}
                onChange={(e) => setLabel((l) => ({ text: e.target.value, color: l?.color ?? LABEL_COLORS[0], strength: l?.strength ?? DEFAULT_LABEL_STRENGTH }))}
                placeholder="e.g. Confidential"
                className="w-full border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"
              />
            </div>
            <div>
              <Label>Colour</Label>
              <div className="flex flex-wrap items-center gap-2">
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Label colour ${c}`}
                    aria-pressed={label?.color === c}
                    onClick={() => setLabel((l) => ({ text: l?.text ?? "", color: c, strength: l?.strength ?? DEFAULT_LABEL_STRENGTH }))}
                    className={`h-7 w-7 border-2 ${label?.color === c ? "border-stone-900" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
                <label className="relative flex h-7 items-center border border-stone-300 bg-white px-2 text-xs font-semibold text-stone-700 hover:bg-stone-100">
                  Custom
                  <input type="color" aria-label="Custom label colour" value={label?.color ?? LABEL_COLORS[0]} onChange={(e) => setLabel((l) => ({ text: l?.text ?? "", color: e.target.value, strength: l?.strength ?? DEFAULT_LABEL_STRENGTH }))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
                </label>
              </div>
            </div>
            <div>
              <Label>Strength ({label?.strength ?? DEFAULT_LABEL_STRENGTH}%)</Label>
              <input
                type="range"
                min={3}
                max={20}
                value={label?.strength ?? DEFAULT_LABEL_STRENGTH}
                aria-label="Label strength"
                onChange={(e) => setLabel((l) => ({ text: l?.text ?? "", color: l?.color ?? LABEL_COLORS[0], strength: Number(e.target.value) }))}
                className="w-full accent-stone-900"
              />
            </div>
            <button type="button" className={btn} disabled={!label} onClick={() => setLabel(null)}>
              Remove label
            </button>
          </CollapsibleSection>

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
          <div className="scroll-stage relative flex max-h-[72vh] flex-1 overflow-hidden lg:max-h-none lg:min-h-0">
            <div ref={stage} onPointerDown={() => setPageSel(null)} className="relative z-[1] flex flex-1 overflow-auto px-4 py-6 sm:px-8">
              <div className="mx-auto w-full">
                {pending && !thread ? (
                  <div role="alert" className="mx-auto max-w-[520px] border border-amber-300 bg-amber-50 p-6 text-center text-amber-900">
                    <div className="mb-1 text-base font-bold">Thread not found</div>
                    <p className="text-sm">Do you want to continue with a single tweet?</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button type="button" onClick={continueSingle} className="bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110">
                        Continue with single tweet
                      </button>
                      <button type="button" onClick={() => setPending(null)} className="border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100">
                        No, try another link
                      </button>
                    </div>
                  </div>
                ) : !thread ? (
                  <div className="mx-auto max-w-[640px] border border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
                    <div className="mb-1 text-base font-bold text-stone-900">Unroll a thread</div>
                    Paste a link to any post in a thread and it loads on its own. You get every post in order, ready to read, copy or download as a PDF.
                  </div>
                ) : view === "pages" ? (
                  <Pages posts={thread.posts} size={size} orientation={orientation} theme={theme} o={vo(false)} containerWidth={stageW} />
                ) : (
                  <Reading posts={thread.posts} theme={theme} o={vo(false)} width={orientation === "landscape" ? 900 : 640} />
                )}
              </div>
            </div>
            {thread && (pageSel || markHist.length > 0) && (
              <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 sm:inset-x-16 flex justify-center">
                <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 gap-y-1.5 border border-stone-300 bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur" role="toolbar" aria-label="Mark text on the pages">
                  {pageSel && (
                    <>
                      <div className="flex border border-stone-300 text-[11px] font-semibold">
                        {(["marker", "underline"] as const).map((m) => (
                          <button key={m} type="button" aria-pressed={markStyle === m} onMouseDown={keepSel} onClick={() => setMarkStyle(m)} className={`px-2 py-1 capitalize ${markStyle === m ? "bg-stone-900 text-white" : "bg-white text-stone-700"}`}>
                            {m}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-0.5">
                        {HIGHLIGHT_COLORS.map((c) => (
                          <button key={c.value} type="button" title={c.name} aria-label={`Mark on page ${c.name}`} onMouseDown={keepSel} onClick={() => markPage(c.value, markStyle)} className="h-5 w-5 border border-stone-400" style={{ backgroundColor: c.value }} />
                        ))}
                      </div>
                      {REDACT_STYLES.map((r) => (
                        <button key={r.label} type="button" onMouseDown={keepSel} onClick={() => markPage(r.color, r.style)} className="border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-800 hover:bg-stone-100">
                          {r.label}
                        </button>
                      ))}
                      <button type="button" onMouseDown={keepSel} onClick={unmarkPage} className="border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100">
                        Remove
                      </button>
                    </>
                  )}
                  {markHist.length > 0 && (
                    <button type="button" onMouseDown={keepSel} onClick={undoMark} className="border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100">
                      Undo
                    </button>
                  )}
                </div>
              </div>
            )}
            <ScrollTop target={stage} />
          </div>
        </div>
      </main>
      {printing && thread && (
        <div ref={printRoot}>
          <PrintPages posts={thread.posts} size={size} orientation={orientation} theme={theme} o={vo(true)} />
        </div>
      )}
    </div>
  );
}
