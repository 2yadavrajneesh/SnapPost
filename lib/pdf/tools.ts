/** The two PDF apps that share the upload, run and download pipeline: ClipBook (news-pdf) and EditPDF (edit-pdf). */

export type PdfTool = {
  id: string;
  /** What the file picker accepts. */
  accept: string;
  multiple: boolean;
  /** Fewest files needed. */
  min: number;
  /** Most files allowed (defaults to the site limit when several files are allowed). */
  max?: number;
};

export const PDF_TOOLS: PdfTool[] = [
  { id: "news-pdf", accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp", multiple: true, min: 1 },
  { id: "edit-pdf", accept: "application/pdf,.pdf", multiple: false, min: 1 },
];

export const toolById = (id: string): PdfTool | undefined => PDF_TOOLS.find((t) => t.id === id);
