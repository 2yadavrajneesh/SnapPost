"use client";

export type PageMode = "single" | "facing" | "poster" | "one" | "two" | "auto";

const ic = { width: 30, height: 30, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const, "aria-hidden": true };

const MODES: { id: PageMode; label: string; note: string; icon: React.ReactNode }[] = [
  {
    id: "single",
    label: "Single page",
    note: "Posts flow onto normal pages, one page at a time.",
    icon: (
      <svg {...ic}>
        <rect x="9" y="4" width="14" height="24" rx="1" />
        <path d="M12 10h8M12 14h8M12 18h5" />
      </svg>
    ),
  },
  {
    id: "facing",
    label: "Facing pages",
    note: "Two pages side by side like a book. Page numbers sit on the outer edge.",
    icon: (
      <svg {...ic}>
        <rect x="3" y="6" width="12.5" height="20" rx="1" />
        <rect x="16.5" y="6" width="12.5" height="20" rx="1" />
        <path d="M6 12h6M6 16h6M20 12h6M20 16h6" />
      </svg>
    ),
  },
  {
    id: "poster",
    label: "Poster page",
    note: "The whole thread on one long page, with no page breaks.",
    icon: (
      <svg {...ic}>
        <rect x="10" y="2" width="12" height="28" rx="1" />
        <path d="M13 7h6M13 11h6M13 15h6M13 19h6M13 23h4" />
      </svg>
    ),
  },
  {
    id: "one",
    label: "One image per page",
    note: "Only the pictures and video covers, one on each page.",
    icon: (
      <svg {...ic}>
        <rect x="8" y="3" width="16" height="26" rx="1" />
        <rect x="11" y="9" width="10" height="14" rx="0.5" />
        <path d="M11 20l3-3 3 3 2-2 2 2" />
      </svg>
    ),
  },
  {
    id: "two",
    label: "Two images per page",
    note: "Two pictures share each page: stacked, or side by side on a landscape page.",
    icon: (
      <svg {...ic}>
        <rect x="8" y="3" width="16" height="26" rx="1" />
        <rect x="11" y="6.5" width="10" height="8" rx="0.5" />
        <rect x="11" y="17.5" width="10" height="8" rx="0.5" />
      </svg>
    ),
  },
  {
    id: "auto",
    label: "Auto-fit images",
    note: "Pictures flow down the page and shrink to fit the space left.",
    icon: (
      <svg {...ic}>
        <rect x="8" y="3" width="16" height="26" rx="1" />
        <rect x="11" y="6" width="10" height="9" rx="0.5" />
        <rect x="11" y="17.5" width="10" height="4" rx="0.5" />
        <path d="M11 25h10" />
      </svg>
    ),
  },
];

/** Picks how pages are made up. Each mode has a small picture of the page it gives. */
export default function PageModePicker({ value, onChange }: { value: PageMode; onChange: (m: PageMode) => void }) {
  return (
    <div>
      <div role="radiogroup" aria-label="Page mode" className="grid grid-cols-3 gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={value === m.id}
            title={m.note}
            onClick={() => onChange(m.id)}
            className={`flex flex-col items-center gap-1 border px-1 py-2 text-center text-[11px] font-semibold leading-tight transition ${value === m.id ? "border-[#1b2420] bg-[#1b2420] text-white" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"}`}
          >
            {m.icon}
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-stone-500">{MODES.find((m) => m.id === value)?.note}</p>
    </div>
  );
}
