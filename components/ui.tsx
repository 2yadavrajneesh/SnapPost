"use client";

import type { ReactNode } from "react";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white/70 p-4 shadow-sm">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">{title}</h2>
      <div className="space-y-3">{children}</div>
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
    <div className={`flex gap-1 rounded-xl bg-stone-100 p-1 ${wrap ? "flex-wrap" : ""}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
            value === o.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-stone-600">{label}</span>
        <span className="tabular-nums text-stone-500">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-orange-700"
      />
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
      <div className="flex items-center rounded-lg border border-stone-200 bg-white focus-within:border-orange-600 focus-within:ring-2 focus-within:ring-orange-200">
        {prefix && <span className="pl-2.5 text-sm text-stone-400">{prefix}</span>}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 rounded-lg bg-transparent px-2.5 py-1.5 text-sm outline-none"
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
