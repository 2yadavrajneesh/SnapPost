"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** A brief "saved" note after work is stored in the browser. Shown at most once every 30 seconds, for 5 seconds. */
export default function SaveNotice() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    last.current = 0;
    const on = () => {
      const now = Date.now();
      if (now - last.current < 30000) return;
      last.current = now;
      setShow(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), 5000);
    };
    window.addEventListener("snap:saved", on);
    return () => {
      window.removeEventListener("snap:saved", on);
      clearTimeout(timer.current);
    };
  }, [path]);
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 left-4 z-[60] flex items-center gap-2 bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
      Your progress is saved
    </div>
  );
}
