"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, cx } from "@/components/ui";

type Result = {
  name: string;
  state: "czeka" | "przetwarzanie" | "ok" | "błąd";
  offerId?: string;
  activated?: boolean;
  requirementCount?: number;
  message?: string;
};

const ACCEPT = ".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

export function NewOfferForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"plik" | "tekst">("plik");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [auto, setAuto] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  async function send(fd: FormData) {
    const res = await fetch("/api/oferty", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Błąd serwera (${res.status})`);
    return data as { offerId: string; activated: boolean; requirementCount: number; aiError?: string };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "plik" && files.length === 0) return setError("Wybierz plik(i) oferty.");
    if (mode === "tekst" && text.trim().length < 50) return setError("Wklej pełną treść oferty.");
    setBusy(true);

    // pojedyncza oferta – od razu przejście do oferty (lub do przeglądu wymagań)
    if (mode === "tekst" || files.length === 1) {
      try {
        const fd = new FormData();
        fd.set("tytul", title);
        fd.set("auto", auto ? "1" : "0");
        if (mode === "plik") fd.set("plik", files[0]);
        else fd.set("tresc", text);
        const data = await send(fd);
        router.push(data.activated ? `/oferty/${data.offerId}` : `/oferty/${data.offerId}/wymagania`);
      } catch (err) {
        setError((err as Error).message);
        setBusy(false);
      }
      return;
    }

    // wiele plików – przetwarzanie po kolei z postępem
    const list: Result[] = files.map((f) => ({ name: f.name, state: "czeka" }));
    setResults(list);
    for (let i = 0; i < files.length; i++) {
      setResults((r) => r.map((x, j) => (j === i ? { ...x, state: "przetwarzanie" } : x)));
      try {
        const fd = new FormData();
        fd.set("auto", auto ? "1" : "0");
        fd.set("plik", files[i]);
        const data = await send(fd);
        setResults((r) =>
          r.map((x, j) =>
            j === i
              ? {
                  ...x,
                  state: "ok",
                  offerId: data.offerId,
                  activated: data.activated,
                  requirementCount: data.requirementCount,
                  message: data.aiError,
                }
              : x,
          ),
        );
      } catch (err) {
        setResults((r) => r.map((x, j) => (j === i ? { ...x, state: "błąd", message: (err as Error).message } : x)));
      }
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
        {(["plik", "tekst"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={busy}
            className={cx("rounded-md px-3 py-1.5", mode === m ? "bg-white font-medium shadow-sm" : "text-slate-500")}
          >
            {m === "plik" ? "Pliki Word (.docx)" : "Wklej treść"}
          </button>
        ))}
      </div>

      {mode === "plik" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            setFiles(Array.from(e.dataTransfer.files ?? []));
            setResults([]);
          }}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center",
            drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-500",
          )}
        >
          <input
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []));
              setResults([]);
            }}
          />
          {files.length > 0 ? (
            <span className="font-medium text-slate-800">
              {files.length === 1 ? files[0].name : `Wybrano ${files.length} plików ofert`}
            </span>
          ) : (
            <>
              <span className="font-medium text-slate-700">Przeciągnij plik(i) ofert lub kliknij, aby wybrać</span>
              <span className="mt-1 text-sm text-slate-500">.docx (zalecany) lub starszy .doc · można kilka ofert naraz</span>
            </>
          )}
        </label>
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          placeholder="Wklej pełną treść ogłoszenia…"
          className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      )}

      {(mode === "tekst" || files.length <= 1) && (
        <label className="block max-w-lg">
          <span className="text-sm font-medium text-slate-700">Tytuł oferty (opcjonalnie)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Zostaw puste – AI odczyta stanowisko z treści"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} disabled={busy} />
        <span>
          <span className="font-medium">Aktywuj ofertę od razu z wymaganiami odczytanymi przez AI</span>
          <span className="block text-slate-500">
            Wymagania (wymagane / mile widziane, kategoria, waga) zostaną automatycznie odczytane z pliku oferty. Możesz je później edytować.
            Odznacz, aby przejrzeć i poprawić wymagania przed aktywacją.
          </span>
        </span>
      </label>

      {error && <Alert tone="red">{error}</Alert>}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Odczyt ofert i wymagań…" : files.length > 1 && mode === "plik" ? `Dodaj ${files.length} oferty` : "Dodaj ofertę"}
        </Button>
        {busy && <span className="text-sm text-slate-500">Odczyt wymagań przez AI trwa zwykle 20–60 sekund na ofertę.</span>}
      </div>

      {results.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          {results.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "w-28 text-xs font-medium",
                  r.state === "ok" ? "text-emerald-700" : r.state === "błąd" ? "text-red-700" : "text-slate-500",
                )}
              >
                {r.state === "ok" ? "✓ gotowe" : r.state === "błąd" ? "✕ błąd" : r.state === "przetwarzanie" ? "odczyt…" : "w kolejce"}
              </span>
              <span className="text-slate-700">{r.name}</span>
              {r.state === "ok" && r.offerId && (
                <Link href={r.activated ? `/oferty/${r.offerId}` : `/oferty/${r.offerId}/wymagania`} className="text-brand-700 hover:underline">
                  {r.activated ? `aktywna · ${r.requirementCount} wymagań →` : "szkic – sprawdź wymagania →"}
                </Link>
              )}
              {r.message && <span className={r.state === "błąd" ? "text-red-700" : "text-amber-700"}>{r.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
