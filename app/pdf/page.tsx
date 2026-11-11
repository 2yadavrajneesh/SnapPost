import Link from "next/link";
import PdfShell from "@/components/pdf/PdfShell";
import { CATEGORIES, PDF_TOOLS } from "@/lib/pdf/tools";

export default function PaperNestHome() {
  return (
    <PdfShell>
      <h1 className="text-2xl font-bold text-stone-900">PaperNest</h1>
      <p className="mb-6 mt-1 max-w-2xl text-sm text-stone-600">PDF tools that run on the server. Upload, get a download link, and your file is deleted shortly after.</p>
      {CATEGORIES.map((c) => {
        const tools = PDF_TOOLS.filter((t) => t.category === c.id);
        if (!tools.length) return null;
        return (
          <section key={c.id} className="mb-7">
            <h2 className="text-sm font-bold text-stone-900">{c.title}</h2>
            <p className="mb-3 text-xs text-stone-500">{c.blurb}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => (
                <Link key={t.id} href={`/pdf/${t.id}`} className="group flex items-start gap-3 border border-stone-300 border-t-[3px] border-t-transparent bg-white/80 p-3.5 transition hover:border-t-accent hover:bg-white">
                  <span className="flex h-9 w-9 flex-none items-center justify-center bg-stone-200 text-stone-700 transition group-hover:bg-accent group-hover:text-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
                  </span>
                  <span>
                    <strong className="block text-sm text-stone-900">{t.title}</strong>
                    <span className="text-xs text-stone-600">{t.blurb}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </PdfShell>
  );
}
