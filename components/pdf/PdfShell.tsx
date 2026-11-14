"use client";

import type { ReactNode } from "react";
import ResetButton from "@/components/ResetButton";
import { ToastProvider } from "@/components/linkdesk/ui";
import ScrollTop from "@/components/ScrollTop";
import SiteHeader from "@/components/SiteHeader";

export default function PdfShell({ children, accent = "#6d28d9", variant = "clip" }: { children: ReactNode; accent?: string; variant?: "clip" | "edit" }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ ["--accent" as string]: accent }}>
      <SiteHeader />
      <div className={`pdf-stage pdf-stage--${variant} relative flex min-h-0 flex-1`}>
        <div className="relative z-[1] min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-8">
          <div className="mx-auto w-full max-w-[1100px]">
            <ToastProvider>{children}</ToastProvider>
            <div className="mt-8 flex justify-end"><ResetButton /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
