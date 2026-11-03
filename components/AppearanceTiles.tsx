"use client";

import type { ReactNode } from "react";
import type { Settings } from "@/lib/types";
import { BIRD, XLOGO } from "./TweetCard";

type Props = {
  settings: Settings;
  onChange: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

function next<T>(list: T[], value: T): T {
  return list[(list.indexOf(value) + 1) % list.length];
}

const svgProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const CORNER_PATH: Record<Settings["corners"], string> = {
  sharp: "M4 20V4h16",
  soft: "M4 20V12a8 8 0 0 1 8-8h8",
  round: "M4 20v-2A14 14 0 0 1 18 4h2",
};

function Tile({
  icon,
  label,
  active,
  name,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  name: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${name}: ${label}. Click to change.`}
      title={`${name}: ${label} (click to change)`}
      className={`flex min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-3 text-[11px] font-medium transition ${
        active
          ? "border-[#1b2420] bg-[#1b2420] text-white"
          : "border-stone-200 bg-[#f4efe8] text-stone-600 hover:bg-[#ece6dc]"
      }`}
    >
      <span className="flex h-[22px] items-center">{icon}</span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

/**
 * The compact, collapsed form of the Appearance settings: one tile each for theme, corners,
 * logo and font. Clicking a tile cycles to the next option; a dark tile means "customised".
 */
export default function AppearanceTiles({ settings, onChange }: Props) {
  const { theme, corners, logo, font } = settings;

  return (
    <div className="grid grid-cols-4 gap-2">
      <Tile
        name="Theme"
        label={theme === "light" ? "Light" : "Dark"}
        active={theme === "dark"}
        onClick={() => onChange("theme", theme === "light" ? "dark" : "light")}
        icon={
          theme === "light" ? (
            <svg {...svgProps}>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg {...svgProps}>
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          )
        }
      />
      <Tile
        name="Corners"
        label={corners === "sharp" ? "Sharp" : corners === "soft" ? "Soft" : "Round"}
        active={corners !== "soft"}
        onClick={() => onChange("corners", next(["soft", "round", "sharp"] as const, corners))}
        icon={
          <svg {...svgProps}>
            <path d={CORNER_PATH[corners]} />
          </svg>
        }
      />
      <Tile
        name="Logo"
        label={logo === "x" ? "X logo" : logo === "bird" ? "Bird" : "No logo"}
        active={logo !== "none"}
        onClick={() => onChange("logo", next(["x", "bird", "none"] as const, logo))}
        icon={
          logo === "none" ? (
            <svg {...svgProps}>
              <circle cx="12" cy="12" r="8" />
              <path d="M6.3 6.3l11.4 11.4" />
            </svg>
          ) : (
            <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={logo === "bird" ? BIRD : XLOGO} />
            </svg>
          )
        }
      />
      <Tile
        name="Font"
        label={font === "sans" ? "Sans" : font === "rounded" ? "Rounded" : "Serif"}
        active={font !== "sans"}
        onClick={() => onChange("font", next(["sans", "rounded", "serif"] as const, font))}
        icon={
          <span
            className="text-[19px] font-bold leading-none"
            style={{
              fontFamily:
                font === "serif"
                  ? "Georgia, 'Times New Roman', serif"
                  : font === "rounded"
                    ? "ui-rounded, 'SF Pro Rounded', 'Nunito', system-ui, sans-serif"
                    : "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            }}
          >
            Aa
          </span>
        }
      />
    </div>
  );
}
