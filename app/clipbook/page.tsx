import NewsWorkspace from "@/components/pdf/NewsWorkspace";
import PdfShell from "@/components/pdf/PdfShell";

export default function ClipBook() {
  return (
    <PdfShell accent="#b91c1c">
      <h1 className="text-2xl font-bold text-stone-900">ClipBook</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-stone-600">Drop in a day of news screenshots. ClipBook lays them out with captions, sources and page numbers, and gives you one tidy PDF to download.</p>
      <NewsWorkspace />
    </PdfShell>
  );
}
