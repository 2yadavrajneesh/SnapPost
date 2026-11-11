"use client";

import { useEffect, useRef, useState } from "react";
import { addHighlight, offsetIn as offsetOf, HIGHLIGHT_COLORS, REDACT_STYLES, removeHighlight, renderHighlighted, type Highlight, type HighlightStyle } from "@/lib/highlight";
import { Segmented } from "./ui";

/**
 * Select some of the tweet's text, then tap a colour to highlight it. Highlights are kept as
 * character ranges so they follow the text on the card.
 */
export default function HighlightEditor({
  text,
  highlights,
  onChange,
  redactExtra,
}: {
  text: string;
  highlights: Highlight[];
  onChange: (h: Highlight[]) => void;
  /** Shown under the text tools when Redact is selected (e.g. the Hide details switches). */
  redactExtra?: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [style, setStyle] = useState<HighlightStyle>("marker");
  const [mode, setMode] = useState<"highlight" | "redact">("highlight");

  // Every change goes through commit(), which remembers the list it replaced so Undo can bring it back.
  const [history, setHistory] = useState<Highlight[][]>([]);
  const commit = (next: Highlight[]) => {
    setHistory((h) => [...h.slice(-49), highlights]);
    onChange(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    onChange(prev);
    setSel(null);
  };
  // New text means the old ranges are meaningless, so the history starts over.
  useEffect(() => setHistory([]), [text]);

  // Track the selection the moment it changes (mouse, touch handles or keyboard). It is only ever
  // replaced by a new valid selection, because tapping a button can collapse it on some phones.
  useEffect(() => {
    const onChange = () => {
      const root = box.current;
      const s = window.getSelection();
      if (!root || !s || s.rangeCount === 0 || s.isCollapsed) return;
      const r = s.getRangeAt(0);
      if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return;
      const a = offsetOf(root, r.startContainer, r.startOffset);
      const b = offsetOf(root, r.endContainer, r.endOffset);
      const [start, end] = a <= b ? [a, b] : [b, a];
      setSel((cur) => (end <= start ? cur : cur && cur.start === start && cur.end === end ? cur : { start, end }));
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  const apply = (color: string, as: HighlightStyle = style) => {
    if (!sel) return;
    commit(addHighlight(highlights, { ...sel, color, style: as }));
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };
  const remove = () => {
    if (!sel) return;
    commit(removeHighlight(highlights, sel.start, sel.end));
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };
  const keep = (e: React.SyntheticEvent) => e.preventDefault(); // keep the text selected while pressing a button

  return (
    <div className="space-y-3">
      <Segmented
        value={mode}
        options={[
          { value: "highlight", label: "Highlight" },
          { value: "redact", label: "Redact" },
        ]}
        onChange={setMode}
      />
      <div
        ref={box}
        onPointerDown={() => setSel(null)}
        className="max-h-44 select-text overflow-auto whitespace-pre-wrap break-words border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800"
      >
        {renderHighlighted(text, highlights, true)}
      </div>
      <p className="text-[11px] text-stone-500">
        {mode === "redact"
          ? sel
            ? "Choose how to hide the selected text."
            : "Select the words to hide, then pick Black bar, Gray bar or Blur. A bar hides text best."
          : sel
            ? "Choose a colour to highlight the selected text."
            : "Select words above, then pick a colour."}
      </p>

      {mode === "highlight" && (
        <Segmented
          value={style === "underline" ? "underline" : "marker"}
          options={[
            { value: "marker", label: "Marker" },
            { value: "underline", label: "Underline" },
          ]}
          onChange={setStyle}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mode === "redact" &&
          REDACT_STYLES.map((r) => (
            <button
              key={r.label}
              type="button"
              disabled={!sel}
              onMouseDown={keep}
              onClick={() => apply(r.color, r.style)}
              className="h-9 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:opacity-35"
            >
              {r.label}
            </button>
          ))}
        {mode === "highlight" && HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.name}
            aria-label={`Highlight ${c.name}`}
            disabled={!sel}
            onMouseDown={keep}
            onClick={() => apply(c.value)}
            className="h-9 w-9 border border-stone-400 transition disabled:opacity-35"
            style={{ backgroundColor: c.value }}
          />
        ))}
        {mode === "highlight" && (
          <label
            title="Pick any colour"
            className={`relative flex h-9 items-center gap-1.5 border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-700 ${sel ? "cursor-pointer hover:bg-stone-100" : "opacity-35"}`}
          >
            <span className="h-4 w-4 border border-stone-400" style={{ background: "conic-gradient(#f87171, #fde047, #86efac, #67e8f9, #a78bfa, #f472b6, #f87171)" }} />
            Custom
            <input
              type="color"
              aria-label="Custom highlight colour"
              disabled={!sel}
              defaultValue="#fde047"
              onChange={(e) => apply(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
          </label>
        )}
        <button
          type="button"
          disabled={history.length === 0}
          onClick={undo}
          className="h-9 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-35"
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!sel}
          onMouseDown={keep}
          onClick={remove}
          className="h-9 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-35"
        >
          Remove
        </button>
        <button
          type="button"
          disabled={highlights.length === 0}
          onClick={() => {
            commit([]);
            setSel(null);
          }}
          className="h-9 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-35"
        >
          Clear all
        </button>
      </div>
      {mode === "redact" && redactExtra}
    </div>
  );
}
