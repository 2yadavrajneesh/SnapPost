"use client";

/**
 * Saves each app's work (links, fetched posts, uploaded files, settings) in this browser, so a reload or a
 * re-opened tab picks up where the person left off. Data goes away in only two cases:
 *  1. the person presses Reset, or
 *  2. nothing was touched for IDLE_LIMIT_MS (any click, key press or scroll counts as use).
 * Everything lives in IndexedDB (it holds files) under "<app>:<name>" keys. Nothing is sent anywhere.
 */
import { useEffect, useRef, useState } from "react";
import { emitHistory, registerHistory } from "@/lib/history";
import type { ToolId } from "./tools";

/** How long the site can sit untouched before every saved session is cleared. */
export const IDLE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const ACTIVE_KEY = "snap:lastActive";
/** localStorage keys that belong to one app (the site theme is never touched). */
const LOCAL_KEYS: Record<ToolId, string[]> = {
  snappost: [],
  threadscroll: [],
  linkdesk: ["linkdesk:batch:v1", "linkdesk:batch:active", "archivevault:saved", "linkdesk:archived:v1"],
  collage: [],
  clipbook: ["clipbook:news:v1"],
  editpdf: ["editpdf:signature:v1"],
};

let dbp: Promise<IDBDatabase> | null = null;
let resetting = false;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open("snappost-session", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}
const tx = async <T,>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = run(d.transaction("kv", mode).objectStore("kv"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

export function markActive(force = false) {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(ACTIVE_KEY)) || 0;
    if (force || now - last > 20_000) localStorage.setItem(ACTIVE_KEY, String(now));
  } catch {}
}

/** Wipes every saved session if the site has been idle too long. Returns true when it did. */
export async function clearIfIdle(): Promise<boolean> {
  try {
    const last = Number(localStorage.getItem(ACTIVE_KEY)) || 0;
    if (last && Date.now() - last > IDLE_LIMIT_MS) {
      await clearEverything();
      markActive(true);
      return true;
    }
    if (!last) markActive(true);
  } catch {}
  return false;
}

export async function clearEverything() {
  resetting = true;
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {}
  try {
    (Object.values(LOCAL_KEYS).flat()).forEach((k) => localStorage.removeItem(k));
  } catch {}
  resetting = false;
}

/** Apps report here whether they currently hold the person's own content (not a sample, not emptied out). */
const live: Partial<Record<ToolId, boolean>> = {};
export const liveWork = (app: ToolId) => live[app];
export function useWork(app: ToolId, has: boolean) {
  useEffect(() => {
    live[app] = has;
    window.dispatchEvent(new Event("snap:dirty"));
    return () => {
      delete live[app];
    };
  }, [app, has]);
}

/** True when the person has done real work in this app (not just opened it), so Reset has something to clear. */
export async function hasWork(app: ToolId): Promise<boolean> {
  if (live[app] !== undefined) return live[app]!;
  try {
    if (localStorage.getItem(`${app}:dirty`)) return true;
  } catch {}
  return (await sList(`${app}:`)).some((e) => e.key.includes(":file"));
}
export function markWork(app: ToolId) {
  try {
    if (localStorage.getItem(`${app}:dirty`)) return;
    localStorage.setItem(`${app}:dirty`, "1");
  } catch {}
  window.dispatchEvent(new Event("snap:dirty"));
}

/** Clears one app's saved session (files, links, settings). */
export async function clearApp(app: ToolId) {
  resetting = true;
  try {
    const d = await db();
    await new Promise<void>((resolve) => {
      const t = d.transaction("kv", "readwrite");
      const s = t.objectStore("kv");
      const range = IDBKeyRange.bound(`${app}:`, `${app}:￿`);
      s.delete(range);
      t.oncomplete = () => resolve();
      t.onerror = () => resolve();
    });
  } catch {}
  try {
    LOCAL_KEYS[app].forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage).filter((k) => k.startsWith(`${app}:`) && !k.includes("siteTheme")).forEach((k) => localStorage.removeItem(k));
  } catch {}
  markActive(true);
}

export async function sGet<T>(key: string): Promise<T | undefined> {
  try {
    await clearIfIdle();
    return (await tx<T | undefined>("readonly", (s) => s.get(key))) ?? undefined;
  } catch {
    return undefined;
  }
}
export async function sSet(key: string, value: unknown): Promise<boolean> {
  if (resetting) return false;
  try {
    await tx("readwrite", (s) => s.put(value, key));
    window.dispatchEvent(new Event("snap:saved"));
    return true;
  } catch {
    return false;
  }
}
export async function sDel(key: string) {
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {}
}
/** Every key that starts with the prefix, with its value. */
export async function sList<T>(prefix: string): Promise<{ key: string; value: T }[]> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const out: { key: string; value: T }[] = [];
      const req = d.transaction("kv", "readonly").objectStore("kv").openCursor(IDBKeyRange.bound(prefix, `${prefix}￿`));
      req.onsuccess = () => {
        const c = req.result;
        if (c) {
          out.push({ key: String(c.key), value: c.value as T });
          c.continue();
        } else resolve(out);
      };
      req.onerror = () => resolve(out);
    });
  } catch {
    return [];
  }
}

