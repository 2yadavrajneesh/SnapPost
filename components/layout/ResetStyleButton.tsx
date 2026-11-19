"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Paintbrush } from "lucide-react";
import { toolFor } from "@/lib/tools";
import { historyFor } from "@/lib/history";
import { useToast } from "@/components/linkdesk/ui";

/** Puts the look and options back to their defaults and keeps the content. Its brush icon tells it apart from "Reset everything". */
export default function ResetStyleButton({ className = "", onReset, disabled }: { className?: string; onReset?: () => void; disabled?: boolean }) {
  const tool = toolFor(usePathname());
  const toast = useToast();
  // by default it is on only while some option differs from its default
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    const check = () => setChanged(!!historyFor(tool.id)?.can().settings);
    check();
    window.addEventListener("snap:history", check);
    return () => window.removeEventListener("snap:history", check);
  }, [tool.id]);
  const off = disabled ?? !changed;
  return (
    <button
      type="button"
      disabled={off}
      title={off ? "Nothing to reset yet" : "Put the style and options back to their defaults. Your content stays."}
      onClick={() => {
        if (onReset) onReset();
        else historyFor(tool.id)?.resetSettings();
        toast("Style reset. Your content stays.");
      }}
      className={`inline-flex h-9 items-center justify-center gap-2 border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white ${className}`}
    >
      <Paintbrush size={15} aria-hidden="true" />
      Reset style
    </button>
  );
}
