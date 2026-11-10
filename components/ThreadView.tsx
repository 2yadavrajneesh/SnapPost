"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { compact, formatDate, formatTime, proxied } from "@/lib/format";
import { PAGE_SIZES, type Orientation, type PageSizeId, type PaperTheme } from "@/lib/paper";
import type { PostData } from "@/lib/types";

export type ViewOpts = { numbers: boolean; media: boolean; stats: boolean; printing: boolean };

const handle = (p: PostData) => `@${p.username}`;
const MM = 96 / 25.4;

/** Logical pixel size of a page (96 dpi), so the preview and the PDF share one layout. */
export function pagePx(size: PageSizeId, orientation: Orientation) {
  const s = PAGE_SIZES.find((x) => x.id === size) ?? PAGE_SIZES[0];
  const [w, h] = orientation === "landscape" ? [s.h, s.w] : [s.w, s.h];
  return { w: Math.round(w * MM), h: Math.round(h * MM), margin: Math.round(Math.max(8, Math.min(14, w * 0.06)) * MM), footer: 30 };
}

export function AuthorHeader({ posts, theme }: { posts: PostData[]; theme: PaperTheme }) {
  const a = posts[0];
  return (
    <header className="flex items-center gap-3 pb-4" style={{ borderBottom: `1px solid ${theme.line}`, marginBottom: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {a.avatar ? <img src={proxied(a.avatar)} alt="" className="h-11 w-11 rounded-full object-cover" /> : <div className="h-11 w-11 rounded-full" style={{ background: theme.line }} />}
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{a.name}</div>
        <div className="truncate text-xs" style={{ color: theme.muted }}>
          {handle(a)} · {posts.length} post{posts.length === 1 ? "" : "s"}
          {a.timestamp ? ` · ${formatDate(a.timestamp)}` : ""}
        </div>
      </div>
    </header>
  );
}

export function PostBody({ p, i, n, theme, o }: { p: PostData; i: number; n: number; theme: PaperTheme; o: ViewOpts }) {
  const frame = { border: `1px solid ${theme.line}` };
  return (
    <div>
      {o.numbers && n > 1 && (
        <div className="mb-1 text-[11px] font-semibold tabular-nums" style={{ color: theme.muted }}>
          {i + 1}/{n}
        </div>
      )}
      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{p.text}</p>
      {o.media && p.photos.length > 0 && (
        <div className={`mt-3 grid gap-1.5 ${p.photos.length > 1 ? "grid-cols-2" : ""}`}>
          {p.photos.map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={proxied(u)} alt="" loading="eager" className="w-full object-cover" style={frame} />
          ))}
        </div>
      )}
      {o.media &&
        p.video &&
        (o.printing ? (
          p.video.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxied(p.video.poster)} alt="Video" className="mt-3 w-full object-cover" style={frame} />
          ) : null
        ) : (
          <video className="mt-3 w-full bg-black" style={frame} controls preload="none" poster={p.video.poster ? proxied(p.video.poster) : undefined} src={p.video.sources[0] ? `/api/video?url=${encodeURIComponent(p.video.sources[0])}` : undefined} />
        ))}
      <div className="mt-2 flex flex-wrap gap-x-4 text-[11px]" style={{ color: theme.muted }}>
        {p.timestamp && <span>{formatTime(p.timestamp)}</span>}
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
    <article className="mx-auto w-full p-4" style={{ maxWidth: width, background: theme.bg, color: theme.fg, border: `1px solid ${theme.line}` }}>
      <AuthorHeader posts={posts} theme={theme} />
      <ol>
        {posts.map((p, i) => (
          <li key={p.id || i} className="py-4" style={{ borderBottom: i < posts.length - 1 ? `1px solid ${theme.line}` : undefined }}>
            <PostBody p={p} i={i} n={posts.length} theme={theme} o={o} />
          </li>
        ))}
      </ol>
    </article>
  );
}

/** One post per page. The post is shrunk (never cut) when it is taller than the page. */
function Page({ posts, i, size, orientation, theme, o }: { posts: PostData[]; i: number; size: PageSizeId; orientation: Orientation; theme: PaperTheme; o: ViewOpts }) {
  const { w, h, margin, footer } = pagePx(size, orientation);
  const boxW = w - margin * 2;
  const boxH = h - margin * 2 - footer;
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, boxH / Math.max(1, el.offsetHeight)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [boxH, boxW, i]);

  const p = posts[i];
  return (
    <div data-page style={{ width: w, height: h, background: theme.bg, color: theme.fg, position: "relative", overflow: "hidden", flex: "none" }}>
      <div style={{ position: "absolute", left: margin, top: margin, width: boxW, height: boxH, overflow: "hidden" }}>
        <div ref={inner} style={{ width: boxW, transform: `scale(${scale})`, transformOrigin: "top center" }}>
          {i === 0 && <AuthorHeader posts={posts} theme={theme} />}
          <PostBody p={p} i={i} n={posts.length} theme={theme} o={o} />
        </div>
      </div>
      <div className="flex justify-between text-[11px]" style={{ position: "absolute", left: margin, right: margin, bottom: margin * 0.45, color: theme.muted }}>
        <span>
          {handle(posts[0])} · post {i + 1} of {posts.length}
        </span>
        <span>page {i + 1} / {posts.length}</span>
      </div>
    </div>
  );
}

/** Print preview: every page at its real proportions, scaled down to fit the available width. */
export function Pages({ posts, size, orientation, theme, o, containerWidth }: { posts: PostData[]; size: PageSizeId; orientation: Orientation; theme: PaperTheme; o: ViewOpts; containerWidth: number }) {
  const { w, h } = pagePx(size, orientation);
  const k = Math.min(1, Math.max(0.2, containerWidth / w));
  return (
    <div className="flex flex-col items-center gap-5">
      {posts.map((_, i) => (
        <div key={i} style={{ width: w * k, height: h * k, boxShadow: "0 2px 14px rgba(0,0,0,.18)", flex: "none" }}>
          <div style={{ width: w, height: h, transform: `scale(${k})`, transformOrigin: "top left" }}>
            <Page posts={posts} i={i} size={size} orientation={orientation} theme={theme} o={o} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** The same pages at full size, kept off screen so they can be photographed into the PDF. */
export function PrintPages(props: { posts: PostData[]; size: PageSizeId; orientation: Orientation; theme: PaperTheme; o: ViewOpts }) {
  return (
    <div aria-hidden="true" style={{ position: "fixed", left: -100000, top: 0, display: "flex", flexDirection: "column" }}>
      {props.posts.map((_, i) => (
        <Page key={i} {...props} i={i} />
      ))}
    </div>
  );
}
