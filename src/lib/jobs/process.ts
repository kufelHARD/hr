import path from "node:path";
import { db } from "@/lib/db";
import { getAiSettings } from "@/lib/app-settings";
import { extractDocument } from "@/lib/extract";
import { analyzeCv } from "@/lib/ai/analyze";
import { AiError } from "@/lib/ai/client";
import { quickMatch, guessCandidateName } from "@/lib/matching";
import { computeMatchScore, computePotentialScore, type RequirementType } from "@/lib/scoring";
import { loadScoringConfig, loadTechMap } from "@/lib/settings";
import { readStoredFile } from "@/lib/storage";
import { normalizeForSearch } from "@/lib/text";

// Przetwarzanie zgłoszenia w dwóch krokach:
//  1. processApplication – ekstrakcja tekstu + natychmiastowe dopasowanie bez AI (sekundy),
//  2. processAiAnalysis – pogłębiona analiza AI, uruchamiana na żądanie rekrutera.

async function setStatus(id: string, status: string, statusMessage: string | null = null) {
  await db.application.update({ where: { id }, data: { status, statusMessage } });
}

async function setAiStatus(id: string, aiStatus: string | null, aiStatusMessage: string | null = null) {
  await db.application.update({ where: { id }, data: { aiStatus, aiStatusMessage } });
}

async function currentVersion(offerId: string) {
  return db.requirementVersion.findFirst({
    where: { offerId },
    orderBy: { version: "desc" },
    include: { requirements: { orderBy: { position: "asc" } } },
  });
}

function toRequirements(version: NonNullable<Awaited<ReturnType<typeof currentVersion>>>) {
  return version.requirements.map((r) => ({
    code: r.code,
    text: r.text,
    type: r.type as RequirementType,
    category: r.category,
    weight: r.weight,
  }));
}

/** Szybkie dopasowanie (bez AI) do aktualnej wersji wymagań – zapisywane jako nowy wynik. */
export async function runQuickMatch(applicationId: string): Promise<void> {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { cvDocument: true, candidate: true } });
  if (!app?.cvDocument.extractedText || app.cvDocument.extractionMethod === "nieudana") return;
  const version = await currentVersion(app.offerId);
  if (!version || version.requirements.length === 0) return;
  const [techMap, scoring] = await Promise.all([loadTechMap(), loadScoringConfig()]);
  const result = quickMatch(toRequirements(version), app.cvDocument.extractedText, techMap, scoring);
  await db.quickMatch.create({
    data: { applicationId: app.id, requirementVersionId: version.id, score: result.score, resultJson: JSON.stringify(result) },
  });
  // imię i nazwisko z nagłówka CV, jeśli jeszcze go nie znamy
  if (!app.candidate.fullName) {
    const name = guessCandidateName(app.cvDocument.extractedText);
    if (name) {
      await db.candidate.update({ where: { id: app.candidateId }, data: { fullName: name, fullNameNormalized: normalizeForSearch(name) } });
    }
  }
}

/** Krok 1: ekstrakcja tekstu (jeśli potrzebna) + natychmiastowe dopasowanie. */
export async function processApplication(applicationId: string): Promise<void> {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { cvDocument: true } });
  if (!app) return;
  try {
    let doc = app.cvDocument;
    if (doc.extractionMethod === null) {
      await setStatus(app.id, "ekstrakcja");
      const buffer = await readStoredFile(doc.storedFilePath);
      const res = await extractDocument(buffer, doc.originalFileName);
      doc = await db.cvDocument.update({
        where: { id: doc.id },
        data: {
          extractedText: res.text,
          textNormalized: normalizeForSearch(res.text),
          extractionMethod: res.method,
          extractionWarnings: JSON.stringify(res.error ? [res.error, ...res.warnings] : res.warnings),
          pageCount: res.pageCount ?? null,
        },
      });
    }
    if (doc.extractionMethod === "nieudana" || !doc.extractedText) {
      const warnings: string[] = doc.extractionWarnings ? JSON.parse(doc.extractionWarnings) : [];
      await setStatus(app.id, "nieczytelne", warnings.slice(0, 2).join(" ") || "Nie udało się odczytać tekstu z pliku.");
      return;
    }
    await runQuickMatch(app.id);
    await setStatus(app.id, "gotowe");
  } catch (e) {
    const message = `Błąd przetwarzania: ${(e as Error).message ?? String(e)}`;
    console.error(`[przetwarzanie] zgłoszenie ${applicationId} (${path.extname(app.cvDocument.originalFileName)}): ${message}`);
    await setStatus(app.id, "blad", message);
  }
}

