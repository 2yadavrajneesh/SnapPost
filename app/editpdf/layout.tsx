import type { Metadata } from "next";

export const metadata: Metadata = {
  applicationName: "EditPDF",
  title: "EditPDF — Edit a PDF Online",
  description: "Add text, highlights, shapes, drawings, signatures and pictures to a PDF, with a live file size estimate.",
  openGraph: { title: "EditPDF — Edit a PDF Online", description: "Mark up and sign a PDF right on the page.", type: "website", siteName: "EditPDF" },
};

export default function EditPdfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
