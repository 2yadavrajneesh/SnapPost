"use client";

import { useEffect, useRef, useState } from "react";
import { proxied } from "@/lib/format";

type Props = {
  images: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
};

/** Full-screen image viewer: fit-to-screen or actual size, arrow-key navigation, Esc to close. */
export default function Lightbox({ images, index, onIndex, onClose }: Props) {
  const [actual, setActual] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const many = images.length > 1;
  const src = images[index];

  useEffect(() => setActual(false), [index]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && many) onIndex((index - 1 + images.length) % images.length);
      else if (e.key === "ArrowRight" && many) onIndex((index + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, images.length, many, onClose, onIndex]);

  if (!src) return null;

  const btn =
    "rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-white/25";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs tabular-nums text-white/70">{many ? `${index + 1} / ${images.length}` : "Image"}</span>
        <div className="flex items-center gap-2">
          <button type="button" className={btn} onClick={() => setActual((v) => !v)}>
            {actual ? "Fit to screen" : "Actual size"}
          </button>
          <a className={btn} href={src} target="_blank" rel="noopener noreferrer">
            Open original
          </a>
          <button ref={closeRef} type="button" className={btn} onClick={onClose} aria-label="Close image viewer">
            Close ✕
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-3">
        {many && (
          <button
            type="button"
            aria-label="Previous image"
            className={`${btn} fixed left-3 top-1/2 z-10 -translate-y-1/2 text-base`}
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index - 1 + images.length) % images.length);
            }}
          >
            ‹
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxied(src)}
          alt=""
          onClick={(e) => {
            e.stopPropagation();
            setActual((v) => !v);
          }}
          className={actual ? "m-auto max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}
        />
        {many && (
          <button
            type="button"
            aria-label="Next image"
            className={`${btn} fixed right-3 top-1/2 z-10 -translate-y-1/2 text-base`}
            onClick={(e) => {
              e.stopPropagation();
              onIndex((index + 1) % images.length);
            }}
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
