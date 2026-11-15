"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider as UiSlider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  const me = useRef<HTMLElement>(null);
  // accordion: opening one section folds the others in the same side panel
  useEffect(() => {
    const onOpen = (e: Event) => {
      const other = (e as CustomEvent<HTMLElement>).detail;
      const mine = me.current;
      if (mine && other !== mine && other.parentElement === mine.parentElement) setOpen(false);
    };
    window.addEventListener("snap:section-open", onOpen);
    return () => window.removeEventListener("snap:section-open", onOpen);
  }, []);
  const change = (next: boolean) => {
    if (next && me.current) window.dispatchEvent(new CustomEvent("snap:section-open", { detail: me.current }));
    setOpen(next);
  };
  return (
    <Collapsible open={open} onOpenChange={change} asChild>
      <section ref={me} className="border-b border-stone-300">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-4 text-left">
          <h2 className="text-sm font-bold text-stone-900">{title}</h2>
          <ChevronDown aria-hidden="true" className={`size-3.5 text-stone-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-3 px-5 pb-5">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
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
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={`flex w-full gap-1 bg-stone-100 p-1 ${wrap ? "flex-wrap" : ""}`}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          title={o.title}
          className="h-auto flex-1 whitespace-nowrap rounded-none px-2.5 py-1.5 text-xs font-medium text-stone-500 hover:bg-transparent hover:text-stone-800 data-[state=on]:bg-white data-[state=on]:text-stone-900"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
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
        {ticks &&
          Array.from({ length: count + 1 }, (_, i) => {
            const f = i / count;
            const done = f <= frac + 1e-6;
            return (
              <span
                key={i}
                aria-hidden="true"
                className={`pointer-events-none absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${done ? "border-stone-900 bg-stone-900" : "border-stone-400 bg-white"}`}
                style={{ left: at(f) }}
              />
            );
          })}
        <UiSlider aria-label={label} min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} className="absolute inset-0 h-full" />
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
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-stone-400">{prefix}</span>}
        <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-none text-sm" />
      </div>
    </label>
  );
}

/** A bordered row with the label on the left and a switch on the right: the site's one on/off control. */
export function SwitchRow({ label, checked, onChange, className = "" }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-3 border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:bg-stone-50 ${className}`}>
      <span className="min-w-0">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={typeof label === "string" ? label : undefined} />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <SwitchRow label={label} checked={checked} onChange={onChange} />;
}

/** Row used for the "Post details" options. */
export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <SwitchRow label={label} checked={checked} onChange={onChange} />;
}
