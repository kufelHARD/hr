"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ApplyForm({
  slug,
  source,
  consentText,
  futureConsentText,
  thankYou,
  maxMb,
  clause,
}: {
  slug: string;
  source: string | null;
  consentText: string;
  futureConsentText: string;
  thankYou: string;
  maxMb: number;
  clause: ReactNode;
}) {
  // czas otwarcia formularza – zgłoszenia wysłane w mniej niż 3 s traktujemy jak boty
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);
  const [state, setState] = useState<"form" | "sending" | "done">("form");
  const [error, setError] = useState<{ text: string; field?: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("t", String(openedAt.current));
    const file = fd.get("plik");
    if (file instanceof File && file.size > maxMb * 1024 * 1024) {
      return setError({ text: `Plik jest za duży (maks. ${maxMb} MB).`, field: "plik" });
    }
    setState("sending");
    try {
      const url = `/api/aplikuj/${encodeURIComponent(slug)}${source ? `?zrodlo=${encodeURIComponent(source)}` : ""}`;
      const res = await fetch(url, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ text: data.error ?? "Nie udało się wysłać aplikacji. Spróbuj ponownie.", field: data.field });
        setState("form");
        return;
      }
      setState("done");
    } catch {
      setError({ text: "Brak połączenia. Spróbuj ponownie." });
      setState("form");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-lg bg-emerald-50 p-5 text-emerald-900" role="status">
        <p className="text-lg font-semibold">✓ Aplikacja wysłana</p>
        <p className="mt-1">{thankYou}</p>
      </div>
    );
  }

  const input = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
  const err = (f: string) => (error?.field === f ? "border-red-400" : "");

  return (
    <form onSubmit={submit} className="space-y-4" noValidate={false}>
      {/* pułapka na boty – pole niewidoczne dla ludzi */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Strona www
          <input type="text" name="strona_www" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Imię i nazwisko *</span>
        <input name="imie" required maxLength={120} autoComplete="name" className={`${input} ${err("imie")}`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">E-mail *</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={`${input} ${err("email")}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Telefon</span>
          <input name="telefon" type="tel" maxLength={40} autoComplete="tel" className={`${input} ${err("telefon")}`} />
        </label>
      </div>
      <label className={`block rounded-lg border-2 border-dashed px-4 py-5 text-center ${error?.field === "plik" ? "border-red-400" : "border-slate-300"} cursor-pointer hover:border-brand-500`}>
        <input
          name="plik"
          type="file"
          required
          accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        <span className="font-medium text-slate-700">{fileName ?? "Dołącz CV *"}</span>
        <span className="mt-1 block text-sm text-slate-500">PDF lub Word, maks. {maxMb} MB</span>
      </label>

      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="zgoda" value="tak" required className="mt-1 h-4 w-4 shrink-0" />
        <span>{consentText} *</span>
      </label>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" name="zgodaPrzyszle" value="tak" className="mt-1 h-4 w-4 shrink-0" />
        <span>{futureConsentText} (opcjonalnie)</span>
      </label>
      <details className="rounded-md bg-slate-50 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">Informacja o przetwarzaniu danych osobowych</summary>
        <div className="mt-2">{clause}</div>
      </details>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error.text}
        </p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-md bg-brand-600 px-4 py-3 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {state === "sending" ? "Wysyłanie…" : "Wyślij aplikację"}
      </button>
      <p className="text-xs text-slate-400">* pola wymagane</p>
    </form>
  );
}
