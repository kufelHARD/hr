import path from "node:path";
import { db } from "@/lib/db";
import { getAiSettings } from "@/lib/app-settings";
import { extractDocument } from "@/lib/extract";
import { analyzeCv } from "@/lib/ai/analyze";
import { AiError } from "@/lib/ai/client";
import { computeMatchScore, computePotentialScore, type RequirementType } from "@/lib/scoring";
import { loadScoringConfig } from "@/lib/settings";
import { readStoredFile } from "@/lib/storage";
import { normalizeForSearch } from "@/lib/text";

async function setStatus(id: string, status: string, statusMessage: string | null = null) {
  await db.application.update({ where: { id }, data: { status, statusMessage } });
}

/** Pełne przetworzenie zgłoszenia: ekstrakcja tekstu (jeśli potrzebna) → analiza AI → zapis wyniku. */
export async function processApplication(applicationId: string): Promise<void> {
  const app = await db.application.findUnique({
    where: { id: applicationId },
    include: { cvDocument: true, candidate: true, offer: true },
  });
  if (!app) return;

  try {
    // 1. Ekstrakcja tekstu (raz na dokument – współdzielona między ofertami)
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
      await setStatus(app.id, "nieczytelne", warnings[0] ?? "Nie udało się odczytać tekstu z pliku.");
      return;
    }

    // 2. Analiza względem aktualnej wersji wymagań oferty
    const version = await db.requirementVersion.findFirst({
      where: { offerId: app.offerId },
      orderBy: { version: "desc" },
      include: { requirements: { orderBy: { position: "asc" } } },
    });
    if (!version || version.requirements.length === 0) {
      await setStatus(app.id, "blad", "Oferta nie ma zapisanych wymagań – uzupełnij wymagania i uruchom analizę ponownie.");
      return;
    }

    await setStatus(app.id, "analiza", "Model AI czyta CV i ofertę…");
    const requirements = version.requirements.map((r) => ({
      code: r.code,
      text: r.text,
      type: r.type as RequirementType,
      category: r.category,
      weight: r.weight,
    }));
    const result = await analyzeCv(
      { title: app.offer.title, rawText: app.offer.rawText, requirements },
      doc.extractedText,
      // postęp widoczny na liście kandydatów (przy modelu lokalnym analiza może trwać kilkanaście minut)
      ({ generatedChars, elapsedMs }) => {
        const min = Math.floor(elapsedMs / 60000);
        const pct = Math.min(95, Math.round((generatedChars / 9000) * 100));
        void setStatus(app.id, "analiza", `Generowanie oceny: ok. ${pct}% · ${min} min`).catch(() => undefined);
      },
    );

    // 3. Wynik liczony deterministycznie przez kod
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
      // imię i nazwisko z CV, jeśli jeszcze go nie znamy (nie nadpisujemy ręcznej zmiany)
      const name = out.kandydat.imie_nazwisko?.trim();
      if (name && !app.candidate.fullName) {
        await tx.candidate.update({
          where: { id: app.candidateId },
          data: { fullName: name, fullNameNormalized: normalizeForSearch(name) },
        });
      }
      await tx.application.update({
        where: { id: app.id },
        data: {
          status: "gotowe",
          statusMessage: result.stored.missingRequirements.length
            ? `AI nie oceniło wymagań: ${result.stored.missingRequirements.join(", ")} (liczone jako „brak”).`
            : null,
        },
      });
    });
  } catch (e) {
    const message =
      e instanceof AiError ? e.message : `Błąd przetwarzania: ${(e as Error).message ?? String(e)}`;
    console.error(`[analiza] zgłoszenie ${applicationId} (${path.extname(app.cvDocument.originalFileName)}): ${message}`);
    await setStatus(app.id, "blad", message);
  }
}
