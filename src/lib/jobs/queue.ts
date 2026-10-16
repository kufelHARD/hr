import { env } from "@/lib/env";
import { getAiSettings } from "@/lib/app-settings";
import { processAiAnalysis, processApplication } from "./process";

// Dwie kolejki w procesie aplikacji (stan zadań jest w bazie, więc po restarcie są wznawiane):
//  - „pliki”: ekstrakcja tekstu + natychmiastowe dopasowanie (sekundy; OCR skanów dłużej),
//  - „ai”: pogłębiona analiza AI na żądanie (model lokalny – po jednej, Claude – kilka równolegle).

type Lane = { pending: string[]; running: Set<string> };
type QueueState = { files: Lane; ai: Lane };

const g = globalThis as unknown as { __queues?: QueueState };
const state: QueueState = (g.__queues ??= {
  files: { pending: [], running: new Set() },
  ai: { pending: [], running: new Set() },
});

function add(lane: Lane, id: string, limit: () => number, run: (id: string) => Promise<void>) {
  if (lane.running.has(id) || lane.pending.includes(id)) return;
  lane.pending.push(id);
  pump(lane, limit, run);
}

function pump(lane: Lane, limit: () => number, run: (id: string) => Promise<void>) {
  while (lane.running.size < limit() && lane.pending.length > 0) {
    const id = lane.pending.shift()!;
    lane.running.add(id);
    run(id)
      .catch((e) => console.error(`[kolejka] zgłoszenie ${id}: ${(e as Error).message}`))
      .finally(() => {
        lane.running.delete(id);
        pump(lane, limit, run);
      });
  }
}

const fileLimit = () => 2;
const aiLimit = () => (getAiSettings().provider === "ollama" ? 1 : env.analysisConcurrency);

/** Ekstrakcja tekstu + szybkie dopasowanie. */
export function enqueueApplication(applicationId: string) {
  add(state.files, applicationId, fileLimit, processApplication);
}

/** Pogłębiona analiza AI. */
export function enqueueAiAnalysis(applicationId: string) {
  add(state.ai, applicationId, aiLimit, processAiAnalysis);
}

export function queueSnapshot() {
  return {
    pending: state.files.pending.length + state.ai.pending.length,
    running: state.files.running.size + state.ai.running.size,
    aiPending: state.ai.pending.length,
    aiRunning: state.ai.running.size,
  };
}

/** Ponowne zakolejkowanie zadań przerwanych zamknięciem aplikacji. */
export async function resumePendingJobs() {
  const { db } = await import("@/lib/db");
  const files = await db.application.findMany({
    // „analiza” – status z wersji 1.0 (wtedy analiza AI była częścią przetwarzania pliku)
    where: { status: { in: ["oczekuje", "ekstrakcja", "analiza"] } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });
  for (const a of files) enqueueApplication(a.id);
  const ai = await db.application.findMany({
    where: { aiStatus: { in: ["oczekuje", "analiza"] } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });
  for (const a of ai) enqueueAiAnalysis(a.id);
  if (files.length + ai.length) console.log(`[kolejka] wznowiono zadania: pliki ${files.length}, analizy AI ${ai.length}`);
}
