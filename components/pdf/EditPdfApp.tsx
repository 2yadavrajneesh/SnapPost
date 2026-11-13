"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import EditorWorkspace from "./EditorWorkspace";
import Organize from "./toolkit/Organize";
import Merge from "./toolkit/Merge";
import Split from "./toolkit/Split";
import Numbers from "./toolkit/Numbers";
import Watermark from "./toolkit/Watermark";
import Redact from "./toolkit/Redact";

const TABS: { id: string; label: string; blurb: string; color: string; icon: string; View: ComponentType }[] = [
  { id: "edit", label: "Edit", blurb: "Add text, highlights, shapes, drawings, signatures and pictures right on the pages.", color: "#047857", icon: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4", View: EditorWorkspace },
  { id: "organize", label: "Organize", blurb: "Reorder, delete, copy and rotate pages, or add blank ones. Drag the pages into place.", color: "#2563eb", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", View: () => <Organize mode="organize" /> },
  { id: "numbers", label: "Page numbers", blurb: "Number the pages: position, margin, first number, page range and font.", color: "#7c3aed", icon: "M5 4h14v16H5zM9 16h6M12 8v5", View: Numbers },
  { id: "redact", label: "Redact", blurb: "Permanently black out names, numbers or any area. Find a word and mark every match.", color: "#111827", icon: "M4 6h16v4H4zM4 14h10v4H4z", View: Redact },
  { id: "merge", label: "Merge", blurb: "Join several PDFs into one, in the order you choose.", color: "#d97706", icon: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M8 12h8M12 8v8", View: Merge },
  { id: "split", label: "Split", blurb: "Cut a PDF by ranges, every N pages, one page per file, or pick the pages you need.", color: "#db2777", icon: "M12 3v18M7 8l-4 4 4 4M17 8l4 4-4 4", View: Split },
  { id: "rotate", label: "Rotate", blurb: "Turn the whole PDF or each page on its own.", color: "#0891b2", icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5", View: () => <Organize mode="rotate" /> },
  { id: "watermark", label: "Watermark", blurb: "Stamp text or a picture on the pages: position, mosaic, transparency, rotation and layer.", color: "#dc2626", icon: "M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z", View: Watermark },
];

export default function EditPdfApp() {
  const [id, setId] = useState("edit");
  const nav = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some((t) => t.id === h)) setId(h);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const pick = (t: string) => {
    setId(t);
    history.replaceState(null, "", `#${t}`);
  };
  const tab = TABS.find((t) => t.id === id) ?? TABS[0];
  const View = tab.View;
  return (
    <div style={{ ["--accent" as string]: tab.color }}>
      <h1 className="text-2xl font-bold text-stone-900">EditPDF</h1>
      <p className="mb-4 mt-1 max-w-2xl text-sm text-stone-600">{tab.blurb}</p>
      <div ref={nav} role="tablist" aria-label="PDF tools" className="relative mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === id}
            onClick={() => pick(t.id)}
            className={`flex flex-none items-center gap-2 border px-3.5 py-2 text-xs font-bold transition ${t.id === id ? "text-white" : "bg-white text-stone-800 hover:bg-stone-100"}`}
            style={t.id === id ? { background: t.color, borderColor: t.color } : { borderColor: "#d6d3d1" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.id === id ? "#fff" : t.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
            {t.label}
          </button>
        ))}
      </div>
      <View key={tab.id} />
    </div>
  );
}
