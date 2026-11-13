import EditorWorkspace from "@/components/pdf/EditorWorkspace";
import PdfShell from "@/components/pdf/PdfShell";

export default function EditPdf() {
  return (
    <PdfShell accent="#047857">
      <h1 className="text-2xl font-bold text-stone-900">EditPDF</h1>
      <p className="mb-5 mt-1 max-w-2xl text-sm text-stone-600">Open a PDF and add text, highlights, shapes, drawings, signatures and pictures right on the pages. See the new file size before you save.</p>
      <EditorWorkspace />
    </PdfShell>
  );
}
