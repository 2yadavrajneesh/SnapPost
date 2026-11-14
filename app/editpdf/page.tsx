import EditPdfApp from "@/components/pdf/EditPdfApp";
import PdfShell from "@/components/pdf/PdfShell";

export default function EditPdf() {
  return (
    <PdfShell accent="#047857" variant="edit">
      <EditPdfApp />
    </PdfShell>
  );
}
