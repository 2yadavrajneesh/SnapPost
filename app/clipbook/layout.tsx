import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "ClipBook",
  title: "ClipBook — News Screenshots to PDF",
  description: "Drop in a day of news screenshots and get one tidy PDF with captions, sources and page numbers. English and Hindi.",
  openGraph: { title: "ClipBook — News Screenshots to PDF", description: "A day of news screenshots, one tidy PDF.", type: "website", siteName: "ClipBook" },
};

export default function ClipBookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
