"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toolFor } from "@/lib/tools";
import { clearApp, hasWork } from "@/lib/session";

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
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="rs-t" aria-describedby="rs-d" className="w-full max-w-sm border-t-4 border-amber-500 bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center bg-amber-100 text-amber-700">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3 2 20h20zM12 10v4M12 17.5v.01" />
                </svg>
              </span>
              <div>
                <h2 id="rs-t" className="text-sm font-bold text-stone-900">Clear everything in {tool.name}?</h2>
                <p id="rs-d" className="mt-1 text-xs leading-relaxed text-stone-600">
                  Your uploaded files, links, pictures and settings in this app will be deleted from this browser. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancel} type="button" disabled={busy} onClick={() => setOpen(false)} className="h-9 border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 hover:bg-stone-100">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void clearApp(tool.id).then(() => window.location.reload());
                }}
                className="h-9 bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Clearing…" : "Yes, clear everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
