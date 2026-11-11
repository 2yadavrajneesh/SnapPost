import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "LinkDesk",
  title: "LinkDesk — Bulk Link Tools",
  description: "Open spreadsheet links in batches, make links clickable in Excel, pull links out of documents and clean messy URLs and save pages to the Wayback Machine. Everything runs in your browser.",
  openGraph: {
    title: "LinkDesk — Bulk Link Tools",
    description: "Open, make, extract, clean and archive links. Files stay in your browser.",
    type: "website",
    siteName: "LinkDesk",
  },
};

export default function LinksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
