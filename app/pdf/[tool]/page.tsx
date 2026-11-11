import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PdfShell from "@/components/pdf/PdfShell";
import ToolWorkspace from "@/components/pdf/ToolWorkspace";
import { PDF_TOOLS, toolById } from "@/lib/pdf/tools";

export const dynamicParams = false;
export const generateStaticParams = () => PDF_TOOLS.map((t) => ({ tool: t.id }));

export async function generateMetadata({ params }: { params: Promise<{ tool: string }> }): Promise<Metadata> {
  const t = toolById((await params).tool);
  return t ? { title: `${t.title} — PaperNest`, description: t.blurb } : {};
}

export default async function ToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const tool = toolById((await params).tool);
  if (!tool) notFound();
  return (
    <PdfShell>
      <Link href="/pdf" className="text-xs font-semibold text-stone-600 hover:text-stone-900">← All PDF tools</Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold text-stone-900">{tool.title}</h1>
      <p className="mb-5 text-sm text-stone-600">{tool.blurb}</p>
      <ToolWorkspace tool={tool} />
    </PdfShell>
  );
}
