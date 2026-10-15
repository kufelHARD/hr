"use client";

import { useState, useTransition } from "react";
import { saveCompanyContextAction, saveTechMapAction } from "../actions";
import { Button } from "@/components/ui";

function Status({ msg }: { msg: { text: string; error: boolean } | null }) {
  if (!msg) return null;
  return <span className={msg.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{msg.text}</span>;
}

export function CompanyContextForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMsg(null);
        }}
        rows={18}
        className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={pending || value === initial}
          onClick={() =>
            start(async () => {
              const r = await saveCompanyContextAction(value);
              setMsg(r.error ? { text: r.error, error: true } : { text: r.message ?? "Zapisano", error: false });
            })
          }
        >
          {pending ? "Zapisywanie…" : "Zapisz opis firmy"}
        </Button>
        <Status msg={msg} />
      </div>
    </div>
  );
}

type Group = { nazwa: string; technologie: string; uwagi: string };

export function TechMapForm({ initial }: { initial: Array<{ nazwa: string; technologie: string[]; uwagi?: string }> }) {
  const [groups, setGroups] = useState<Group[]>(
    initial.map((g) => ({ nazwa: g.nazwa, technologie: g.technologie.join(", "), uwagi: g.uwagi ?? "" })),
  );
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [filter, setFilter] = useState("");

  const update = (i: number, patch: Partial<Group>) => {
    setGroups((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
    setMsg(null);
  };
  const f = filter.trim().toLowerCase();

  return (
    <div className="space-y-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtruj grupy (np. Oracle)…"
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="space-y-2">
        {groups.map((g, i) =>
          f && !`${g.nazwa} ${g.technologie}`.toLowerCase().includes(f) ? null : (
            <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[220px_1fr_auto]">
              <input value={g.nazwa} onChange={(e) => update(i, { nazwa: e.target.value })} placeholder="Nazwa grupy" className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-medium" />
              <div className="space-y-1">
                <textarea
                  value={g.technologie}
                  onChange={(e) => update(i, { technologie: e.target.value })}
                  rows={2}
                  placeholder="Technologie oddzielone przecinkami"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <input value={g.uwagi} onChange={(e) => update(i, { uwagi: e.target.value })} placeholder="Uwagi dla AI (opcjonalnie)" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600" />
              </div>
              <Button variant="ghost" className="self-start text-red-600" title="Usuń grupę" onClick={() => setGroups((gs) => gs.filter((_, j) => j !== i))}>
                ✕
              </Button>
            </div>
          ),
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setGroups((gs) => [...gs, { nazwa: "", technologie: "", uwagi: "" }])}>+ Dodaj grupę</Button>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const payload = groups.map((g) => ({
                nazwa: g.nazwa.trim(),
                technologie: g.technologie.split(",").map((t) => t.trim()).filter(Boolean),
                ...(g.uwagi.trim() ? { uwagi: g.uwagi.trim() } : {}),
              }));
              const r = await saveTechMapAction(payload);
              setMsg(r.error ? { text: r.error, error: true } : { text: r.message ?? "Zapisano", error: false });
            })
          }
        >
          {pending ? "Zapisywanie…" : "Zapisz mapę technologii"}
        </Button>
        <Status msg={msg} />
      </div>
    </div>
  );
}
