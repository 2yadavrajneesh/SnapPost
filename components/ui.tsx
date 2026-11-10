"use client";

import { useState, type ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-stone-300 px-5 pb-5 pt-5">
      <h2 className="mb-3 text-sm font-bold text-stone-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Same look as Section, but the body folds away. Closed unless defaultOpen. */
export function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-stone-300">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-4 text-left">
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`text-stone-500 transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="space-y-3 px-5 pb-5">{children}</div>}
    </section>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-xs font-medium text-stone-600">{children}</div>;
}

type SegOption<T extends string> = { value: T; label: string; title?: string };

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  wrap = false,
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  wrap?: boolean;
}) {
  return (
    <div className={`flex gap-1 bg-stone-100 p-1 ${wrap ? "flex-wrap" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 whitespace-nowrap px-2.5 py-1.5 text-xs font-medium transition ${
            value === o.value ? "bg-white text-stone-900" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const THUMB = 22; // px, keep in sync with .snap-range in globals.css

/**
 * Labelled slider: a title, "low / value / high" captions and a track with a ring thumb.
 * With `ticks`, each step gets a dot on the track (used for Text size).
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  lowLabel,
  highLabel,
  ticks = false,
  emphasizeHigh = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  lowLabel: string;
  highLabel: string;
  ticks?: boolean;
  emphasizeHigh?: boolean;
  onChange: (v: number) => void;
}) {
  const frac = (value - min) / (max - min);
  const count = Math.round((max - min) / step);
  const at = (f: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${f})`;
  return (
    <div>
      <div className="mb-3 text-base font-semibold text-stone-900">{label}</div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs text-stone-500">{lowLabel}</span>
        <span className="min-w-[4.5rem] bg-stone-100 px-3 py-1 text-center text-sm font-semibold tabular-nums text-stone-800">
          {value}
          {suffix}
        </span>
        <span className={emphasizeHigh ? "text-base font-semibold text-stone-800" : "text-xs font-medium text-stone-600"}>{highLabel}</span>
      </div>
      <div className="relative h-7">
        {/* track + filled part */}
        <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-stone-300" aria-hidden="true" />
        <div className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-stone-900" style={{ left: at(0), width: `calc((100% - ${THUMB}px) * ${frac})` }} aria-hidden="true" />
        {ticks &&
          Array.from({ length: count + 1 }, (_, i) => {
            const f = i / count;
            const done = f <= frac + 1e-6;
            return (
              <span
                key={i}
                aria-hidden="true"
                className={`absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${done ? "border-stone-900 bg-stone-900" : "border-stone-400 bg-white"}`}
                style={{ left: at(f) }}
              />
            );
          })}
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="snap-range absolute inset-0 w-full"
        />
      </div>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  prefix,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  prefix?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="flex items-center border border-stone-200 bg-white focus-within:border-orange-600 focus-within:ring-2 focus-within:ring-orange-200">
        {prefix && <span className="pl-2.5 text-sm text-stone-400">{prefix}</span>}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent px-2.5 py-1.5 text-sm outline-none"
        />
      </div>
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-xs font-medium text-stone-600">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-orange-700"
      />
    </label>
  );
}

/** Checkbox row used for the "Post details" options. */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 border px-2.5 py-2 text-xs font-medium transition ${
        checked ? "border-stone-300 bg-white text-stone-800" : "border-stone-200 bg-stone-50 text-stone-400"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-stone-900" />
      {label}
    </label>
  );
}
