"use client";

import { useEffect, useRef, useState } from "react";
import ResetButton from "@/components/ResetButton";
import ArchiveTool from "@/components/linkdesk/ArchiveTool";
import CleanerTool from "@/components/linkdesk/CleanerTool";
import ExtractTool from "@/components/linkdesk/ExtractTool";
import MakerTool from "@/components/linkdesk/MakerTool";
import BatchTool from "@/components/linkdesk/BatchTool";
import { ToastProvider, useToast } from "@/components/linkdesk/ui";
import ScrollTop from "@/components/ScrollTop";
import SiteHeader from "@/components/SiteHeader";
import { LinkProvider, useLinks } from "@/lib/linkdesk/store";

const ICONS: Record<string, string> = {
  maker: "M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7",
  batch: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  extract: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 12v6M9 15l3 3 3-3",
  clean: "M3 4h18l-7 8v6l-4 2v-8z",
  archive: "M3 7h18v4H3zM5 11v9h14v-9M10 15h4",
};
/** Each LinkDesk tool has its own colour, used on its tab and inside its page. */
const COLORS: Record<string, string> = { maker: "#2563eb", batch: "#0d9488", extract: "#d97706", clean: "#db2777", archive: "#7c3aed" };
const TABS = [
  { id: "maker", label: "Make links", sub: "Spreadsheet to clickable" },
  { id: "batch", label: "Open in batches", sub: "Open many at a time" },
  { id: "extract", label: "Extract links", sub: "Pull from files and text" },
  { id: "clean", label: "Link Cleaner", sub: "Remove tracking junk" },
  { id: "archive", label: "Archive a page", sub: "Save to Wayback Machine" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Tells the person when a saved list was dropped for being idle, or could not be saved. */
function SessionNotices() {
  const { expired, ackExpired, saveFailed } = useLinks();
  const toast = useToast();
  useEffect(() => {
    if (expired) {
      toast("Your saved list was cleared after 7 days without use.", "warn");
      ackExpired();
    }
  }, [expired, ackExpired, toast]);
  useEffect(() => {
    if (saveFailed) toast("This list is too big to keep in the browser. It will be gone if you reload.", "warn");
  }, [saveFailed, toast]);
  return null;
}

function TabBar({ tab, go }: { tab: TabId; go: (t: TabId) => void }) {
  const { items } = useLinks();
  const bar = useRef<HTMLElement>(null);
  // Keep the chosen tab in view by moving only the tab bar itself. scrollIntoView also scrolls the whole page
  // sideways on narrow screens, which made the page jump left and drift back.
  useEffect(() => {
    const nav = bar.current;
    const el = document.getElementById(`tab-${tab}`);
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
  }, [tab]);
  return (
    <nav ref={bar} role="tablist" aria-label="LinkDesk tools" className="relative mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const on = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={on}
            aria-controls={`view-${t.id}`}
            onClick={() => go(t.id)}
            style={{ ["--tc" as string]: COLORS[t.id] }}
            className="tab-card group relative flex min-w-[148px] flex-1 items-center gap-2.5 border px-3 py-2.5 text-left transition"
          >
            <span className="flex h-9 w-9 flex-none items-center justify-center text-white transition" style={{ background: COLORS[t.id] }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICONS[t.id]} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-stone-900">{t.label}</span>
              <span className="hidden truncate text-[11px] text-stone-500 md:block">{t.sub}</span>
            </span>
            {t.id === "batch" && items.length > 0 && (
              <span style={{ background: COLORS.batch }} className="absolute right-2 top-2 min-w-[20px] px-1.5 text-center text-[10px] font-bold leading-[18px] text-white" aria-label={`${items.length} links in the list`}>
                {items.length > 999 ? "999+" : items.length}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default function LinkDesk() {
  const [tab, setTab] = useState<TabId>("batch");
  const stage = useRef<HTMLDivElement>(null);
  const [inbox, setInbox] = useState<{ text: string; name: string; n: number } | null>(null);

  // remember the tab in the address (#batch) so a refresh or shared link opens the same tool
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1) as TabId;
      if (TABS.some((t) => t.id === h)) setTab(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (t: TabId) => {
    setTab(t);
    history.replaceState(null, "", `#${t}`);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ ["--accent" as string]: "#1f5fd6" }}>
      <SiteHeader />
      <div className="desk-stage relative flex min-h-0 flex-1">
        <div ref={stage} className="relative z-[1] min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-8">
          <div className="mx-auto w-full max-w-[1200px]">
            <LinkProvider>
              <ToastProvider>
                <SessionNotices />
                <TabBar tab={tab} go={go} />
                <div role="tabpanel" id="view-maker" aria-labelledby="tab-maker" hidden={tab !== "maker"} style={{ ["--accent" as string]: COLORS.maker }}>
                  <MakerTool onSent={() => go("batch")} />
                </div>
                <div role="tabpanel" id="view-extract" aria-labelledby="tab-extract" hidden={tab !== "extract"} style={{ ["--accent" as string]: COLORS.extract }}>
                  <ExtractTool
                    onSent={() => go("batch")}
                    onClean={(text, name) => {
                      setInbox((i) => ({ text, name, n: (i?.n ?? 0) + 1 }));
                      go("clean");
                    }}
                  />
                </div>
                <div role="tabpanel" id="view-clean" aria-labelledby="tab-clean" hidden={tab !== "clean"} style={{ ["--accent" as string]: COLORS.clean }}>
                  <CleanerTool inbox={inbox} onSent={() => go("batch")} />
                </div>
                <div role="tabpanel" id="view-archive" aria-labelledby="tab-archive" hidden={tab !== "archive"} style={{ ["--accent" as string]: COLORS.archive }}>
                  <ArchiveTool />
                </div>
                <div role="tabpanel" id="view-batch" aria-labelledby="tab-batch" hidden={tab !== "batch"} style={{ ["--accent" as string]: COLORS.batch }}>
                  <BatchTool active={tab === "batch"} />
                </div>
              </ToastProvider>
            </LinkProvider>
            <div className="mt-8 flex justify-end"><ResetButton /></div>
          </div>
        </div>
        <ScrollTop target={stage} />
      </div>
    </div>
  );
}