/** Krok 2 (na żądanie): pogłębiona analiza AI względem aktualnej wersji wymagań. */
export async function processAiAnalysis(applicationId: string): Promise<void> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { cvDocument: true, candidate: true, offer: true },
  });
  if (!app) return;
  try {
    if (!app.cvDocument.extractedText || app.cvDocument.extractionMethod === "nieudana") {
      await setAiStatus(app.id, "blad", "Brak tekstu CV do analizy.");
      return;
    }
    const version = await currentVersion(app.offerId);
    if (!version || version.requirements.length === 0) {
      await setAiStatus(app.id, "blad", "Oferta nie ma zapisanych wymagań.");
      return;
    }

    await setAiStatus(app.id, "analiza", "Model AI czyta CV i ofertę…");
    const requirements = toRequirements(version);
    const result = await analyzeCv(
      { title: app.offer.title, rawText: app.offer.rawText, requirements },
      app.cvDocument.extractedText,
      // postęp widoczny w aplikacji (przy modelu lokalnym analiza może trwać kilka minut)
      ({ generatedChars, elapsedMs }) => {
        const min = Math.floor(elapsedMs / 60000);
        const pct = Math.min(95, Math.round((generatedChars / 9000) * 100));
        void setAiStatus(app.id, "analiza", `Generowanie oceny: ok. ${pct}% · ${min} min`).catch(() => undefined);
      },
    );

    // wynik liczony deterministycznie przez kod
    const scoring = await loadScoringConfig();
    const match = computeMatchScore(requirements, result.stored.output.wymagania, scoring);
    const potential = computePotentialScore(result.stored.output.potencjal, scoring);
    const out = result.stored.output;
    const unverified = Object.values(result.stored.evidence).filter((e) => e === "niezweryfikowany" || e === "brak_cytatu").length;

    await db.$transaction(async (tx) => {
      await tx.analysis.create({
        data: {
          applicationId: app.id,
          requirementVersionId: version.id,
          model: result.model,
          effort: result.provider === "claude" ? getAiSettings().claude.effort : null,
          provider: result.provider,
          costUsd: result.costUsd,
          promptHash: result.promptHash,
          resultJson: JSON.stringify(result.stored),
          matchScore: match.score,
          potentialScore: potential.score,
          recommendation: out.rekomendacja,
          summary: out.opis_kandydata,
          technologiesNormalized: normalizeForSearch(out.kandydat.technologie.join(" | ")),
          scoringSnapshot: JSON.stringify(scoring),
          unverifiedEvidence: unverified,
          injectionDetected: out.podejrzane_instrukcje.wykryto,
          inputTokens: result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          durationMs: result.durationMs,
        },
      });
      const name = out.kandydat.imie_nazwisko?.trim();
      if (name && !app.candidate.fullName) {
        await tx.candidate.update({ where: { id: app.candidateId }, data: { fullName: name, fullNameNormalized: normalizeForSearch(name) } });
      }
      await tx.application.update({
        where: { id: app.id },
        data: {
          aiStatus: "gotowe",
          aiStatusMessage: result.stored.missingRequirements.length
            ? `AI nie oceniło wymagań: ${result.stored.missingRequirements.join(", ")} (liczone jako „brak”).`
            : null,
        },
      });
    });
  } catch (e) {
    const message = e instanceof AiError ? e.message : `Błąd analizy AI: ${(e as Error).message ?? String(e)}`;
    console.error(`[analiza AI] zgłoszenie ${applicationId}: ${message}`);
    await setAiStatus(app.id, "blad", message);
  }
}
