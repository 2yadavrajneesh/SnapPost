"use client";

import { useEffect, useRef, useState } from "react";
import ArchiveTool from "@/components/linkdesk/ArchiveTool";
import CleanerTool from "@/components/linkdesk/CleanerTool";
import ExtractTool from "@/components/linkdesk/ExtractTool";
import MakerTool from "@/components/linkdesk/MakerTool";
import BatchTool from "@/components/linkdesk/BatchTool";
import { ToastProvider } from "@/components/linkdesk/ui";
import ScrollTop from "@/components/ScrollTop";
import SiteHeader from "@/components/SiteHeader";
import { LinkProvider, useLinks } from "@/lib/linkdesk/store";

const ICONS: Record<string, string> = {
  maker: "M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7",
  batch: "M4 5h16M4 12h16M4 19h10M18 17l3 2-3 2",
  extract: "M21 21l-4.3-4.3M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM8 11h6M11 8v6",
  clean: "M4 20l9-9M13 11l-2-2 6-6 4 4-6 6-2-2zM4 20h6",
  archive: "M3 7h18v4H3zM5 11v9h14v-9M10 15h4",
};
const TABS = [
  { id: "maker", label: "Make links", sub: "Spreadsheet to clickable" },
  { id: "batch", label: "Open in batches", sub: "Open many at a time" },
  { id: "extract", label: "Extract links", sub: "Pull from files and text" },
  { id: "clean", label: "Link Cleaner", sub: "Remove tracking junk" },
  { id: "archive", label: "Archive a page", sub: "Save to Wayback Machine" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TabBar({ tab, go }: { tab: TabId; go: (t: TabId) => void }) {
  const { items } = useLinks();
  useEffect(() => {
    document.getElementById(`tab-${tab}`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tab]);
  return (
    <nav role="tablist" aria-label="LinkDesk tools" className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
            className={`group relative flex min-w-[148px] flex-1 items-center gap-2.5 border px-3 py-2.5 text-left transition ${
              on ? "border-stone-300 border-t-[3px] border-t-accent bg-white shadow-sm" : "border-stone-300 border-t-[3px] border-t-transparent bg-white/60 hover:bg-white"
            }`}
          >
            <span className={`flex h-8 w-8 flex-none items-center justify-center transition ${on ? "bg-accent text-white" : "bg-stone-200 text-stone-600 group-hover:bg-stone-300"}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={ICONS[t.id]} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-xs font-bold ${on ? "text-stone-900" : "text-stone-700"}`}>{t.label}</span>
              <span className="hidden truncate text-[11px] text-stone-500 md:block">{t.sub}</span>
            </span>
            {t.id === "batch" && items.length > 0 && (
              <span className="absolute right-2 top-2 min-w-[20px] bg-accent px-1.5 text-center text-[10px] font-bold leading-[18px] text-white" aria-label={`${items.length} links in the list`}>
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
                <TabBar tab={tab} go={go} />
                <div role="tabpanel" id="view-maker" aria-labelledby="tab-maker" hidden={tab !== "maker"}>
                  <MakerTool onSent={() => go("batch")} />
                </div>
                <div role="tabpanel" id="view-extract" aria-labelledby="tab-extract" hidden={tab !== "extract"}>
                  <ExtractTool
                    onSent={() => go("batch")}
                    onClean={(text, name) => {
                      setInbox((i) => ({ text, name, n: (i?.n ?? 0) + 1 }));
                      go("clean");
                    }}
                  />
                </div>
                <div role="tabpanel" id="view-clean" aria-labelledby="tab-clean" hidden={tab !== "clean"}>
                  <CleanerTool inbox={inbox} onSent={() => go("batch")} />
                </div>
                <div role="tabpanel" id="view-archive" aria-labelledby="tab-archive" hidden={tab !== "archive"}>
                  <ArchiveTool />
                </div>
                <div role="tabpanel" id="view-batch" aria-labelledby="tab-batch" hidden={tab !== "batch"}>
                  <BatchTool active={tab === "batch"} />
                </div>
              </ToastProvider>
            </LinkProvider>
          </div>
        </div>
        <ScrollTop target={stage} />
      </div>
    </div>
  );
}
