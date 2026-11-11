"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { compact, formatDate, formatTime, proxied } from "@/lib/format";
import { renderHighlighted, type Highlight } from "@/lib/highlight";
import { PAGE_SIZES, formatPageNumber, rgba, type NumFormat, type NumPos, type Orientation, type PageLabel, type PageSizeId, type PaperTheme } from "@/lib/paper";
import type { PostData } from "@/lib/types";

export type ViewOpts = { numbers: boolean; media: boolean; stats: boolean; printing: boolean; numPos: NumPos; numFormat: NumFormat; label: PageLabel | null; hl: Record<number, Highlight[]>; redact: Redact; pick?: boolean; fontSize?: number };

export type Redact = { name: boolean; avatar: boolean; media: boolean };
export const NO_REDACT: Redact = { name: false, avatar: false, media: false };

const handle = (p: PostData) => `@${p.username}`;
const GRAY = "#8b98a5";
const bar = (w: number, h = 12) => <span style={{ display: "inline-block", width: w, height: h, background: GRAY, borderRadius: 2, verticalAlign: "middle" }} />;
const MM = 96 / 25.4;

/** Logical pixel size of a page (96 dpi), so the preview and the PDF share one layout. */
export function pagePx(size: PageSizeId, orientation: Orientation) {
  const s = PAGE_SIZES.find((x) => x.id === size) ?? PAGE_SIZES[0];
  const [w, h] = orientation === "landscape" ? [s.h, s.w] : [s.w, s.h];
  return { w: Math.round(w * MM), h: Math.round(h * MM), margin: Math.round(Math.max(8, Math.min(14, w * 0.06)) * MM), footer: 30 };
}

