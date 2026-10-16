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

function toDirUrl(dir: string): string {
  return `${dir.replace(/\\/g, "/")}/`;
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
    // pdfjs wymaga ukośnika „/” na końcu – także na Windows (fs.readFile akceptuje „/” w ścieżkach)
    standardFontDataUrl: toDirUrl(path.join(dir, "standard_fonts")),
    cMapUrl: toDirUrl(path.join(dir, "cmaps")),
    cMapPacked: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  return { doc, close: () => task.destroy() };
}

export type PdfPageText = {
  pageNumber: number;
  text: string;
  charCount: number;
  /** grafika na stronie z małą ilością tekstu: obrazy i ścieżki wektorowe (np. skan albo tekst zamieniony na krzywe) */
  graphics?: { images: number; paths: number };
};

/** Liczy obrazy i ścieżki na stronie – strona bez nich nie ma czego rozpoznawać przez OCR. */
async function pageGraphics(page: Awaited<ReturnType<Awaited<ReturnType<typeof openPdf>>["doc"]["getPage"]>>) {
  const { OPS } = await loadPdfJs();
  const imageOps = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup, OPS.paintImageMaskXObjectGroup]);
  const list = await page.getOperatorList();
  let images = 0;
  let paths = 0;
  for (const fn of list.fnArray) {
    if (imageOps.has(fn)) images++;
    else if (fn === OPS.constructPath) paths++;
  }
  return { images, paths };
}

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
      const charCount = text.replace(/\s/g, "").length;
      const graphics = charCount < MIN_CHARS_PER_PAGE ? await pageGraphics(page) : undefined;
      pages.push({ pageNumber: p, text, charCount, graphics });
      page.cleanup();
    }
    return { pages, pageCount: doc.numPages };
  } finally {
    await close();
  }
}

/** Renderuje strony PDF do PNG (dla OCR), otwierając dokument raz; strony podawane kolejno przez `onPage`. */
export async function renderPdfPagesToPng(
  buffer: Buffer,
  pageNumbers: number[],
  onPage: (pageNumber: number, png: Buffer) => void,
  scale = 2.5,
): Promise<void> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { doc, close } = await openPdf(new Uint8Array(buffer));
  try {
    for (const pageNumber of pageNumbers) {
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
      onPage(pageNumber, canvas.toBuffer("image/png"));
      page.cleanup();
    }
  } finally {
    await close();
  }
}

/** Renderuje jedną stronę PDF do PNG. */
export async function renderPdfPageToPng(buffer: Buffer, pageNumber: number, scale = 2.5): Promise<Buffer> {
  let out: Buffer | null = null;
  await renderPdfPagesToPng(buffer, [pageNumber], (_, png) => (out = png), scale);
  return out!;
}
