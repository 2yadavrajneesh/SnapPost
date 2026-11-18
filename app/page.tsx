import Link from "next/link";
import { ArrowRight, Check, Lock, MonitorSmartphone, Timer } from "lucide-react";
import { SITE_NAME } from "@/lib/site";
import HomeHeader from "@/components/layout/HomeHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TOOLS, ToolIcon, type ToolId } from "@/lib/tools";

const DETAILS: Record<ToolId, { blurb: string; points: string[] }> = {
  snappost: { blurb: "Paste a post link and get a clean, high-resolution picture of it.", points: ["Choose layout, fonts and colours", "Keeps photos and video previews", "Save as PNG, PDF or MP4"] },
  threadscroll: { blurb: "Turn a long thread into something you can actually read.", points: ["Unroll one thread or many links", "Pages sized for print or phones", "Export as images, text or PDF"] },
  linkdesk: { blurb: "Everything you need when you work with lists of links.", points: ["Open links in batches", "Make links from spreadsheets", "Clean, extract and archive"] },
  collage: { blurb: "Put several posts side by side in one neat picture.", points: ["Add links or upload pictures", "Grid layouts with a clean title", "Download in one click"] },
  clipbook: { blurb: "Compile a day of news clippings into one tidy PDF.", points: ["Captions, sources and page numbers", "English and Hindi", "Drag to reorder pictures"] },
  editpdf: { blurb: "Change a PDF without installing anything.", points: ["Type, highlight, draw and sign", "Merge, split, rotate, redact", "Page numbers and watermarks"] },
};

const FACTS = [
  { icon: Lock, title: "Private by design", text: "Your files are processed in your browser. Nothing is uploaded." },
  { icon: Timer, title: "Picks up where you left off", text: "Your work is saved on this device and stays for 7 days." },
  { icon: MonitorSmartphone, title: "Works on any screen", text: "Phone, tablet or desktop, in light or dark theme." },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      <HomeHeader />
      <main className="home-stage">
        <section id="tools" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-8 sm:px-6 sm:py-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">All tools</h2>
              <p className="mt-1 text-sm text-stone-600">Each one opens on its own page and works on its own.</p>
            </div>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TOOLS.map((t) => {
              const d = DETAILS[t.id];
              return (
                <li key={t.id} className="flex">
                  <Card className="home-card group w-full gap-4 py-0 transition hover:-translate-y-0.5 hover:shadow-md" style={{ ["--tc" as string]: t.accent }}>
                    <div className="h-1.5 w-full" style={{ background: t.accent }} />
                    <CardHeader className="gap-3 px-5 pt-1">
                      <ToolIcon id={t.id} size={44} />
                      <div>
                        <CardTitle className="text-lg font-bold text-stone-900">{t.name}</CardTitle>
                        <CardDescription className="mt-1 text-sm text-stone-600">{d.blurb}</CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 px-5">
                      <ul className="space-y-1.5 text-sm text-stone-700">
                        {d.points.map((p) => (
                          <li key={p} className="flex items-start gap-2">
                            <Check className="mt-0.5 size-4 flex-none" style={{ color: t.accent }} />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="px-5 pb-5">
                      <Button asChild className="w-full font-semibold text-white hover:brightness-110" style={{ background: t.accent }}>
                        <Link href={t.href} aria-label={`Open ${t.name}`}>
                          Open {t.name} <ArrowRight className="transition group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                    </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-t border-stone-300 bg-white/60">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {FACTS.map((f) => (
              <div key={f.title} className="flex gap-3">
                <f.icon className="mt-0.5 size-5 flex-none text-stone-700" />
                <div>
                  <h3 className="text-sm font-bold text-stone-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-stone-600">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-stone-300 py-6 text-center text-xs text-stone-500">{SITE_NAME} · Not affiliated with X or any news outlet.</footer>
    </div>
  );
}
