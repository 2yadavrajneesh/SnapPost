"use client";

import { usePathname } from "next/navigation";
import { Paintbrush } from "lucide-react";
import { toolFor } from "@/lib/tools";
import { historyFor } from "@/lib/history";
import { useToast } from "@/components/linkdesk/ui";

/** Puts the look and options back to their defaults and keeps the content. Its brush icon tells it apart from "Reset everything". */
export default function ResetStyleButton({ className = "", onReset }: { className?: string; onReset?: () => void }) {
  const tool = toolFor(usePathname());
  const toast = useToast();
  return (
    <button
      type="button"
      title="Put the style and options back to their defaults. Your content stays."
      onClick={() => {
        if (onReset) onReset();
        else historyFor(tool.id)?.resetSettings();
        toast("Style reset. Your content stays.");
      }}
      className={`inline-flex h-9 items-center justify-center gap-2 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 ${className}`}
    >
      <Paintbrush size={15} aria-hidden="true" />
      Reset style
    </button>
  );
}
