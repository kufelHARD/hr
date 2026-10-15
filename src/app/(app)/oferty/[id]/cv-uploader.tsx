"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";

type Item = { name: string; state: "czeka" | "wysyłanie" | "ok" | "błąd"; message?: string };

const ACCEPT = ".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";

export function CvUploader({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    const start = items.length;
    setItems((it) => [...it, ...files.map((f) => ({ name: f.name, state: "czeka" as const }))]);
    setBusy(true);
    for (let i = 0; i < files.length; i++) {
      const idx = start + i;
      setItems((it) => it.map((x, j) => (j === idx ? { ...x, state: "wysyłanie" } : x)));
      try {
        const fd = new FormData();
        fd.set("plik", files[i]);
        const res = await fetch(`/api/oferty/${offerId}/cv`, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? `Błąd (${res.status})`);
        setItems((it) => it.map((x, j) => (j === idx ? { ...x, state: "ok", message: data.note } : x)));
      } catch (e) {
        setItems((it) => it.map((x, j) => (j === idx ? { ...x, state: "błąd", message: (e as Error).message } : x)));
      }
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(Array.from(e.dataTransfer.files ?? []));
        }}
        className={cx(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50 hover:border-brand-500",
        )}
      >
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <span className="font-medium text-slate-700">Przeciągnij pliki CV tutaj lub kliknij, aby wybrać</span>
        <span className="mt-1 text-sm text-slate-500">PDF lub Word (.docx, .doc) · można wiele naraz · każde CV zostanie automatycznie przeanalizowane</span>
      </label>
      {items.length > 0 && (
        <ul className="space-y-1 text-sm">
          {items.map((it, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "inline-block w-24 text-xs font-medium",
                  it.state === "ok" && "text-emerald-700",
                  it.state === "błąd" && "text-red-700",
                  (it.state === "czeka" || it.state === "wysyłanie") && "text-slate-500",
                )}
              >
                {it.state === "ok" ? "✓ dodano" : it.state === "błąd" ? "✕ błąd" : it.state === "wysyłanie" ? "wysyłanie…" : "w kolejce"}
              </span>
              <span className="text-slate-700">{it.name}</span>
              {it.message && <span className={it.state === "błąd" ? "text-red-700" : "text-slate-500"}>– {it.message}</span>}
            </li>
          ))}
        </ul>
      )}
      {!busy && items.some((i) => i.state === "ok") && (
        <p className="text-xs text-slate-500">Analiza trwa w tle (zwykle 1–3 min na CV). Lista poniżej odświeża się automatycznie.</p>
      )}
    </div>
  );
}
