import { NextResponse } from "next/server";
import { submitApplication } from "@/lib/apply/submit";
import { clientIp, rateLimit } from "@/lib/apply/rate-limit";

export const runtime = "nodejs";

/** Publiczne przyjmowanie aplikacji z formularza „Aplikuj” (bez logowania). */
export async function POST(request: Request, ctx: RouteContext<"/api/aplikuj/[slug]">) {
  const { slug } = await ctx.params;
  const ip = clientIp(request.headers);
  if (!rateLimit(`aplikuj:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Zbyt wiele zgłoszeń z tego adresu. Spróbuj ponownie później." }, { status: 429 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Nieprawidłowe dane formularza." }, { status: 400 });
  }
  // pułapka na boty: wypełnione ukryte pole albo wysyłka szybciej niż w 3 s od otwarcia strony
  const tooFast = Date.now() - Number(form.get("t") ?? 0) < 3000;
  if (String(form.get("strona_www") ?? "") !== "" || tooFast) {
    return NextResponse.json({ ok: true }); // udajemy sukces – bot nie dostaje informacji zwrotnej
  }
  const file = form.get("plik");
  const res = await submitApplication({
    slug,
    source: new URL(request.url).searchParams.get("zrodlo"),
    fields: {
      imie: String(form.get("imie") ?? ""),
      email: String(form.get("email") ?? ""),
      telefon: String(form.get("telefon") ?? ""),
      zgoda: String(form.get("zgoda") ?? ""),
      zgodaPrzyszle: String(form.get("zgodaPrzyszle") ?? ""),
    },
    file: file instanceof File && file.size > 0 ? { name: file.name, buffer: Buffer.from(await file.arrayBuffer()) } : null,
  });
  if (!res.ok) return NextResponse.json({ error: res.error, field: res.field }, { status: 400 });
  return NextResponse.json({ ok: true });
}
