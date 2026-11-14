"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toolFor } from "@/lib/tools";
import { hasWork } from "@/lib/session";
import ResetPageDialog from "@/components/ResetPageDialog";

/** Start-over control that lives inside each tool. It always asks first, in a warning dialog. */
export default function ResetButton({ className = "" }: { className?: string }) {
  const tool = toolFor(usePathname());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => void hasWork(tool.id).then((v) => live && setHas(v));
    check();
    const t = setTimeout(check, 1500); // after the saved session has been restored
    window.addEventListener("snap:dirty", check);
    window.addEventListener("snap:saved", check);
    return () => { live = false; clearTimeout(t); window.removeEventListener("snap:dirty", check); window.removeEventListener("snap:saved", check); };
  }, [tool.id]);

  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, busy]);

  return (
    <>
      <button
        type="button"
        disabled={!has}
        onClick={() => setOpen(true)}
        title={has ? `Clear everything ${tool.name} has saved and start fresh` : "Nothing to reset yet"}
        className={`inline-flex h-9 items-center justify-center gap-2 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-stone-300 disabled:hover:bg-white disabled:hover:text-stone-700 ${className}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        Reset everything
      </button>
      <ResetPageDialog open={open} onClose={() => setOpen(false)} app={tool.id} name={tool.name} />
    </>
  );
}
