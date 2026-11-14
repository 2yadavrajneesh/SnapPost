"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export const btn = "inline-flex h-9 items-center justify-center gap-1.5 border px-3 text-xs font-semibold transition disabled:opacity-40";
export const btnPrimary = `${btn} border-transparent bg-accent text-white hover:brightness-110`;
export const btnPlain = `${btn} border-stone-300 bg-white text-stone-800 hover:bg-stone-100`;
export const btnSm = "inline-flex h-8 items-center justify-center gap-1 border border-stone-300 bg-white px-2.5 text-[11px] font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-40";
export const btnIcon = "inline-flex h-8 w-8 shrink-0 items-center justify-center border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-100 disabled:opacity-40";
export const field = "w-full border border-stone-300 bg-white px-2.5 py-2 text-xs font-medium text-stone-800 outline-none focus:border-[color:var(--accent)]";

/** A numbered step card, like the original LinkDesk panels. */
export function Card({ step, title, chip, children }: { step?: number; title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="snap-fade border border-stone-300 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        {step != null && <span className="flex h-6 w-6 items-center justify-center bg-accent text-xs font-bold text-white">{step}</span>}
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
        {chip}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export const Chip = ({ children }: { children: ReactNode }) => <span className="max-w-[16rem] truncate bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">{children}</span>;

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-stone-900" />
      <span>{children}</span>
    </label>
  );
}

/** A drop zone that also opens the file picker. */
export function DropZone({ accept, title, note, onFile, disabled }: { accept: string; title: string; note: string; onFile: (f: File) => void; disabled?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragEnter={(e) => (e.preventDefault(), setOver(true))}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={(e) => (e.preventDefault(), setOver(false))}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !disabled) onFile(f);
      }}
      className={`flex cursor-pointer flex-col items-center gap-1 border-2 border-dashed px-4 py-7 text-center transition ${over ? "border-accent bg-stone-100" : "border-stone-300 bg-stone-50 hover:bg-stone-100"}`}
    >
      <input
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
        <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
      </svg>
      <strong className="text-sm text-stone-900">{title}</strong>
      <small className="text-[11px] text-stone-500">{note}</small>
    </label>
  );
}

/* ---------- toasts ---------- */
type ToastKind = "ok" | "warn";
export type ToastAction = { label: string; run: () => void };
type Toast = { id: number; msg: string; kind: ToastKind; action?: ToastAction };
const ToastCtx = createContext<(msg: string, kind?: ToastKind, action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: ToastKind = "ok", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { id, msg, kind, action }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), action ? 8000 : 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {list.map((t) => (
          <div key={t.id} role="status" className={`snap-pop pointer-events-auto px-4 py-2.5 text-xs font-semibold shadow-lg ${t.kind === "warn" ? "bg-amber-100 text-amber-900" : "bg-stone-900 text-white"}`}>
            <span className="flex items-center justify-between gap-3">
              <span>{t.msg}</span>
              {t.action && (
                <button type="button" className="shrink-0 border border-white/40 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide hover:bg-white/15" onClick={() => { t.action!.run(); setList((l) => l.filter((x) => x.id !== t.id)); }}>
                  {t.action.label}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/** Copies text, with a fallback for browsers that block the clipboard API. */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    async (text: string, okMsg: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(okMsg);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
          ok = document.execCommand("copy");
        } catch {}
        ta.remove();
        toast(ok ? okMsg : "Copy was blocked by the browser. Select the text and copy it by hand.", ok ? "ok" : "warn");
      }
    },
    [toast],
  );
}
