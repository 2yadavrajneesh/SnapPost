import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { del, list, put } from "@vercel/blob";
import { PDF_LIMITS } from "./config";

/**
 * Where uploaded files and results live while a job runs. On Vercel it is Vercel Blob (public links with an
 * unguessable folder name). For tests and local work, PDF_STORAGE=local keeps files on disk instead.
 */
export const storageMode = (): "blob" | "local" | "off" => {
  if (process.env.PDF_STORAGE === "local") return "local";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return process.env.NODE_ENV === "production" ? "off" : "local";
};

const LOCAL_DIR = process.env.PDF_LOCAL_DIR || path.join(os.tmpdir(), "papernest-local");
const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i;
const LOCAL_URL = "/api/pdf/file/";

export type Kind = "in" | "out";

/** A safe file name: no folders, no odd characters. */
export const cleanName = (name: string, fallback = "file"): string => {
  const base = name.split(/[\\/]/).pop() ?? "";
  const s = base.normalize("NFKD").replace(/[^\w.\- ()]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 100);
  return s && s !== "." && s !== ".." ? s : fallback;
};

/** True for a link to one of our own stored files of this kind (never any other website). */
export function ownUrl(url: string, kind: Kind): boolean {
  if (url.startsWith(LOCAL_URL)) return storageMode() === "local" && new RegExp(`^${LOCAL_URL}${kind}/[\\w-]{36}/[^/]+$`).test(url);
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname) && u.pathname.startsWith(`/papernest/${kind}/`);
  } catch {
    return false;
  }
}

const localPath = (kind: Kind, id: string, name: string) => path.join(LOCAL_DIR, kind, id, name);

export async function saveFile(kind: Kind, name: string, bytes: Uint8Array, type: string): Promise<{ url: string }> {
  const id = randomUUID();
  const file = cleanName(name);
  if (storageMode() === "local") {
    const p = localPath(kind, id, file);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, bytes);
    return { url: `${LOCAL_URL}${kind}/${id}/${encodeURIComponent(file)}` };
  }
  const r = await put(`papernest/${kind}/${id}/${file}`, Buffer.from(bytes), { access: "public", addRandomSuffix: false, contentType: type, cacheControlMaxAge: 60 });
  return { url: r.url };
}

export async function readLocal(kind: Kind, id: string, name: string): Promise<Uint8Array | null> {
  if (!/^[\w-]{36}$/.test(id)) return null;
  try {
    return await fs.readFile(localPath(kind, id, cleanName(decodeURIComponent(name))));
  } catch {
    return null;
  }
}

/** Reads one of our stored files, refusing anything bigger than `max` bytes. */
export async function readFile(url: string, kind: Kind, max: number): Promise<Uint8Array> {
  if (!ownUrl(url, kind)) throw new Error("That file link is not valid.");
  if (url.startsWith(LOCAL_URL)) {
    const [, , , , k, id, name] = url.split("/");
    const b = await readLocal(k as Kind, id, name);
    if (!b) throw new Error("The uploaded file is gone. Add it again.");
    if (b.length > max) throw new Error("That file is too large.");
    return b;
  }
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error("The uploaded file is gone. Add it again.");
  const len = Number(r.headers.get("content-length") || 0);
  if (len > max) throw new Error("That file is too large.");
  const b = new Uint8Array(await r.arrayBuffer());
  if (b.length > max) throw new Error("That file is too large.");
  return b;
}

export async function deleteFiles(urls: string[]): Promise<void> {
  const blobs: string[] = [];
  for (const url of urls) {
    if (url.startsWith(LOCAL_URL)) {
      const [, , , , k, id] = url.split("/");
      if (/^[\w-]{36}$/.test(id) && (k === "in" || k === "out")) await fs.rm(path.join(LOCAL_DIR, k, id), { recursive: true, force: true }).catch(() => {});
    } else if (ownUrl(url, "in") || ownUrl(url, "out")) blobs.push(url);
  }
  if (blobs.length) await del(blobs).catch(() => {});
}

let lastSweep = 0;
/** Deletes anything older than the time limit. Runs at most once a minute, so no scheduled job is needed. */
export async function sweepOld(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  const cutoff = now - PDF_LIMITS.ttlMinutes * 60_000;
  try {
    if (storageMode() === "local") {
      for (const kind of ["in", "out"]) {
        const base = path.join(LOCAL_DIR, kind);
        for (const id of await fs.readdir(base).catch(() => [] as string[])) {
          const st = await fs.stat(path.join(base, id)).catch(() => null);
          if (st && st.mtimeMs < cutoff) await fs.rm(path.join(base, id), { recursive: true, force: true });
        }
      }
    } else if (storageMode() === "blob") {
      const old: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix: "papernest/", limit: 1000, cursor });
        for (const b of page.blobs) if (new Date(b.uploadedAt).getTime() < cutoff) old.push(b.url);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      for (let i = 0; i < old.length; i += 100) await del(old.slice(i, i + 100));
    }
  } catch {
    // cleaning up is best effort
  }
}
