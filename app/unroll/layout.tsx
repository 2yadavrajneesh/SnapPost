import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thread Unroller — SnapPost",
  description: "Paste a link to any post in an X (Twitter) thread and read the whole thread in one clean page. Copy it as text or Markdown, or download it.",
  openGraph: {
    title: "Thread Unroller — SnapPost",
    description: "Read a whole X (Twitter) thread in one clean page, then copy or download it as text or Markdown.",
    type: "website",
    siteName: "SnapPost",
  },
};

export default function UnrollLayout({ children }: { children: React.ReactNode }) {
  return children;
}
