"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Eraser, Redo2, RotateCcw, SlidersHorizontal, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { historyFor } from "@/lib/history";
import { toolFor } from "@/lib/tools";
import ResetPageDialog from "@/components/layout/ResetPageDialog";
import { useToast } from "@/components/linkdesk/ui";

function Hint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Undo, Redo and the three reset actions for the current app, shown in the header. */
export default function HistoryBar() {
  const tool = toolFor(usePathname());
  const [, tick] = useState(0);
  const [page, setPage] = useState(false);
  const toast = useToast();

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
      <DropdownMenu>
        <Hint label="Reset options">
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Reset options">
              <RotateCcw />
            </Button>
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem disabled={!can.changes} className="items-start gap-2.5" onSelect={() => { h.resetChanges(); toast("Changes reset. Undo brings them back."); }}>
            <Eraser className="mt-0.5" />
            <span><b className="block">Reset changes</b><span className="text-xs text-muted-foreground">Back to how your files, lists and links were first added.</span></span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!can.settings} className="items-start gap-2.5" onSelect={() => { h.resetSettings(); toast("Settings reset. Undo brings them back."); }}>
            <SlidersHorizontal className="mt-0.5" />
            <span><b className="block">Reset settings</b><span className="text-xs text-muted-foreground">Options back to default; your content stays.</span></span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" className="items-start gap-2.5" onSelect={() => setPage(true)}>
            <Trash2 className="mt-0.5" />
            <span><b className="block">Reset page</b><span className="text-xs text-muted-foreground">Everything back to the starting state.</span></span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetPageDialog open={page} onClose={() => setPage(false)} app={tool.id} name={tool.name} />
    </div>
  );
}
