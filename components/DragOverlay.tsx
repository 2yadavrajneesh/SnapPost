"use client";

import { useEffect, useState } from "react";

/** Dims the page and outlines it while files are dragged over the window, so people see where to drop. */
export default function DragOverlay() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setOver(true); } };
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setOver(false); } };
    const end = () => { depth = 0; setOver(false); };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", end);
    window.addEventListener("dragend", end);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", end);
      window.removeEventListener("dragend", end);
    };
  }, []);
  if (!over) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-2 z-[90] flex items-end justify-center border-2 border-dashed border-sky-500 bg-sky-500/10">
      <span className="mb-8 bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-lg">Drop files anywhere highlighted to add them</span>
    </div>
  );
}
