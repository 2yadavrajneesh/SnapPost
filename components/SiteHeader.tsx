"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TOOLS, ToolIcon, toolFor } from "@/lib/tools";
import { useSiteTheme } from "@/lib/useSiteTheme";

/**
 * Top bar shared by every tool. On wide screens the five tools sit in the bar; on tablets and phones they
 * fold into a menu button, so the bar stays one tidy row (brand, page actions, theme switch, menu).
 */
export default function SiteHeader({ actions }: { actions?: ReactNode }) {
  const path = usePathname();
  const [theme, setTheme] = useSiteTheme();
  const tool = toolFor(path);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  // the menu closes after choosing a tool, on Escape, on a tap outside, and when the screen grows wide
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuBtn.current?.focus();
      }
    };
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const wide = window.matchMedia("(min-width: 1280px)");
    const grow = () => wide.matches && setOpen(false);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    wide.addEventListener("change", grow);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
      wide.removeEventListener("change", grow);
    };
  }, [open]);

  return (
    <header ref={root} className="sticky top-0 z-30 border-b border-stone-300 bg-[#faf6f1]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <Link href={tool.href} className="flex min-w-0 items-center gap-2.5" aria-label={`${tool.name} home`}>
          <ToolIcon id={tool.id} />
          <div className="min-w-0">
            <div className="truncate text-base font-bold leading-none">{tool.name}</div>
            <div className="mt-1 hidden truncate text-[11px] text-stone-500 2xl:block">{tool.tagline}</div>
          </div>
          <span className="ml-1 hidden bg-stone-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-600 sm:inline">Beta</span>
        </Link>

        {/* wide screens: the tools in the bar */}
        <nav aria-label="Tools" className="hidden items-center gap-1 xl:flex">
          {TOOLS.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              title={n.hint}
              aria-current={n.id === tool.id ? "page" : undefined}
              className={`flex items-center gap-2 whitespace-nowrap py-1 pl-1 pr-3 text-xs font-semibold transition ${
                n.id === tool.id ? "bg-stone-900 text-white" : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100"
              }`}
            >
              <ToolIcon id={n.id} size={24} />
              {n.name}
            </Link>
          ))}
        </nav>

        <div className="flex flex-none items-center gap-2">
          {actions}
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
          {/* tablets and phones: one button that opens the tool list */}
          <button
            ref={menuBtn}
            type="button"
            aria-label={open ? "Close tools menu" : "Open tools menu"}
            aria-expanded={open}
            aria-controls="tools-menu"
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 items-center gap-2 border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 xl:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
            <span className="hidden sm:inline">Tools</span>
          </button>
        </div>
      </div>

      {open && (
        <div id="tools-menu" className="border-t border-stone-300 bg-[#faf6f1] shadow-lg xl:hidden">
          <nav aria-label="Tools" className="mx-auto grid max-w-[1440px] gap-1.5 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
            {TOOLS.map((n) => {
              const here = n.id === tool.id;
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  aria-current={here ? "page" : undefined}
                  className={`flex items-center gap-3 border p-2.5 transition ${here ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}`}
                >
                  <ToolIcon id={n.id} size={36} />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight">{n.name}</span>
                    <span className={`block truncate text-[11px] ${here ? "text-stone-300" : "text-stone-500"}`}>{n.hint}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
