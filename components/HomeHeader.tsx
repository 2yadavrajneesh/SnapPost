"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { SITE_NAME } from "@/lib/site";
import { useSiteTheme } from "@/lib/useSiteTheme";

/** Top bar of the home page: brand and the theme switch. */
export default function HomeHeader() {
  const [theme, setTheme] = useSiteTheme();
  return (
    <header className="site-bar sticky top-0 z-30 backdrop-blur" style={{ ["--tc" as string]: "#1b2420" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${SITE_NAME} home`}>
          <Logo size={38} className="text-stone-900" />
          <span className="text-base font-bold leading-none">{SITE_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
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
