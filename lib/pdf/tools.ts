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
];

export const toolById = (id: string): PdfTool | undefined => PDF_TOOLS.find((t) => t.id === id);
