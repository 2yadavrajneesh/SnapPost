"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { historyFor } from "@/lib/history";
import { toolFor } from "@/lib/tools";
import ResetPageDialog from "@/components/ResetPageDialog";
import { useToast } from "@/components/linkdesk/ui";

const icon = "h-[18px] w-[18px]";
const btn = "inline-flex h-9 w-9 items-center justify-center border border-stone-300 bg-white text-stone-700 transition hover:bg-stone-100 disabled:opacity-35 disabled:hover:bg-white";

/** Undo, Redo and the three reset actions for the current app, shown in the header. */
export default function HistoryBar() {
  const tool = toolFor(usePathname());
  const [, tick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [page, setPage] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    const on = () => tick((n) => n + 1);
    window.addEventListener("snap:history", on);
    setMenu(false);
    return () => window.removeEventListener("snap:history", on);
  }, [tool.id]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // keep the field's own undo
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const h = historyFor(tool.id);
      if (!h) return;
      if (k === "z" && !e.shiftKey && h.can().undo) { e.preventDefault(); h.undo(); }
      else if ((k === "y" || (k === "z" && e.shiftKey)) && h.can().redo) { e.preventDefault(); h.redo(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [tool.id]);

  const h = historyFor(tool.id);
  if (!h) return null;
  const can = h.can();
  const item = "flex w-full items-start gap-2.5 px-3 py-2 text-left text-xs hover:bg-stone-100 disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-1" ref={box}>
      <button type="button" className={btn} disabled={!can.undo} onClick={() => h.undo()} aria-label="Undo" title="Undo (Ctrl+Z)">
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
      </button>
      <button type="button" className={btn} disabled={!can.redo} onClick={() => h.redo()} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" /></svg>
      </button>
      <div className="relative">
        <button type="button" className={btn} aria-haspopup="menu" aria-expanded={menu} aria-label="Reset options" title="Reset options" onClick={() => setMenu((m) => !m)}>
          <svg className={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
        </button>
        {menu && (
          <div role="menu" className="snap-scale absolute right-0 top-full z-50 mt-1 w-64 border border-stone-300 bg-white py-1 shadow-xl">
            <button role="menuitem" className={item} disabled={!can.changes} onClick={() => { h.resetChanges(); setMenu(false); toast("Changes reset. Undo brings them back."); }}>
              <span><b className="block text-stone-900">Reset changes</b><span className="text-stone-500">Back to how your files, lists and links were first added.</span></span>
            </button>
            <button role="menuitem" className={item} disabled={!can.settings} onClick={() => { h.resetSettings(); setMenu(false); toast("Settings reset. Undo brings them back."); }}>
              <span><b className="block text-stone-900">Reset settings</b><span className="text-stone-500">Options back to default; your content stays.</span></span>
            </button>
            <div className="my-1 border-t border-stone-200" />
            <button role="menuitem" className={`${item} text-red-700`} onClick={() => { setMenu(false); setPage(true); }}>
              <span><b className="block">Reset page</b><span className="text-stone-500">Everything back to the starting state.</span></span>
            </button>
          </div>
        )}
      </div>
      <ResetPageDialog open={page} onClose={() => setPage(false)} app={tool.id} name={tool.name} />
    </div>
  );
}
