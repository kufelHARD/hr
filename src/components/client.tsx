"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { buttonStyles, cx } from "./ui";

/** Odświeża dane strony co kilka sekund, dopóki trwa przetwarzanie. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}

type ActionResult = { ok?: boolean; error?: string; message?: string } | void;

/**
 * Przycisk wywołujący akcję serwera, opcjonalnie z potwierdzeniem.
 * Komunikat błędu/sukcesu pokazywany obok przycisku.
 */
export function ActionButton({
  action,
  confirm,
  children,
  variant = "secondary",
  className,
  pendingLabel,
}: {
  action: () => Promise<ActionResult>;
  confirm?: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
  className?: string;
  pendingLabel?: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={cx(buttonStyles[variant], className)}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          setMsg(null);
          start(async () => {
            const res = await action();
            if (res && res.error) setMsg({ text: res.error, error: true });
            else if (res && res.message) setMsg({ text: res.message, error: false });
            router.refresh();
          });
        }}
      >
        {pending ? (pendingLabel ?? "Proszę czekać…") : children}
      </button>
      {msg && <span className={cx("text-sm", msg.error ? "text-red-700" : "text-emerald-700")}>{msg.text}</span>}
    </span>
  );
}

/** Wybór etapu rekrutacji (zapis od razu po zmianie). */
export function StageSelect({
  value,
  stages,
  action,
  disabled,
}: {
  value: string;
  stages: Array<{ key: string; label: string }>;
  action: (stage: string) => Promise<ActionResult>;
  disabled?: boolean;
}) {
  const [current, setCurrent] = useState(value);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      value={current}
      disabled={disabled || pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const next = e.target.value;
        setCurrent(next);
        start(async () => {
          await action(next);
          router.refresh();
        });
      }}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
      aria-label="Etap rekrutacji"
    >
      {stages.map((s) => (
        <option key={s.key} value={s.key}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

/** Pole z linkiem i przyciskiem „Kopiuj”. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-sm font-medium text-slate-700">{label}</span>
      <input readOnly value={value} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs" />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
          } catch {
            /* np. brak HTTPS – użytkownik skopiuje ręcznie */
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className={cx(buttonStyles.secondary, "px-2.5 py-1.5")}
      >
        {copied ? "✓ Skopiowano" : "Kopiuj"}
      </button>
    </div>
  );
}

const PREVIEW_KEY = "porownywarka:ukryj-podglad-cv";

/**
 * Układ „treść + podgląd z boku”. Podgląd można ukryć (wybór zapamiętany w przeglądarce),
 * wtedy treść zajmuje całą szerokość.
 */
export function WithSidePreview({ preview, title, children }: { preview: ReactNode; title: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt preferencji dopiero po stronie przeglądarki
      setHidden(localStorage.getItem(PREVIEW_KEY) === "1");
    } catch {
      /* brak dostępu do localStorage – podgląd widoczny */
    }
  }, []);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    try {
      localStorage.setItem(PREVIEW_KEY, next ? "1" : "0");
    } catch {
      /* ignoruj */
    }
  };
  if (hidden) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <button type="button" onClick={toggle} className={cx(buttonStyles.secondary, "py-1.5")}>
            Pokaż {title}
          </button>
        </div>
        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    );
  }
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
      <div className="relative xl:sticky xl:top-4">
        {preview}
        <button
          type="button"
          onClick={toggle}
          className="absolute -top-3 right-3 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-600 shadow-sm hover:bg-slate-50"
        >
          Ukryj {title}
        </button>
      </div>
      <div className="min-w-0 space-y-6 xl:order-first">{children}</div>
    </div>
  );
}
