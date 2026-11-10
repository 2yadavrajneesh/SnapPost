"use client";

import { useEffect, useState } from "react";

export const SITE_THEME_KEY = "snappost:siteTheme";
export type SiteTheme = "light" | "dark";

/** Light/dark theme of the website itself (shared by every page, remembered in localStorage). */
export function useSiteTheme() {
  const [theme, setTheme] = useState<SiteTheme>("light");
  useEffect(() => {
    try {
      if (localStorage.getItem(SITE_THEME_KEY) === "dark") setTheme("dark");
    } catch {
      /* ignore */
    }
  }, []);
  const change = (th: SiteTheme) => {
    setTheme(th);
    document.documentElement.dataset.theme = th;
    try {
      localStorage.setItem(SITE_THEME_KEY, th);
    } catch {
      /* ignore */
    }
  };
  return [theme, change] as const;
}
