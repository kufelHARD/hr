import path from "node:path";
import { layoutPage, type TextBox } from "./pdf-layout";

// Strona uznana za „bez warstwy tekstowej”, jeśli ma mniej znaków niż próg (np. skan z numerem strony).
export const MIN_CHARS_PER_PAGE = 40;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Folder pakietu w node_modules aplikacji (bez require.resolve – bundler podmienia je przy budowaniu). */
export function packageDir(name: string): string {
  return path.join(process.cwd(), "node_modules", ...name.split("/"));
}

function pdfjsDir(): string {
  return packageDir("pdfjs-dist");
}

export async function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

export async function openPdf(data: Uint8Array) {
  const pdfjs = await loadPdfJs();
  const dir = pdfjsDir();
  const task = pdfjs.getDocument({
    data,
    disableFontFace: true,
    useSystemFonts: false,
    standardFontDataUrl: path.join(dir, "standard_fonts") + path.sep,
    cMapUrl: path.join(dir, "cmaps") + path.sep,
    cMapPacked: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  return { doc, close: () => task.destroy() };
}

export type PdfPageText = { pageNumber: number; text: string; charCount: number };

/** Ekstrakcja tekstu ze wszystkich stron z odtworzeniem kolejności czytania (kolumny). */
export async function extractPdfPages(buffer: Buffer): Promise<{ pages: PdfPageText[]; pageCount: number }> {
  const { doc, close } = await openPdf(new Uint8Array(buffer));
  try {
    const pages: PdfPageText[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const boxes: TextBox[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str) continue;
        // transform = [a, b, c, d, e, f]; e,f – położenie linii bazowej; wysokość ≈ |d| (lub hypot(c,d) dla obrotu)
        const [, , c, d, e, f] = item.transform as number[];
        const fontSize = Math.hypot(c, d) || Math.abs(item.height) || 10;
        const [vx, vy] = viewport.convertToViewportPoint(e, f);
        const width = item.width || fontSize * 0.5 * item.str.length;
        boxes.push({
          text: item.str,
          x0: vx,
          x1: vx + width,
          y0: vy - fontSize * 0.85,
          y1: vy + fontSize * 0.15,
          fontSize,
        });
      }
      const text = layoutPage(boxes);
      pages.push({ pageNumber: p, text, charCount: text.replace(/\s/g, "").length });
      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await close();
  }
}

/** Renderuje stronę PDF do PNG (dla OCR). */
export async function renderPdfPageToPng(buffer: Buffer, pageNumber: number, scale = 2.5): Promise<Buffer> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { doc, close } = await openPdf(new Uint8Array(buffer));
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: null,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await close();
  }
}
