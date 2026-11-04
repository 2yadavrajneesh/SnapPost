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

function Stats({ items, size, gap }: { items: [Parameters<typeof Icon>[0]["name"], number][]; size: number; gap: number }) {
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
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={proxied(src)}
        alt=""
        width={size}
        height={size}
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

  return (
    <div style={{ display: "flex", gap, marginTop, alignItems: "flex-start" }}>
      {columns.map((col, c) => (
        <div key={c} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap }}>
          {col.map(({ src, idx }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={idx}
              src={proxied(src)}
              alt=""
              onClick={onOpen ? () => onOpen(photos, idx) : undefined}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                borderRadius: radius,
                border,
                cursor: onOpen ? "zoom-in" : undefined,
              }}
            />
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
      style={{
        position: "relative",
        marginTop,
        width: "100%",
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
        <img src={poster} alt="" style={FILL} />
      )}
      {!video.gif && (
        <div
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
  onOpen,
}: {
  q: PostData;
  fs: number;
  t: Theme;
  radius: number;
  depth: number;
  onOpen?: OpenMedia;
}) {
  const small = Math.round(fs * (depth === 0 ? 0.74 : 0.68));
  const hasStats = q.replies + q.reposts + q.likes + q.views > 0;
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
          {q.timestamp && <span style={{ color: t.muted, whiteSpace: "nowrap" }}>· {relativeTime(q.timestamp)}</span>}
        </div>
      </div>

      <div style={{ marginTop: Math.round(fs * 0.3), fontSize: Math.round(fs * 0.85), lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {q.text}
      </div>

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

      {q.quote && depth < 1 && <QuoteCard q={q.quote} fs={fs} t={t} radius={radius} depth={depth + 1} onOpen={onOpen} />}

      {hasStats && depth === 0 && (
        <div style={{ marginTop: Math.round(fs * 0.5), color: t.muted, fontSize: Math.round(fs * 0.55) }}>
          <Stats
            size={Math.round(fs * 0.5)}
            gap={Math.round(fs * 0.9)}
            items={[
              ["reply", q.replies],
              ["repost", q.reposts],
              ["like", q.likes],
              ["views", q.views],
            ]}
          />
        </div>
      )}
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
  onOpen,
}: {
  posts: PostData[];
  fs: number;
  t: Theme;
  radius: number;
  logo: Settings["logo"];
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
        const hasStats = p.replies + p.reposts + p.likes + p.views > 0;
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
                  {p.timestamp ? ` · ${relativeTime(p.timestamp)}` : ""}
                </span>
                {i === 0 && <Logo kind={logo} size={Math.round(fs * 1.15)} color={t.text} />}
              </div>

              <div style={{ marginTop: Math.round(fs * 0.3), fontSize: textSize, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {p.text}
              </div>

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

              {p.quote && <QuoteCard q={p.quote} fs={fs} t={t} radius={radius} depth={0} onOpen={onOpen} />}

              {hasStats && (
                <div style={{ marginTop: Math.round(fs * 0.45), color: t.muted, fontSize: Math.round(fs * 0.5) }}>
                  <Stats
                    size={Math.round(fs * 0.5)}
                    gap={Math.round(fs * 0.9)}
                    items={[
                      ["reply", p.replies],
                      ["repost", p.reposts],
                      ["like", p.likes],
                      ["views", p.views],
                    ]}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {first?.timestamp && (
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
  displayInfo?: { likes: boolean; reposts: boolean; replies: boolean; dateTime: boolean; views: boolean };
};

/**
 * The exportable frame. It renders at a fixed logical width (FRAME_W) and is scaled
 * down by its parent for preview, so exports are always crisp and predictable.
 *
 * With a fixed output ratio the content is scaled down to fit inside the frame when it is
 * taller than the ratio allows, so the whole post and all its media always stay visible.
 */
const TweetCard = forwardRef<HTMLDivElement, Props>(function TweetCard({ tweet, settings, thread, onOpenMedia, showQuote = true, displayInfo }, ref) {
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

  // Scale the content down (never up) so it fits inside the fixed-ratio frame without cropping.
  const innerRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el || !ratio) {
      setFit(1);
      return;
    }
    const frameH = Math.round(FRAME_W / ratio);
    const measure = () => {
      const s = Math.min(1, (frameH - 2 * framePad) / (el.offsetHeight || 1), (FRAME_W - 2 * framePad) / (el.offsetWidth || 1));
      const next = Math.max(0.05, s);
      setFit((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio, framePad]);

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
        background: minimal
          ? t.card
          : settings.theme === "light"
            ? "linear-gradient(135deg, #f6efe5 0%, #ecdfcd 100%)"
            : "linear-gradient(135deg, #0a0d12 0%, #151c27 100%)",
        color: t.text,
        fontFamily: FONTS[settings.font],
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: "100%",
          flex: "none",
          boxSizing: "border-box",
          padding: cardPad,
          background: minimal ? "transparent" : t.card,
          borderRadius: minimal ? 0 : radius,
          overflow: "hidden",
          boxShadow: minimal
            ? "none"
            : settings.theme === "light"
              ? "0 30px 80px -30px rgba(80,50,20,0.35), 0 0 0 1px rgba(0,0,0,0.04)"
              : "0 30px 80px -30px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)",
          transform: fit < 1 ? `scale(${fit})` : undefined,
          transformOrigin: "center center",
        }}
      >
        {showThread ? (
          <ThreadView posts={thread!} fs={fs} t={t} radius={radius} logo={settings.logo} onOpen={onOpenMedia} />
        ) : (
          <>
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
              <Logo kind={settings.logo} size={Math.round(fs * 0.85)} color={t.text} />
            </div>

            {/* Text */}
            <div style={{ marginTop: gap, fontSize: fs, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {tweet.text || "Tweet text"}
            </div>

            {/* Media */}
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

            {/* Quoted post */}
            {showQuote && tweet.quote && <QuoteCard q={tweet.quote} fs={fs} t={t} radius={radius} depth={0} onOpen={onOpenMedia} />}

            {/* Footer: stats left, time right */}
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
              <Stats
                size={Math.round(fs * 0.58)}
                gap={Math.round(fs * 1.0)}
                items={[
                  ...(displayInfo?.replies !== false ? [["reply", tweet.replies] as [ "reply", number]] : []),
                  ...(displayInfo?.reposts !== false ? [["repost", tweet.reposts] as ["repost", number]] : []),
                  ...(displayInfo?.likes !== false ? [["like", tweet.likes] as ["like", number]] : []),
                ]}
              />
              {(displayInfo?.dateTime !== false || (displayInfo?.views !== false && tweet.views > 0)) && (
                <span>
                  {displayInfo?.dateTime !== false ? `${tweet.time} · ${tweet.date}` : ""}
                  {displayInfo?.views !== false && tweet.views > 0 && (
                    <>
                      {displayInfo?.dateTime !== false ? " · " : ""}
                      <b style={{ color: t.text }}>{compact(tweet.views)}</b> Views
                    </>
                  )}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default TweetCard;
