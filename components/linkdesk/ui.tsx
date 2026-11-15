"use client";

import { SwitchRow } from "@/components/ui";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { toast } from "sonner";

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
  return <SwitchRow label={children} checked={checked} onChange={onChange} />;
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
/** Shows a message (with an optional action such as Undo) using the shared toast stack. */
const push = (msg: string, kind: ToastKind = "ok", action?: ToastAction) => {
  const opts = { duration: action ? 8000 : 3800, action: action ? { label: action.label, onClick: action.run } : undefined };
  if (kind === "warn") toast.warning(msg, opts);
  else toast.success(msg, opts);
};
export const useToast = () => push;

/** Kept so pages can still wrap themselves; the toast stack itself lives once in the root layout. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
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
