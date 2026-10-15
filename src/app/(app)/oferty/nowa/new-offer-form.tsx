"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, cx } from "@/components/ui";

export function NewOfferForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"plik" | "tekst">("plik");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "plik" && !file) return setError("Wybierz plik oferty.");
    if (mode === "tekst" && text.trim().length < 50) return setError("Wklej pełną treść oferty.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("tytul", title);
      if (mode === "plik" && file) fd.set("plik", file);
      else fd.set("tresc", text);
      const res = await fetch("/api/oferty", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Błąd serwera (${res.status})`);
      router.push(`/oferty/${data.offerId}/wymagania`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-sm">
        {(["plik", "tekst"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cx("rounded-md px-3 py-1.5", mode === m ? "bg-white font-medium shadow-sm" : "text-slate-500")}
          >
            {m === "plik" ? "Plik Word (.docx)" : "Wklej treść"}
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
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center",
            drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-white hover:border-brand-500",
          )}
        >
          <input
            type="file"
            accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <span className="font-medium text-slate-800">{file.name}</span>
          ) : (
            <>
              <span className="font-medium text-slate-700">Przeciągnij plik oferty lub kliknij, aby wybrać</span>
              <span className="mt-1 text-sm text-slate-500">.docx (zalecany) lub starszy .doc</span>
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

      <label className="block max-w-lg">
        <span className="text-sm font-medium text-slate-700">Tytuł oferty (opcjonalnie)</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Zostaw puste – AI odczyta stanowisko z treści"
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>

      {error && <Alert tone="red">{error}</Alert>}

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Odczyt oferty i analiza wymagań…" : "Dalej: wyodrębnij wymagania"}
        </Button>
        {busy && <span className="text-sm text-slate-500">To zwykle trwa 10–60 sekund.</span>}
      </div>
    </form>
  );
}
