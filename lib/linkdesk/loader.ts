/** Loads a library from cdnjs the first time it is needed (the same builds the original LinkDesk used). */
const loading = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading.delete(src);
        reject(new Error(`Could not load ${src}`));
      };
      document.head.appendChild(s);
    });
    loading.set(src, p);
  }
  return p;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Lib = any;

export async function getXLSX(): Promise<Lib> {
  const w = window as unknown as { XLSX?: Lib };
  if (!w.XLSX) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  if (!w.XLSX) throw new Error("The spreadsheet reader did not load.");
  return w.XLSX;
}
