"use client";

import type { RatioKey } from "@/lib/types";

type Tile = { key: Exclude<RatioKey, "auto">; label: string; w: number; h: number };

const TILES: Tile[] = [
  { key: "compact", label: "Compact", w: 15, h: 10 },
  { key: "standard", label: "Standard", w: 14, h: 10.5 },
  { key: "wide", label: "Wide", w: 17, h: 9.5 },
  { key: "story", label: "9:16", w: 9, h: 16 },
  { key: "square", label: "1:1", w: 12, h: 12 },
  { key: "portrait", label: "4:5", w: 11, h: 13.75 },
];

/** Output ratio picker: six tiles with a small outline of each shape. Clicking the active tile goes back to Auto. */
export default function RatioTiles({ value, onChange }: { value: RatioKey; onChange: (v: RatioKey) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TILES.map((t) => {
        const on = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? "auto" : t.key)}
            className={`flex min-h-[64px] flex-col items-center justify-center gap-1.5 border px-2 py-2.5 text-xs font-semibold transition ${
              on ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-200 bg-[#f7f3ee] text-stone-600 hover:bg-stone-100"
            }`}
          >
            <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true">
              <rect x={(20 - t.w) / 2} y={(18 - t.h) / 2} width={t.w} height={t.h} rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
