"use client";

import { forwardRef, useCallback, useMemo } from "react";
import { CARD_W, FRAME_W, layoutCollage, type Cell, type LastRow, type LayoutMode } from "@/lib/collage";
import type { PostData } from "@/lib/types";
import CollageCard, { type CardStyle } from "./CollageCard";

export type FrameLook = { background: string; gap: number; pad: number; cellRadius: number; shadow: boolean };

export type Item = { key: string; post: PostData };

function CellView({ item, cell, style, look, onNatural, stretch }: { stretch: boolean; item: Item; cell: Cell; style: CardStyle; look: FrameLook; onNatural: (key: string, h: number) => void }) {
  const onHeight = useCallback((h: number) => onNatural(item.key, h), [item.key, onNatural]);
  const card = style.theme === "dark" ? "#000000" : "#ffffff";
  const border = style.theme === "dark" ? "#2f3336" : "#cfd9de";
  const inner = CARD_W * cell.scale;
  const fill = stretch ? cell.h / cell.scale : undefined; // grid cells: the card grows to the cell's height
  return (
    <div
      style={{
        position: "absolute",
        left: cell.x,
        top: cell.y,
        width: cell.w,
        height: cell.h,
        overflow: "hidden",
        background: card,
        borderRadius: look.cellRadius,
        border: style.border ? `2px solid ${border}` : "none",
        boxShadow: look.shadow ? "0 10px 30px rgba(0,0,0,.18)" : "none",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: CARD_W, transform: `scale(${cell.scale})`, transformOrigin: "top left", marginLeft: Math.max(0, (cell.w - inner) / 2) }}>
        <CollageCard post={item.post} style={style} fill={fill} onHeight={onHeight} />
      </div>
    </div>
  );
}

/**
 * The collage picture at its full logical size (FRAME_W wide). The page scales it down for preview
 * and draws this same element to a PNG, so the file matches what you see.
 */
const CollageFrame = forwardRef<
  HTMLDivElement,
  { items: Item[]; natural: Record<string, number>; onNatural: (key: string, h: number) => void; mode: LayoutMode; cols: number; ratio: number | null; lastRow: LastRow; style: CardStyle; look: FrameLook }
>(function CollageFrame({ items, natural, onNatural, mode, cols, ratio, lastRow, style, look }, ref) {
  const layout = useMemo(
    () => layoutCollage({ n: items.length, mode, cols, ratio: mode === "masonry" ? null : ratio, gap: look.gap, pad: look.pad, lastRow, natural: items.map((i) => natural[i.key]) }),
    [items, natural, mode, cols, ratio, lastRow, look.gap, look.pad],
  );
  return (
    <div ref={ref} style={{ position: "relative", width: FRAME_W, height: layout.height, background: look.background, overflow: "hidden" }}>
      {items.map((it, i) => (layout.cells[i] ? <CellView key={it.key} item={it} cell={layout.cells[i]} style={style} look={look} onNatural={onNatural} stretch={mode === "grid"} /> : null))}
    </div>
  );
});

export default CollageFrame;
