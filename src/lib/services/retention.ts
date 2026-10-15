import { db } from "@/lib/db";
import { loadScoringConfig } from "@/lib/settings";
import { deleteCandidate } from "./candidates";

/**
 * Retencja danych (RODO): usuwa kandydatów, których ostatnie zgłoszenie jest starsze niż X dni.
 * Domyślnie wyłączona – konfiguracja w config/scoring.json → "retencja".
 */
export async function runRetention(opts: { dryRun?: boolean } = {}): Promise<{ enabled: boolean; candidates: string[] }> {
  const cfg = (await loadScoringConfig()).retencja;
  if (!cfg.wlaczona) return { enabled: false, candidates: [] };
  const cutoff = new Date(Date.now() - cfg.dni * 24 * 60 * 60 * 1000);

  const candidates = await db.candidate.findMany({
    where: {
      ...(cfg.tylko_bez_zgody ? { consentFuture: false } : {}),
      createdAt: { lt: cutoff },
      applications: { none: { createdAt: { gte: cutoff } } },
    },
    select: { id: true },
  });
  if (!opts.dryRun) {
    for (const c of candidates) await deleteCandidate(c.id);
    if (candidates.length) console.log(`[retencja] usunięto dane ${candidates.length} kandydatów (starsze niż ${cfg.dni} dni)`);
  }
  return { enabled: true, candidates: candidates.map((c) => c.id) };
}
