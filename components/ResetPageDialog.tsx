"use client";

import { useEffect, useRef, useState } from "react";
import { clearApp } from "@/lib/session";
import type { ToolId } from "@/lib/tools";

/** Warning shown before the whole page is put back to its starting state. */
export default function ResetPageDialog({ open, onClose, app, name }: { open: boolean; onClose: () => void; app: ToolId; name: string }) {
  const [busy, setBusy] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, busy, onClose]);
  if (!open) return null;
  return (
    <div className="snap-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="rs-t" aria-describedby="rs-d" className="snap-scale w-full max-w-sm border-t-4 border-amber-500 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center bg-amber-100 text-amber-700">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 3 2 20h20zM12 10v4M12 17.5v.01" />
            </svg>
          </span>
          <div>
            <h2 id="rs-t" className="text-sm font-bold text-stone-900">Reset the whole {name} page?</h2>
            <p id="rs-d" className="mt-1 text-xs leading-relaxed text-stone-600">
              Everything on this page goes back to how it looked when you first opened it: your files, links, pictures, settings and undo history are deleted from this browser. This cannot be undone.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancel} type="button" disabled={busy} onClick={onClose} className="h-9 border border-stone-300 bg-white px-4 text-xs font-semibold text-stone-800 hover:bg-stone-100">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void clearApp(app).then(() => window.location.reload());
            }}
            className="h-9 bg-red-600 px-4 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? "Resetting…" : "Yes, reset the page"}
          </button>
        </div>
      </div>
    </div>
  );
}
