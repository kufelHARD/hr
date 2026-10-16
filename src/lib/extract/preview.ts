import mammoth from "mammoth";
import { convertDocToDocx } from "./doc";
import { headerFooterText } from "./docx";

// Podgląd CV w formacie Word w przeglądarce: DOCX → HTML (mammoth, ze zdjęciami osadzonymi jako data:),
// .doc → najpierw DOCX przez LibreOffice (jeśli jest), w ostateczności odczytany tekst.
// Strona podglądu nie zawiera skryptów i jest wyświetlana w ramce z atrybutem sandbox.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STYLE = `
  body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; background: #f1f5f9; }
  main { background: #fff; max-width: 820px; margin: 16px auto; padding: 40px 48px; box-shadow: 0 1px 3px rgb(0 0 0 / .12); }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #e2e8f0; padding: 4px 8px; vertical-align: top; }
  h1, h2, h3 { line-height: 1.25; margin: 1em 0 .4em; }
  p { margin: .3em 0; }
  ul, ol { margin: .3em 0; padding-left: 1.4em; }
  .hf { color: #64748b; font-size: 12px; border-bottom: 1px dashed #cbd5e1; margin-bottom: 16px; padding-bottom: 8px; }
  pre { white-space: pre-wrap; font: inherit; }
`;

export function previewDocument(title: string, body: string): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

export async function docxPreviewHtml(buffer: Buffer): Promise<string> {
  const [result, hf] = await Promise.all([
    mammoth.convertToHtml({ buffer }, { convertImage: mammoth.images.dataUri }),
    headerFooterText(buffer).catch(() => [] as string[]),
  ]);
  // linki bez „javascript:” itp. – podgląd i tak jest w ramce bez skryptów
  const html = result.value.replace(/href="(?!https?:|mailto:|tel:|#)[^"]*"/gi, 'href="#"');
  const header = hf.length ? `<div class="hf">${hf.map(escapeHtml).join("<br>")}</div>` : "";
  return header + html;
}

/** HTML podglądu dla pliku Word (.docx / .doc); `fallbackText` – tekst odczytany z CV, gdy konwersja się nie uda. */
export async function wordPreviewBody(buffer: Buffer, kind: "docx" | "doc", fallbackText: string | null): Promise<string> {
  try {
    const docx = kind === "doc" ? await convertDocToDocx(buffer) : buffer;
    return await docxPreviewHtml(docx);
  } catch {
    return `<p style="color:#64748b">Podgląd formatowania niedostępny – poniżej tekst odczytany z pliku.</p><pre>${escapeHtml(fallbackText ?? "(brak tekstu)")}</pre>`;
  }
}
