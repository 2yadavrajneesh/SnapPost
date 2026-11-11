"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildItems, nowStr, type Item, type RawLink, type Source } from "./core";

const KEY = "linkdesk:batch:v1";

type Persist = { raw: RawLink[]; items: Item[]; size: number; auto: boolean; dedupe: boolean; source: Source };

type Store = {
  raw: RawLink[];
  items: Item[];
  size: number;
  auto: boolean;
  dedupe: boolean;
  source: Source;
  ready: boolean;
  /** Replace the list. `keep` carries over which links were already opened. Returns how many rows were skipped / whether the cap hit. */
  setLinks: (raw: RawLink[], source: Source, keep?: boolean) => { skipped: number; capped: boolean };
  setSize: (n: number) => void;
  setAuto: (v: boolean) => void;
  setDedupe: (v: boolean) => void;
  markOpened: (indices: number[]) => void;
  setOpened: (indices: number[], opened: boolean) => void;
  removeAt: (i: number) => void;
  clear: () => void;
};

const Ctx = createContext<Store | null>(null);
export const useLinks = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLinks outside LinkProvider");
  return c;
};

/** The batch list shared by every LinkDesk tool, so "Send to batches" works from anywhere. It is saved in this browser only. */
export function LinkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persist>({ raw: [], items: [], size: 20, auto: true, dedupe: false, source: null });
  const [ready, setReady] = useState(false);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (p && Array.isArray(p.items) && !(p.source && p.source.sample)) {
        setState({
          raw: Array.isArray(p.raw) ? p.raw : [],
          items: p.items,
          size: Math.min(100, Math.max(1, parseInt(p.size, 10) || 20)),
          auto: p.auto !== false,
          dedupe: !!p.dedupe,
          source: p.source ?? null,
        });
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  const setLinks = useCallback((raw: RawLink[], source: Source, keep = false) => {
    const cur = latest.current;
    const r = buildItems(raw, { auto: cur.auto, dedupe: cur.dedupe }, keep ? cur.items : undefined);
    setState({ ...cur, raw, items: r.items, source });
    return { skipped: r.skipped, capped: r.capped };
  }, []);

  const rebuild = (patch: Partial<Persist>) =>
    setState((cur) => {
      const next = { ...cur, ...patch };
      return { ...next, items: buildItems(next.raw, { auto: next.auto, dedupe: next.dedupe }, cur.items).items };
    });

  const value = useMemo<Store>(
    () => ({
      ...state,
      ready,
      setLinks,
      setSize: (n) => setState((c) => ({ ...c, size: Math.min(100, Math.max(1, Math.round(n) || 20)) })),
      setAuto: (v) => rebuild({ auto: v }),
      setDedupe: (v) => rebuild({ dedupe: v }),
      markOpened: (idx) => setState((c) => ({ ...c, items: c.items.map((it, i) => (idx.includes(i) ? { ...it, opened: true, at: nowStr() } : it)) })),
      setOpened: (idx, opened) => setState((c) => ({ ...c, items: c.items.map((it, i) => (idx.includes(i) ? { ...it, opened, at: opened ? nowStr() : null } : it)) })),
      removeAt: (i) => setState((c) => ({ ...c, items: c.items.filter((_, k) => k !== i) })),
      clear: () => setState((c) => ({ ...c, items: [], raw: [], source: null })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, ready, setLinks],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
