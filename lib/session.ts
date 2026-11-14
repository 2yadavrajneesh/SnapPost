"use client";

/**
 * Saves each app's work (links, fetched posts, uploaded files, settings) in this browser, so a reload or a
 * re-opened tab picks up where the person left off. Data goes away in only two cases:
 *  1. the person presses Reset, or
 *  2. nothing was touched for IDLE_LIMIT_MS (any click, key press or scroll counts as use).
 * Everything lives in IndexedDB (it holds files) under "<app>:<name>" keys. Nothing is sent anywhere.
 */
import { useEffect, useRef, useState } from "react";
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
export function useSessionSnapshot<T>(key: string, snapshot: T, restore: (saved: T) => void | Promise<void>): boolean {
  const [ready, setReady] = useState(false);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    let dead = false;
    (async () => {
      const saved = await sGet<T>(key);
      if (saved !== undefined && !dead) await restoreRef.current(saved);
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
      void sSet(key, latest.current);
    }, 700);
  });
  useEffect(() => {
    const flush = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void sSet(key, latest.current);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [key]);
  return ready;
}
