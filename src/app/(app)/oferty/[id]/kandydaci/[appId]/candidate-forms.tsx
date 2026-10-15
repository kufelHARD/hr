"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { assignToOfferAction, renameCandidateAction, saveNotesAction, setConsentAction } from "../../../../actions";
import { Button } from "@/components/ui";

export function NotesForm({ applicationId, initial, readOnly }: { applicationId: string; initial: string; readOnly: boolean }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== initial && saved === null;
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(null);
        }}
        readOnly={readOnly}
        rows={6}
        placeholder={readOnly ? "Brak notatek" : "Własne notatki rekrutera (widoczne tylko w tej aplikacji)…"}
        className="w-full rounded-lg border border-slate-300 p-3 text-sm"
      />
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={pending || (!dirty && saved !== null) || value === initial}
            onClick={() =>
              start(async () => {
                const r = await saveNotesAction(applicationId, value);
                setSaved(r.message ?? "Zapisano");
              })
            }
          >
            {pending ? "Zapisywanie…" : "Zapisz notatki"}
          </Button>
          {saved && <span className="text-sm text-emerald-700">{saved}</span>}
        </div>
      )}
    </div>
  );
}

export function ConsentToggle({ candidateId, initial, consentAt }: { candidateId: string; initial: boolean; consentAt: string | null }) {
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5"
        checked={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(async () => {
            await setConsentAction(candidateId, next);
            router.refresh();
          });
        }}
      />
      <span>
        Zgoda na udział w przyszłych rekrutacjach
        {value && consentAt && <span className="block text-xs text-slate-500">odnotowano {consentAt}</span>}
        {!value && <span className="block text-xs text-slate-500">Bez zgody dane należy usunąć po zakończeniu procesu.</span>}
      </span>
    </label>
  );
}

export function RenameForm({ candidateId, initial }: { candidateId: string; initial: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)} className="text-xs text-slate-400 hover:text-slate-700" title="Popraw imię i nazwisko">
        ✎ zmień
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <input value={value} onChange={(e) => setValue(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-sm" autoFocus />
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await renameCandidateAction(candidateId, value);
            setEditing(false);
            router.refresh();
          })
        }
      >
        Zapisz
      </Button>
    </span>
  );
}

export function AssignForm({ candidateId, offers }: { candidateId: string; offers: Array<{ id: string; title: string }> }) {
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (offers.length === 0) return <p className="text-sm text-slate-500">Brak innych aktywnych ofert.</p>;
  return (
    <div className="space-y-2">
      <select value={offerId} onChange={(e) => setOfferId(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
        {offers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.title}
          </option>
        ))}
      </select>
      <Button
        disabled={pending || !offerId}
        onClick={() =>
          start(async () => {
            const r = await assignToOfferAction(candidateId, offerId);
            if (r?.error) setError(r.error);
          })
        }
      >
        {pending ? "Przypisywanie…" : "Przypisz i analizuj"}
      </Button>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
