import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "CollageMaker",
  title: "CollageMaker — Tweet Collage Maker",
  description: "Paste several tweet links and turn them into one clean, perfectly aligned collage. Download it as a PNG or PDF.",
  openGraph: {
    title: "CollageMaker — Tweet Collage Maker",
    description: "Turn several tweets into one neat grid collage.",
    type: "website",
    siteName: "CollageMaker",
  },
};

export default function CollageLayout({ children }: { children: React.ReactNode }) {
  return children;
}
