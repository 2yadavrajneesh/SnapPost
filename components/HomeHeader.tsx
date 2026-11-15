"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSiteTheme } from "@/lib/useSiteTheme";

/** Top bar of the home page: brand, a jump link to the tools, and the theme switch. */
export default function HomeHeader() {
  const [theme, setTheme] = useSiteTheme();
  return (
    <header className="site-bar sticky top-0 z-30 backdrop-blur" style={{ ["--tc" as string]: "#1b2420" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="SnapPost home">
          <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" fill="#1b2420" />
            <path d="M14 26V14h12M38 14h12v12M50 38v12H38M26 50H14V38" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
            <rect x="25" y="25" width="14" height="14" fill="#fde68a" />
          </svg>
          <span className="text-base font-bold leading-none">SnapPost</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="hidden text-xs font-semibold sm:inline-flex">
            <a href="#tools">Browse tools</a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full"
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon /> : <Sun />}
          </Button>
        </div>
      </div>
    </header>
  );
}
