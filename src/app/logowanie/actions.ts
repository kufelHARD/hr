"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!process.env.APP_PASSWORD) {
    return { error: "Hasło aplikacji nie jest skonfigurowane. Ustaw APP_PASSWORD w pliku .env." };
  }
  const password = String(formData.get("haslo") ?? "");
  if (!(await checkPassword(password))) {
    await new Promise((r) => setTimeout(r, 800)); // spowolnienie prób zgadywania
    return { error: "Nieprawidłowe hasło." };
  }
  const { token, expires } = await createSessionToken();
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires,
  });
  const back = String(formData.get("powrot") ?? "/");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/logowanie");
}
