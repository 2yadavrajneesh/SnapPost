"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSiteTheme } from "@/lib/useSiteTheme";

const NAV = [
  { href: "/", label: "Screenshot", hint: "Posts to PNG, PDF & MP4" },
  { href: "/unroll", label: "Thread Unroller", hint: "Read or save a whole thread" },
] as const;

/** Top bar shared by every tool: brand, tool buttons, theme switch and (optional) page-specific actions. */
export default function SiteHeader({ tagline, actions }: { tagline: string; actions?: ReactNode }) {
  const path = usePathname();
  const [theme, setTheme] = useSiteTheme();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <header className="sticky top-0 z-20 border-b border-stone-300 bg-[#faf6f1]/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SnapPost home">
          <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" fill="#1b2420" />
            <path d="M14 26V14h12M38 14h12v12M50 38v12H38M26 50H14V38" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
            <rect x="25" y="25" width="14" height="14" fill="#ea580c" />
          </svg>
          <div>
            <div className="text-base font-bold leading-none">SnapPost</div>
            <div className="mt-1 hidden text-[11px] text-stone-500 sm:block">{tagline}</div>
          </div>
          <span className="ml-1 bg-stone-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600">Beta</span>
        </Link>

        <nav aria-label="Tools" className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              title={n.hint}
              aria-current={active(n.href) ? "page" : undefined}
              className={`whitespace-nowrap px-3 py-1.5 text-xs font-semibold transition ${
                active(n.href) ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            title={theme === "light" ? "Dark theme" : "Light theme"}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-800 transition hover:bg-stone-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {theme === "light" ? (
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              ) : (
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </>
              )}
            </svg>
          </button>
          {actions}
        </div>
      </div>
    </header>
  );
}
