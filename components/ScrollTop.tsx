"use client";

import { useEffect, useState, type RefObject } from "react";

/** A "Go to top" button for a scrolling area. It appears once the area has been scrolled down a little. */
export default function ScrollTop({ target, threshold = 120 }: { target: RefObject<HTMLElement | null>; threshold?: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    // the area itself may scroll, or (on tablets and phones) the whole page does
    const onScroll = () => setShow(el.scrollTop > threshold || window.scrollY > threshold);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
    };
  }, [target, threshold]);

  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="Go to top"
      title="Go to top"
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const behavior = reduce ? "auto" : "smooth";
        target.current?.scrollTo({ top: 0, behavior });
        window.scrollTo({ top: 0, behavior });
      }}
      className="fixed bottom-4 right-4 z-30 flex h-11 w-11 items-center justify-center border border-stone-300 bg-white text-stone-800 shadow-md transition hover:bg-stone-100"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
