"use client";

import { useState, useTransition } from "react";
import { saveRequirementsAction } from "../../../actions";
import { Alert, Badge, Button, cx } from "@/components/ui";
import { CATEGORY_LABELS, REQUIREMENT_CATEGORIES, type RequirementCategory } from "@/lib/ai/schemas";

export type EditableRequirement = {
  key: string;
  text: string;
  type: "wymagane" | "mile_widziane";
  category: RequirementCategory;
  weight: number;
  inferred: boolean;
  source?: string | null;
};

let keySeq = 0;
export const newKey = () => `k${Date.now()}-${keySeq++}`;

export function RequirementsEditor({
  offerId,
  initial,
  details,
  isDraft,
  candidateCount,
}: {
  offerId: string;
  initial: EditableRequirement[];
  details: { title: string; area: string; level: string };
  isDraft: boolean;
  candidateCount: number;
}) {
  const [rows, setRows] = useState<EditableRequirement[]>(initial);
  const [title, setTitle] = useState(details.title);
  const [area, setArea] = useState(details.area);
  const [level, setLevel] = useState(details.level);
  const [note, setNote] = useState("");
  const [reanalyze, setReanalyze] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const update = (key: string, patch: Partial<EditableRequirement>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, dir: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const j = index + dir;
      if (j < 0 || j >= next.length) return rs;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  const required = rows.filter((r) => r.type === "wymagane").length;

  function save() {
    setError(null);
    const empty = rows.findIndex((r) => r.text.trim().length < 2);
    if (empty >= 0) return setError(`Wymaganie nr ${empty + 1} jest puste.`);
    if (rows.length === 0) return setError("Dodaj co najmniej jedno wymaganie.");
    start(async () => {
      const res = await saveRequirementsAction({
        offerId,
        title,
        area,
        level,
        note,
        reanalyze: !isDraft && reanalyze,
        requirements: rows.map(({ text, type, category, weight, inferred, source }) => ({
          text,
          type,
          category,
          weight,
          inferred,
          source: source ?? null,
        })),
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-1">
          <span className="text-sm font-medium text-slate-700">Stanowisko</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Dział / obszar</span>
          <input value={area} onChange={(e) => setArea(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Poziom</span>
          <input value={level} onChange={(e) => setLevel(e.target.value)} placeholder="np. mid / senior" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="text-sm text-slate-500">
        {rows.length} wymagań · {required} wymaganych · {rows.length - required} mile widzianych. Waga: 1 = pomocnicze, 2 = ważne,
        3 = kluczowe. „Wymagane” liczą się podwójnie względem „mile widzianych”.
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className={cx("flex gap-3 rounded-lg border bg-white p-3", r.inferred ? "border-amber-200" : "border-slate-200")}>
            <span className="mt-2 w-8 shrink-0 text-sm font-medium text-slate-400">R{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-2">
              <textarea
                value={r.text}
                onChange={(e) => update(r.key, { text: e.target.value })}
                rows={Math.min(4, Math.max(1, Math.ceil(r.text.length / 110)))}
                aria-label={`Treść wymagania R${i + 1}`}
                className="block w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={r.type}
                  onChange={(e) => update(r.key, { type: e.target.value as EditableRequirement["type"] })}
                  aria-label="Typ"
                  className={cx(
                    "rounded-md border px-2 py-1.5 text-sm",
                    r.type === "wymagane" ? "border-brand-500 bg-brand-50 text-brand-900" : "border-slate-300",
                  )}
                >
                  <option value="wymagane">Wymagane</option>
                  <option value="mile_widziane">Mile widziane</option>
                </select>
                <select
                  value={r.category}
                  onChange={(e) => update(r.key, { category: e.target.value as RequirementCategory })}
                  aria-label="Kategoria"
                  className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                >
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <span className="ml-1 text-xs text-slate-500">Waga</span>
                <div className="flex overflow-hidden rounded-md border border-slate-300" role="group" aria-label="Waga">
                  {[1, 2, 3].map((w) => (
                    <button
                      key={w}
                      type="button"
                      title={`Waga ${w}`}
                      onClick={() => update(r.key, { weight: w })}
                      className={cx("px-3 py-1.5 text-sm", r.weight === w ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                {r.inferred && (
                  <Badge tone="amber" title="AI wywnioskowało to wymaganie z zakresu obowiązków – zweryfikuj">
                    wywnioskowane
                  </Badge>
                )}
                <div className="ml-auto flex gap-1">
                  <Button type="button" variant="ghost" className="px-2 py-1" onClick={() => move(i, -1)} disabled={i === 0} title="W górę">
                    ↑
                  </Button>
                  <Button type="button" variant="ghost" className="px-2 py-1" onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="W dół">
                    ↓
                  </Button>
                  <Button type="button" variant="ghost" className="px-2 py-1 text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} title="Usuń">
                    ✕
                  </Button>
                </div>
              </div>
              {r.source && <div className="text-xs italic text-slate-500">Źródło: „{r.source}”</div>}
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        onClick={() =>
          setRows((rs) => [...rs, { key: newKey(), text: "", type: "wymagane", category: "technologia", weight: 2, inferred: false }])
        }
      >
        + Dodaj wymaganie
      </Button>

      <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        {!isDraft && (
          <>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Notatka do wersji (opcjonalnie)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="np. obniżono wagę certyfikatu" className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            </label>
            {candidateCount > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reanalyze} onChange={(e) => setReanalyze(e.target.checked)} />
                Uruchom też ponownie analizę AI dla kandydatów, którzy ją mieli (szybkie dopasowanie wszystkich {candidateCount} kandydatów przeliczy się zawsze)
              </label>
            )}
          </>
        )}
        {error && <Alert tone="red">{error}</Alert>}
        <Button type="button" variant="primary" onClick={save} disabled={pending}>
          {pending ? "Zapisywanie…" : isDraft ? "Zapisz i aktywuj ofertę" : "Zapisz jako nową wersję wymagań"}
        </Button>
      </div>
    </div>
  );
}
