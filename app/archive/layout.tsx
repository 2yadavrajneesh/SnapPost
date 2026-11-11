import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "ArchiveVault",
  title: "ArchiveVault — Web Page Archiver",
  description: "Save any web page to the Internet Archive's Wayback Machine, check for existing snapshots and open other archives with your link filled in. No account or key needed.",
  openGraph: {
    title: "ArchiveVault — Web Page Archiver",
    description: "Save a web page to the Wayback Machine and other archives so it never disappears.",
    type: "website",
    siteName: "ArchiveVault",
  },
};

export default function ArchiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
