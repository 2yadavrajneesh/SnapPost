"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { layoutNews, NEWS, splitPlan, type NewsPiece, type Wrap } from "@/lib/pdf/newsLayout";

export type PreviewItem = { id: number; url: string; nw: number; nh: number; caption: string; source: string; dx: number; dy: number; page: number };
export type PreviewSettings = { title: string; footer: string; layout: string; orient: string; header: string; theme: string; numbers: boolean; splitTall: boolean; titleStyle: string; showDate: boolean };

const THEME: Record<string, string> = { navy: "#1a3373", red: "#bf1a1f", green: "#14734d", black: "#1a1a1a" };
type Piece = NewsPiece & { url: string; top: number; ph: number; full: number; id: number };

let ctx: CanvasRenderingContext2D | null = null;
/** Wraps text with the browser's own font metrics, close to what the PDF fonts do. */
const wrap: Wrap = (text, width, size, maxLines) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  const width_ = (t: string) => {
    if (!ctx) return t.length * size * 0.5;
    ctx.font = `${size}px Arial, "Noto Sans", sans-serif`;
    return ctx.measureText(t).width;
  };
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (width_(t) <= width || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && width_(`${last}…`) > width) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
};

/** A live, page-by-page picture of the PDF, drawn from the same layout rules the server uses. */
export default function NewsPreview({ items, s, date, onMove, onSend }: { items: PreviewItem[]; s: PreviewSettings; date: string; onMove?: (id: number, dx: number, dy: number) => void; onSend?: (id: number, page: number) => void }) {
  const drag = useRef<{ id: number; sx: number; sy: number; dx: number; dy: number; page: number; k: number } | null>(null);
  const [live, setLive] = useState<{ id: number; dx: number; dy: number } | null>(null);
  const down = (e: React.PointerEvent, id: number, dx: number, dy: number, page: number, k: number) => {
    if (!onMove) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id, sx: e.clientX, sy: e.clientY, dx, dy, page, k };
    setLive({ id, dx, dy });
  };
  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) setLive({ id: d.id, dx: d.dx + (e.clientX - d.sx) / d.k, dy: d.dy + (e.clientY - d.sy) / d.k });
  };
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const nx = d.dx + (e.clientX - d.sx) / d.k;
    const ny = d.dy + (e.clientY - d.sy) / d.k;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).map((el) => (el as HTMLElement).closest?.("[data-pg]")).find(Boolean) as HTMLElement | null | undefined;
    const pg = hit ? Number(hit.dataset.pg) : d.page;
    if (hit && pg !== d.page && onSend) onSend(d.id, pg + 1);
    else onMove?.(d.id, Math.round(nx), Math.round(ny));
    setLive(null);
  };
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(160, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(160, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const pieces: Piece[] = [];
    items.forEach((it, i) => {
      if (!it.nw || !it.nh) return;
      const k = Math.min(1, NEWS.maxEdge[0] / it.nw, NEWS.maxEdge[1] / it.nh);
      const w = Math.round(it.nw * k);
      const h = Math.round(it.nh * k);
      splitPlan(w, h, s.splitTall).forEach((p, j) => pieces.push({ w, h: p.h, caption: j === 0 ? it.caption.trim().slice(0, 400) : "", source: j === 0 ? it.source.trim().slice(0, 60) : "", n: i + 1, cont: j > 0, url: it.url, top: p.top, ph: p.h, full: h, id: it.id, dx: it.dx, dy: it.dy, pin: j === 0 ? it.page : 0 }));
    });
    return layoutNews(pieces, { layout: s.layout, landscape: s.orient === "landscape", headerMode: s.header, numbers: s.numbers, titleStyle: s.titleStyle, showDate: s.showDate }, wrap);
  }, [items, s.layout, s.orient, s.header, s.numbers, s.splitTall, s.titleStyle, s.showDate]);

  const k = width / layout.pw;
  const accent = THEME[s.theme] ?? THEME.navy;
  const total = layout.pages.length;
  const font = 'Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif';

  return (
    <div ref={box} className="space-y-3">
      {!total && <div className="border border-dashed border-stone-300 bg-white px-3 py-8 text-center text-xs text-stone-500">Add a screenshot and the pages appear here as you work.</div>}
      {layout.pages.map((pg, pi) => (
        <figure key={pi} className="m-0">
          <div data-pg={pi} className="relative overflow-hidden bg-white shadow-md ring-1 ring-stone-300" style={{ width: layout.pw * k, height: layout.ph * k }}>
            <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.pw, height: layout.ph, transform: `scale(${k})`, fontFamily: font, color: "#262626" }}>
              {layout.showHeadOn(pi) && (
                <>
                  {layout.head.rects.map((r, ri) => (
                    <div key={ri} className="absolute" style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: r.color === "accent" ? accent : "#b3b3b3" }} />
                  ))}
                  <div className="absolute whitespace-nowrap font-bold" style={{ left: layout.head.title.x, top: layout.head.title.base - layout.head.title.size * 1.05, fontSize: layout.head.title.size, lineHeight: 1.1, color: layout.head.title.color === "white" ? "#fff" : accent, transform: layout.head.title.align === "center" ? "translateX(-50%)" : undefined }}>{s.title || "Daily News Update"}</div>
                  {date && layout.head.date && <div className="absolute whitespace-nowrap" style={{ left: layout.head.date.x, top: layout.head.date.base - layout.head.date.size * 1.05, fontSize: layout.head.date.size, lineHeight: 1.1, color: layout.head.date.color === "white" ? "#fff" : "#4d4d4d", transform: layout.head.date.align === "center" ? "translateX(-50%)" : layout.head.date.align === "right" ? "translateX(-100%)" : undefined }}>{date}</div>}
                </>
              )}
              {pg.cells.map((c, ci) => {
                const sc = c.h / c.it.ph;
                const lv = live && live.id === c.it.id ? { x: live.dx - (c.it.dx ?? 0), y: live.dy - (c.it.dy ?? 0) } : { x: 0, y: 0 };
                return (
                  <div key={ci} onPointerDown={(e) => down(e, c.it.id, c.it.dx ?? 0, c.it.dy ?? 0, pi, k)} onPointerMove={moveTo} onPointerUp={up} title={onMove ? "Drag to move. Drop on another page to send it there." : undefined} style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: `translate(${lv.x}px, ${lv.y}px)`, zIndex: live && live.id === c.it.id ? 5 : undefined }}>
                    <div className="absolute" style={{ left: c.x - 0.5, top: c.y - 0.5, width: c.w + 1, height: c.h + 1, border: "0.75px solid #ccc", boxSizing: "border-box" }} />
                    <div className="absolute" style={{ pointerEvents: "auto", cursor: onMove ? "grab" : undefined, touchAction: "none", left: c.x, top: c.y, width: c.w, height: c.h, backgroundImage: `url(${c.it.url})`, backgroundSize: `${c.w}px ${c.it.full * sc}px`, backgroundPosition: `0 ${-c.it.top * sc}px`, backgroundRepeat: "no-repeat" }} />
                    {(c.label || c.source) && (
                      <div className="absolute whitespace-nowrap font-bold" style={{ left: c.x, top: c.base - c.size * 1.05, fontSize: c.size, lineHeight: 1.1 }}>
                        {c.label && <span style={{ color: accent }}>{c.label}&nbsp;</span>}
                        {c.source && <span style={{ color: "#262626" }}>{c.source}</span>}
                      </div>
                    )}
                    {c.lines.map((ln, li) => (
                      <div key={li} className="absolute whitespace-nowrap" style={{ left: c.x, top: c.base + (c.label || c.source ? c.size * 1.35 : 0) + li * c.size * 1.3 - c.size * 1.05, fontSize: c.size, lineHeight: 1.1, color: "#404040" }}>{ln}</div>
                    ))}
                  </div>
                );
              })}
              <div className="absolute whitespace-nowrap" style={{ left: layout.margin, top: layout.footBase - 8 * 1.05, fontSize: 8, lineHeight: 1.1, color: "#737373" }}>{s.footer}</div>
              <div className="absolute whitespace-nowrap text-right" style={{ right: layout.margin, top: layout.footBase - 8 * 1.05, fontSize: 8, lineHeight: 1.1, color: "#737373" }}>Page {pi + 1} of {total}</div>
            </div>
          </div>
          <figcaption className="mt-1 text-center text-[10px] font-semibold text-stone-500">Page {pi + 1} of {total}</figcaption>
        </figure>
      ))}
    </div>
  );
}
