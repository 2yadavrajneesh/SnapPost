"use client";

import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compact, formatDate, formatTime, proxied, relativeTime, videoSrc } from "@/lib/format";
import { FRAME_W, RATIOS, type PostData, type Settings, type TweetData, type VideoData } from "@/lib/types";

const FONTS: Record<Settings["font"], string> = {
  sans: `"TwitterChirp", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
  rounded: `ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif`,
  serif: `Georgia, "Times New Roman", serif`,
};

const BLUE = "#1d9bf0";

const THEMES = {
  light: { card: "#ffffff", text: "#0f1419", muted: "#536471", border: "#cfd9de" },
  dark: { card: "#000000", text: "#e7e9ea", muted: "#71767b", border: "#2f3336" },
};

const RADIUS: Record<Settings["corners"], number> = { sharp: 0, soft: 24, round: 52 };

type Theme = (typeof THEMES)["light"];
type OpenMedia = (images: string[], index: number) => void;

export type DisplayInfo = { likes: boolean; reposts: boolean; replies: boolean; dateTime: boolean; views: boolean };
export const ALL_INFO: DisplayInfo = { likes: true, reposts: true, replies: true, dateTime: true, views: true };

type StatItem = [Parameters<typeof Icon>[0]["name"], number];
/** Which engagement counters are visible, given the "Post details" checkboxes. */
function statItems(v: { replies: number; reposts: number; likes: number; views: number }, info: DisplayInfo, withViews: boolean): StatItem[] {
  return [
    ...(info.replies ? [["reply", v.replies] as StatItem] : []),
    ...(info.reposts ? [["repost", v.reposts] as StatItem] : []),
    ...(info.likes ? [["like", v.likes] as StatItem] : []),
    ...(withViews && info.views ? [["views", v.views] as StatItem] : []),
  ];
}

/* ---------- Icons ---------- */

export const XLOGO =
  "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z";
export const BIRD =
  "M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z";

function Logo({ kind, size, color }: { kind: Settings["logo"]; size: number; color: string }) {
  if (kind === "none") return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={kind === "bird" ? BLUE : color} aria-hidden="true" style={{ flex: "none" }}>
      <path d={kind === "bird" ? BIRD : XLOGO} />
    </svg>
  );
}

function Badge({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Verified" style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="11" fill={BLUE} />
      <path d="M7 12.5l3.2 3.2L17 8.9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Icon({ name, size }: { name: "reply" | "repost" | "like" | "views"; size: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: { flex: "none" as const } };
  switch (name) {
    case "reply":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 11.5a8.5 8.5 0 0 1-12.5 7.5L3 20.5l1.5-5A8.5 8.5 0 1 1 21 11.5z" />
        </svg>
      );
    case "repost":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11V9a3 3 0 0 1 3-3h15" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v2a3 3 0 0 1-3 3H3" />
        </svg>
      );
    case "like":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "views":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 20V10" />
          <path d="M18 20V4" />
          <path d="M6 20v-4" />
        </svg>
      );
  }
}

function Stats({ items, size, gap }: { items: StatItem[]; size: number; gap: number }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: gap, rowGap: gap / 2 }}>
      {items.map(([name, n]) => (
        <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4 }}>
          <Icon name={name} size={size * 1.25} />
          {compact(n)}
        </span>
      ))}
    </div>
  );
}

/* ---------- Avatar ---------- */

function Avatar({ src, name, size }: { src: string; name: string; size: number }) {
  // Try our same-origin proxy first, then the original URL, then the small "_normal" size; only then
  // fall back to the initial. The retry counter belongs to one src, so a new tweet starts fresh.
  const attempts = useMemo(() => {
    if (!src) return [];
    const list = [proxied(src), src, src.replace("_400x400.", "_normal.")].map((u) => (u === src || u.startsWith("/") || u.startsWith("data:") ? u : proxied(u)));
    return list.filter((u, i) => u && list.indexOf(u) === i);
  }, [src]);
  const [state, setState] = useState({ src, tried: 0 });
  const tried = state.src === src ? state.tried : 0;
  const url = attempts[tried];
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={url}
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => setState({ src, tried: tried + 1 })}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BLUE,
        color: "#fff",
        fontWeight: 700,
        fontSize: Math.round(size * 0.45),
      }}
    >
      {(name || "?").trim().charAt(0).toUpperCase()}
    </div>
  );
}

/* ---------- Media: photos (full, uncropped, click to enlarge) and playable video ---------- */

const FILL: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" };

/** Small "enlarge" button over media. Preview-only: left out of exported images. */
function ExpandBadge({ size, onClick }: { size: number; onClick: () => void }) {
  return (
    <button
      type="button"
      data-no-export=""
      aria-label="Enlarge image"
      onClick={onClick}
      style={{
        position: "absolute",
        top: Math.round(size * 0.3),
        right: Math.round(size * 0.3),
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        border: "1px solid rgba(255,255,255,0.35)",
        background: "rgba(15,20,25,0.62)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "zoom-in",
        padding: 0,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
      </svg>
    </button>
  );
}

/** One photo. Fills the width, but in a fixed-ratio frame it is also capped to the media budget (--snap-media-max). */
function PhotoImg({
  src,
  radius,
  border,
  maxShare,
  onClick,
}: {
  src: string;
  radius: number;
  border: string;
  maxShare: number;
  onClick?: () => void;
}) {
  const [aspect, setAspect] = useState(1.5); // width / height, known once the image has loaded
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxied(src)}
      alt=""
      onClick={onClick}
      onLoad={(e) => {
        const im = e.currentTarget;
        if (im.naturalWidth && im.naturalHeight) setAspect(im.naturalWidth / im.naturalHeight);
      }}
      style={{
        display: "block",
        width: `min(100%, calc(var(--snap-media-max, 100000px) * ${maxShare.toFixed(3)} * ${aspect.toFixed(4)}))`,
        height: "auto",
        margin: "0 auto",
        borderRadius: radius,
        border,
        cursor: onClick ? "zoom-in" : undefined,
      }}
    />
  );
}

function Photos({
  photos,
  fs,
  marginTop,
  radius,
  border,
  onOpen,
}: {
  photos: string[];
  fs: number;
  marginTop: number;
  radius: number;
  border: string;
  onOpen?: OpenMedia;
}) {
  // One photo spans the card; several are laid out in two columns. Every photo keeps its own
  // aspect ratio, so nothing is cropped.
  const cols = photos.length === 1 ? 1 : 2;
  const columns: { src: string; idx: number }[][] = Array.from({ length: cols }, () => []);
  photos.forEach((src, idx) => columns[idx % cols].push({ src, idx }));
  const gap = Math.max(4, Math.round(fs * 0.15));
  const share = 1 / Math.ceil(photos.length / cols); // photos stacked in a column split the media budget

  return (
    <div data-media style={{ display: "flex", gap, marginTop, alignItems: "flex-start" }}>
      {columns.map((col, c) => (
        <div key={c} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap }}>
          {col.map(({ src, idx }) => (
            <div key={idx} style={{ position: "relative" }}>
              <PhotoImg src={src} radius={radius} border={border} maxShare={share} onClick={onOpen ? () => onOpen(photos, idx) : undefined} />
              {onOpen && <ExpandBadge size={Math.round(fs * 1.1)} onClick={() => onOpen(photos, idx)} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function VideoPlayer({
  video,
  fs,
  marginTop,
  radius,
  border,
  maxHeight,
}: {
  video: VideoData;
  fs: number;
  marginTop: number;
  radius: number;
  border: string;
  maxHeight: number;
}) {
  // Try each MP4 through our same-origin proxy first, then directly; HLS is the last resort.
  const attempts = useMemo(() => {
    const list = video.sources.flatMap((s) => [videoSrc(s), s]);
    if (video.hls) list.push(video.hls);
    return list;
  }, [video]);
  const [tried, setTried] = useState(0);
  const src = attempts[tried];
  const poster = video.poster ? proxied(video.poster) : undefined;
  const badge = Math.round(fs * 1.8);

  return (
    <div
      data-media
      style={{
        position: "relative",
        marginTop,
        width: `min(100%, calc(var(--snap-media-max, 100000px) * ${(video.width / video.height).toFixed(4)}))`,
        marginLeft: "auto",
        marginRight: "auto",
        aspectRatio: `${video.width} / ${video.height}`,
        maxHeight,
        overflow: "hidden",
        background: "#000",
        borderRadius: radius,
        border,
      }}
    >
      {/* Poster + play badge sit under the <video>: they're what shows in exported files. */}
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img data-video-ui="" src={poster} alt="" style={FILL} />
      )}
      {!video.gif && (
        <div
          data-video-ui=""
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: badge,
            height: badge,
            marginLeft: -badge / 2,
            marginTop: -badge / 2,
            borderRadius: "50%",
            background: "rgba(0,0,0,0.6)",
            border: "3px solid rgba(255,255,255,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={badge * 0.45} height={badge * 0.45} viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}
      {src ? (
        <video
          key={src}
          src={src}
          poster={poster}
          controls={!video.gif}
          autoPlay={video.gif}
          loop={video.gif}
          muted={video.gif}
          playsInline
          preload="metadata"
          onError={() => setTried((n) => n + 1)}
          style={FILL}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "6px 10px",
            background: "rgba(0,0,0,0.7)",
            color: "#fff",
            fontSize: Math.round(fs * 0.45),
            textAlign: "center",
          }}
        >
          This video couldn&apos;t be loaded here.
        </div>
      )}
    </div>
  );
}

function Media({
  photos,
  video,
  fs,
  marginTop,
  radius,
  border,
  videoMaxHeight,
  onOpen,
}: {
  photos: string[];
  video: VideoData | null;
  fs: number;
  marginTop: number;
  radius: number;
  border: string;
  videoMaxHeight: number;
  onOpen?: OpenMedia;
}) {
  return (
    <>
      {photos.length > 0 && <Photos photos={photos} fs={fs} marginTop={marginTop} radius={radius} border={border} onOpen={onOpen} />}
      {video && (
        <VideoPlayer
          key={video.sources.join("|") + (video.hls ?? "")}
          video={video}
          fs={fs}
          marginTop={marginTop}
          radius={radius}
          border={border}
          maxHeight={videoMaxHeight}
        />
      )}
    </>
  );
}

/* ---------- Quoted post (recursive) ---------- */

function QuoteCard({
  q,
  fs,
  t,
  radius,
  depth,
  showMedia,
  info,
  onOpen,
}: {
  q: PostData;
  fs: number;
  t: Theme;
  radius: number;
  depth: number;
  showMedia: boolean;
  info: DisplayInfo;
  onOpen?: OpenMedia;
}) {
  const small = Math.round(fs * (depth === 0 ? 0.74 : 0.68));
  const stats = statItems(q, info, true);
  const hasStats = stats.length > 0 && q.replies + q.reposts + q.likes + q.views > 0;
  return (
    <div
      style={{
        marginTop: Math.round(fs * 0.6),
        border: `1px solid ${t.border}`,
        borderRadius: Math.round(radius * 0.55),
        padding: Math.round(fs * 0.55),
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: Math.round(fs * 0.35) }}>
        <Avatar src={q.avatar} name={q.name} size={Math.round(fs * 1.25)} />
        <div style={{ display: "flex", alignItems: "center", gap: Math.round(fs * 0.2), minWidth: 0, fontSize: small, lineHeight: 1.25 }}>
          <span style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.name}</span>
          {q.verified && <Badge size={Math.round(small * 1.05)} />}
          <span style={{ color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>@{q.username}</span>
          {q.timestamp && info.dateTime && <span style={{ color: t.muted, whiteSpace: "nowrap" }}>· {relativeTime(q.timestamp)}</span>}
        </div>
      </div>

      <div style={{ marginTop: Math.round(fs * 0.3), fontSize: Math.round(fs * 0.85), lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {q.text}
      </div>

      {showMedia && (
        <Media
          photos={q.photos}
          video={q.video}
          fs={fs}
          marginTop={Math.round(fs * 0.5)}
          radius={Math.round(radius * 0.4)}
          border={`1px solid ${t.border}`}
          videoMaxHeight={Math.round(fs * 10)}
          onOpen={onOpen}
        />
      )}

      {q.quote && depth < 1 && <QuoteCard q={q.quote} fs={fs} t={t} radius={radius} depth={depth + 1} showMedia={showMedia} info={info} onOpen={onOpen} />}

      {hasStats && depth === 0 && (
        <div style={{ marginTop: Math.round(fs * 0.5), color: t.muted, fontSize: Math.round(fs * 0.55) }}>
          <Stats
            size={Math.round(fs * 0.5)}
            gap={Math.round(fs * 0.9)}
            items={stats}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Parent posts above a reply (what the reply is answering), joined by a connector line ---------- */

function ParentChain({
  posts,
  fs,
  t,
  info,
  showMedia,
  radius,
  onOpen,
}: {
  posts: PostData[];
  fs: number;
  t: Theme;
  info: DisplayInfo;
  showMedia: boolean;
  radius: number;
  onOpen?: OpenMedia;
}) {
  const avatar = Math.round(fs * 1.25);
  const nameSize = Math.round(fs * 0.72);
  return (
    <div>
      {posts.map((p, i) => (
        <div key={p.id || i} style={{ display: "flex", gap: Math.round(fs * 0.5) }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: avatar }}>
            <Avatar src={p.avatar} name={p.name || p.username} size={avatar} />
            <div style={{ flex: 1, width: 3, marginTop: Math.round(fs * 0.2), background: t.border, borderRadius: 2 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingBottom: Math.round(fs * 0.8) }}>
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(fs * 0.2), lineHeight: 1.25, fontSize: nameSize }}>
              <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              {p.verified && <Badge size={Math.round(nameSize * 1.05)} />}
              <span style={{ color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                @{p.username}
                {p.timestamp && info.dateTime ? ` · ${formatDate(p.timestamp)}` : ""}
              </span>
            </div>
            <div style={{ marginTop: Math.round(fs * 0.2), fontSize: Math.round(fs * 0.9), lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {p.text}
            </div>
            {showMedia && (
              <Media
                photos={p.photos}
                video={p.video}
                fs={fs}
                marginTop={Math.round(fs * 0.45)}
                radius={Math.round(radius * 0.55)}
                border={`1px solid ${t.border}`}
                videoMaxHeight={Math.round(fs * 10)}
                onOpen={onOpen}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Full thread: every post in order, joined by a connector line ---------- */

function ThreadView({
  posts,
  fs,
  t,
  radius,
  logo,
  showQuote,
  showMedia,
  info,
  onOpen,
}: {
  posts: PostData[];
  fs: number;
  t: Theme;
  radius: number;
  logo: Settings["logo"];
  showQuote: boolean;
  showMedia: boolean;
  info: DisplayInfo;
  onOpen?: OpenMedia;
}) {
  const avatar = Math.round(fs * 1.5);
  const nameSize = Math.round(fs * 0.72);
  const textSize = Math.round(fs * 0.92);
  const first = posts[0];

  return (
    <div>
      {posts.map((p, i) => {
        const last = i === posts.length - 1;
        const stats = statItems(p, info, true);
        const hasStats = stats.length > 0 && p.replies + p.reposts + p.likes + p.views > 0;
        return (
          <div key={p.id || i} style={{ display: "flex", gap: Math.round(fs * 0.5) }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none", width: avatar }}>
              <Avatar src={p.avatar} name={p.name || p.username} size={avatar} />
              {!last && (
                <div
                  style={{
                    flex: 1,
                    width: 3,
                    marginTop: Math.round(fs * 0.2),
                    marginBottom: Math.round(fs * 0.2),
                    background: t.border,
                    borderRadius: 2,
                  }}
                />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : Math.round(fs * 0.9) }}>
              <div style={{ display: "flex", alignItems: "center", gap: Math.round(fs * 0.2), lineHeight: 1.25, fontSize: nameSize }}>
                <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                {p.verified && <Badge size={Math.round(nameSize * 1.05)} />}
                <span style={{ color: t.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  @{p.username}
                  {p.timestamp && info.dateTime ? ` · ${relativeTime(p.timestamp)}` : ""}
                </span>
                {i === 0 && <Logo kind={logo} size={Math.round(fs * 1.35)} color={t.text} />}
              </div>

              <div style={{ marginTop: Math.round(fs * 0.3), fontSize: textSize, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {p.text}
              </div>

              {showMedia && (
                <Media
                  photos={p.photos}
                  video={p.video}
                  fs={fs}
                  marginTop={Math.round(fs * 0.5)}
                  radius={Math.round(radius * 0.55)}
                  border={`1px solid ${t.border}`}
                  videoMaxHeight={Math.round(fs * 12)}
                  onOpen={onOpen}
                />
              )}

              {showQuote && p.quote && <QuoteCard q={p.quote} fs={fs} t={t} radius={radius} depth={0} showMedia={showMedia} info={info} onOpen={onOpen} />}

              {hasStats && (
                <div style={{ marginTop: Math.round(fs * 0.45), color: t.muted, fontSize: Math.round(fs * 0.5) }}>
                  <Stats
                    size={Math.round(fs * 0.5)}
                    gap={Math.round(fs * 0.9)}
                    items={stats}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {first?.timestamp && info.dateTime && (
        <div style={{ marginTop: Math.round(fs * 0.7), color: t.muted, fontSize: Math.round(fs * 0.5) }}>
          {formatTime(first.timestamp)} · {formatDate(first.timestamp)} · {posts.length} posts
        </div>
      )}
    </div>
  );
}

/* ---------- Main card ---------- */

type Props = {
  tweet: TweetData;
  settings: Settings;
  /** When set (2+ posts), the card shows the whole thread instead of the single tweet. */
  thread?: PostData[] | null;
  onOpenMedia?: OpenMedia;
  showQuote?: boolean;
  showMedia?: boolean;
  /** Posts above a reply: shown when `showParents` is on; their media follows `showParentMedia`. */
  showParents?: boolean;
  showParentMedia?: boolean;
  displayInfo?: DisplayInfo;
};

/**
 * The exportable frame. It renders at a fixed logical width (FRAME_W) and is scaled
 * down by its parent for preview, so exports are always crisp and predictable.
 *
 * With a fixed output ratio the whole post re-fits to the frame (scaled up or down and re-wrapped),
 * so the text, layout and all media always stay visible and the frame is used well.
 */
const MIN_FIT = 0.2;
const MAX_FIT = 3;
/** Share of a fixed-ratio frame's inner height that attached media may occupy. */
const MEDIA_BUDGET = 0.55;

const TweetCard = forwardRef<HTMLDivElement, Props>(function TweetCard({ tweet, settings, thread, onOpenMedia, showQuote = true, showMedia = true, showParents = true, showParentMedia = true, displayInfo = ALL_INFO }, ref) {
  const t = THEMES[settings.theme];
  const fs = settings.textSize;
  const p = settings.padding / 100;
  const radius = RADIUS[settings.corners];
  const minimal = settings.style === "minimal";
  const ratio = RATIOS[settings.ratio].value;

  const framePad = Math.round((minimal ? 96 : 72) * p);
  const cardPad = minimal ? 0 : Math.round(fs * 1.1 * p);
  const gap = Math.round(fs * 0.7);
  const nameSize = Math.round(fs * 0.8);
  const showThread = !!thread && thread.length > 1;
  const isReply = !!tweet.replyingTo && tweet.replyingTo.toLowerCase() !== tweet.username.toLowerCase();
  const footerStats = statItems(tweet, displayInfo, false);
  const showTime = displayInfo.dateTime;
  const showViews = displayInfo.views && tweet.views > 0;

  // Fixed ratio: the whole post (text, layout, media) re-fits to the frame. We search for the
  // largest scale at which the content, re-wrapped to the width that scale leaves it, still fits the
  // height. A bigger scale means a narrower logical width, so text re-wraps and media re-sizes too.
  // Auto ratio: no fitting, the frame simply hugs the content.
  const innerRef = useRef<HTMLDivElement>(null);
  const mediaN = useRef(1);
  const [fit, setFit] = useState<number | null>(null);
  const frameH = ratio ? Math.round(FRAME_W / ratio) : 0;
  const availW = FRAME_W - 2 * framePad;
  const availH = frameH - 2 * framePad;
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || !ratio) {
      setFit(null);
      return;
    }
    const apply = (sc: number) => {
      el.style.width = `${availW / sc}px`;
      el.style.transform = `scale(${sc})`;
      mediaN.current = Math.max(1, el.querySelectorAll("[data-media]").length);
      el.style.setProperty("--snap-media-max", `${(availH * MEDIA_BUDGET) / mediaN.current / sc}px`);
      return el.offsetHeight * sc;
    };
    const run = () => {
      let lo = MIN_FIT;
      let hi = MAX_FIT;
      if (apply(lo) > availH) {
        apply(lo);
        setFit((prev) => (prev !== null && Math.abs(prev - lo) < 0.002 ? prev : lo));
        return;
      }
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (apply(mid) <= availH) lo = mid;
        else hi = mid;
      }
      apply(lo); // leave the DOM exactly at the chosen scale
      setFit((prev) => (prev !== null && Math.abs(prev - lo) < 0.002 ? prev : lo));
    };
    run();
    const ro = new ResizeObserver(run); // images and fonts finishing loading change the height
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, availW, availH, fs, tweet, thread, showQuote, showMedia, showParents, showParentMedia, displayInfo, settings.font, settings.logo, minimal]);

  return (
    <div
      ref={ref}
      data-snap-frame=""
      style={{
        width: FRAME_W,
        height: ratio ? Math.round(FRAME_W / ratio) : undefined,
        minHeight: ratio ? undefined : 240,
        boxSizing: "border-box",
        padding: framePad,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        // Corners apply to the whole picture (so exports are rounded too), not just the inner card.
        borderRadius: radius,
        // No panel behind the post in either theme: only the tweet itself is visible (Minimalist keeps its solid fill).
        background: minimal ? t.card : "transparent",
        color: t.text,
        fontFamily: FONTS[settings.font],
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: ratio && fit ? availW / fit : "100%",
          flex: "none",
          boxSizing: "border-box",
          padding: cardPad,
          background: minimal ? "transparent" : t.card,
          borderRadius: minimal ? 0 : radius,
          overflow: "hidden",
          // No drop shadow: the frame is transparent, so a shadow would be clipped into a visible halo.
          boxShadow: minimal ? "none" : settings.theme === "light" ? "0 0 0 1px rgba(0,0,0,0.06)" : "0 0 0 1px rgba(255,255,255,0.08)",
          transform: ratio && fit ? `scale(${fit})` : undefined,
          ...(ratio && fit ? ({ "--snap-media-max": `${(availH * MEDIA_BUDGET) / mediaN.current / fit}px` } as React.CSSProperties) : {}),
          transformOrigin: "center center",
        }}
      >
        {showThread ? (
          <ThreadView posts={thread!} fs={fs} t={t} radius={radius} logo={settings.logo} showQuote={showQuote} showMedia={showMedia} info={displayInfo} onOpen={onOpenMedia} />
        ) : (
          <>
            {/* Posts being replied to, with a connector line down to this reply */}
            {showParents && !!tweet.parents?.length && (
              <ParentChain posts={tweet.parents} fs={fs} t={t} info={displayInfo} showMedia={showParentMedia} radius={radius} onOpen={onOpenMedia} />
            )}

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(fs * 0.4) }}>
              <Avatar src={tweet.avatar} name={tweet.name || tweet.username} size={Math.round(fs * 1.5)} />
              <div style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
                <div style={{ display: "flex", alignItems: "center", gap: Math.round(fs * 0.2) }}>
                  <span style={{ fontSize: nameSize, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tweet.name || "Display name"}
                  </span>
                  {tweet.verified && <Badge size={Math.round(nameSize * 1.05)} />}
                </div>
                <div style={{ fontSize: nameSize, color: t.muted }}>@{tweet.username || "username"}</div>
              </div>
              <Logo kind={settings.logo} size={Math.round(fs * 1.05)} color={t.text} />
            </div>

            {isReply && (
              <div style={{ marginTop: gap, display: "flex", alignItems: "center", gap: Math.round(fs * 0.3), color: t.muted, fontSize: Math.round(fs * 0.62) }}>
                <Icon name="reply" size={Math.round(fs * 0.7)} />
                <span>
                  Replying to <span style={{ color: BLUE }}>@{tweet.replyingTo}</span>
                </span>
              </div>
            )}

            {/* Text */}
            <div style={{ marginTop: isReply ? Math.round(gap * 0.5) : gap, fontSize: fs, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {tweet.text || "Tweet text"}
            </div>

            {/* Media */}
            {showMedia && (
              <Media
                photos={tweet.photos}
                video={tweet.video}
                fs={fs}
                marginTop={gap}
                radius={Math.round(radius * 0.55)}
                border={`1px solid ${t.border}`}
                videoMaxHeight={Math.round(fs * 14)}
                onOpen={onOpenMedia}
              />
            )}

            {/* Quoted post */}
            {showQuote && tweet.quote && <QuoteCard q={tweet.quote} fs={fs} t={t} radius={radius} depth={0} showMedia={showMedia} info={displayInfo} onOpen={onOpenMedia} />}

            {/* Footer: stats left, time right (each part only when its checkbox is on) */}
            {(footerStats.length > 0 || showTime || showViews) && (
              <div
                style={{
                  marginTop: gap,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  columnGap: gap,
                  rowGap: Math.round(fs * 0.3),
                  color: t.muted,
                  fontSize: Math.round(fs * 0.58),
                }}
              >
                <Stats size={Math.round(fs * 0.58)} gap={Math.round(fs * 1.0)} items={footerStats} />
                {(showTime || showViews) && (
                  <span style={{ marginLeft: "auto" }}>
                    {showTime ? `${tweet.time} · ${tweet.date}` : ""}
                    {showViews && (
                      <>
                        {showTime ? " · " : ""}
                        <b style={{ color: t.text }}>{compact(tweet.views)}</b> Views
                      </>
                    )}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default TweetCard;
