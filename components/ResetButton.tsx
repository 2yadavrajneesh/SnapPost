"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toolFor } from "@/lib/tools";
import { hasWork } from "@/lib/session";
import ResetPageDialog from "@/components/ResetPageDialog";

/** Page-reset control that sits inside a tool. It stays off until there is something to reset, and always asks first. */
export default function ResetButton({ className = "" }: { className?: string }) {
  const tool = toolFor(usePathname());
  const [open, setOpen] = useState(false);
  const [has, setHas] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => void hasWork(tool.id).then((v) => live && setHas(v));
    check();
    const t = setTimeout(check, 1500); // after the saved session has been restored
    window.addEventListener("snap:dirty", check);
    window.addEventListener("snap:saved", check);
    return () => { live = false; clearTimeout(t); window.removeEventListener("snap:dirty", check); window.removeEventListener("snap:saved", check); };
  }, [tool.id]);

  return (
    <>
      <Button
        variant="outline"
        disabled={!has}
        onClick={() => setOpen(true)}
        title={has ? `Clear everything ${tool.name} has saved and start fresh` : "Nothing to reset yet"}
        className={`text-xs font-semibold hover:border-red-300 hover:bg-red-50 hover:text-red-700 ${className}`}
      >
        <RotateCcw />
        Reset everything
      </Button>
      <ResetPageDialog open={open} onClose={() => setOpen(false)} app={tool.id} name={tool.name} />
    </>
  );
}
