"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/** The PDF tools a file can be passed between. */
export const TOOLS: { id: string; label: string; color: string; icon: string }[] = [
  { id: "edit", label: "Edit", color: "#047857", icon: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4" },
  { id: "organize", label: "Organize", color: "#2563eb", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { id: "numbers", label: "Page numbers", color: "#7c3aed", icon: "M5 4h14v16H5zM9 16h6M12 8v5" },
  { id: "redact", label: "Redact", color: "#111827", icon: "M4 6h16v4H4zM4 14h10v4H4z" },
  { id: "merge", label: "Merge", color: "#d97706", icon: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M8 12h8M12 8v8" },
  { id: "split", label: "Split", color: "#db2777", icon: "M12 3v18M7 8l-4 4 4 4M17 8l4 4-4 4" },
  { id: "extract", label: "Extract", color: "#0d9488", icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 17v-6M9 14l3-3 3 3" },
  { id: "rotate", label: "Rotate", color: "#0891b2", icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" },
  { id: "watermark", label: "Watermark", color: "#dc2626", icon: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" },
];
export const toolLabel = (id: string) => TOOLS.find((t) => t.id === id)?.label ?? id;

export type FlowFile = { name: string; bytes: Uint8Array };
type State = { origin: { tab: string; file: FlowFile } | null; latest: FlowFile | null };

let pending: (FlowFile & { to: string }) | null = null;
let state: State = { origin: null, latest: null };
const subs = new Set<() => void>();
const set = (next: Partial<State>) => { state = { ...state, ...next }; subs.forEach((f) => f()); };

/** Pass a file to another tool and switch to it, remembering where it came from. */
export function sendTo(from: string, to: string, file: FlowFile) {
  pending = { ...file, to };
  set({ origin: { tab: from, file }, latest: null });
  window.location.hash = to;
}
/** Take the file waiting for this tool, if there is one. */
export function takePending(to: string): FlowFile | null {
  if (!pending || pending.to !== to) return null;
  const p = pending;
  pending = null;
  return { name: p.name, bytes: p.bytes };
}
/** A tool has made a new version of the file: that is what "return" brings back. */
export function publish(file: FlowFile) { set({ latest: file }); }
export async function returnToOrigin() {
  const o = state.origin;
  if (!o) return;
  const f = (await currentFile()) ?? state.latest ?? o.file;
  pending = { ...f, to: o.tab };
  set({ origin: null, latest: null });
  window.location.hash = o.tab;
}
export function clearOrigin() { if (state.origin) set({ origin: null }); }
export function useFlow() {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => state, () => state);
}

/** The open tool says how to get its current file, including changes it has not applied yet. */
type Getter = () => Promise<FlowFile | null>;
let getter: Getter | null = null;
export function useCurrentFile(fn: Getter) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const g: Getter = () => ref.current();
    getter = g;
    return () => { if (getter === g) getter = null; };
  }, []);
}
export const currentFile = async () => (getter ? getter() : null);
