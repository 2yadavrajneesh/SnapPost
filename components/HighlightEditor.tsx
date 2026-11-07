"use client";

import { useRef, useState } from "react";
import { addHighlight, HIGHLIGHT_COLORS, removeHighlight, renderHighlighted, type Highlight, type HighlightStyle } from "@/lib/highlight";
import { Segmented } from "./ui";

/** Character offset in the text for a DOM position inside the selectable copy of the tweet text. */
function offsetOf(root: HTMLElement, node: Node, off: number): number {
  const holder = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement))?.closest("[data-start]") as HTMLElement | null;
  if (holder && root.contains(holder)) return Number(holder.dataset.start) + (node.nodeType === Node.TEXT_NODE ? off : 0);
  // Selection edge sits on the container itself: use the child at that index.
  const child = node.childNodes[off] as HTMLElement | undefined;
  if (child && "dataset" in child && child.dataset.start != null) return Number(child.dataset.start);
  return (root.textContent ?? "").length;
}

/**
 * Select some of the tweet's text, then tap a colour to highlight it. Highlights are kept as
 * character ranges so they follow the text on the card.
 */
export default function HighlightEditor({
  text,
  highlights,
  onChange,
}: {
  text: string;
  highlights: Highlight[];
  onChange: (h: Highlight[]) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [style, setStyle] = useState<HighlightStyle>("marker");

  // Remember the selection as it is made: tapping a button can clear it on some phones.
  function capture() {
    const root = box.current;
    const s = window.getSelection();
    if (!root || !s || s.rangeCount === 0 || s.isCollapsed) return;
    const r = s.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return;
    const a = offsetOf(root, r.startContainer, r.startOffset);
    const b = offsetOf(root, r.endContainer, r.endOffset);
    const [start, end] = a <= b ? [a, b] : [b, a];
    setSel(end > start ? { start, end } : null);
  }

  const apply = (color: string) => {
    if (!sel) return;
    onChange(addHighlight(highlights, { ...sel, color, style }));
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };
  const remove = () => {
    if (!sel) return;
    onChange(removeHighlight(highlights, sel.start, sel.end));
    setSel(null);
    window.getSelection()?.removeAllRanges();
  };
  const keep = (e: React.SyntheticEvent) => e.preventDefault(); // keep the text selected while pressing a button

  return (
    <div className="space-y-3">
      <div
        ref={box}
        onMouseUp={capture}
        onTouchEnd={() => setTimeout(capture, 50)}
        onKeyUp={capture}
        className="max-h-44 select-text overflow-auto whitespace-pre-wrap break-words border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed text-stone-800"
      >
        {renderHighlighted(text, highlights, true)}
      </div>
      <p className="text-[11px] text-stone-500">{sel ? "Choose a colour to highlight the selected text." : "Select words above, then pick a colour."}</p>

      <Segmented
        value={style}
        options={[
          { value: "marker", label: "Marker" },
          { value: "underline", label: "Underline" },
        ]}
        onChange={setStyle}
      />

      <div className="flex flex-wrap items-center gap-2">
        {HIGHLIGHT_COLORS.map((c) => (
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
            onChange([]);
            setSel(null);
          }}
          className="h-9 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-100 disabled:opacity-35"
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
