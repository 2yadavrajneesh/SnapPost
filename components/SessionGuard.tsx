"use client";

import { useEffect } from "react";
import { clearIfIdle, markActive } from "@/lib/session";

/** Counts clicks, keys and scrolling as use, and clears all saved sessions after a long idle spell. */
export default function SessionGuard() {
  useEffect(() => {
    // check for a long idle spell first, before this visit counts as use
    void clearIfIdle().then((cleared) => (cleared ? window.location.reload() : markActive(true)));
    const onUse = () => markActive();
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, onUse, { passive: true }));
    // a page left open for days: clear it and start fresh
    const check = async () => {
      if (await clearIfIdle()) window.location.reload();
    };
    const timer = setInterval(check, 5 * 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onUse));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
