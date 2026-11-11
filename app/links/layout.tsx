import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "LinkDesk",
  title: "LinkDesk — Bulk Link Tools",
  description: "Open spreadsheet links in batches, make links clickable in Excel, pull links out of documents and clean messy URLs. Everything runs in your browser.",
  openGraph: {
    title: "LinkDesk — Bulk Link Tools",
    description: "Open, make, extract and clean links in bulk. Files stay in your browser.",
    type: "website",
    siteName: "LinkDesk",
  },
};

export default function LinksLayout({ children }: { children: React.ReactNode }) {
  return children;
}
