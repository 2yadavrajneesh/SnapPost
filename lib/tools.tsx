import type { ReactNode } from "react";

export type ToolId = "snappost" | "threadscroll" | "archivevault" | "linkdesk";

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
  { id: "archivevault", name: "ArchiveVault", href: "/archive", tagline: "Save any web page to the Wayback Machine and more.", hint: "Archive a link so it never disappears", accent: "#4338ca" },
  { id: "linkdesk", name: "LinkDesk", href: "/links", tagline: "Open, make, extract and clean links in bulk.", hint: "Work with lists of links: batches, spreadsheets, cleaning", accent: "#1f5fd6" },
];

export const toolFor = (path: string): Tool => (path.startsWith("/unroll") ? TOOLS[1] : path.startsWith("/archive") ? TOOLS[2] : path.startsWith("/links") ? TOOLS[3] : TOOLS[0]);

/** The icon of each tool: a dark tile with a white glyph and one coloured accent. */
export function ToolIcon({ id, size = 36 }: { id: ToolId; size?: number }): ReactNode {
  return id === "snappost" ? (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" fill="#1b2420" />
      <path d="M14 26V14h12M38 14h12v12M50 38v12H38M26 50H14V38" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
      <rect x="25" y="25" width="14" height="14" fill="#ea580c" />
    </svg>
  ) : id === "linkdesk" ? (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" fill="#1b2420" />
      {[12, 26, 40].flatMap((y) => [12, 26, 40].map((x) => <rect key={`${x}${y}`} x={x} y={y} width="12" height="12" fill={y === 12 || (y === 26 && x === 12) ? "#60a5fa" : "#fff"} opacity={y === 12 || (y === 26 && x === 12) ? 1 : 0.9} />))}
    </svg>
  ) : id === "archivevault" ? (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" fill="#1b2420" />
      <path d="M12 14h40v10H12zM16 24v26h32V24" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
      <rect x="26" y="32" width="12" height="8" fill="#818cf8" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" fill="#1b2420" />
      <path d="M17 16v32" stroke="#fff" strokeWidth="4" strokeLinecap="square" />
      <rect x="12" y="12" width="10" height="10" fill="#14b8a6" />
      <rect x="12" y="27" width="10" height="10" fill="#fff" />
      <rect x="12" y="42" width="10" height="10" fill="#fff" />
      <path d="M30 17h22M30 32h22M30 47h14" stroke="#fff" strokeWidth="5" strokeLinecap="square" />
    </svg>
  );
}
