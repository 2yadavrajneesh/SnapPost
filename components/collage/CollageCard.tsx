"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, BIRD, Icon, XLOGO } from "@/components/TweetCard";
import { compact, formatDate, formatTime, photoSize, proxied } from "@/lib/format";
import { CARD_W } from "@/lib/collage";
import type { PostData } from "@/lib/types";

export type CardStyle = {
  theme: "light" | "dark";
  corners: "sharp" | "soft" | "round";
  logo: "x" | "bird" | "none";
  textSize: number; // px at CARD_W
  stats: boolean;
  media: boolean;
  dateTime: boolean;
  border: BorderKind;
  borderColor: string; // "auto" follows the card theme
};

export type BorderKind = "none" | "thin" | "thick" | "double" | "dashed" | "dotted";
export const BORDERS: Record<BorderKind, { label: string; css: string | null }> = {
  none: { label: "None", css: null },
  thin: { label: "Thin", css: "2px solid" },
  thick: { label: "Thick", css: "7px solid" },
  double: { label: "Double", css: "7px double" },
  dashed: { label: "Dashed", css: "4px dashed" },
  dotted: { label: "Dotted", css: "5px dotted" },
};
export const cardBorder = (style: CardStyle): string => {
  const b = BORDERS[style.border].css;
  if (!b) return "none";
  return `${b} ${style.borderColor === "auto" ? (style.theme === "dark" ? "#2f3336" : "#cfd9de") : style.borderColor}`;
};

