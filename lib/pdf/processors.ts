import "server-only";
import { degrees, PDFDocument } from "pdf-lib";
import { parsePages } from "./pages";

export type Input = { name: string; bytes: Uint8Array };
export type Output = { name: string; bytes: Uint8Array; type: string };
export type Ctx = { inputs: Input[]; options: Record<string, unknown> };

const stem = (n: string) => n.replace(/\.[^.]+$/, "") || "file";
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

async function open(i: Input): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(i.bytes, { ignoreEncryption: false, updateMetadata: false });
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(e.message)) throw new Error(`"${i.name}" is password protected. Remove the password first.`);
    throw new Error(`"${i.name}" could not be read as a PDF.`);
  }
}

async function merge({ inputs }: Ctx): Promise<Output> {
  const out = await PDFDocument.create();
  for (const i of inputs) {
    const doc = await open(i);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return { name: "merged.pdf", bytes: await out.save(), type: "application/pdf" };
}

async function rotate({ inputs, options }: Ctx): Promise<Output> {
  const doc = await open(inputs[0]);
  const angle = [90, 180, 270].includes(Number(options.angle)) ? Number(options.angle) : 90;
  const pages = doc.getPages();
  for (const idx of parsePages(str(options.pages, "all"), pages.length)) {
    const p = pages[idx];
    p.setRotation(degrees((p.getRotation().angle + angle) % 360));
  }
  return { name: `${stem(inputs[0].name)}-rotated.pdf`, bytes: await doc.save(), type: "application/pdf" };
}

export const PROCESSORS: Record<string, (c: Ctx) => Promise<Output>> = { merge, rotate };
