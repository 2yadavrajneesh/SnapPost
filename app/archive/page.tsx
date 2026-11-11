"use client";

import { useEffect, useRef, useState } from "react";
import ScrollTop from "@/components/ScrollTop";
import SiteHeader from "@/components/SiteHeader";
import { CollapsibleSection, Label, Section } from "@/components/ui";
import { archiveLinks, normalizeWebUrl, snapshotDate, type Snapshot } from "@/lib/archive";

type Lookup = { state: "idle" | "loading" | "done" | "error"; snapshot: Snapshot | null; error?: string };
type Saved = { url: string; snapshot: string; at: number };

const HISTORY_KEY = "archivevault:saved";

const fmt = (ts: string) => {
  const d = snapshotDate(ts);
  return d ? d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ts;
};

function loadHistory(): Saved[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.url === "string" && typeof x.snapshot === "string").slice(0, 30) : [];
  } catch {
    return [];
  }
}

const btn = "inline-flex h-9 items-center justify-center gap-1.5 border px-3 text-xs font-semibold transition disabled:opacity-40";
const btnPrimary = `${btn} border-transparent bg-accent text-white hover:brightness-110`;
const btnPlain = `${btn} border-stone-300 bg-white text-stone-800 hover:bg-stone-100`;

function Card({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <article className="border border-stone-300 bg-white p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="text-base font-bold text-stone-900">{title}</h3>
        <span className="bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600">{tag}</span>
      </div>
      {children}
    </article>
  );
}

