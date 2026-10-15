import { NextResponse } from "next/server";
import { addCvToOffer } from "@/lib/services/candidates";

export const runtime = "nodejs";

/** Wgranie jednego CV do oferty (klient wysyła pliki pojedynczo, żeby pokazać postęp). */
export async function POST(request: Request, ctx: RouteContext<"/api/oferty/[id]/cv">) {
  const { id } = await ctx.params;
  const form = await request.formData();
  const file = form.get("plik");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Brak pliku." }, { status: 400 });
  }
  const res = await addCvToOffer(id, file.name, Buffer.from(await file.arrayBuffer()));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ applicationId: res.applicationId, note: res.note });
}
