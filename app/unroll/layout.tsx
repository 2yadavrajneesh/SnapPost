import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "ThreadScroll",
  title: "ThreadScroll — Thread Unroller",
  description: "Paste a link to any post in an X (Twitter) thread and read the whole thread in one clean page. Copy it as text or Markdown, or download it.",
  openGraph: {
    title: "ThreadScroll — Thread Unroller",
    description: "Read a whole X (Twitter) thread in one clean page, then copy or download it as text or Markdown.",
    type: "website",
    siteName: "ThreadScroll",
  },
};

export default function UnrollLayout({ children }: { children: React.ReactNode }) {
  return children;
}
