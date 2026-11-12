import "server-only";

type PDFObject = import("mupdf").PDFObject;
export type PageWeights = { big: [number, number][]; small: number };
export type Analysis = { total: number; pages: PageWeights[]; streams: number; partial: boolean };

const SKIP = new Set(["Parent", "P", "Prev", "Next", "Dest", "StructParent", "StructParents", "Annots", "Thumb", "B"]);
const BIG = 2048;

/** For each page, lists the big objects (pictures, fonts, content) it uses, so shared ones are only counted once when pages are kept together. */
export async function analyzePdf(bytes: Uint8Array): Promise<Analysis> {
  const mupdf = await import("mupdf");
  let doc;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch {
    throw new Error("That file could not be read as a PDF.");
  }
  try {
    if (doc.needsPassword()) throw new Error("This PDF is password protected. Remove the password first.");
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("That file is not a PDF.");
    const total = pdf.countPages();
    const started = Date.now();
    let partial = false;
    const sizeOf = (o: PDFObject): number => {
      try {
        const L = o.get("Length");
        if (L.isNumber()) return L.asNumber();
      } catch {}
      try {
        return o.readRawStream().getLength();
      } catch {
        return 0;
      }
    };
    const all = new Map<number, number>();
    const pages: PageWeights[] = [];
    for (let i = 0; i < total; i++) {
      const page = pdf.loadPage(i) as unknown as { getObject(): PDFObject; destroy(): void };
      const po = page.getObject();
      const seen = new Set<number>();
      const big = new Map<number, number>();
      let small = 0;
      let nodes = 0;
      const walk = (node: PDFObject, depth: number) => {
        if (depth > 12 || ++nodes > 6000) return;
        if (node.isIndirect()) {
          const num = node.asIndirect();
          if (seen.has(num)) return;
          seen.add(num);
          // the stream flag is only visible on the reference, so check it before resolving
          if (node.isStream()) {
            const n = sizeOf(node);
            all.set(num, n);
            if (n >= BIG) big.set(num, n);
            else small += n;
          }
          node = node.resolve();
        }
        if (node.isArray()) node.forEach((v) => walk(v, depth + 1));
        else if (node.isDictionary()) node.forEach((v, k) => (typeof k === "string" && SKIP.has(k) ? undefined : walk(v, depth + 1)));
      };
      walk(po.get("Contents"), 0);
      let res = po.get("Resources");
      for (let up = po, k = 0; res.isNull() && k < 6; k++) {
        up = up.get("Parent");
        if (up.isNull()) break;
        res = up.get("Resources");
      }
      walk(res, 0);
      if (nodes > 6000 || Date.now() - started > 40_000) partial = true;
      pages.push({ big: [...big.entries()], small });
      page.destroy();
      if (Date.now() - started > 40_000) {
        partial = true;
        while (pages.length < total) pages.push({ big: [], small: 0 });
        break;
      }
    }
    let streams = 0;
    for (const n of all.values()) streams += n;
    return { total: bytes.length, pages, streams, partial };
  } finally {
    doc.destroy();
  }
}
