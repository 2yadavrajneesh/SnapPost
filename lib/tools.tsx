import type { ReactNode } from "react";

export type ToolId = "snappost" | "threadscroll" | "linkdesk" | "collage" | "clipbook" | "editpdf";

export type Tool = {
  id: ToolId;
  name: string;
  href: string;
  tagline: string;
  hint: string;
  /** Primary button colour on the tool's own page. */
  accent: string;
};

export const TOOLS: Tool[] = [
  { id: "snappost", name: "SnapPost", href: "/", tagline: "Screenshot, upgraded. Posts to PNG, PDF & MP4.", hint: "Turn a post into a polished image, PDF or video", accent: "#c2410c" },
  { id: "threadscroll", name: "ThreadScroll", href: "/unroll", tagline: "Unroll any thread into pages, text & PDF.", hint: "Unroll a whole thread to read, print or save", accent: "#0f766e" },
  { id: "linkdesk", name: "LinkDesk", href: "/links", tagline: "Open, make, extract, clean and archive links.", hint: "Work with links: batches, spreadsheets, cleaning, archiving", accent: "#1f5fd6" },
  { id: "collage", name: "CollageMaker", href: "/collage", tagline: "Turn several tweets into one neat collage.", hint: "Upload tweet links and make a grid collage", accent: "#be185d" },
  { id: "clipbook", name: "ClipBook", href: "/clipbook", tagline: "A day of news screenshots, one tidy PDF.", hint: "Compile news screenshots into a daily-update PDF", accent: "#b91c1c" },
  { id: "editpdf", name: "EditPDF", href: "/editpdf", tagline: "Type, highlight, draw and sign on a PDF.", hint: "Edit a PDF right on the page", accent: "#047857" },
];

const ROUTES: [string, ToolId][] = [["/unroll", "threadscroll"], ["/links", "linkdesk"], ["/collage", "collage"], ["/clipbook", "clipbook"], ["/editpdf", "editpdf"]];
export const toolFor = (path: string): Tool => TOOLS.find((t) => t.id === (ROUTES.find(([r]) => path.startsWith(r))?.[1] ?? "snappost")) ?? TOOLS[0];

/** The icon of each tool: a tile in the tool's own colour with a white glyph. */
export function ToolIcon({ id, size = 36 }: { id: ToolId; size?: number }): ReactNode {
  const bg = TOOLS.find((t) => t.id === id)?.accent ?? "#1b2420";
  const frame = { width: size, height: size, viewBox: "0 0 64 64", "aria-hidden": true } as const;
  return (
    <svg {...frame}>
      <rect width="64" height="64" fill={bg} />
      {id === "snappost" ? (
        <>
          <path d="M14 26V14h12M38 14h12v12M50 38v12H38M26 50H14V38" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
          <rect x="25" y="25" width="14" height="14" fill="#fde68a" />
        </>
      ) : id === "threadscroll" ? (
        <>
          <path d="M17 16v32" stroke="#fff" strokeWidth="4" strokeLinecap="square" />
          <rect x="12" y="12" width="10" height="10" fill="#99f6e4" />
          <rect x="12" y="27" width="10" height="10" fill="#fff" />
          <rect x="12" y="42" width="10" height="10" fill="#fff" />
          <path d="M30 17h22M30 32h22M30 47h14" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
        </>
      ) : id === "linkdesk" ? (
        <g fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M27 37a9 9 0 0 0 12.7 0l7-7a9 9 0 0 0-12.7-12.7l-3 3" />
          <path d="M37 27a9 9 0 0 0-12.7 0l-7 7a9 9 0 0 0 12.7 12.7l3-3" />
        </g>
      ) : id === "collage" ? (
        <>
          <rect x="10" y="10" width="21" height="28" fill="#fbcfe8" />
          <rect x="35" y="10" width="19" height="14" fill="#fff" />
          <rect x="35" y="28" width="19" height="26" fill="#fff" />
          <rect x="10" y="42" width="21" height="12" fill="#fff" />
        </>
      ) : id === "editpdf" ? (
        <>
          <path d="M12 8h22l10 10v38H12z" fill="#fff" />
          <path d="M34 8v10h10z" fill="#a7f3d0" />
          <path d="M18 32h16M18 39h10" stroke={bg} strokeWidth="3.5" />
          <path d="M43 26l9 9-15 15-10 2 2-10z" fill="#fbbf24" stroke={bg} strokeWidth="2.5" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M10 14h34v36H14a4 4 0 0 1-4-4z" fill="#fff" />
          <path d="M44 22h10v24a4 4 0 0 1-4 4h-6" fill="none" stroke="#fff" strokeWidth="4" />
          <rect x="16" y="20" width="22" height="12" fill="#fecaca" />
          <path d="M16 39h22M16 44h14" stroke={bg} strokeWidth="3.5" />
        </>
      )}
    </svg>
  );
}
