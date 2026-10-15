import { db } from "@/lib/db";
import { contentDisposition, readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

/** Podgląd (PDF w przeglądarce) lub pobranie oryginalnego CV. ?pobierz=1 wymusza pobranie. */
export async function GET(request: Request, ctx: RouteContext<"/api/pliki/cv/[id]">) {
  const { id } = await ctx.params;
  const doc = await db.cvDocument.findUnique({ where: { id } });
  if (!doc) return new Response("Nie znaleziono pliku", { status: 404 });
  const download = new URL(request.url).searchParams.has("pobierz");
  const inline = !download && doc.mimeType === "application/pdf";
  const buffer = await readStoredFile(doc.storedFilePath);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": contentDisposition(doc.originalFileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
