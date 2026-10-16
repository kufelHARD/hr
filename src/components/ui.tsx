import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const buttonStyles = {
  primary: `${buttonBase} bg-brand-600 text-white hover:bg-brand-700`,
  secondary: `${buttonBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`,
  danger: `${buttonBase} border border-red-200 bg-white text-red-700 hover:bg-red-50`,
  ghost: `${buttonBase} text-slate-600 hover:bg-slate-100`,
};

export function Button({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return <button {...props} className={cx(buttonStyles[variant], className)} />;
}

export function LinkButton({
  variant = "secondary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link {...props} className={cx(buttonStyles[variant], className)} />;
}

export function Card({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          {title && <h2 className="font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const badgeTones = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "slate", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeTones[tone])}>
      {children}
    </span>
  );
}

export const REQUIREMENT_STATUS_TONE: Record<string, BadgeTone> = {
  pelne: "green",
  pokrewne: "blue",
  czesciowe: "amber",
  brak: "red",
};

export const RECOMMENDATION_TONE: Record<string, BadgeTone> = {
  zaprosic: "green",
  do_rozwazenia: "amber",
  slabe_dopasowanie: "red",
};

export function scoreTone(score: number | null | undefined): BadgeTone {
  if (score === null || score === undefined) return "slate";
  if (score >= 70) return "green";
  if (score >= 45) return "amber";
  return "red";
}

const scoreColor: Record<BadgeTone, string> = {
  green: "#059669",
  amber: "#d97706",
  red: "#dc2626",
  slate: "#94a3b8",
  blue: "#0284c7",
  violet: "#7c3aed",
};

/** Duży okrągły wskaźnik procentowy. */
export function ScoreGauge({ label, score, hint }: { label: string; score: number | null; hint?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  const color = scoreColor[scoreTone(score)];
  return (
    <div className="flex items-center gap-4">
      <svg width="128" height="128" viewBox="0 0 128 128" role="img" aria-label={`${label}: ${score === null ? "brak" : Math.round(value) + "%"}`}>
        <circle cx="64" cy="64" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform="rotate(-90 64 64)"
        />
        <text x="64" y="72" textAnchor="middle" fontSize="28" fontWeight="700" fill="#0f172a">
          {score === null ? "–" : `${Math.round(value)}%`}
        </text>
      </svg>
      <div>
        <div className="text-lg font-semibold text-slate-800">{label}</div>
        {hint && <div className="max-w-56 text-sm text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

/** Mały pasek wyniku do list. */
export function ScoreBar({ score }: { score: number | null | undefined }) {
  const tone = scoreTone(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, background: scoreColor[tone] }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold tabular-nums">{score === null || score === undefined ? "–" : `${Math.round(score)}%`}</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {children && <div className="mt-2 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "amber", children }: { tone?: "amber" | "red" | "blue" | "green"; children: ReactNode }) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    blue: "border-sky-200 bg-sky-50 text-sky-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return <div className={cx("rounded-lg border px-4 py-3 text-sm", styles[tone])}>{children}</div>;
}

export function AiDisclaimer() {
  return (
    <Alert tone="blue">
      <strong>Ocena AI ma charakter pomocniczy. Decyzję rekrutacyjną podejmuje człowiek.</strong>
    </Alert>
  );
}

export function formatDate(d: Date | string | null | undefined, withTime = false): string {
  if (!d) return "–";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export const APPLICATION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  oczekuje: { label: "W kolejce", tone: "slate" },
  ekstrakcja: { label: "Odczyt pliku…", tone: "violet" },
  analiza: { label: "Analiza AI…", tone: "violet" },
  gotowe: { label: "Gotowe", tone: "green" },
  blad: { label: "Błąd", tone: "red" },
  nieczytelne: { label: "Nie udało się odczytać tekstu", tone: "red" },
};

export const OFFER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  szkic: { label: "Szkic", tone: "amber" },
  aktywna: { label: "Aktywna", tone: "green" },
  zarchiwizowana: { label: "Zarchiwizowana", tone: "slate" },
};

export const STAGE_INFO: Record<string, { label: string; tone: BadgeTone }> = {
  nowe: { label: "Nowe", tone: "blue" },
  selekcja: { label: "Selekcja", tone: "violet" },
  rozmowa: { label: "Rozmowa", tone: "amber" },
  oferta: { label: "Oferta", tone: "amber" },
  zatrudniony: { label: "Zatrudniony", tone: "green" },
  odrzucony: { label: "Odrzucony", tone: "slate" },
};

export const AI_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  oczekuje: { label: "AI: w kolejce", tone: "slate" },
  analiza: { label: "AI: analiza…", tone: "violet" },
  blad: { label: "AI: błąd", tone: "red" },
};
