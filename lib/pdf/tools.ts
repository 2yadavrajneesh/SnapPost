/** The PaperNest tool list. Plain data, so the pages and the server share it. */

export type OptionDef = {
  id: string;
  label: string;
  type: "select" | "text" | "number" | "checkbox" | "password" | "textarea";
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
  kind: "pdf" | "image" | "both";
  /** Tools with their own page layout instead of the standard upload form. */
  ui?: "news" | "editor";
  multiple: boolean;
  /** Fewest files needed. */
  min: number;
  /** Most files allowed (defaults to the site limit when several files are allowed). */
  max?: number;
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
  {
    id: "page-numbers",
    title: "Page numbers",
    blurb: "Add page numbers to every page, or only some.",
    category: "edit",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Add numbers",
    options: [
      { id: "pos", label: "Position", type: "select", default: "bc", choices: [{ value: "bc", label: "Bottom centre" }, { value: "br", label: "Bottom right" }, { value: "bl", label: "Bottom left" }, { value: "tc", label: "Top centre" }, { value: "tr", label: "Top right" }, { value: "tl", label: "Top left" }, { value: "c", label: "Middle" }] },
      { id: "format", label: "Style", type: "select", default: "n", choices: [{ value: "n", label: "1" }, { value: "page", label: "Page 1" }, { value: "of", label: "Page 1 of 10" }] },
      { id: "start", label: "First number", type: "number", default: 1, min: 0, max: 9999 },
      { id: "size", label: "Text size", type: "number", default: 11, min: 6, max: 48 },
      PAGES,
    ],
    icon: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  },
  {
    id: "watermark",
    title: "Watermark",
    blurb: "Stamp a text watermark across the pages.",
    category: "edit",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Add watermark",
    options: [
      { id: "text", label: "Watermark text", type: "text", default: "CONFIDENTIAL", placeholder: "DRAFT" },
      { id: "angle", label: "Direction", type: "select", default: "45", choices: [{ value: "45", label: "Diagonal" }, { value: "0", label: "Straight" }] },
      { id: "size", label: "Text size", type: "number", default: 64, min: 12, max: 200 },
      { id: "opacity", label: "Strength (10 to 100)", type: "number", default: 25, min: 10, max: 100 },
      { id: "color", label: "Colour", type: "select", default: "gray", choices: [{ value: "black", label: "Black" }, { value: "gray", label: "Grey" }, { value: "red", label: "Red" }, { value: "blue", label: "Blue" }] },
      PAGES,
    ],
    icon: "M4 20L20 4M7 7h4M13 13h4M5 17h3",
  },
  {
    id: "crop",
    title: "Crop PDF",
    blurb: "Trim the margins of every page.",
    category: "edit",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Crop pages",
    options: [
      { id: "top", label: "Top (mm)", type: "number", default: 10, min: 0, max: 300 },
      { id: "right", label: "Right (mm)", type: "number", default: 10, min: 0, max: 300 },
      { id: "bottom", label: "Bottom (mm)", type: "number", default: 10, min: 0, max: 300 },
      { id: "left", label: "Left (mm)", type: "number", default: 10, min: 0, max: 300 },
      PAGES,
    ],
    icon: "M6 2v16h16M2 6h16v16",
  },
  {
    id: "add-text",
    title: "Add text",
    blurb: "Write a line of text on the pages you pick.",
    category: "edit",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Add text",
    options: [
      { id: "text", label: "Text", type: "text", default: "", placeholder: "Reviewed by Rajneesh" },
      { id: "pos", label: "Position", type: "select", default: "tl", choices: [{ value: "bc", label: "Bottom centre" }, { value: "br", label: "Bottom right" }, { value: "bl", label: "Bottom left" }, { value: "tc", label: "Top centre" }, { value: "tr", label: "Top right" }, { value: "tl", label: "Top left" }, { value: "c", label: "Middle" }] },
      { id: "size", label: "Text size", type: "number", default: 12, min: 6, max: 96 },
      { id: "color", label: "Colour", type: "select", default: "black", choices: [{ value: "black", label: "Black" }, { value: "gray", label: "Grey" }, { value: "red", label: "Red" }, { value: "blue", label: "Blue" }] },
      PAGES,
    ],
    icon: "M5 6V4h14v2M12 4v16M9 20h6",
  },
  {
    id: "protect",
    title: "Protect PDF",
    blurb: "Lock a PDF with a password (AES-256).",
    category: "security",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Protect PDF",
    options: [
      { id: "password", label: "Password to open", type: "password", default: "", help: "Anyone who opens the file will need this. We do not store it." },
    ],
    icon: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3",
  },
  {
    id: "unlock",
    title: "Unlock PDF",
    blurb: "Remove the password, if you know it.",
    category: "security",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Unlock PDF",
    options: [
      { id: "password", label: "Current password", type: "password", default: "", help: "You must know the password. This cannot guess or break one." },
    ],
    icon: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 7-2.6",
  },
  {
    id: "metadata",
    title: "Edit metadata",
    blurb: "Set or clear the title, author and other file details.",
    category: "security",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Save details",
    options: [
      { id: "title", label: "Title", type: "text", default: "", help: "Leave a box empty to keep what the file already has." },
      { id: "author", label: "Author", type: "text", default: "" },
      { id: "subject", label: "Subject", type: "text", default: "" },
      { id: "keywords", label: "Keywords", type: "text", default: "", placeholder: "comma, separated" },
      { id: "clear", label: "Remove all existing details first", type: "checkbox", default: false },
    ],
    icon: "M4 6h16M4 12h10M4 18h7",
  },
  {
    id: "pdf-to-text",
    title: "PDF to text",
    blurb: "Pull the text out of a PDF as a .txt file.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Get text",
    options: [
      PAGES,
      { id: "marks", label: "Mark where each page starts", type: "checkbox", default: true },
    ],
    icon: "M5 4h14M5 9h14M5 14h9M5 19h6",
  },
  {
    id: "pdf-to-markdown",
    title: "PDF to Markdown",
    blurb: "Turn a text PDF into a .md file with headings and lists.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Get Markdown",
    options: [
      PAGES,
      { id: "marks", label: "Add a line between pages", type: "checkbox", default: false },
    ],
    icon: "M3 6h18v12H3zM7 15V9l3 3 3-3v6M17 9v6M15 13l2 2 2-2",
  },
  {
    id: "redact",
    title: "Redact PDF",
    blurb: "Permanently black out words, emails or numbers. The text underneath is removed.",
    category: "security",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Redact",
    options: [
      { id: "terms", label: "Words or phrases to redact", type: "textarea", default: "", placeholder: "One per line", help: "Matches are found anywhere in the text, ignoring capital letters." },
      { id: "emails", label: "Also redact email addresses", type: "checkbox", default: false },
      { id: "phones", label: "Also redact phone numbers", type: "checkbox", default: false },
      { id: "mode", label: "What to do", type: "select", default: "redact", choices: [{ value: "preview", label: "Preview only (highlight matches, change nothing)" }, { value: "redact", label: "Redact for real" }] },
      PAGES,
    ],
    icon: "M4 7h16M4 12h10M4 17h16",
  },
  {
    id: "compress",
    title: "Compress PDF",
    blurb: "Make the file smaller.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Compress",
    options: [
      { id: "level", label: "Level", type: "select", default: "normal", choices: [{ value: "normal", label: "Normal (keeps text and quality)" }, { value: "strong", label: "Smallest (turns pages into pictures, text is no longer selectable)" }] },
      { id: "dpi", label: "Picture quality for Smallest", type: "select", default: "110", choices: [{ value: "80", label: "Low (80 dpi)" }, { value: "110", label: "Medium (110 dpi)" }, { value: "150", label: "High (150 dpi)" }], showIf: { id: "level", value: "strong" } },
    ],
    icon: "M8 3v6l-3-3M8 9L5 6M16 21v-6l3 3M16 15l3 3M4 12h16",
  },
  {
    id: "compare",
    title: "Compare PDFs",
    blurb: "See what changed in the text between two versions.",
    category: "more",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: true,
    min: 2,
    max: 2,
    action: "Compare",
    options: [
      { id: "ignore", label: "Ignore differences in spaces and line breaks", type: "checkbox", default: true },
    ],
    icon: "M8 3v18M16 3v18M4 8h8M12 16h8",
  },
  {
    id: "pdf-to-word",
    title: "PDF to Word",
    blurb: "Make an editable .docx from a text PDF.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Convert to Word",
    options: [
      { id: "layout", label: "Layout", type: "select", default: "editable", choices: [{ value: "editable", label: "Editable text (headings, lists, paragraphs)" }, { value: "close", label: "Close layout (text kept where it is on the page)" }, { value: "picture", label: "Exact look (each page as a picture, not editable)" }] },
      PAGES,
    ],
    icon: "M6 3h9l4 4v14H6zM9 12l1.5 5L12 13l1.5 4L15 12",
  },
  {
    id: "pdf-to-excel",
    title: "PDF to Excel",
    blurb: "Pull table-like text into a spreadsheet, one sheet per page.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Convert to Excel",
    options: [
      PAGES,
    ],
    icon: "M4 4h16v16H4zM4 10h16M10 4v16",
  },
  {
    id: "pdf-to-powerpoint",
    title: "PDF to PowerPoint",
    blurb: "Turn each page into a slide.",
    category: "convert",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Convert to PowerPoint",
    options: [
      { id: "mode", label: "Slides contain", type: "select", default: "picture", choices: [{ value: "picture", label: "The page as a picture (looks the same)" }, { value: "text", label: "The text (editable, simpler look)" }] },
      PAGES,
    ],
    icon: "M4 5h16v11H4zM12 16v4M8 20h8",
  },
  {
    id: "ocr",
    title: "OCR (scanned PDF)",
    blurb: "Read the text in a scanned PDF or photo and make it searchable.",
    category: "convert",
    accept: "application/pdf,.pdf,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    kind: "both",
    multiple: false,
    min: 1,
    action: "Read the text",
    options: [
      { id: "lang", label: "Language", type: "select", default: "eng", choices: [{ value: "eng", label: "English" }, { value: "hin", label: "Hindi" }, { value: "eng+hin", label: "English and Hindi" }, { value: "spa", label: "Spanish" }, { value: "fra", label: "French" }, { value: "deu", label: "German" }] },
      { id: "output", label: "Give me", type: "select", default: "pdf", choices: [{ value: "pdf", label: "Searchable PDF (looks the same, text can be selected)" }, { value: "txt", label: "Plain text file" }] },
      { id: "pages", label: "Pages", type: "text", default: "all", placeholder: "all, or 1-10", help: "Reading takes a few seconds per page, so up to 40 pages at a time." },
    ],
    icon: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5",
  },
  {
    id: "news-pdf",
    title: "News PDF maker",
    blurb: "Drop in a day of news screenshots and get one tidy PDF with captions, sources and page numbers.",
    category: "edit",
    ui: "news",
    accept: "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
    kind: "image",
    multiple: true,
    min: 1,
    action: "Make PDF",
    options: [],
    icon: "M4 5h12v14H4zM16 8h4v9a2 2 0 0 1-2 2M7 9h6M7 12h6M7 15h3",
  },
  {
    id: "edit-pdf",
    title: "Edit PDF",
    blurb: "Add text, highlights, shapes, drawings, signatures and pictures right on the pages.",
    category: "edit",
    ui: "editor",
    accept: "application/pdf,.pdf",
    kind: "pdf",
    multiple: false,
    min: 1,
    action: "Save edits",
    options: [],
    icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  },
];

export const toolById = (id: string): PdfTool | undefined => PDF_TOOLS.find((t) => t.id === id);
