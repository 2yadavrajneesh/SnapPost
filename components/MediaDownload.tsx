"use client";

import { useState } from "react";
import { downloadHref, photoSize, proxied } from "@/lib/format";
import type { PostData, TweetData, VideoData } from "@/lib/types";

type Group = { title: string | null; photos: string[]; video: VideoData | null };

const SIZES = [
  { name: "orig", label: "Original", hint: "Full quality" },
  { name: "large", label: "Large", hint: "up to 2048 px" },
  { name: "medium", label: "Medium", hint: "up to 1200 px" },
  { name: "small", label: "Small", hint: "up to 680 px" },
] as const;

const btn =
  "inline-flex items-center justify-center border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100";

const ext = (src: string) => {
  try {
    const f = new URL(src).searchParams.get("format");
    if (f && /^[a-z0-9]{2,4}$/i.test(f)) return f.toLowerCase();
  } catch {
    /* fall through */
  }
  return /\.png(\?|$)/i.test(src) ? "png" : "jpg";
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * "Download attached media": detects whether the post carries photos, a video or a GIF and offers
 * the sizes that make sense for each (photo sizes for images, MP4 resolutions for video).
 */
export default function MediaDownload({ tweet }: { tweet: TweetData }) {
  const [open, setOpen] = useState(false);
  const q: PostData | null = tweet.quote;
  const groups: Group[] = [
    { title: null, photos: tweet.photos.filter((p) => !p.startsWith("data:")), video: tweet.video },
    ...(q ? [{ title: "Quoted post", photos: q.photos, video: q.video }] : []),
  ].filter((g) => g.photos.length || g.video);

  if (!groups.length) return null;

  const photoCount = groups.reduce((n, g) => n + g.photos.length, 0);
  const videos = groups.filter((g) => g.video).map((g) => g.video!);
  const gifCount = videos.filter((v) => v.gif).length;
  const videoCount = videos.length - gifCount;
  const summary = [
    photoCount ? plural(photoCount, "photo") : "",
    videoCount ? plural(videoCount, "video") : "",
    gifCount ? plural(gifCount, "GIF") : "",
  ]
    .filter(Boolean)
    .join(" + ");
  const base = `snappost-${tweet.username || "post"}`;

  function downloadAllPhotos() {
    const all = groups.flatMap((g) => g.photos);
    all.forEach((src, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = downloadHref("image", photoSize(src, "orig"), `${base}-photo-${i + 1}-original.${ext(src)}`);
        a.download = "";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 400); // browsers drop downloads fired in the same instant
    });
  }

  let photoNo = 0;
  return (
    <div className="border border-stone-300 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-stone-900 hover:bg-stone-50"
      >
        <span className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
          </svg>
          Download attached media
        </span>
        <span className="text-xs font-medium text-stone-500">{summary}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-stone-300 px-3 py-3">
          {groups.map((g, gi) => (
            <div key={gi} className="space-y-3">
              {g.title && <div className="text-xs font-semibold text-stone-500">{g.title}</div>}

              {g.photos.map((src) => {
                const n = ++photoNo;
                return (
                  <div key={src + n} className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proxied(photoSize(src, "small"))} alt="" className="h-14 w-14 flex-none border border-stone-200 object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 text-xs font-semibold text-stone-800">Photo {n}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {SIZES.map((s) => (
                          <a
                            key={s.name}
                            className={btn}
                            title={`${s.label} · ${s.hint}`}
                            href={downloadHref("image", photoSize(src, s.name), `${base}-photo-${n}-${s.name === "orig" ? "original" : s.name}.${ext(src)}`)}
                            download=""
                          >
                            {s.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}

              {g.video && (
                <div className="flex gap-3">
                  {g.video.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxied(g.video.poster)} alt="" className="h-14 w-14 flex-none border border-stone-200 object-cover" />
                  ) : (
                    <div className="h-14 w-14 flex-none border border-stone-200 bg-stone-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 text-xs font-semibold text-stone-800">
                      {g.video.gif ? "GIF (saved as MP4)" : "Video"}
                      <span className="ml-1.5 font-normal text-stone-500">
                        {g.video.width}×{g.video.height}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(g.video.variants?.length ? g.video.variants : g.video.sources.slice(0, 1).map((url) => ({ url, height: g.video!.height, width: g.video!.width }))).map(
                        (v, i) => (
                          <a
                            key={v.url}
                            className={btn}
                            title={v.width ? `${v.width}×${v.height} MP4` : "MP4"}
                            href={downloadHref("video", v.url, `${base}-${g.video!.gif ? "gif" : "video"}-${v.height || i + 1}p.mp4`)}
                            download=""
                          >
                            {v.height ? `${v.height}p` : "MP4"}
                            {i === 0 ? " · Best" : ""}
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {photoCount > 1 && (
            <button type="button" onClick={downloadAllPhotos} className={`${btn} w-full`}>
              Download all {photoCount} photos (Original)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
