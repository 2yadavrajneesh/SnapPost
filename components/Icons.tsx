import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  copy: <><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 10v6M14 10v6" />,
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  download: <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  reset: <path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4" />,
  clipboard: <><rect x="6" y="5" width="12" height="16" rx="1.5" /><path d="M9 5V3h6v2" /></>,
  sheet: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M4 9h16M4 15h16M10 3v18" /></>,
  eraser: <path d="m8 20-4-4 11-11 5 5-8 8H8zM13 9l5 5" />,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
};

export type IconName = keyof typeof P;

export function Ico({ n, className = "h-4 w-4" }: { n: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[n]}
    </svg>
  );
}
