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
