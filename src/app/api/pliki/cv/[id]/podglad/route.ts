import { db } from "@/lib/db";
import { readStoredFile } from "@/lib/storage";
import { previewDocument, wordPreviewBody } from "@/lib/extract/preview";

export const runtime = "nodejs";

/** Podgląd CV w formacie Word jako strona HTML (PDF wyświetla przeglądarka bezpośrednio z /api/pliki/cv/[id]). */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await db.cvDocument.findUnique({ where: { id } });
  if (!doc) return new Response("Nie znaleziono pliku", { status: 404 });
  if (doc.mimeType === "application/pdf") return Response.redirect(new URL(`/api/pliki/cv/${id}`, request.url), 302);
  const kind = doc.mimeType === "application/msword" ? "doc" : "docx";
  const body = await wordPreviewBody(await readStoredFile(doc.storedFilePath), kind, doc.extractedText);
  return new Response(previewDocument(doc.originalFileName, body), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // bez skryptów, formularzy i zasobów z zewnątrz; zdjęcia tylko osadzone (data:)
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
    },
  });
}
