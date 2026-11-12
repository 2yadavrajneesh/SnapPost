"use client";

import { upload } from "@vercel/blob/client";

export type PdfConfig = { mode: "blob" | "local" | "off"; maxFileBytes: number; maxImageBytes: number; maxFiles: number; ttlMinutes: number };
export type Uploaded = { url: string; name: string };
export type RunResult = { url: string; name: string; size: number; expiresAt: number; note?: string };

let cached: Promise<PdfConfig> | null = null;
export const getConfig = () => (cached ??= fetch("/api/pdf/config").then((r) => r.json() as Promise<PdfConfig>));

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => ((Math.random() * 16) | 0).toString(16)));
const safe = (n: string) => n.replace(/[^\w.\- ]+/g, "_").slice(-90) || "file";

/** Sends one file to storage and returns its private link. */
export const isImageFile = (f: File) => /^image\//.test(f.type);

export async function uploadFile(file: File, mode: PdfConfig["mode"], onProgress?: (pct: number) => void): Promise<Uploaded> {
  if (mode === "off") throw new Error("File storage is not set up on this site yet.");
  const name = safe(file.name);
  if (mode === "local") {
    const res = await fetch(`/api/pdf/upload-local?name=${encodeURIComponent(name)}&kind=${isImageFile(file) ? "image" : "pdf"}`, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? "Upload failed.");
    onProgress?.(100);
    return { url: j.url, name: file.name };
  }
  const blob = await upload(`papernest/in/${uuid()}/${name}`, file, {
    access: "public",
    handleUploadUrl: "/api/pdf/upload",
    clientPayload: isImageFile(file) ? "image" : "pdf",
    multipart: file.size > 20 * 1024 * 1024,
    contentType: file.type || undefined,
    onUploadProgress: (p) => onProgress?.(p.percentage),
  });
  return { url: blob.url, name: file.name };
}

export async function runTool(tool: string, files: Uploaded[], options: Record<string, unknown>): Promise<RunResult> {
  const res = await fetch("/api/pdf/process", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool, files, options }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? (res.status === 429 ? "Too many requests. Please wait a little." : "Something went wrong."));
  return j as RunResult;
}

export const deleteResult = (url: string) => fetch("/api/pdf/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }).catch(() => {});

/** Adds ?download=1 so the browser saves the file instead of opening it. */
export const downloadHref = (url: string) => url + (url.includes("?") ? "&" : "?") + "download=1";
