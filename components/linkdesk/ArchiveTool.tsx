"use client";

import { useEffect, useRef, useState } from "react";
import { Ico } from "@/components/Icons";
import { sDel, sGet, sSet, useSessionSnapshot } from "@/lib/session";
import { archiveLinks, normalizeWebUrl, snapshotDate, type Snapshot } from "@/lib/archive";
import { btnPlain, btnPrimary, btnSm, btnIcon, Card, Chip, field, useCopy, useToast } from "./ui";

type Lookup = { state: "idle" | "loading" | "done" | "error"; snapshot: Snapshot | null; error?: string };
type Saved = { url: string; snapshot: string; at: number };

const HISTORY_KEY = "linkdesk:archived:v1";

const fmt = (ts: string) => {
  const d = snapshotDate(ts);
  return d ? d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ts;
};

function loadHistory(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? localStorage.getItem("archivevault:saved") ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.url === "string" && typeof x.snapshot === "string").slice(0, 30) : [];
  } catch {
    return [];
  }
}

function Out({ href, children, primary = false }: { href: string; children: string; primary?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={primary ? btnPrimary : btnPlain}>
      {children}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M8 7h9v9" /></svg>
    </a>
  );
}

/** Save a web page to the Wayback Machine, and open other archives with the link already filled in. */
export default function ArchiveTool() {
  const toast = useToast();
  const copy = useCopy();
  const [link, setLink] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle", snapshot: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<Saved[]>([]);
  useSessionSnapshot("linkdesk:archive", { link }, (v) => setLink(v.link ?? ""));
  const input = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const url = normalizeWebUrl(link);
  const links = url ? archiveLinks(url) : null;

  useEffect(() => setHistory(loadHistory()), []);
  const remember = (list: Saved[]) => {
    setHistory(list);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {}
  };

  // look the page up in the Wayback Machine as soon as the box holds a usable address
  useEffect(() => {
    setFresh(null);
    setSaveError(null);
    if (!url) {
      setLookup({ state: "idle", snapshot: null });
      return;
    }
    const id = ++reqId.current;
    setLookup({ state: "loading", snapshot: null });
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/archive?url=${encodeURIComponent(url)}`);
        const j = await r.json();
        if (id !== reqId.current) return;
        if (!r.ok) throw new Error(j.error || "Lookup failed.");
        setLookup({ state: "done", snapshot: j.snapshot ?? null });
      } catch (e) {
        if (id === reqId.current) setLookup({ state: "error", snapshot: null, error: e instanceof Error ? e.message : "Lookup failed." });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [url]);

  async function saveWayback() {
    if (!url || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch("/api/archive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't save the page.");
      const snap = j.snapshot as Snapshot;
      setFresh(snap);
      setLookup({ state: "done", snapshot: snap });
      remember([{ url, snapshot: snap.url, at: Date.now() }, ...history.filter((h) => h.snapshot !== snap.url)].slice(0, 30));
      toast("Saved to the Wayback Machine");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the page.");
    } finally {
      setSaving(false);
    }
  }

  // one click: archive.today must open straight from the click, then the Wayback save runs here
  function saveEverywhere() {
    if (!links) return;
    window.open(links.todaySave, "_blank", "noopener");
    void saveWayback();
  }

  async function pasteLink() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setLink(t.trim());
    } catch {
      input.current?.focus();
      toast("Paste with Ctrl+V or long-press", "warn");
    }
  }

  const snap = fresh ?? lookup.snapshot;

  return (
    <div className="space-y-4">
      <p className="text-xs text-stone-500">Save a web page to the Internet Archive&apos;s Wayback Machine so it never disappears, and open other archives with your link filled in. No account or key needed.</p>

      <Card step={1} title="Web page to archive" chip={url && <Chip>{new URL(url).hostname}</Chip>}>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              ref={input}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Paste any web link…"
              inputMode="url"
              aria-label="Web page to archive"
              aria-busy={lookup.state === "loading"}
              className={`${field} !py-2.5 !pr-9 !text-sm`}
            />
            {lookup.state === "loading" && <span className="snap-spinner absolute right-2.5 top-1/2 -mt-2" aria-hidden="true" />}
          </div>
          <button type="button" onClick={() => void pasteLink()} aria-label="Paste link from clipboard" title="Paste from clipboard" className={`${btnPlain} w-10 px-0`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>
          </button>
          <button type="button" onClick={() => setLink("")} aria-label="Start over with a different link" title="Start over" className={`${btnPlain} w-10 px-0`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>
        {link.trim() && !url && <p role="alert" className="text-[11px] text-red-700">That doesn&apos;t look like a public web address.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!url || saving} onClick={saveEverywhere} className={btnPrimary}>{saving ? "Saving…" : "Save everywhere"}</button>
          <button type="button" disabled={!url || saving} onClick={() => void saveWayback()} className={btnPlain}>Save to Wayback Machine only</button>
        </div>
        <p className="text-[11px] leading-snug text-stone-500">&quot;Save everywhere&quot; saves to the Wayback Machine here and opens archive.today in a new tab with your link filled in. Allow pop-ups if your browser asks.</p>
      </Card>

      {links && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Wayback Machine" chip={<Chip>Internet Archive</Chip>}>
            {lookup.state === "loading" && <p className="text-sm text-stone-500">Looking for existing snapshots…</p>}
            {lookup.state === "error" && <p role="alert" className="text-sm text-red-700">{lookup.error}</p>}
            {lookup.state === "done" && !snap && <p className="text-sm text-stone-600">No snapshot yet. Be the first to save this page.</p>}
            {snap && <p className="text-sm text-stone-700">{fresh ? "Saved just now: " : "Latest snapshot: "}<strong>{fmt(snap.timestamp)}</strong></p>}
            {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
            {saving && <p className="text-sm text-stone-500">Saving. This can take up to a minute…</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void saveWayback()} className={btnPrimary}>{saving ? "Saving…" : snap ? "Save a new snapshot" : "Save now"}</button>
              {snap && <Out href={snap.url}>Open snapshot</Out>}
              {snap && <button type="button" onClick={() => void copy(snap.url, "Snapshot link copied")} className={btnPlain}>Copy link</button>}
              <Out href={links.waybackCalendar}>All snapshots</Out>
            </div>
          </Card>

          <Card title="archive.today" chip={<Chip>New tab</Chip>}>
            <p className="text-sm text-stone-600">Saves a copy of the page as it looks now, text and images. You finish the save on their site.</p>
            <div className="flex flex-wrap gap-2">
              <Out href={links.todaySave} primary>Save on archive.today</Out>
              <Out href={links.todayFind}>Find existing copy</Out>
            </div>
          </Card>

          <Card title="Ghost Archive" chip={<Chip>New tab</Chip>}>
            <p className="text-sm text-stone-600">Search whether this page is already preserved there.</p>
            <div className="flex flex-wrap gap-2"><Out href={links.ghostFind}>Search Ghost Archive</Out></div>
          </Card>
        </div>
      )}
      {links && <p className="text-[11px] leading-snug text-stone-500">Only the Wayback Machine is saved from this page. The other archives open on their own sites, because they ask you to confirm a check there. Some sites block archiving, and a saved copy is public.</p>}

      <section className="border border-stone-300 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-stone-900">Saved in this browser</h2>
          {history.length > 0 && (
            <span className="flex gap-2">
              <button title="Copy all" aria-label="Copy all" type="button" className={btnIcon} onClick={() => void copy(history.map((h) => `${h.url}\n${h.snapshot}`).join("\n\n"), "List copied")}><Ico n="copy" /></button>
              <button title="Clear list" aria-label="Clear list" type="button" className={btnIcon} onClick={() => { const prev = history; remember([]); toast("Cleared the list.", "ok", { label: "Undo", run: () => remember(prev) }); }}><Ico n="trash" /></button>
            </span>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-stone-500">Pages you save appear here, so you can find the snapshot links again. They stay in this browser only.</p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {history.map((h) => (
              <li key={h.snapshot} className="border border-stone-200 bg-stone-50 p-2.5 text-xs">
                <div className="truncate font-medium text-stone-800" title={h.url}>{h.url}</div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                  <a href={h.snapshot} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">Open snapshot</a>
                  <button type="button" onClick={() => void copy(h.snapshot, "Snapshot link copied")} className="font-semibold text-stone-600 hover:underline">Copy link</button>
                  <button type="button" onClick={() => setLink(h.url)} className="font-semibold text-stone-600 hover:underline">Use again</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
