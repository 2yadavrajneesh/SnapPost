"use client";

import type { NumPos } from "@/lib/paper";

const GRID: { value: NumPos; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top", label: "Top centre" },
  { value: "top-right", label: "Top right" },
  { value: "left", label: "Left side" },
  { value: "center", label: "Centre (faint, behind the text)" },
  { value: "right", label: "Right side" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom", label: "Bottom centre" },
  { value: "bottom-right", label: "Bottom right" },
];

/** A small page: tap where the page number should go. "None" hides it. */
export default function NumPosPicker({ value, onChange }: { value: NumPos; onChange: (v: NumPos) => void }) {
  return (
    <div className="flex items-stretch gap-3">
      <div role="radiogroup" aria-label="Page number position" className="grid h-28 w-20 flex-none grid-cols-3 grid-rows-3 gap-1 border border-stone-400 bg-white p-1">
        {GRID.map((g) => {
          const on = value === g.value;
          return (
            <button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={g.label}
              title={g.label}
              onClick={() => onChange(g.value)}
              className={`flex items-center justify-center border transition ${on ? "border-accent bg-accent" : "border-stone-200 bg-stone-50 hover:bg-stone-200"}`}
            >
              <span className={`block h-1.5 w-1.5 rounded-full ${on ? "bg-white" : "bg-stone-400"}`} />
            </button>
          );
        })}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <p className="text-[11px] leading-snug text-stone-500">
          {value === "none" ? "No page number." : `Position: ${GRID.find((g) => g.value === value)?.label ?? ""}.`} Tap a square on the page to move it.
        </p>
        <button
          type="button"
          aria-pressed={value === "none"}
          onClick={() => onChange("none")}
          className={`h-8 border px-3 text-xs font-semibold transition ${value === "none" ? "border-accent text-accent" : "border-stone-300 text-stone-700 hover:bg-stone-100"}`}
        >
          No page number
        </button>
      </div>
    </div>
  );
}
