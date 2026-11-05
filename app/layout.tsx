import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf6f1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("snappost:siteTheme")==="dark")document.documentElement.dataset.theme="dark"}catch(e){}`,
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
