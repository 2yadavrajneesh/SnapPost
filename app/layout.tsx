import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/linkdesk/ui";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import SessionGuard from "@/components/SessionGuard";
import DragOverlay from "@/components/DragOverlay";
import SaveNotice from "@/components/SaveNotice";

export const metadata: Metadata = {
  title: "SnapPost — Tools for posts, links and PDFs",
  description: "Six free tools that run in your browser: turn posts into images, unroll threads, work with links, make collages, compile news PDFs and edit PDFs.",
  applicationName: "SnapPost",
  other: { "color-scheme": "only light", "supported-color-schemes": "light", "darkreader-lock": "" },
  openGraph: { title: "SnapPost — Tools for posts, links and PDFs", description: "Six free tools that run in your browser. Nothing is uploaded.", type: "website", siteName: "SnapPost" },
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
        <SessionGuard />
        <DragOverlay />
        <SaveNotice />
        <TooltipProvider delayDuration={200}><ToastProvider>{children}</ToastProvider><Toaster position="bottom-center" /></TooltipProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
