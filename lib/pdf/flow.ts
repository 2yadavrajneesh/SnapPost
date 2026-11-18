"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

/** The PDF tools a file can be passed between. */
export const TOOLS: { id: string; label: string }[] = [
  { id: "edit", label: "Edit" },
  { id: "organize", label: "Organize" },
  { id: "numbers", label: "Page numbers" },
  { id: "redact", label: "Redact" },
  { id: "merge", label: "Merge" },
  { id: "split", label: "Split" },
  { id: "extract", label: "Extract" },
  { id: "rotate", label: "Rotate" },
  { id: "watermark", label: "Watermark" },
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
