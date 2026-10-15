import { db } from "@/lib/db";
import { contentDisposition, readStoredFile } from "@/lib/storage";
import { MIME_BY_KIND } from "@/lib/extract";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/pliki/oferta/[id]">) {
  const { id } = await ctx.params;
  const offer = await db.jobOffer.findUnique({ where: { id } });
  if (!offer?.storedFilePath || !offer.originalFileName) return new Response("Nie znaleziono pliku", { status: 404 });
  const buffer = await readStoredFile(offer.storedFilePath);
  const mime = MIME_BY_KIND[offer.sourceType as keyof typeof MIME_BY_KIND] ?? "application/octet-stream";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": contentDisposition(offer.originalFileName, false),
      "Cache-Control": "private, no-store",
    },
  });
}
