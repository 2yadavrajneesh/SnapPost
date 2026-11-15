"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOOLS } from "@/lib/tools";
import { SITE_NAME } from "@/lib/site";
import { useSiteTheme } from "@/lib/useSiteTheme";

/** Top bar of the home page: brand, a jump link to the tools, and the theme switch. */
export default function HomeHeader() {
  const [theme, setTheme] = useSiteTheme();
  return (
    <header className="site-bar sticky top-0 z-30 backdrop-blur" style={{ ["--tc" as string]: "#1b2420" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE_NAME} home`}>
          <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" fill="#1b2420" />
            {TOOLS.map((t, i) => (
              <rect key={t.id} x={12 + (i % 2) * 22} y={11 + Math.floor(i / 2) * 15} width="18" height="12" fill={t.accent} />
            ))}
          </svg>
          <span className="text-base font-bold leading-none">{SITE_NAME}</span>
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
