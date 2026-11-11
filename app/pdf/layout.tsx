import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "PaperNest",
  title: "PaperNest — PDF Tools",
  description: "Merge, split, rotate and convert PDFs online. Files are processed on the server and deleted right after.",
  openGraph: { title: "PaperNest — PDF Tools", description: "Free PDF tools with a download link.", type: "website", siteName: "PaperNest" },
};

export default function PdfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
