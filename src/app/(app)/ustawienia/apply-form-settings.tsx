"use client";

import { useState, useTransition } from "react";
import { saveApplyFormAction } from "../actions";
import { Button } from "@/components/ui";

type Cfg = { nazwa_firmy: string; zgoda_rekrutacja: string; zgoda_przyszle: string; podziekowanie: string; maks_rozmiar_mb: number };

export function ApplyFormSettings({ publicUrl, envUrl, config, clause }: { publicUrl: string; envUrl: boolean; config: Cfg; clause: string }) {
  const [url, setUrl] = useState(publicUrl);
  const [cfg, setCfg] = useState(config);
  const [text, setText] = useState(clause);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const field = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  const set = (k: keyof Cfg, v: string | number) => setCfg((c) => ({ ...c, [k]: v }));
  return (
    <div className="space-y-4">
      <label className="block max-w-xl">
        <span className="text-sm font-medium text-slate-700">Adres publiczny ATS</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} disabled={envUrl} placeholder="https://kariera.summ-it.pl" className={field} />
        <span className="mt-1 block text-xs text-slate-500">
          {envUrl
            ? "Ustawiony w konfiguracji serwera (PUBLIC_URL)."
            : "Adres, pod którym kandydaci z internetu otwierają formularz – z niego powstają linki do ogłoszeń."}
        </span>
      </label>
      <div className="grid gap-4 md:grid-cols-[1fr_160px]">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Nazwa firmy na formularzu</span>
          <input value={cfg.nazwa_firmy} onChange={(e) => set("nazwa_firmy", e.target.value)} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Maks. rozmiar CV (MB)</span>
          <input type="number" min={1} max={30} value={cfg.maks_rozmiar_mb} onChange={(e) => set("maks_rozmiar_mb", Number(e.target.value))} className={field} />
        </label>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Zgoda na bieżącą rekrutację (wymagana)</span>
        <textarea rows={2} value={cfg.zgoda_rekrutacja} onChange={(e) => set("zgoda_rekrutacja", e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Zgoda na przyszłe rekrutacje (opcjonalna)</span>
        <textarea rows={2} value={cfg.zgoda_przyszle} onChange={(e) => set("zgoda_przyszle", e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Podziękowanie po wysłaniu</span>
        <input value={cfg.podziekowanie} onChange={(e) => set("podziekowanie", e.target.value)} className={field} />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Klauzula informacyjna RODO (Markdown)</span>
        <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} className={`${field} font-mono text-xs`} />
        <span className="mt-1 block text-xs text-amber-700">Uzupełnij dane w nawiasach [ ] i zatwierdź treść z IOD przed udostępnieniem linków kandydatom.</span>
      </label>
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveApplyFormAction({ publicUrl: envUrl ? "" : url, config: cfg, clause: text });
              setMsg(r.error ? { text: r.error, error: true } : { text: r.message ?? "Zapisano", error: false });
            })
          }
        >
          {pending ? "Zapisywanie…" : "Zapisz ustawienia formularza"}
        </Button>
        {msg && <span className={msg.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