const THEMES = {
  light: { card: "#ffffff", text: "#0f1419", muted: "#536471", border: "#cfd9de", soft: "#f7f9f9" },
  dark: { card: "#000000", text: "#e7e9ea", muted: "#71767b", border: "#2f3336", soft: "#16181c" },
};
const RADIUS = { sharp: 0, soft: 18, round: 34 } as const;
const FONT = `"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

function Media({ post, radius, t }: { post: PostData; radius: number; t: (typeof THEMES)["light"] }) {
  const r = Math.max(0, radius - 6);
  if (post.photos.length) {
    const photos = post.photos.slice(0, 4);
    const single = photos.length === 1;
    if (single) {
      return (
        <div style={{ position: "relative", flex: "1 1 auto", minHeight: 290, maxHeight: 460, marginTop: 16, borderRadius: r, overflow: "hidden", border: `1px solid ${t.border}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proxied(photoSize(photos[0], "large"))} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      );
    }
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: 16, borderRadius: r, overflow: "hidden", border: `1px solid ${t.border}` }}>
        {photos.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={proxied(photoSize(src, "large"))} alt="" crossOrigin="anonymous" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", gridColumn: photos.length === 3 && i === 0 ? "1 / -1" : undefined }} />
        ))}
      </div>
    );
  }
  if (post.video?.poster) {
    return (
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: 290, maxHeight: 460, marginTop: 16, borderRadius: r, overflow: "hidden", border: `1px solid ${t.border}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxied(post.video.poster)} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(0,0,0,.62)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
      </div>
    );
  }
  return null;
}

/**
 * One tweet, drawn at a fixed width (CARD_W) so every card has the same proportions.
 * The collage scales it into its cell; `onHeight` reports how tall it is at that width.
 */
function Body({ post, style, fill, width = CARD_W }: { post: PostData; style: CardStyle; fill?: number; width?: number }) {
  const t = THEMES[style.theme];
  const fs = style.textSize;

  const q = post.quote;
  const stats: [("reply" | "repost" | "like" | "views"), number][] = [["reply", post.replies], ["repost", post.reposts], ["like", post.likes]];
  if (post.views > 0) stats.push(["views", post.views]);

  return (
    <div style={{ width, minHeight: fill, boxSizing: "border-box", padding: 28, background: t.card, color: t.text, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={proxied(post.avatar)} alt="" crossOrigin="anonymous" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", flex: "none", background: t.soft }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 21, lineHeight: 1.2 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{post.name}</span>
            {post.verified && <Badge size={20} kind={post.verifiedType ?? "blue"} />}
          </div>
          <div style={{ color: t.muted, fontSize: 17, lineHeight: 1.3 }}>@{post.username}</div>
        </div>
        {style.logo !== "none" && (
          <svg width="26" height="26" viewBox="0 0 24 24" fill={style.logo === "bird" ? "#1d9bf0" : t.text} aria-hidden="true" style={{ flex: "none" }}>
            <path d={style.logo === "bird" ? BIRD : XLOGO} />
          </svg>
        )}
      </div>

      {post.text && <div style={{ marginTop: 16, fontSize: fs, lineHeight: 1.38, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{post.text}</div>}

      {style.media && <Media post={post} radius={RADIUS[style.corners]} t={t} />}

      {q && (
        <div style={{ marginTop: 16, border: `1px solid ${t.border}`, borderRadius: Math.max(0, RADIUS[style.corners] - 6), padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 17, lineHeight: 1.3 }}>
            <span style={{ fontWeight: 800 }}>{q.name}</span>
            {q.verified && <Badge size={16} kind={q.verifiedType ?? "blue"} />}
            <span style={{ color: t.muted }}>@{q.username}</span>
          </div>
          {q.text && <div style={{ marginTop: 6, fontSize: Math.round(fs * 0.82), lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{q.text.length > 260 ? q.text.slice(0, 257) + "…" : q.text}</div>}
          {style.media && q.photos[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxied(photoSize(q.photos[0], "medium"))} alt="" crossOrigin="anonymous" style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block", marginTop: 10, borderRadius: Math.max(0, RADIUS[style.corners] - 10) }} />
          )}
        </div>
      )}

      <div style={{ marginTop: "auto" }}>
      {style.dateTime && post.timestamp && (
        <div style={{ marginTop: 16, color: t.muted, fontSize: 16 }}>{formatTime(post.timestamp)} · {formatDate(post.timestamp)}</div>
      )}

      {style.stats && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${t.border}`, display: "flex", flexWrap: "wrap", gap: "8px 24px", color: t.muted, fontSize: 16, alignItems: "center" }}>
          {stats.map(([name, n]) => (
            <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
              <Icon name={name} size={19} />
              {compact(n)}
            </span>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * One tweet. By default it is drawn at CARD_W so every card has the same proportions.
 * With `fitBox` (a cell's size in the picture) the card works out the width that lets the whole tweet fill
 * that box as large as possible: a tall tweet is drawn wider so its text wraps less, a short one narrower so
 * its text grows. `onFit` reports that width and the tweet's height at it.
 * `onHeight` reports how tall the tweet is at CARD_W, measured from a hidden copy so stretching never skews it.
 */
export default function CollageCard({ post, style, fill, width = CARD_W, onHeight, fitBox, onFit }: { post: PostData; style: CardStyle; fill?: number; width?: number; onHeight?: (h: number) => void; fitBox?: { w: number; h: number }; onFit?: (w: number, h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const [natH, setNatH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const report = () => {
      onHeight(el.offsetHeight);
      setNatH(el.offsetHeight);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  const fw = fitBox?.w ?? 0;
  const fh = fitBox?.h ?? 0;
  useEffect(() => {
    const el = fitRef.current?.firstElementChild as HTMLElement | null | undefined;
    if (!el || !fw || !fh || !onFit) return;
    const hAt = (w: number) => {
      el.style.width = `${w}px`;
      return el.offsetHeight;
    };
    // the output height of the tweet at logical width w is hAt(w) * fw / w; find the narrowest w that fits
    const fits = (w: number) => (hAt(w) * fw) / w <= fh;
    let lo = 340;
    let hi = Math.max(CARD_W, fw / 0.3);
    let w: number;
    if (fits(lo)) w = lo;
    else if (!fits(hi)) w = hi;
    else {
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid;
        else lo = mid;
      }
      w = hi;
    }
    onFit(Math.round(w), hAt(Math.round(w)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fw, fh, post, style, natH]);

  return (
    <div style={{ position: "relative", width }}>
      <Body post={post} style={style} fill={fill} width={width} />
      {onHeight && (
        <div ref={ref} data-no-export="" aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, visibility: "hidden", pointerEvents: "none" }}>
          <Body post={post} style={style} />
        </div>
      )}
      {fitBox && (
        <div ref={fitRef} data-no-export="" aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, visibility: "hidden", pointerEvents: "none" }}>
          <Body post={post} style={style} />
        </div>
      )}
    </div>
  );
}
