import { NextResponse } from "next/server";
import { createOfferDraft } from "@/lib/services/offers";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Utworzenie szkicu oferty z pliku (.docx/.doc) lub wklejonej treści + propozycja wymagań od AI. */
export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("plik");
  const text = String(form.get("tresc") ?? "");
  const title = String(form.get("tytul") ?? "");

  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !text.trim()) {
    return NextResponse.json({ error: "Wgraj plik oferty lub wklej jej treść." }, { status: 400 });
  }
  const res = await createOfferDraft({
    title,
    text: hasFile ? undefined : text,
    file: hasFile ? { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) } : undefined,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ offerId: res.offerId });
}
