"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { liveWork, markWork } from "@/lib/session";
import { toolFor } from "@/lib/tools";

/** A brief "saved" note after work is stored in the browser. Shown at most once every 30 seconds, for 5 seconds. */
export default function SaveNotice() {
  const path = usePathname();
  const [show, setShow] = useState(false);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    last.current = 0;
    // only a save that follows something the person did counts; restoring data on load does not
    let touched = 0;
    let window_ = 4000;
    const touch = (e: Event) => {
      const t = e.target as Element | null;
      // sample or pre-filled content does not count as the person's own work
      // switching tools or tabs is navigation, not work
      if (t?.closest?.("[data-no-save-notice], [role=\"tab\"], header, nav")) { touched = 0; return; }
      touched = Date.now();
      // reading uploaded files takes longer, so allow more time before they are stored
      const files = e.type === "drop" ? (e as DragEvent).dataTransfer?.files?.length : e.type === "change" ? (t as HTMLInputElement)?.files?.length : e.type === "paste" ? (e as ClipboardEvent).clipboardData?.files?.length : 0;
      window_ = files ? 30000 : 4000;
    };
    const evs = ["keydown", "pointerdown", "input", "change", "drop", "paste"] as const;
    evs.forEach((e) => window.addEventListener(e, touch, true));
    const on = () => {
      const now = Date.now();
      if (now - touched > window_ || document.documentElement.hasAttribute("data-sample")) return;
      const app = toolFor(location.pathname).id;
      if (liveWork(app) === false) return; // nothing of the person's own is on screen
      markWork(app);
      if (now - last.current < 30000) return;
      last.current = now;
      setShow(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), 5000);
    };
    window.addEventListener("snap:saved", on);
    return () => {
      window.removeEventListener("snap:saved", on);
      evs.forEach((e) => window.removeEventListener(e, touch, true));
      clearTimeout(timer.current);
    };
  }, [path]);
  if (!show) return null;
  return (
    <Alert variant="success" role="status" aria-live="polite" className="snap-pop pointer-events-none fixed bottom-20 right-4 z-[60] w-auto max-w-[calc(100vw-2rem)] items-center py-2.5 shadow-lg">
      <CircleCheck />
      <AlertTitle className="text-xs font-semibold">Your progress is saved</AlertTitle>
    </Alert>
  );
}
