import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SnapPost — Turn posts into polished images",
  description: "Turn X (Twitter) posts into polished, high-resolution images. Customize the layout, preserve photos and video previews, and export as PNG, PDF, or video.",
  keywords: ["tweet to image", "X post screenshot", "tweet screenshot", "twitter screenshot", "post to PNG", "tweet to PDF"],
  applicationName: "SnapPost",
  openGraph: {
    title: "SnapPost — Turn posts into polished images",
    description: "Paste an X (Twitter) link and export a polished PNG, PDF or video of the post.",
    type: "website",
    siteName: "SnapPost",
  },
  twitter: {
    card: "summary",
    title: "SnapPost — Turn posts into polished images",
    description: "Paste an X (Twitter) link and export a polished PNG, PDF or video of the post.",
  },
};

export default function SnapPostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
