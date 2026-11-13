"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, btnPlain, btnPrimary, btnSm, useCopy } from "@/components/linkdesk/ui";
import { deleteResult, downloadHref, getConfig, runTool, uploadFile, type PdfConfig, type RunResult } from "@/lib/pdf/client";

type Pt = [number, number];
type Base = { id: number; page: number };
type Ann = Base &
  (
    | { k: "text"; x: number; y: number; text: string; size: number; color: string; bold: boolean }
    | { k: "rect" | "ellipse" | "highlight" | "white"; x: number; y: number; w: number; h: number; color: string; width: number }
    | { k: "ink"; pts: Pt[]; color: string; width: number }
    | { k: "image"; x: number; y: number; w: number; h: number; data: string }
  );
type Tool = "select" | "text" | "highlight" | "rect" | "ellipse" | "white" | "ink" | "image";
type PdfDocProxy = import("pdfjs-dist").PDFDocumentProxy;

const COLORS = ["#111827", "#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"];
const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "M5 3l14 7-6 2-2 6z" },
  { id: "text", label: "Text", icon: "M5 6V4h14v2M12 4v16M9 20h6" },
  { id: "highlight", label: "Highlight", icon: "M4 20h16M7 16l8-8 3 3-8 8H7z" },
  { id: "rect", label: "Box", icon: "M4 5h16v14H4z" },
  { id: "ellipse", label: "Circle", icon: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" },
  { id: "white", label: "Whiteout", icon: "M4 5h16v14H4zM4 19L20 5" },
  { id: "ink", label: "Draw", icon: "M4 20c4-1 5-6 9-9l4-4 3 3-4 4c-3 4-8 5-12 6z" },
  { id: "image", label: "Picture", icon: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4" },
];
const SIG_KEY = "editpdf:signature:v1";
let nid = 0;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Shrinks a picture so the request stays small. Returns a data URL. */
async function toDataUrl(file: File, max = 1000): Promise<{ data: string; ratio: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const png = file.type === "image/png";
  return { data: c.toDataURL(png ? "image/png" : "image/jpeg", 0.85), ratio: c.width / c.height };
}

/* ---------------- one page: canvas + overlay ---------------- */
function PageView({
  doc, index, base, width, tool, annots, selected, editing, color, strokeW, textSize, onDown, onSelect, onChange, onEdit, onCommit, onRemoveEmpty, register,
}: {
  doc: PdfDocProxy; index: number; base: [number, number]; width: number; tool: Tool; annots: Ann[]; selected: number | null; editing: number | null; color: string; strokeW: number; textSize: number;
  onDown: (page: number, u: number, v: number, el: HTMLElement) => void; onSelect: (id: number | null) => void; onChange: (id: number, p: Partial<Ann>, commit?: boolean) => void; onEdit: (id: number | null) => void; onCommit: () => void; onRemoveEmpty: (id: number) => void; register: (i: number, el: HTMLElement | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(index < 2);
  const height = (width * base[1]) / base[0];
  const scale = width / base[0];

  useEffect(() => {
    register(index, wrap.current);
    return () => register(index, null);
  }, [index, register]);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    if (!near) {
      cv.width = 1;
      cv.height = 1;
      return;
    }
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let dead = false;
    (async () => {
      const page = await doc.getPage(index + 1);
      if (dead) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale: (width / base[0]) * dpr });
      cv.width = Math.floor(vp.width);
      cv.height = Math.floor(vp.height);
      task = page.render({ canvas: cv, viewport: vp });
      await task.promise.catch(() => {});
    })();
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [near, doc, index, width, base]);

  const rel = (e: { clientX: number; clientY: number }) => {
    const r = wrap.current!.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)] as const;
  };
  const drawing = tool !== "select";

  const startDrag = (e: React.PointerEvent, a: Ann, mode: "move" | "resize") => {
    if (editing === a.id) return;
    e.stopPropagation();
    onSelect(a.id);
    if (drawing && mode === "move") return;
    const r = wrap.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const orig = JSON.parse(JSON.stringify(a)) as Ann;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width;
      const dy = (ev.clientY - sy) / r.height;
      if (mode === "resize" && "w" in orig) {
        const w = clamp(orig.w + dx, 0.02, 1);
        const h = orig.k === "image" ? w * (orig.w ? (orig.h * r.height) / (orig.w * r.width) : 1) * (r.width / r.height) : clamp(orig.h + dy, 0.01, 1);
        onChange(a.id, { w, h } as Partial<Ann>);
      } else if (orig.k === "ink") onChange(a.id, { pts: orig.pts.map(([u, v]) => [u + dx, v + dy] as Pt) } as Partial<Ann>);
      else if ("x" in orig) onChange(a.id, { x: orig.x + dx, y: orig.y + dy } as Partial<Ann>);
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      onCommit();
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  };

  const hexA = (c: string, a: number) => `${c}${Math.round(a * 255).toString(16).padStart(2, "0")}`;
  const inPage = annots.filter((a) => a.page === index);

  return (
    <div ref={wrap} data-page={index} className="relative mx-auto mb-4 select-none bg-white shadow-md" style={{ width, height }}>
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      <div
        className="absolute inset-0"
        style={{ touchAction: drawing ? "none" : "pan-y", cursor: tool === "text" ? "text" : drawing ? "crosshair" : "default" }}
        onPointerDown={(e) => {
          if (!drawing) return onSelect(null);
          const [u, v] = rel(e);
          onDown(index, u, v, wrap.current!);
          e.preventDefault();
        }}
      >
        {inPage.map((a) => {
          const sel = selected === a.id;
          const ring = sel ? "outline outline-2 outline-offset-1 outline-[color:var(--accent)]" : "hover:outline hover:outline-1 hover:outline-stone-400";
          if (a.k === "ink") {
            const xs = a.pts.map((p) => p[0]);
            const ys = a.pts.map((p) => p[1]);
            return (
              <svg key={a.id} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${width} ${height}`}>
                <polyline points={a.pts.map(([u, v]) => `${u * width},${v * height}`).join(" ")} fill="none" stroke={a.color} strokeWidth={a.width * scale} strokeLinecap="round" strokeLinejoin="round" />
                <rect className="pointer-events-auto" x={Math.min(...xs) * width - 4} y={Math.min(...ys) * height - 4} width={(Math.max(...xs) - Math.min(...xs)) * width + 8} height={(Math.max(...ys) - Math.min(...ys)) * height + 8} fill="transparent" stroke={sel ? "var(--accent)" : "none"} strokeDasharray="4" onPointerDown={(e) => startDrag(e, a, "move")} style={{ cursor: "move" }} />
              </svg>
            );
          }
          if (a.k === "text") {
            const lines = a.text.split("\n");
            const fs = a.size * scale;
            return (
              <div key={a.id} className={`absolute ${ring}`} style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%`, cursor: editing === a.id ? "text" : "move" }} onPointerDown={(e) => startDrag(e, a, "move")} onDoubleClick={() => onEdit(a.id)}>
                {editing === a.id ? (
                  <textarea
                    autoFocus
                    value={a.text}
                    onChange={(e) => onChange(a.id, { text: e.target.value } as Partial<Ann>)}
                    onBlur={() => {
                      onEdit(null);
                      if (!a.text.trim()) onRemoveEmpty(a.id);
                      else onCommit();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    spellCheck={false}
                    className="m-0 block resize-none overflow-hidden border-0 bg-white/60 p-0 outline-none"
                    style={{ fontFamily: "Arial, sans-serif", fontSize: fs, lineHeight: 1.25, color: a.color, fontWeight: a.bold ? 700 : 400, width: `${Math.max(...lines.map((l) => l.length), 6) + 2}ch`, height: `${lines.length * 1.25}em` }}
                  />
                ) : (
                  <div style={{ fontFamily: "Arial, sans-serif", fontSize: fs, lineHeight: 1.25, color: a.color, fontWeight: a.bold ? 700 : 400, whiteSpace: "pre", minWidth: 10 }}>{a.text}</div>
                )}
              </div>
            );
          }
          const box = { left: `${a.x * 100}%`, top: `${a.y * 100}%`, width: `${a.w * 100}%`, height: `${a.h * 100}%`, cursor: "move" } as const;
          return (
            <div key={a.id} className={`absolute ${ring}`} style={box} onPointerDown={(e) => startDrag(e, a, "move")}>
              {a.k === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.data} alt="" draggable={false} className="pointer-events-none h-full w-full" />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    background: a.k === "highlight" ? hexA(a.color, 0.35) : a.k === "white" ? "#fff" : "transparent",
                    border: a.k === "rect" || a.k === "ellipse" ? `${Math.max(1, a.width * scale)}px solid ${a.color}` : "none",
                    borderRadius: a.k === "ellipse" ? "50%" : 0,
                    boxShadow: a.k === "white" && sel ? "inset 0 0 0 1px #94a3b8" : "none",
                  }}
                />
              )}
              {sel && <span onPointerDown={(e) => startDrag(e, a, "resize")} className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize border border-white bg-accent" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- signature pad ---------------- */
function SignaturePad({ onUse, onClose }: { onUse: (data: string, ratio: number) => void; onClose: () => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [has, setHas] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const last = useRef<Pt | null>(null);
  useEffect(() => {
    try {
      setSaved(localStorage.getItem(SIG_KEY));
    } catch {}
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = cv.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * cv.current!.width, ((e.clientY - r.top) / r.height) * cv.current!.height] as Pt;
  };
  const draw = (e: React.PointerEvent) => {
    if (!last.current) return;
    const ctx = cv.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(...last.current);
    ctx.lineTo(...p);
    ctx.stroke();
    last.current = p;
    setHas(true);
  };
  const use = () => {
    const c = cv.current!;
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
    let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d.data[(y * c.width + x) * 4 + 3] > 10) (x0 = Math.min(x0, x), x1 = Math.max(x1, x), y0 = Math.min(y0, y), y1 = Math.max(y1, y));
    if (x1 <= x0) return;
    const pad = 6;
    const out = document.createElement("canvas");
    out.width = x1 - x0 + pad * 2;
    out.height = y1 - y0 + pad * 2;
    out.getContext("2d")!.drawImage(c, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    const data = out.toDataURL("image/png");
    try {
      localStorage.setItem(SIG_KEY, JSON.stringify({ data, ratio: out.width / out.height }));
    } catch {}
    onUse(data, out.width / out.height);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Draw your signature">
      <div className="w-full max-w-[560px] bg-white p-4 shadow-xl">
        <h2 className="text-sm font-bold text-stone-900">Draw your signature</h2>
        <p className="mb-2 text-[11px] text-stone-500">Use your finger, mouse or pen. It is kept only on this device.</p>
        <canvas
          ref={cv}
          width={960}
          height={300}
          className="w-full touch-none border border-stone-300 bg-stone-50"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            last.current = pos(e);
          }}
          onPointerMove={draw}
          onPointerUp={() => (last.current = null)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} disabled={!has} onClick={use}>Use this signature</button>
          <button type="button" className={btnPlain} onClick={() => { cv.current!.getContext("2d")!.clearRect(0, 0, 960, 300); setHas(false); }}>Clear</button>
          {saved && <button type="button" className={btnPlain} onClick={() => { try { const s = JSON.parse(saved); onUse(s.data, s.ratio); } catch {} }}>Use saved signature</button>}
          <button type="button" className={`${btnPlain} ml-auto`} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- the editor ---------------- */
export default function EditorWorkspace() {
  const [cfg, setCfg] = useState<PdfConfig | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<PdfDocProxy | null>(null);
  const [sizes, setSizes] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const [annots, setAnnots] = useState<Ann[]>([]);
  const [past, setPast] = useState<Ann[][]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(COLORS[0]);
  const [strokeW, setStrokeW] = useState(2);
  const [textSize, setTextSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [avail, setAvail] = useState(800);
  const [pending, setPending] = useState<{ data: string; ratio: number } | null>(null);
  const [sig, setSig] = useState(false);
  const [busy, setBusy] = useState<"" | "upload" | "process">("");
  const [pct, setPct] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [over, setOver] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLElement>());
  const imgInput = useRef<HTMLInputElement>(null);
  const copy = useCopy();
  const annotsRef = useRef(annots);
  annotsRef.current = annots;

  useEffect(() => {
    getConfig().then(setCfg).catch(() => {});
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(Math.max(280, el.clientWidth - 8)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  const width = Math.round(Math.min(avail, 820) * zoom);
  const register = useCallback((i: number, el: HTMLElement | null) => {
    if (el) pageEls.current.set(i, el);
    else pageEls.current.delete(i);
  }, []);

  async function open(f: File) {
    setError("");
    setResult(null);
    if (!/\.pdf$/i.test(f.name) && !/pdf$/i.test(f.type)) return setError("Please choose a PDF file.");
    if (f.size > (cfg?.maxFileBytes ?? 100 * 1048576)) return setError(`That file is larger than ${size(cfg?.maxFileBytes ?? 100 * 1048576)}.`);
    setLoading(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const d = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      const s: [number, number][] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const p = await d.getPage(i);
        const v = p.getViewport({ scale: 1 });
        s.push([v.width, v.height]);
      }
      setSizes(s);
      setDoc(d);
      setFile(f);
      setAnnots([]);
      setPast([]);
      setSelected(null);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setError(name === "PasswordException" ? "This PDF is password protected. Remove the password with Unlock PDF first." : "That file could not be opened as a PDF.");
    } finally {
      setLoading(false);
    }
  }

  const snapshot = () => setPast((p) => [...p.slice(-49), annotsRef.current]);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setAnnots(p[p.length - 1]);
      setSelected(null);
      return p.slice(0, -1);
    });
  }, []);
  const removeSel = useCallback(() => {
    if (selected == null) return;
    snapshot();
    setAnnots((a) => a.filter((x) => x.id !== selected));
    setSelected(null);
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && !typing) removeSel();
      else if (e.key === "Escape") {
        setTool("select");
        setPending(null);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, removeSel]);

  const chooseTool = (t: Tool) => {
    setTool(t);
    setPending(null);
    setEditing(null);
    if (t === "highlight") setColor("#facc15");
    else if (color === "#facc15") setColor(COLORS[0]);
    if (t === "image") imgInput.current?.click();
  };

  const change = (id: number, p: Partial<Ann>) => setAnnots((a) => a.map((x) => (x.id === id ? ({ ...x, ...p } as Ann) : x)));
  const apply = (p: Partial<Ann>) => {
    if (selected == null) return;
    snapshot();
    change(selected, p);
  };

  const onDown = (page: number, u: number, v: number, el: HTMLElement) => {
    setResult(null);
    if (pending && tool === "image") {
      const w = 0.3;
      const [pw, ph] = sizes[page];
      const h = (w * pw) / ph / pending.ratio;
      const a: Ann = { id: ++nid, page, k: "image", x: clamp(u - w / 2, 0, 1 - w), y: clamp(v - h / 2, 0, 1 - h), w, h, data: pending.data };
      snapshot();
      setAnnots((l) => [...l, a]);
      setSelected(a.id);
      setPending(null);
      setTool("select");
      return;
    }
    if (tool === "text") {
      const a: Ann = { id: ++nid, page, k: "text", x: u, y: v, text: "", size: textSize, color, bold };
      snapshot();
      setAnnots((l) => [...l, a]);
      setSelected(a.id);
      setEditing(a.id);
      return;
    }
    if (tool === "ink") {
      const a: Ann = { id: ++nid, page, k: "ink", pts: [[u, v]], color, width: strokeW + 1 };
      snapshot();
      setAnnots((l) => [...l, a]);
      const r = el.getBoundingClientRect();
      const mv = (ev: PointerEvent) => setAnnots((l) => l.map((x) => (x.id === a.id && x.k === "ink" ? { ...x, pts: [...x.pts, [clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height)] as Pt] } : x)));
      const up = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up);
        setAnnots((l) => l.filter((x) => !(x.id === a.id && x.k === "ink" && x.pts.length < 2)));
      };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
      return;
    }
    if (tool === "highlight" || tool === "rect" || tool === "ellipse" || tool === "white") {
      const a: Ann = { id: ++nid, page, k: tool, x: u, y: v, w: 0.001, h: 0.001, color, width: strokeW };
      snapshot();
      setAnnots((l) => [...l, a]);
      setSelected(a.id);
      const r = el.getBoundingClientRect();
      const mv = (ev: PointerEvent) => {
        const cx = clamp((ev.clientX - r.left) / r.width);
        const cy = clamp((ev.clientY - r.top) / r.height);
        setAnnots((l) => l.map((x) => (x.id === a.id && "w" in x ? { ...x, x: Math.min(u, cx), y: Math.min(v, cy), w: Math.abs(cx - u), h: Math.abs(cy - v) } : x)));
      };
      const up = () => {
        window.removeEventListener("pointermove", mv);
        window.removeEventListener("pointerup", up);
        setAnnots((l) => l.filter((x) => !(x.id === a.id && "w" in x && (x.w < 0.008 || x.h < 0.004))));
        setSelected((s) => s);
      };
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    }
  };

  const pickImage = async (f?: File) => {
    if (!f) return setTool("select");
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setError("Use a PNG, JPG or WebP picture.");
    try {
      setPending(await toDataUrl(f));
      setError("");
    } catch {
      setError("That picture could not be read.");
    }
  };

  async function save() {
    if (!file) return;
    setError("");
    setResult(null);
    const payload = annots.map((a) => {
      const { id, ...rest } = a;
      void id;
      return rest;
    });
    if (JSON.stringify(payload).length > 3_800_000) return setError("The pictures and drawings are too large to save in one go. Remove a few or use smaller pictures.");
    try {
      setBusy("upload");
      setPct(0);
      const up = await uploadFile(file, cfg?.mode ?? "off", setPct);
      setBusy("process");
      setResult(await runTool("edit-pdf", [up], { annotations: payload }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy("");
    }
  }

  // rough size after saving: the original plus the pictures, drawings and text that get added
  const extra = annots.reduce((n, a) => n + (a.k === "image" ? Math.round(a.data.length * 0.75) : a.k === "ink" ? a.pts.length * 14 + 200 : a.k === "text" ? 300 + a.text.length * 2 : 220), 0);
  const selAnn = annots.find((a) => a.id === selected) ?? null;
  const goto = (n: number) => pageEls.current.get(clamp(n, 0, sizes.length - 1))?.scrollIntoView({ block: "start", behavior: "smooth" });

  /* ----- no file yet ----- */
  if (!doc || !file) {
    return (
      <Card title="Open a PDF to edit">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) open(e.dataTransfer.files[0]); }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 border-2 border-dashed px-4 py-12 text-center transition ${over ? "border-accent bg-white" : "border-stone-300 bg-stone-50 hover:bg-white"}`}
        >
          <input type="file" hidden accept="application/pdf,.pdf" onChange={(e) => { if (e.target.files?.[0]) open(e.target.files[0]); e.target.value = ""; }} />
          <strong className="text-sm text-stone-900">{loading ? "Opening…" : "Drop a PDF here, or click to choose"}</strong>
          <small className="text-[11px] text-stone-500">Up to {size(cfg?.maxFileBytes ?? 100 * 1048576)}. The pages open here in your browser; the file is only sent to the server when you press Save.</small>
        </label>
        {error && <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
      </Card>
    );
  }

  const isText = selAnn?.k === "text";
  const canColor = tool !== "select" && tool !== "white" && tool !== "image" ? true : !!selAnn && selAnn.k !== "white" && selAnn.k !== "image";
  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-20 space-y-2 border border-stone-300 bg-white/95 p-2.5 backdrop-blur">
        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" onClick={() => chooseTool(t.id)} aria-pressed={tool === t.id} title={t.label} className={`inline-flex h-9 items-center gap-1.5 border px-2.5 text-xs font-semibold transition ${tool === t.id ? "border-accent bg-accent text-white" : "border-stone-300 bg-white text-stone-800 hover:bg-stone-100"}`}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
          <button type="button" onClick={() => setSig(true)} className="inline-flex h-9 items-center gap-1.5 border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-800 hover:bg-stone-100" title="Signature">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 18c3-6 5-9 6-6s2 5 4 1 3-4 5-2M3 21h18" /></svg>
            <span className="hidden sm:inline">Signature</span>
          </button>
          <span className="mx-1 h-6 w-px bg-stone-300" />
          <button type="button" className={btnSm} onClick={undo} disabled={!past.length}>Undo</button>
          <button type="button" className={btnSm} onClick={removeSel} disabled={selected == null}>Delete</button>
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" className={btnSm} onClick={() => setZoom((z) => clamp(+(z - 0.15).toFixed(2), 0.5, 1.8))} aria-label="Zoom out">−</button>
            <span className="w-10 text-center text-[11px] font-semibold text-stone-600">{Math.round(zoom * 100)}%</span>
            <button type="button" className={btnSm} onClick={() => setZoom((z) => clamp(+(z + 0.15).toFixed(2), 0.5, 1.8))} aria-label="Zoom in">+</button>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-stone-700">
          {canColor && (
            <span className="flex items-center gap-1.5" role="group" aria-label="Colour">
              {[...COLORS, "#facc15"].map((c) => (
                <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={(isText || selAnn ? (selAnn as { color?: string } | null)?.color : color) === c} onClick={() => { setColor(c); if (selAnn && "color" in selAnn) apply({ color: c } as Partial<Ann>); }} className="h-5 w-5 border border-stone-400" style={{ background: c, outline: (selAnn && "color" in selAnn ? selAnn.color : color) === c ? "2px solid var(--accent)" : "none", outlineOffset: 1 }} />
              ))}
            </span>
          )}
          {(tool === "text" || isText) && (
            <>
              <label className="flex items-center gap-1.5">Size
                <input type="range" min={8} max={60} value={isText ? (selAnn as { size: number }).size : textSize} onChange={(e) => { const v = +e.target.value; setTextSize(v); if (isText) change(selAnn!.id, { size: v } as Partial<Ann>); }} />
                <span className="w-6">{isText ? (selAnn as { size: number }).size : textSize}</span>
              </label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={isText ? (selAnn as { bold: boolean }).bold : bold} onChange={(e) => { setBold(e.target.checked); if (isText) apply({ bold: e.target.checked } as Partial<Ann>); }} />Bold</label>
            </>
          )}
          {(tool === "rect" || tool === "ellipse" || tool === "ink" || (selAnn && ["rect", "ellipse", "ink"].includes(selAnn.k))) && (
            <label className="flex items-center gap-1.5">Line
              <input type="range" min={1} max={10} value={selAnn && "width" in selAnn ? selAnn.width : strokeW} onChange={(e) => { const v = +e.target.value; setStrokeW(v); if (selAnn && "width" in selAnn) change(selAnn.id, { width: v } as Partial<Ann>); }} />
            </label>
          )}
          <span className="text-stone-500">
            {pending ? "Click on the page to place it." : tool === "select" ? "Click an item to move or resize it. Double-click text to edit." : tool === "text" ? "Click where the text should go." : tool === "ink" ? "Press and drag to draw." : tool === "image" ? "Choose a picture, then click to place it." : "Press and drag on the page."}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div ref={scroller} className="min-w-0">
          {sizes.map((s, i) => (
            <PageView key={i} doc={doc} index={i} base={s} width={width} tool={tool} annots={annots} selected={selected} editing={editing} color={color} strokeW={strokeW} textSize={textSize} onDown={onDown} onSelect={(id) => { setSelected(id); if (id == null) setEditing(null); }} onChange={(id, p) => change(id, p)} onEdit={setEditing} onCommit={snapshot} onRemoveEmpty={(id) => setAnnots((l) => l.filter((x) => x.id !== id))} register={register} />
          ))}
        </div>
        <aside className="space-y-3 self-start lg:sticky lg:top-[112px]">
          <Card title={result ? "Your PDF is ready" : "Save"}>
            <p className="mb-2 truncate text-xs font-semibold text-stone-800">{file.name}</p>
            <p className="mb-2 text-[11px] text-stone-500">{sizes.length} page{sizes.length === 1 ? "" : "s"} · {annots.length} edit{annots.length === 1 ? "" : "s"}</p>
            <dl className="mb-3 space-y-1 text-xs">
              <div className="flex justify-between"><dt className="text-stone-500">Now</dt><dd className="font-bold text-stone-900">{size(file.size)}</dd></div>
              <div className="flex justify-between"><dt className="text-stone-500">After saving</dt><dd className="font-bold text-stone-900">about {size(file.size + extra + (annots.length ? 2500 : 0))}</dd></div>
            </dl>
            {!result && (
              <button type="button" className={`${btnPrimary} w-full`} disabled={!annots.length || !!busy || cfg?.mode === "off"} onClick={save}>
                {busy === "upload" ? `Uploading ${pct}%` : busy === "process" ? "Saving…" : "Save edits"}
              </button>
            )}
            {error && <p role="alert" className="mt-3 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p>}
            {result && (
              <div className="space-y-2">
                {result.note && <p className="bg-stone-100 px-3 py-2 text-xs font-semibold text-stone-800">{result.note}</p>}
                <p className="text-[11px] text-stone-500">Actual size {size(result.size)}. The link works for about {cfg?.ttlMinutes ?? 30} minutes, then the file is deleted.</p>
                <a className={`${btnPrimary} w-full`} href={downloadHref(result.url)} download={result.name}>Download</a>
                <button type="button" className={`${btnPlain} w-full`} onClick={() => copy(result.url, "Link copied.")}>Copy link</button>
                <button type="button" className={`${btnPlain} w-full`} onClick={() => { deleteResult(result.url); setResult(null); }}>Keep editing</button>
              </div>
            )}
            <button type="button" className={`${btnPlain} mt-2 w-full`} onClick={() => { if (result) deleteResult(result.url); setDoc(null); setFile(null); setAnnots([]); setPast([]); setResult(null); setError(""); }}>Open another PDF</button>
          </Card>
          <div className="px-1 text-[11px] leading-relaxed text-stone-500">
            <label className="mb-2 flex items-center gap-1.5 font-semibold text-stone-700">Go to page
              <input type="number" min={1} max={sizes.length} defaultValue={1} className="w-16 border border-stone-300 px-1.5 py-1 text-xs" onKeyDown={(e) => { if (e.key === "Enter") goto(+(e.target as HTMLInputElement).value - 1); }} />
            </label>
            Edits are added on top of the page. Existing text is not changed, so use Whiteout to cover it first. Text uses English and Hindi fonts.
          </div>
        </aside>
      </div>
      <input ref={imgInput} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      {sig && <SignaturePad onClose={() => setSig(false)} onUse={(data, ratio) => { setSig(false); setPending({ data, ratio }); setTool("image"); }} />}
    </div>
  );
}