export function AuthorHeader({ posts, theme, redact, showCount = true }: { posts: PostData[]; theme: PaperTheme; redact: Redact; showCount?: boolean }) {
  const a = posts[0];
  return (
    <header className="flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${theme.line}`, marginBottom: 16 }}>
      {redact.avatar || !a.avatar ? (
        <div className="h-11 w-11 flex-none rounded-full" style={{ background: redact.avatar ? GRAY : theme.line }} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxied(a.avatar)} alt="" className="h-11 w-11 rounded-full object-cover" />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{redact.name ? bar(120, 13) : a.name}</div>
        <div className="mt-0.5 truncate text-xs" style={{ color: theme.muted }}>
          {redact.name ? bar(80, 10) : handle(a)}
          {showCount ? ` · ${posts.length} post${posts.length === 1 ? "" : "s"}` : ""}
        </div>
      </div>
    </header>
  );
}

export function PostBody({ p, i, n, theme, o }: { p: PostData; i: number; n: number; theme: PaperTheme; o: ViewOpts }) {
  const frame = { border: `1px solid ${theme.line}` };
  // Hidden media is blurred hard; the box clips the blur so it never spills over the text.
  const blur = (node: React.ReactNode) =>
    o.redact.media ? (
      <div style={{ overflow: "hidden" }}>
        <div style={{ filter: "blur(26px)", transform: "scale(1.15)" }}>{node}</div>
      </div>
    ) : (
      node
    );
  return (
    <div>
      {o.numbers && n > 1 && (
        <div className="mb-1 text-[11px] font-semibold tabular-nums" style={{ color: theme.muted }}>
          {i + 1}/{n}
        </div>
      )}
      <p data-post={o.pick ? i : undefined} style={{ fontSize: o.fontSize ?? 16 }} className={`whitespace-pre-wrap break-words leading-relaxed${o.pick ? " select-text" : ""}`}>{renderHighlighted(p.text, o.hl[i], !!o.pick)}</p>
      {o.media && p.photos.length > 0 && (
        <div className="mt-3">
          {blur(
            <div className={`grid gap-1.5 ${p.photos.length > 1 ? "grid-cols-2" : ""}`}>
              {p.photos.map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={proxied(u)} alt="" loading="eager" className="w-full object-cover" style={frame} />
              ))}
            </div>,
          )}
        </div>
      )}
      {o.media && p.video && (
        <div className="mt-3">
          {blur(
            o.printing ? (
              p.video.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxied(p.video.poster)} alt="Video" className="w-full object-cover" style={frame} />
              ) : null
            ) : (
              <video className="w-full bg-black" style={frame} controls preload="none" poster={p.video.poster ? proxied(p.video.poster) : undefined} src={p.video.sources[0] ? `/api/video?url=${encodeURIComponent(p.video.sources[0])}` : undefined} />
            ),
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4" style={{ color: theme.muted, fontSize: Math.max(11, Math.round((o.fontSize ?? 16) * 0.72)) }}>
        {p.timestamp && <span>{formatDate(p.timestamp)} · {formatTime(p.timestamp)}</span>}
        {o.stats && (
          <>
            <span>{compact(p.likes)} likes</span>
            <span>{compact(p.reposts)} reposts</span>
            <span>{compact(p.views)} views</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Continuous reading view: header, then every post one under another. */
export function Reading({ posts, theme, o, width }: { posts: PostData[]; theme: PaperTheme; o: ViewOpts; width: number }) {
  return (
    <article className="relative mx-auto w-full p-4" style={{ maxWidth: width, background: theme.bg, color: theme.fg, border: `1px solid ${theme.line}` }}>
      <LabelOverlay label={o.label} w={width} />
      <div style={{ position: "relative", zIndex: 1 }}>
      <AuthorHeader posts={posts} theme={theme} redact={o.redact} />
      <ol>
        {posts.map((p, i) => (
          <li key={p.id || i} className="py-4" style={{ borderBottom: i < posts.length - 1 ? `1px solid ${theme.line}` : undefined }}>
            <PostBody p={p} i={i} n={posts.length} theme={theme} o={o} />
          </li>
        ))}
      </ol>
      </div>
    </article>
  );
}

/** Light tint plus a large diagonal label behind the content. Kept faint so the text stays easy to read. */
function LabelOverlay({ label, w }: { label: PageLabel | null; w: number }) {
  const text = label?.text.trim();
  if (!label || !text) return null;
  const size = Math.max(20, Math.min(w * 0.15, (w * 0.9) / (Math.max(4, text.length) * 0.62)));
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", background: rgba(label.color, label.strength * 0.004), zIndex: 0 }}>
      <div
        style={{
          position: "absolute", left: "50%", top: "50%", whiteSpace: "nowrap", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
          fontSize: size, color: rgba(label.color, label.strength / 100), transform: "translate(-50%, -50%) rotate(-28deg)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/** The page number, placed on the chosen side of the page. "Centre" is a large, faint number behind the text. */
function PageNumber({ text, pos, w, h, margin, theme }: { text: string; pos: NumPos; w: number; h: number; margin: number; theme: PaperTheme }) {
  if (pos === "none") return null;
  const base = { position: "absolute", color: theme.muted, fontSize: 11, lineHeight: 1, whiteSpace: "nowrap" } as const;
  const side = margin * 0.45;
  const wide = { left: 0, width: w } as const;
  const style =
    pos === "top"
      ? { ...base, top: side, ...wide, textAlign: "center" as const }
      : pos === "bottom"
        ? { ...base, bottom: side, ...wide, textAlign: "center" as const }
        : pos === "top-left"
          ? { ...base, top: side, left: margin }
          : pos === "top-right"
            ? { ...base, top: side, right: margin }
            : pos === "bottom-left"
              ? { ...base, bottom: side, left: margin }
              : pos === "bottom-right"
                ? { ...base, bottom: side, right: margin }
                : pos === "left"
                  ? { ...base, left: side, top: h / 2, transform: "translate(-50%, -50%) rotate(-90deg)", transformOrigin: "center", marginLeft: 5 }
                  : pos === "right"
                    ? { ...base, right: side, top: h / 2, transform: "translate(50%, -50%) rotate(90deg)", transformOrigin: "center", marginRight: 5 }
                    : { ...base, ...wide, top: h / 2, textAlign: "center" as const, transform: "translateY(-50%)", fontSize: Math.round(Math.min(w, h) * 0.34), fontWeight: 800, opacity: 0.07, zIndex: 0 };
  return <div style={style}>{pos === "center" ? text.replace(/\D*(\w+).*/, "$1") : text}</div>;
}

type Group = { items: number[]; header: boolean; media: boolean };

/** A post with a numbered marker and a dotted line running down to the next post. */
function PostRow({ p, i, n, theme, o }: { p: PostData; i: number; n: number; theme: PaperTheme; o: ViewOpts }) {
  const last = i === n - 1;
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div style={{ width: 26, flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {o.numbers ? (
          <div style={{ width: 26, height: 26, borderRadius: 13, background: theme.fg, color: theme.bg, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</div>
        ) : (
          <div style={{ width: 10, height: 10, borderRadius: 5, background: theme.muted, marginTop: 4 }} />
        )}
        {!last && <div style={{ flex: 1, minHeight: 12, marginTop: 4, borderLeft: `2px dotted ${theme.muted}`, opacity: 0.7 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 18 }}>
        <PostBody p={p} i={i} n={n} theme={theme} o={{ ...o, numbers: false }} />
      </div>
    </div>
  );
}

/**
 * Splits the thread into pages. A post with a picture or video gets a page of its own; short text posts
 * are packed together so a page is not left mostly empty.
 */
function usePages(posts: PostData[], size: PageSizeId, orientation: Orientation, theme: PaperTheme, o: ViewOpts) {
  const { w, h, margin, footer } = pagePx(size, orientation);
  const boxW = w - margin * 2;
  const boxH = h - margin * 2 - footer;
  const ref = useRef<HTMLDivElement>(null);
  const [hs, setHs] = useState<Record<string, number>>({});
  const hasMedia = (p: PostData) => o.media && (p.photos.length > 0 || !!p.video);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>("[data-m]").forEach((n) => (next[n.dataset.m!] = n.offsetHeight));
      setHs((prev) => (Object.keys(next).length === Object.keys(prev).length && Object.keys(next).every((k) => prev[k] === next[k]) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    el.querySelectorAll("[data-m]").forEach((n) => ro.observe(n));
    return () => ro.disconnect();
  }, [posts, boxW, o.stats, o.media, o.numbers, o.hl, o.redact.name, o.redact.avatar]);

  const groups: Group[] = [];
  let cur: (Group & { used: number }) | null = null;
  let headerPending = true;
  const hH = hs.h ?? 90;
  const flush = () => {
    if (cur) groups.push({ items: cur.items, header: cur.header, media: false });
    cur = null;
  };
  posts.forEach((p, i) => {
    if (hasMedia(p)) {
      flush();
      groups.push({ items: [i], header: headerPending, media: true });
      headerPending = false;
      return;
    }
    const add = hs[i] ?? boxH;
    if (cur && cur.used + add > boxH) flush();
    if (!cur) {
      cur = { items: [], used: headerPending ? hH : 0, header: headerPending, media: false };
      headerPending = false;
    }
    (cur as Group & { used: number }).items.push(i);
    (cur as Group & { used: number }).used += add;
  });
  flush();

  const measurer = (
    <div ref={ref} aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, width: boxW, visibility: "hidden", pointerEvents: "none" }}>
      <div data-m="h"><AuthorHeader posts={posts} theme={theme} redact={o.redact} showCount={false} /></div>
      {posts.map((p, i) => (hasMedia(p) ? null : <div key={i} data-m={i}><PostRow p={p} i={i} n={posts.length} theme={theme} o={{ ...o, pick: false }} /></div>))}
    </div>
  );
  return { groups, measurer };
}

/** One page: its posts keep the same text size on every page; only a post taller than the page shrinks to fit. */
function Page({ posts, group, idx, total, size, orientation, theme, o }: { posts: PostData[]; group: Group; idx: number; total: number; size: PageSizeId; orientation: Orientation; theme: PaperTheme; o: ViewOpts }) {
  const { w, h, margin, footer } = pagePx(size, orientation);
  const boxW = w - margin * 2;
  const boxH = h - margin * 2 - footer;
  const inner = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const apply = (width: number, s: number, origin: string) => {
      el.style.width = `${width}px`;
      el.style.transform = `scale(${s})`;
      el.style.transformOrigin = origin;
    };
    const fit = () => {
      el.style.width = `${boxW}px`;
      apply(boxW, Math.min(1, boxH / Math.max(1, el.offsetHeight)), "top center");
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });

  return (
    <div data-page style={{ width: w, height: h, background: theme.bg, color: theme.fg, position: "relative", overflow: "hidden", flex: "none" }}>
      <LabelOverlay label={o.label} w={w} />
      <div style={{ position: "absolute", left: margin, top: margin, width: boxW, height: boxH, overflow: "hidden", zIndex: 1 }}>
        <div ref={inner}>
          {group.header && <AuthorHeader posts={posts} theme={theme} redact={o.redact} showCount={false} />}
          {group.items.map((i) => (
            <PostRow key={i} p={posts[i]} i={i} n={posts.length} theme={theme} o={o} />
          ))}
        </div>
      </div>
      <PageNumber text={formatPageNumber(idx, total, o.numFormat)} pos={o.numPos} w={w} h={h} margin={margin} theme={theme} />
    </div>
  );
}

/** Print preview: every page at its real proportions, scaled down to fit the available width. */
export function Pages({ posts, size, orientation, theme, o, containerWidth }: { posts: PostData[]; size: PageSizeId; orientation: Orientation; theme: PaperTheme; o: ViewOpts; containerWidth: number }) {
  const { w, h } = pagePx(size, orientation);
  const k = Math.min(1, Math.max(0.2, containerWidth / w));
  const { groups, measurer } = usePages(posts, size, orientation, theme, o);
  return (
    <div className="flex flex-col items-center gap-5">
      {measurer}
      {groups.map((g, i) => (
        <div key={g.items[0]} style={{ width: w * k, height: h * k, boxShadow: "0 2px 14px rgba(0,0,0,.18)", flex: "none" }}>
          <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: "top left" }}>
            <Page posts={posts} group={g} idx={i} total={groups.length} size={size} orientation={orientation} theme={theme} o={o} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The same pages at full size, kept off screen so they can be photographed into the PDF. */
export function PrintPages(props: { posts: PostData[]; size: PageSizeId; orientation: Orientation; theme: PaperTheme; o: ViewOpts }) {
  const { groups, measurer } = usePages(props.posts, props.size, props.orientation, props.theme, props.o);
  return (
    <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, display: "flex", flexDirection: "column" }}>
      {measurer}
      {groups.map((g, i) => (
        <Page key={g.items[0]} {...props} group={g} idx={i} total={groups.length} />
      ))}
    </div>
  );
}
