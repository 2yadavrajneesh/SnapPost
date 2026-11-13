"use client";

import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { CARD_W, FRAME_W, layoutCollage, type Cell, type LastRow, type LayoutMode } from "@/lib/collage";
import type { PostData } from "@/lib/types";
import CollageCard, { cardBorder, type CardStyle } from "./CollageCard";

export type FrameLook = { background: string; gap: number; pad: number; cellRadius: number; shadow: boolean };

/** An uploaded picture, already scaled down and stored as a data URL so it exports cleanly. */
export type Picture = { src: string; w: number; h: number };

export type Item = { key: string; post?: PostData; image?: Picture };

const BORDER_PX = { none: 0, thin: 2, thick: 7, double: 7, dashed: 4, dotted: 5 } as const;

function CellView({ item, cell, style, look, onNatural, stretch }: { stretch: boolean; item: Item; cell: Cell; style: CardStyle; look: FrameLook; onNatural: (key: string, h: number) => void }) {
  const onHeight = useCallback((h: number) => onNatural(item.key, h), [item.key, onNatural]);
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const onFit = useCallback((w: number, h: number) => setFit((c) => (c && c.w === w && Math.abs(c.h - h) < 1 ? c : { w, h })), []);
  const pic = item.image;
  // a picture reports the height it has at the card width, like a tweet does
  useEffect(() => {
    if (pic) onHeight(Math.round((CARD_W * pic.h) / pic.w));
  }, [pic, onHeight]);
  const card = style.theme === "dark" ? "#000000" : "#ffffff";
  const bw = BORDER_PX[style.border];
  // grid cells: the tweet is drawn at the width that fills the cell; masonry keeps the fixed card width
  const box = { w: cell.w - 2 * bw, h: cell.h - 2 * bw };
  const cardW = stretch && fit ? fit.w : CARD_W;
  const scale = stretch && fit ? Math.min(box.w / fit.w, box.h / fit.h) : cell.scale;
  const inner = cardW * scale;
  const fill = stretch ? box.h / scale : undefined;
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
        border: cardBorder(style),
        boxShadow: look.shadow ? "0 10px 30px rgba(0,0,0,.18)" : "none",
        boxSizing: "border-box",
      }}
    >
      {pic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pic.src} alt="" width={pic.w} height={pic.h} style={{ display: "block", width: box.w, height: box.h, objectFit: stretch ? "contain" : "fill" }} />
      ) : item.post ? (
        <div style={{ width: cardW, transform: `scale(${scale})`, transformOrigin: "top left", marginLeft: Math.max(0, (box.w - inner) / 2) }}>
          <CollageCard post={item.post} style={style} fill={fill} width={cardW} onHeight={onHeight} fitBox={stretch ? box : undefined} onFit={stretch ? onFit : undefined} />
        </div>
      ) : null}
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
