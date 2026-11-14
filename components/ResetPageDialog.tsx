"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { clearApp } from "@/lib/session";
import type { ToolId } from "@/lib/tools";

/** Warning shown before the whole page is put back to its starting state. */
export default function ResetPageDialog({ open, onClose, app, name }: { open: boolean; onClose: () => void; app: ToolId; name: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent className="max-h-[92vh] overflow-y-auto border-t-4 border-t-amber-500 sm:max-w-sm">
        <AlertDialogHeader className="text-left">
          <div className="flex items-start gap-3">
            <span className="flex size-10 flex-none items-center justify-center bg-amber-100 text-amber-700">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <AlertDialogTitle className="text-sm font-bold">Reset the whole {name} page?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-relaxed">
                Everything on this page goes back to how it looked when you first opened it: your files, links, pictures, settings and undo history are deleted from this browser. This cannot be undone.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row justify-end gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void clearApp(app).then(() => window.location.reload());
            }}
          >
            {busy ? "Resetting…" : "Yes, reset the page"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
