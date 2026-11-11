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
import { LinkProvider } from "@/lib/linkdesk/store";

const TABS = [
  { id: "maker", label: "Make links" },
  { id: "batch", label: "Open in batches" },
  { id: "extract", label: "Extract links" },
  { id: "clean", label: "Link Cleaner" },
  { id: "archive", label: "Archive a page" },
] as const;
type TabId = (typeof TABS)[number]["id"];

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
        <div ref={stage} className="min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-8">
          <div className="mx-auto w-full max-w-[1200px]">
            <LinkProvider>
              <ToastProvider>
                <nav role="tablist" aria-label="LinkDesk tools" className="mb-4 flex gap-1 overflow-x-auto bg-stone-200 p-1">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      id={`tab-${t.id}`}
                      aria-selected={tab === t.id}
                      aria-controls={`view-${t.id}`}
                      onClick={() => go(t.id)}
                      className={`whitespace-nowrap px-4 py-2 text-xs font-semibold transition ${tab === t.id ? "bg-white text-stone-900" : "text-stone-600 hover:text-stone-900"}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>
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
