import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }
  const url = new URL("/logowanie", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") url.searchParams.set("powrot", target);
  return NextResponse.redirect(url);
}

export const config = {
  // wszystko poza stroną logowania i zasobami statycznymi
  matcher: ["/((?!logowanie|_next/static|_next/image|favicon.ico).*)"],
};