/**
 * Keeps `snapshot` saved under `key`, and hands the saved copy to `restore` once when the page opens.
 * `restore` runs before anything is written, so an empty first render never overwrites the saved work.
 * Returns whether restoring has finished.
 */
export type SnapshotOptions = {
  /** Snapshot fields that hold the person's own content (files, lists, links). "Reset settings" keeps these. */
  content?: string[];
  /** For apps with several tools mounted at once: which tool this history belongs to (see setHistoryScope). */
  scope?: string;
  /** The app already saves this state itself: keep only the history and the starting point, not a second copy. */
  local?: boolean;
};

const hasValue = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : !!v);
const HISTORY_MAX = 40;

/**
 * Saves an app's state to the browser and keeps an undo / redo history of it.
 * It also remembers the state when content was first added (for "Reset changes") and the
 * very first default state (for "Reset settings").
 */
export function useSessionSnapshot<T>(key: string, snapshot: T, restore: (saved: T) => void | Promise<void>, options: SnapshotOptions = {}): boolean {
  const [ready, setReady] = useState(false);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const contentKeys = useRef(options.content ?? []);

  const initial = useRef<string | null>(null);
  if (initial.current === null) initial.current = JSON.stringify(snapshot);
  const hist = useRef<string[]>([]);
  const ptr = useRef(-1);
  const baseline = useRef<string | null>(null);
  const applyingUntil = useRef(0);
  const flags = useRef({ undo: false, redo: false, changes: false, settings: false });

  const settingsTarget = (cur: string) => {
    const base = JSON.parse(initial.current as string) as Record<string, unknown>;
    const now = JSON.parse(cur) as Record<string, unknown>;
    contentKeys.current.forEach((k) => (base[k] = now[k]));
    return JSON.stringify(base);
  };

  /** Put the latest state into the history (called after changes settle, and before any undo / reset). */
  const record = () => {
    const cur = JSON.stringify(latest.current);
    if (ptr.current < 0) {
      hist.current = [cur];
      ptr.current = 0;
    } else if (hist.current[ptr.current] !== cur) {
      if (Date.now() < applyingUntil.current) {
        hist.current[ptr.current] = cur; // an undo / redo just landed; keep the entry exact
      } else {
        hist.current = [...hist.current.slice(0, ptr.current + 1), cur].slice(-HISTORY_MAX);
        ptr.current = hist.current.length - 1;
      }
    }
    // remember how the content looked when it first appeared
    const now = JSON.parse(cur) as Record<string, unknown>;
    const has = contentKeys.current.some((k) => hasValue(now[k]));
    if (has && baseline.current === null) {
      baseline.current = cur;
      void sSet(`${key}:baseline`, cur);
    } else if (!has && baseline.current !== null) {
      baseline.current = null;
      void sDel(`${key}:baseline`);
    }
    flags.current = {
      undo: ptr.current > 0,
      redo: ptr.current < hist.current.length - 1,
      changes: baseline.current !== null && baseline.current !== cur,
      settings: settingsTarget(cur) !== cur,
    };
    emitHistory();
  };
  const recordRef = useRef(record);
  recordRef.current = record;

  useEffect(() => {
    let dead = false;
    (async () => {
      const saved = options.local ? undefined : await sGet<T>(key);
      const base = await sGet<string>(`${key}:baseline`);
      if (base !== undefined) baseline.current = base;
      if (saved !== undefined && !dead && !options.local) await restoreRef.current(saved);
      if (!dead) setReady(true);
    })();
    return () => {
      dead = true;
    };
  }, [key]);

  // save shortly after things stop changing, but never wait longer than a few seconds
  useEffect(() => {
    if (!ready || timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (!options.local) void sSet(key, latest.current);
      recordRef.current();
    }, 700);
  });
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        if (!options.local) void sSet(key, latest.current);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [key]);

  // let the header drive undo / redo / resets
  useEffect(() => {
    if (!ready) return;
    const apply = (json: string, exact: boolean) => {
      applyingUntil.current = exact ? Date.now() + 1500 : 0;
      void restoreRef.current(JSON.parse(json) as T);
    };
    const settle = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        if (!options.local) void sSet(key, latest.current);
      }
      recordRef.current();
    };
    return registerHistory(key.split(":")[0], {
      undo: () => { settle(); if (ptr.current > 0) { ptr.current--; apply(hist.current[ptr.current], true); } },
      redo: () => { settle(); if (ptr.current < hist.current.length - 1) { ptr.current++; apply(hist.current[ptr.current], true); } },
      resetChanges: () => { settle(); if (baseline.current) apply(baseline.current, false); },
      resetSettings: () => { settle(); apply(settingsTarget(JSON.stringify(latest.current)), false); },
      can: () => flags.current,
    }, options.scope ?? "");
  }, [ready, key]);
  return ready;
}
