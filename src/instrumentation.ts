// Uruchamiane raz przy starcie serwera Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __startupDone?: boolean };
  if (g.__startupDone) return;
  g.__startupDone = true;

  const { resumePendingJobs } = await import("@/lib/jobs/queue");
  const { runRetention } = await import("@/lib/services/retention");

  // wznowienie analiz przerwanych zamknięciem aplikacji
  setTimeout(() => resumePendingJobs().catch((e) => console.error("[start] wznowienie kolejki:", e.message)), 2000);

  // retencja: przy starcie i raz na dobę (tylko jeśli włączona w configu)
  const retention = () => runRetention().catch((e) => console.error("[retencja]", e.message));
  setTimeout(retention, 10000);
  setInterval(retention, 24 * 60 * 60 * 1000).unref?.();
}
