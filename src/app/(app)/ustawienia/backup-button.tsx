"use client";

import { useState, useTransition } from "react";
import { createBackupAction } from "../actions";
import { Button } from "@/components/ui";

export function BackupButton() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ text: string; error: boolean; fileName?: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await createBackupAction();
            setRes(r.error ? { text: r.error, error: true } : { text: r.message ?? "", error: false, fileName: r.fileName });
          })
        }
      >
        {pending ? "Tworzenie kopii…" : "Utwórz kopię zapasową"}
      </Button>
      {res && (
        <p className={res.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>
          {res.text}
          {res.fileName && (
            <>
              {" "}
              <a href={`/api/kopia/${encodeURIComponent(res.fileName)}`} className="font-medium underline">
                Pobierz
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
