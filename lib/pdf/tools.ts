/** The PaperNest tool list. Plain data, so the pages and the server share it. */

export type OptionDef = {
  id: string;
  label: string;
  type: "select" | "text" | "number" | "checkbox";
  choices?: { value: string; label: string }[];
  default: string | number | boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  /** Only shown when another option has this value. */
  showIf?: { id: string; value: string };
};

export type CategoryId = "organize" | "convert" | "edit" | "security" | "more";
export const CATEGORIES: { id: CategoryId; title: string; blurb: string }[] = [
  { id: "organize", title: "Organize", blurb: "Join, split, reorder and rotate pages." },
  { id: "convert", title: "Convert", blurb: "Turn PDFs into other formats and back." },
  { id: "edit", title: "Edit", blurb: "Add numbers, marks, text and more." },
  { id: "security", title: "Protect and clean", blurb: "Passwords, redaction and metadata." },
  { id: "more", title: "More", blurb: "Compare, repair and read." },
];

export type PdfTool = {
  id: string;
  title: string;
  blurb: string;
  category: CategoryId;
  /** What the file picker accepts. */
  accept: string;
  kind: "pdf" | "image";
  multiple: boolean;
  /** Fewest files needed. */
  min: number;
  /** Label of the main button. */
  action: string;
  options: OptionDef[];
  /** One SVG path (24x24, stroked) for the card icon. */
  icon: string;
};

const PAGES: OptionDef = { id: "pages", label: "Pages", type: "text", default: "all", placeholder: "all, odd, even, or 1-3, 5", help: "Which pages to use. Leave as all for every page." };

export const PDF_TOOLS: PdfTool[] = [
  {
    id: "merge",
    title: "Merge PDF",
    blurb: "Join several PDFs into one, in the order you choose.",
    category: "organize",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: true,
    min: 2,
    action: "Merge PDFs",
    options: [],
    icon: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3M8 12h8M12 8v8",
  },
  {
    id: "rotate",
    title: "Rotate PDF",
    blurb: "Turn all pages, or only the ones you pick.",
    category: "organize",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Rotate",
    options: [
      { id: "angle", label: "Turn pages", type: "select", default: "90", choices: [{ value: "90", label: "Clockwise 90°" }, { value: "180", label: "Upside down 180°" }, { value: "270", label: "Anticlockwise 90°" }] },
      PAGES,
    ],
    icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5",
  },
  {
    id: "split",
    title: "Split PDF",
    blurb: "Cut one PDF into several files by page ranges or every N pages.",
    category: "organize",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Split PDF",
    options: [
      { id: "mode", label: "Split by", type: "select", default: "ranges", choices: [{ value: "ranges", label: "Page ranges" }, { value: "every", label: "Every N pages" }, { value: "single", label: "One file per page" }] },
      { id: "ranges", label: "Ranges", type: "text", default: "1-3, 4-6", placeholder: "1-3, 4-6, 7-", help: "Each range becomes its own PDF. All files come in one ZIP.", showIf: { id: "mode", value: "ranges" } },
      { id: "n", label: "Pages per file", type: "number", default: 2, min: 1, max: 500, showIf: { id: "mode", value: "every" } },
    ],
    icon: "M6 3v6m0 6v6M18 3v6m0 6v6M3 12h18",
  },
  {
    id: "remove",
    title: "Remove pages",
    blurb: "Delete the pages you do not want.",
    category: "organize",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Remove pages",
    options: [{ id: "pages", label: "Pages to remove", type: "text", default: "", placeholder: "2, 5-7", help: "For example 2, 5-7 or 9-." }],
    icon: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5",
  },
  {
    id: "extract",
    title: "Extract pages",
    blurb: "Keep only the pages you pick, in a new PDF.",
    category: "organize",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Extract pages",
    options: [{ id: "pages", label: "Pages to keep", type: "text", default: "", placeholder: "1-3, 8", help: "For example 1-3, 8 or odd or even." }],
    icon: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 14h6",
  },
  {
    id: "organize",
    title: "Organize pages",
    blurb: "Reorder, repeat or drop pages by typing the new order.",
    category: "organize",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Organize",
    options: [{ id: "order", label: "New page order", type: "text", default: "", placeholder: "3, 1, 2, 2, 5-7", help: "Pages appear in the order you type. Leave a page out to drop it, repeat it to copy it. Use 8-1 for reverse order." }],
    icon: "M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3",
  },
  {
    id: "images-to-pdf",
    title: "Images to PDF",
    blurb: "Put JPG, PNG or WebP images into one PDF, one per page.",
    category: "convert",
    accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    kind: "image",
    multiple: true,
    min: 1,
    action: "Make PDF",
    options: [
      { id: "size", label: "Page size", type: "select", default: "fit", choices: [{ value: "fit", label: "Same as each image" }, { value: "a4", label: "A4" }, { value: "letter", label: "US Letter" }] },
      { id: "margin", label: "Margin (points)", type: "number", default: 0, min: 0, max: 100, showIf: { id: "size", value: "a4" } },
    ],
    icon: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01",
  },
  {
    id: "pdf-to-images",
    title: "PDF to images",
    blurb: "Save each page as a PNG or JPG picture, in one ZIP.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Convert to images",
    options: [
      { id: "format", label: "Format", type: "select", default: "png", choices: [{ value: "png", label: "PNG" }, { value: "jpg", label: "JPG" }] },
      { id: "dpi", label: "Quality", type: "select", default: "150", choices: [{ value: "96", label: "Screen (96 dpi)" }, { value: "150", label: "Good (150 dpi)" }, { value: "220", label: "Sharp (220 dpi)" }] },
      PAGES,
    ],
    icon: "M4 4h12l4 4v12H4zM8 16l3-4 2 3 2-2 3 3",
  },
];

export const toolById = (id: string): PdfTool | undefined => PDF_TOOLS.find((t) => t.id === id);
