import path from "node:path";
import { env } from "@/lib/env";
import { convertDocToDocx, DocConversionUnavailableError } from "./doc";
import { extractDocx } from "./docx";
import { extractPdfPages, MIN_CHARS_PER_PAGE, renderPdfPageToPng } from "./pdf";

export type ExtractionMethod = "tekst" | "ocr" | "nieudana";

export type ExtractionResult = {
  text: string;
  method: ExtractionMethod;
  warnings: string[];
  pageCount?: number;
  /** komunikat dla użytkownika, gdy nie udało się odczytać tekstu */
  error?: string;
};

export type FileKind = "pdf" | "docx" | "doc";

export class UnsupportedFileError extends Error {}

/** Minimalna sensowna długość tekstu CV/oferty. */
const MIN_TOTAL_CHARS = 120;

/** Rozpoznanie typu pliku po zawartości (a nie tylko po rozszerzeniu). */
export function detectFileKind(buffer: Buffer, fileName: string): FileKind {
  const ext = path.extname(fileName).toLowerCase();
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  if (isZip && (ext === ".docx" || ext === ".docm" || ext === "")) return "docx";
  if (isOle && (ext === ".doc" || ext === "")) return "doc";
  if (isZip) return "docx";
  if (isOle) return "doc";
  throw new UnsupportedFileError(
    `Nieobsługiwany format pliku „${fileName}”. Obsługiwane formaty: PDF, DOCX${ext === ".doc" ? "" : " oraz DOC"}.`,
  );
}

export const MIME_BY_KIND: Record<FileKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

/** Odsetek liter wśród znaków niebiałych – niski oznacza „krzaki” z fontów bez mapowania Unicode. */
function letterRatio(text: string): number {
  const chars = text.replace(/\s/g, "");
  if (!chars.length) return 0;
  const letters = chars.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters / chars.length;
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const { pages, pageCount } = await extractPdfPages(buffer);

  const unreadable = pages.filter((p) => p.charCount < MIN_CHARS_PER_PAGE || letterRatio(p.text) < 0.5);
  let usedOcr = false;

  if (unreadable.length > 0) {
    if (!env.ocrEnabled) {
      warnings.push(`Strony bez warstwy tekstowej (${unreadable.map((p) => p.pageNumber).join(", ")}) – OCR wyłączony.`);
    } else {
      for (const p of unreadable) {
        try {
          const png = await renderPdfPageToPng(buffer, p.pageNumber);
          const { ocrImage } = await import("./ocr");
          const { text, confidence } = await ocrImage(png);
          const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
          if (clean.replace(/\s/g, "").length > p.charCount) {
            p.text = clean;
            p.charCount = clean.replace(/\s/g, "").length;
            usedOcr = true;
            if (confidence < 60) {
              warnings.push(`Strona ${p.pageNumber}: niska pewność OCR (${Math.round(confidence)}%) – tekst może zawierać błędy.`);
            }
          }
        } catch (e) {
          warnings.push(`Strona ${p.pageNumber}: OCR nie powiódł się (${(e as Error).message}).`);
        }
      }
      if (usedOcr) {
        warnings.push(
          `Tekst odczytany przez OCR (strony: ${unreadable.map((p) => p.pageNumber).join(", ")}). Sprawdź poprawność kluczowych informacji.`,
        );
      }
    }
  }

  const text = pages
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
  const total = text.replace(/\s/g, "").length;
  if (total < MIN_TOTAL_CHARS) {
    return {
      text,
      method: "nieudana",
      warnings,
      pageCount,
      error: "Nie udało się odczytać tekstu z pliku (prawdopodobnie skan słabej jakości lub obraz bez tekstu).",
    };
  }
  return { text, method: usedOcr ? "ocr" : "tekst", warnings, pageCount };
}

/** Główna funkcja ekstrakcji tekstu z pliku CV lub oferty. */
export async function extractDocument(buffer: Buffer, fileName: string): Promise<ExtractionResult> {
  const kind = detectFileKind(buffer, fileName);
  try {
    if (kind === "pdf") return await extractPdf(buffer);

    let docxBuffer = buffer;
    const warnings: string[] = [];
    if (kind === "doc") {
      docxBuffer = await convertDocToDocx(buffer);
      warnings.push("Plik .doc został automatycznie przekonwertowany do .docx (LibreOffice).");
    }
    const res = await extractDocx(docxBuffer);
    warnings.push(...res.warnings);
    if (res.text.replace(/\s/g, "").length < MIN_TOTAL_CHARS) {
      return {
        text: res.text,
        method: "nieudana",
        warnings,
        error: "Dokument nie zawiera czytelnego tekstu (np. treść wklejona jako obraz).",
      };
    }
    return { text: res.text, method: "tekst", warnings };
  } catch (e) {
    if (e instanceof DocConversionUnavailableError) {
      return { text: "", method: "nieudana", warnings: [], error: e.message };
    }
    // nie logujemy treści dokumentu – tylko komunikat błędu
    console.error(`[ekstrakcja] błąd dla pliku typu ${kind}: ${(e as Error).message}`);
    return {
      text: "",
      method: "nieudana",
      warnings: [`Szczegóły techniczne: ${(e as Error).message}`],
      error: `Nie udało się odczytać pliku (${kind.toUpperCase()}). Plik może być uszkodzony lub zabezpieczony hasłem.`,
    };
  }
}
