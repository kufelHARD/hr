import { NextResponse } from "next/server";
import { createOfferDraft } from "@/lib/services/offers";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nowa oferta z pliku (.docx/.doc) lub wklejonej treści. AI odczytuje wymagania z treści oferty;
 * z polem auto=1 oferta jest od razu aktywowana z tymi wymaganiami, inaczej trafia do szkiców do przeglądu.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("plik");
  const text = String(form.get("tresc") ?? "");
  const title = String(form.get("tytul") ?? "");
  const autoActivate = form.get("auto") === "1";

  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !text.trim()) {
    return NextResponse.json({ error: "Wgraj plik oferty lub wklej jej treść." }, { status: 400 });
  }
  const res = await createOfferDraft({
    title,
    text: hasFile ? undefined : text,
    file: hasFile ? { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) } : undefined,
    autoActivate,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json(res);
}
