"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";
import { isPasswordConfigured, setPassword } from "@/lib/app-settings";

export type LoginState = { error?: string };

async function startSession(formData: FormData) {
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

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!isPasswordConfigured()) return { error: "Hasło nie jest jeszcze ustawione – odśwież stronę." };
  const password = String(formData.get("haslo") ?? "");
  if (!(await checkPassword(password))) {
    await new Promise((r) => setTimeout(r, 800)); // spowolnienie prób zgadywania
    return { error: "Nieprawidłowe hasło." };
  }
  await startSession(formData);
  return {};
}

/** Pierwsze uruchomienie: ustawienie hasła aplikacji (możliwe tylko, gdy żadne hasło nie istnieje). */
export async function setupPassword(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (isPasswordConfigured()) return { error: "Hasło jest już ustawione." };
  const password = String(formData.get("haslo") ?? "");
  const repeat = String(formData.get("haslo2") ?? "");
  if (password.length < 8) return { error: "Hasło musi mieć co najmniej 8 znaków." };
  if (password !== repeat) return { error: "Hasła nie są takie same." };
  setPassword(password);
  await startSession(formData);
  return {};
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/logowanie");
}
