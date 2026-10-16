// Uruchamiane raz przy starcie serwera Next.js.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __startupDone?: boolean };
  if (g.__startupDone) return;
  g.__startupDone = true;

  const { resumePendingJobs } = await import("@/lib/jobs/queue");
  const { runRetention } = await import("@/lib/services/retention");

  const { repairCandidateNames } = await import("@/lib/services/names");

  // wznowienie analiz przerwanych zamknięciem aplikacji; poprawa imion odczytanych przez starszą wersję
  setTimeout(() => {
    resumePendingJobs().catch((e) => console.error("[start] wznowienie kolejki:", e.message));
    repairCandidateNames()
      .then((r) => r.renamed && console.log(`[start] poprawiono imiona kandydatów: ${r.renamed}`))
      .catch((e) => console.error("[start] imiona kandydatów:", e.message));
  }, 2000);

  // „rozgrzanie” odczytu PDF i OCR, żeby pierwsze wgrane CV nie czekało na wczytanie bibliotek i modelu OCR
  setTimeout(async () => {
    try {
      const { loadPdfJs } = await import("@/lib/extract/pdf");
      await loadPdfJs();
      const { env } = await import("@/lib/env");
      if (env.ocrEnabled) await (await import("@/lib/extract/ocr")).warmUpOcr();
    } catch (e) {
      console.error("[start] przygotowanie OCR:", (e as Error).message);
    }
  }, 4000);

  // retencja: przy starcie i raz na dobę (tylko jeśli włączona w configu)
  const retention = () => runRetention().catch((e) => console.error("[retencja]", e.message));
  setTimeout(retention, 10000);
  setInterval(retention, 24 * 60 * 60 * 1000).unref?.();
}
