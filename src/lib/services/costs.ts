import { db } from "@/lib/db";

export type CostPeriod = { label: string; costUsd: number; calls: number; cvAnalyses: number; claudeCalls: number; localCalls: number; unknownCost: number };

async function period(label: string, from?: Date): Promise<CostPeriod> {
  const where = from ? { createdAt: { gte: from } } : {};
  const rows = await db.aiUsage.groupBy({
    by: ["provider", "kind", "success"],
    where,
    _sum: { costUsd: true },
    _count: { _all: true },
  });
  const unknown = await db.aiUsage.count({ where: { ...where, costUsd: null } });
  return {
    label,
    costUsd: rows.reduce((s, r) => s + (r._sum.costUsd ?? 0), 0),
    calls: rows.reduce((s, r) => s + r._count._all, 0),
    cvAnalyses: rows.filter((r) => r.kind === "analiza" && r.success).reduce((s, r) => s + r._count._all, 0),
    claudeCalls: rows.filter((r) => r.provider === "claude").reduce((s, r) => s + r._count._all, 0),
    localCalls: rows.filter((r) => r.provider === "ollama").reduce((s, r) => s + r._count._all, 0),
    unknownCost: unknown,
  };
}

/** Zestawienie kosztów AI: bieżący miesiąc, ostatnie 30 dni, łącznie + średni koszt analizy CV w Claude. */
export async function costSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [month, last30, all] = await Promise.all([
    period("Bieżący miesiąc", monthStart),
    period("Ostatnie 30 dni", new Date(now.getTime() - 30 * 24 * 3600 * 1000)),
    period("Łącznie"),
  ]);
  const claudeCv = await db.analysis.aggregate({
    where: { provider: "claude", costUsd: { not: null } },
    _avg: { costUsd: true },
    _count: { _all: true },
  });
  return { periods: [month, last30, all], avgClaudeCvUsd: claudeCv._avg.costUsd, claudeCvCount: claudeCv._count._all };
}
