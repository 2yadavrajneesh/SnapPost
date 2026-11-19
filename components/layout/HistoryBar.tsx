"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { historyFor } from "@/lib/history";
import { toolFor } from "@/lib/tools";

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Undo and Redo for the current app, with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y). */
export default function HistoryBar() {
  const tool = toolFor(usePathname());
  const [, tick] = useState(0);

  useEffect(() => {
    const on = () => tick((n) => n + 1);
    window.addEventListener("snap:history", on);
    return () => window.removeEventListener("snap:history", on);
  }, [tool.id]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return; // keep the field's own undo
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const h = historyFor(tool.id);
      if (!h) return;
      if (k === "z" && !e.shiftKey && h.can().undo) { e.preventDefault(); h.undo(); }
      else if ((k === "y" || (k === "z" && e.shiftKey)) && h.can().redo) { e.preventDefault(); h.redo(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [tool.id]);

  const h = historyFor(tool.id);
  if (!h) return null;
  const can = h.can();

  return (
    <div className="flex items-center gap-1">
      <Hint label="Undo (Ctrl+Z)">
        <Button variant="outline" size="icon" disabled={!can.undo} onClick={() => h.undo()} aria-label="Undo">
          <Undo2 />
        </Button>
      </Hint>
      <Hint label="Redo (Ctrl+Shift+Z)">
        <Button variant="outline" size="icon" disabled={!can.redo} onClick={() => h.redo()} aria-label="Redo">
          <Redo2 />
        </Button>
      </Hint>
    </div>
  );
}