export default function ArchiveVault() {
  const [link, setLink] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ state: "idle", snapshot: null });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Snapshot | null>(null); // the snapshot made by the last save
  const [history, setHistory] = useState<Saved[]>([]);
  const [notice, setNotice] = useState("");
  const stage = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const url = normalizeWebUrl(link);
  const links = url ? archiveLinks(url) : null;

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(""), 2200);
  };

  useEffect(() => setHistory(loadHistory()), []);
  const remember = (list: Saved[]) => {
    setHistory(list);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch {}
  };

  // Look the page up in the Wayback Machine as soon as the box holds a usable address.
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
      flash("Saved to the Wayback Machine");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the page.");
    } finally {
      setSaving(false);
    }
  }

  // One click: open archive.today with the link filled in (it must open straight from the click), and save to Wayback here.
  function saveEverywhere() {
    if (!links) return;
    window.open(links.todaySave, "_blank", "noopener");
    void saveWayback();
  }

  async function copy(text: string, what = "Link") {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copied`);
    } catch {
      flash("Couldn't copy");
    }
  }

  async function pasteLink() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setLink(t.trim());
    } catch {
      input.current?.focus();
      flash("Paste with Ctrl+V or long-press");
    }
  }

  const snap = fresh ?? lookup.snapshot;
  const open = (href: string, label: string, primary = false) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className={primary ? btnPrimary : btnPlain}>
      {label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 17L17 7M8 7h9v9" />
      </svg>
    </a>
  );

  return (
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden" style={{ ["--accent" as string]: "#4338ca" }}>
      <SiteHeader />

      <main className="grid w-full flex-1 lg:min-h-0 lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        <aside className="order-2 min-w-0 border-t border-stone-300 lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-t-0">
          <Section title="Source">
            <div>
              <Label>Web page to archive (checks automatically)</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={input}
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="Paste any web link…"
                    inputMode="url"
                    aria-busy={lookup.state === "loading"}
                    className="w-full border border-stone-200 bg-white py-2 pl-3 pr-9 text-sm outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)]"
                  />
                  {lookup.state === "loading" && <span className="snap-spinner absolute right-2.5 top-1/2 -mt-2" aria-hidden="true" />}
                </div>
                <button type="button" onClick={() => void pasteLink()} aria-label="Paste link from clipboard" title="Paste from clipboard" className="flex w-10 flex-none items-center justify-center border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  </svg>
                </button>
                <button type="button" onClick={() => setLink("")} aria-label="Start over with a different link" title="Start over" className="flex w-10 flex-none items-center justify-center border border-stone-200 bg-white text-stone-700 transition hover:bg-stone-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              </div>
              {link.trim() && !url && <p role="alert" className="mt-1.5 text-[11px] text-red-700">That doesn&apos;t look like a public web address.</p>}
            </div>
          </Section>

          <Section title="Save">
            <button type="button" disabled={!url || saving} onClick={saveEverywhere} className={`${btnPrimary} w-full`}>
              {saving ? "Saving…" : "Save everywhere"}
            </button>
            <p className="text-[11px] leading-snug text-stone-500">Saves to the Wayback Machine here and opens archive.today in a new tab with your link filled in. Allow pop-ups if your browser asks.</p>
            <button type="button" disabled={!url || saving} onClick={() => void saveWayback()} className={`${btnPlain} w-full`}>
              Save to Wayback Machine only
            </button>
          </Section>

          <CollapsibleSection title="Saved in this browser">
            {history.length === 0 ? (
              <p className="text-[11px] text-stone-500">Pages you save appear here, so you can find the snapshot links again. They stay in this browser only.</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li key={h.snapshot} className="border border-stone-200 bg-white p-2.5 text-xs">
                      <div className="truncate font-medium text-stone-800" title={h.url}>{h.url}</div>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
                        <a href={h.snapshot} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">Open snapshot</a>
                        <button type="button" onClick={() => void copy(h.snapshot, "Snapshot link")} className="font-semibold text-stone-600 hover:underline">Copy link</button>
                        <button type="button" onClick={() => setLink(h.url)} className="font-semibold text-stone-600 hover:underline">Use again</button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void copy(history.map((h) => `${h.url}\n${h.snapshot}`).join("\n\n"), "List")} className={`${btnPlain} flex-1`}>
                    Copy all
                  </button>
                  <button type="button" onClick={() => remember([])} className={`${btnPlain} flex-1`}>
                    Clear list
                  </button>
                </div>
              </>
            )}
          </CollapsibleSection>
        </aside>

        <div className="order-1 flex min-w-0 flex-col lg:order-2 lg:min-h-0">
          <div className="vault-stage relative flex max-h-[72vh] flex-1 overflow-hidden lg:max-h-none lg:min-h-0">
            <div ref={stage} className="relative z-[1] flex flex-1 overflow-auto px-4 py-6 sm:px-8">
              <div className="mx-auto w-full max-w-[720px]">
                {!url || !links ? (
                  <div className="border border-stone-300 bg-white p-8 text-center text-sm text-stone-600">
                    <div className="mb-1 text-base font-bold text-stone-900">Keep a page from disappearing</div>
                    Paste a link to any web page. We check whether the Wayback Machine already has it, save a fresh copy on request, and open other archives with your link filled in. No account or key needed.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Card title="Wayback Machine" tag="Internet Archive">
                      {lookup.state === "loading" && <p className="mt-2 text-sm text-stone-500">Looking for existing snapshots…</p>}
                      {lookup.state === "error" && <p role="alert" className="mt-2 text-sm text-red-700">{lookup.error}</p>}
                      {lookup.state === "done" && !snap && <p className="mt-2 text-sm text-stone-600">No snapshot yet. Be the first to save this page.</p>}
                      {snap && (
                        <p className="mt-2 text-sm text-stone-700">
                          {fresh ? "Saved just now: " : "Latest snapshot: "}
                          <strong>{fmt(snap.timestamp)}</strong>
                        </p>
                      )}
                      {saveError && <p role="alert" className="mt-2 text-sm text-red-700">{saveError}</p>}
                      {saving && <p className="mt-2 text-sm text-stone-500">Saving. This can take up to a minute…</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={saving} onClick={() => void saveWayback()} className={btnPrimary}>
                          {saving ? "Saving…" : snap ? "Save a new snapshot" : "Save now"}
                        </button>
                        {snap && open(snap.url, "Open snapshot")}
                        {snap && (
                          <button type="button" onClick={() => void copy(snap.url, "Snapshot link")} className={btnPlain}>
                            Copy link
                          </button>
                        )}
                        {open(links.waybackCalendar, "All snapshots")}
                      </div>
                    </Card>

                    <Card title="archive.today" tag="Opens in a new tab">
                      <p className="mt-2 text-sm text-stone-600">Saves a copy of the page as it looks now, text and images. You finish the save on their site.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {open(links.todaySave, "Save on archive.today", true)}
                        {open(links.todayFind, "Find existing copy")}
                      </div>
                    </Card>

                    <Card title="Ghost Archive" tag="Opens in a new tab">
                      <p className="mt-2 text-sm text-stone-600">Search whether this page is already preserved there.</p>
                      <div className="mt-3 flex flex-wrap gap-2">{open(links.ghostFind, "Search Ghost Archive")}</div>
                    </Card>

                    <p className="text-[11px] leading-snug text-stone-500">
                      Only the Wayback Machine is saved from this page. The other archives open on their own sites, because they ask you to confirm a check there. Some sites block archiving, and a saved copy is public.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <ScrollTop target={stage} />
            {notice && (
              <div role="status" className="absolute bottom-4 left-1/2 z-[6] -translate-x-1/2 bg-stone-900 px-4 py-2 text-xs font-semibold text-white shadow">
                {notice}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
