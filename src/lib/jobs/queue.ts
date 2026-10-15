import { env } from "@/lib/env";
import { processApplication } from "./process";

// Prosta kolejka analiz w procesie aplikacji. Stan zadań jest w bazie (Application.status),
// więc po restarcie aplikacji niedokończone zadania są wznawiane (resumePendingJobs).

type QueueState = { pending: string[]; running: Set<string> };

const g = globalThis as unknown as { __analysisQueue?: QueueState };
const state: QueueState = (g.__analysisQueue ??= { pending: [], running: new Set() });

export function enqueueApplication(applicationId: string) {
  if (state.running.has(applicationId) || state.pending.includes(applicationId)) return;
  state.pending.push(applicationId);
  pump();
}

export function queueSnapshot() {
  return { pending: state.pending.length, running: state.running.size };
}

function pump() {
  while (state.running.size < env.analysisConcurrency && state.pending.length > 0) {
    const id = state.pending.shift()!;
    state.running.add(id);
    processApplication(id)
      .catch((e) => console.error(`[kolejka] zgłoszenie ${id}: ${(e as Error).message}`))
      .finally(() => {
        state.running.delete(id);
        pump();
      });
  }
}

/** Ponowne zakolejkowanie zadań przerwanych zamknięciem aplikacji. */
export async function resumePendingJobs() {
  const { db } = await import("@/lib/db");
  const pending = await db.application.findMany({
    where: { status: { in: ["oczekuje", "ekstrakcja", "analiza"] } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
  });
  for (const a of pending) enqueueApplication(a.id);
  if (pending.length) console.log(`[kolejka] wznowiono ${pending.length} zadań analizy`);
}
