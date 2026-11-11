"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildItems, nowStr, type Item, type RawLink, type Source } from "./core";

const KEY = "linkdesk:batch:v1";
const ACTIVE_KEY = "linkdesk:batch:active";
/** A saved list is dropped after this long without anyone using the page. */
export const IDLE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const EMPTY: Persist = { raw: [], items: [], size: 20, auto: true, dedupe: false, source: null };

type Persist = { raw: RawLink[]; items: Item[]; size: number; auto: boolean; dedupe: boolean; source: Source };

type Store = {
  raw: RawLink[];
  items: Item[];
  size: number;
  auto: boolean;
  dedupe: boolean;
  source: Source;
  ready: boolean;
  /** True once, after a saved list was dropped for being idle too long. */
  expired: boolean;
  ackExpired: () => void;
  /** True if the browser refused to save the list (too big or storage blocked). */
  saveFailed: boolean;
  /** Clear the list and put every setting back to its default. */
  resetSession: () => void;
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
  const [state, setState] = useState<Persist>(EMPTY);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef(state);
  latest.current = state;
  const lastActive = useRef(Date.now());
  const lastWritten = useRef(0);

  const touch = useCallback((force = false) => {
    const now = Date.now();
    lastActive.current = now;
    if (force || now - lastWritten.current > 30_000) {
      lastWritten.current = now;
      try {
        localStorage.setItem(ACTIVE_KEY, String(now));
      } catch {}
    }
  }, []);

  const expire = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(ACTIVE_KEY);
    } catch {}
    setState(EMPTY);
    setExpired(true);
  }, []);

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
      const seen = Number(localStorage.getItem(ACTIVE_KEY)) || Date.now();
      if (p && Array.isArray(p.items) && p.items.length && Date.now() - seen > IDLE_LIMIT_MS) {
        localStorage.removeItem(KEY);
        localStorage.removeItem(ACTIVE_KEY);
        setExpired(true);
      } else if (p && Array.isArray(p.items) && !(p.source && p.source.sample)) {
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
    touch(true);
    setReady(true);
  }, [touch]);

  // saved in this browser; the sample list is never kept
  useEffect(() => {
    if (!ready) return;
    try {
      if (state.source?.sample) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, JSON.stringify(state));
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
    touch();
  }, [state, ready, touch]);

  // any use of the page keeps the session alive; a long quiet spell resets it, even with the page left open
  useEffect(() => {
    const onUse = () => touch();
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, onUse, { passive: true }));
    const check = () => {
      let seen = lastActive.current;
      try {
        seen = Math.max(seen, Number(localStorage.getItem(ACTIVE_KEY)) || 0);
      } catch {}
      if (latest.current.items.length && Date.now() - seen > IDLE_LIMIT_MS) expire();
    };
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      evs.forEach((e) => window.removeEventListener(e, onUse));
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [touch, expire]);

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
      expired,
      ackExpired: () => setExpired(false),
      saveFailed,
      resetSession: () => setState(EMPTY),
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
    [state, ready, setLinks, expired, saveFailed],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
