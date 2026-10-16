import path from "node:path";
import * as z from "zod/v4";
import { db } from "@/lib/db";
import { detectFileKind, extractDocument, UnsupportedFileError } from "@/lib/extract";
import { extractRequirements } from "@/lib/ai/requirements";
import { AiError } from "@/lib/ai/client";
import { REQUIREMENT_CATEGORIES, type OfferExtraction } from "@/lib/ai/schemas";
import { REQUIREMENT_TYPES } from "@/lib/scoring";
import { deleteStoredFile, saveFile } from "@/lib/storage";
import { deleteCandidate } from "./candidates";
import { slugify } from "@/lib/apply/sources";

/** Nadaje ofercie adres publicznego formularza (/aplikuj/<slug>), jeśli jeszcze go nie ma. */
export async function ensureOfferSlug(offerId: string): Promise<string> {
  const offer = await db.jobOffer.findUniqueOrThrow({ where: { id: offerId } });
  if (offer.slug) return offer.slug;
  for (let i = 0; i < 5; i++) {
    const slug = slugify(offer.title);
    try {
      await db.jobOffer.update({ where: { id: offerId }, data: { slug } });
      return slug;
    } catch {
      /* kolizja – kolejna próba */
    }
  }
  throw new Error("Nie udało się nadać adresu formularza.");
}

export async function setPublicApply(offerId: string, enabled: boolean) {
  await db.jobOffer.update({ where: { id: offerId }, data: { publicApply: enabled } });
}

export const MAX_OFFER_BYTES = 20 * 1024 * 1024;

export const requirementInputSchema = z.object({
  text: z.string().trim().min(2, "Treść wymagania jest za krótka"),
  type: z.enum(REQUIREMENT_TYPES),
  category: z.enum(REQUIREMENT_CATEGORIES),
  weight: z.number().int().min(1).max(3),
  inferred: z.boolean().default(false),
  source: z.string().nullish(),
});
export type RequirementInput = z.infer<typeof requirementInputSchema>;

export type CreateDraftResult =
  | { ok: true; offerId: string; activated: boolean; requirementCount: number; aiError?: string }
  | { ok: false; error: string };

/** Notatka wersji wymagań zapisanej automatycznie (bez przeglądu przez rekrutera). */
export const AUTO_VERSION_NOTE = "Wymagania wyodrębnione automatycznie z pliku oferty (AI) – niezweryfikowane przez rekrutera.";

/**
 * Nowa oferta jako szkic: ekstrakcja tekstu z pliku (lub wklejona treść) + propozycja wymagań od AI.
 * Rekruter przegląda i edytuje wymagania, a zapis tworzy wersję 1 i aktywuje ofertę.
 */
export async function createOfferDraft(input: {
  title?: string;
  file?: { name: string; buffer: Buffer };
  text?: string;
  /** true = od razu zapisz wymagania od AI jako wersję 1 i aktywuj ofertę (bez kroku przeglądu) */
  autoActivate?: boolean;
}): Promise<CreateDraftResult> {
  let rawText = input.text?.trim() ?? "";
  let sourceType = "tekst";
  let stored: string | null = null;
  let originalFileName: string | null = null;

  if (input.file) {
    const { name, buffer } = input.file;
    if (buffer.length > MAX_OFFER_BYTES) return { ok: false, error: "Plik jest za duży (maks. 20 MB)." };
    let kind;
    try {
      kind = detectFileKind(buffer, name);
    } catch (e) {
      if (e instanceof UnsupportedFileError) return { ok: false, error: e.message };
      throw e;
    }
    const res = await extractDocument(buffer, name);
    if (res.method === "nieudana") return { ok: false, error: res.error ?? "Nie udało się odczytać pliku oferty." };
    rawText = res.text;
    sourceType = kind;
    originalFileName = name;
    stored = await saveFile("offers", buffer, path.extname(name) || `.${kind}`);
  }

  if (rawText.replace(/\s/g, "").length < 50) {
    return { ok: false, error: "Treść oferty jest za krótka. Wgraj plik .docx albo wklej pełną treść ogłoszenia." };
  }

  let draft: OfferExtraction | null = null;
  let draftError: string | null = null;
  try {
    draft = await extractRequirements(rawText);
  } catch (e) {
    draftError = e instanceof AiError ? e.message : `Błąd AI: ${(e as Error).message}`;
  }

  const title = input.title?.trim() || draft?.stanowisko || originalFileName?.replace(/\.[^.]+$/, "") || "Nowa oferta";
  const offer = await db.jobOffer.create({
    data: {
      title,
      area: draft?.obszar ?? null,
      level: draft?.poziom ?? null,
      summary: draft?.podsumowanie ?? null,
      status: "szkic",
      sourceType,
      originalFileName,
      storedFilePath: stored,
      rawText,
      draftJson: draft ? JSON.stringify(draft) : null,
      draftError,
    },
  });

  if (input.autoActivate && draft) {
    const saved = await saveRequirements(
      offer.id,
      { title, area: draft.obszar, level: draft.poziom },
      draft.wymagania.map((w) => ({
        text: w.tresc,
        type: w.typ,
        category: w.kategoria,
        weight: w.waga,
        inferred: w.wywnioskowane,
        source: w.zrodlo,
      })),
      AUTO_VERSION_NOTE,
    );
    if (saved.ok) return { ok: true, offerId: offer.id, activated: true, requirementCount: draft.wymagania.length };
  }
  return {
    ok: true,
    offerId: offer.id,
    activated: false,
    requirementCount: draft?.wymagania.length ?? 0,
    aiError: draftError ?? undefined,
  };
}

/** Ponowne wyodrębnienie wymagań przez AI (np. po błędzie lub dla nowej wersji promptu). */
export async function regenerateDraft(offerId: string): Promise<{ ok: boolean; error?: string }> {
  const offer = await db.jobOffer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Oferta nie istnieje." };
  try {
    const draft = await extractRequirements(offer.rawText);
    await db.jobOffer.update({ where: { id: offerId }, data: { draftJson: JSON.stringify(draft), draftError: null } });
    return { ok: true };
  } catch (e) {
    const error = e instanceof AiError ? e.message : `Błąd AI: ${(e as Error).message}`;
    await db.jobOffer.update({ where: { id: offerId }, data: { draftError: error } });
    return { ok: false, error };
  }
}

export async function currentRequirementVersion(offerId: string) {
  return db.requirementVersion.findFirst({
    where: { offerId },
    orderBy: { version: "desc" },
    include: { requirements: { orderBy: { position: "asc" } } },
  });
}

function sameRequirements(
  a: Array<{ text: string; type: string; category: string; weight: number }>,
  b: RequirementInput[],
): boolean {
  return (
    a.length === b.length &&
    a.every((r, i) => r.text === b[i].text && r.type === b[i].type && r.category === b[i].category && r.weight === b[i].weight)
  );
}

/**
 * Zapis wymagań jako nowej, niezmiennej wersji. Szkic staje się ofertą aktywną.
 * Zwraca numer wersji (lub dotychczasowy, jeśli nic się nie zmieniło).
 */
export async function saveRequirements(
  offerId: string,
  details: { title: string; area?: string | null; level?: string | null },
  requirements: RequirementInput[],
  note?: string,
): Promise<{ ok: true; version: number; changed: boolean } | { ok: false; error: string }> {
  const offer = await db.jobOffer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Oferta nie istnieje." };
  if (offer.status === "zarchiwizowana") return { ok: false, error: "Oferta jest zarchiwizowana – tylko do odczytu." };
  if (!details.title.trim()) return { ok: false, error: "Podaj tytuł oferty." };
  if (requirements.length === 0) return { ok: false, error: "Oferta musi mieć co najmniej jedno wymaganie." };

  const current = await currentRequirementVersion(offerId);
  const changed = !current || !sameRequirements(current.requirements, requirements);

  const version = await db.$transaction(async (tx) => {
    await tx.jobOffer.update({
      where: { id: offerId },
      data: {
        title: details.title.trim(),
        area: details.area?.trim() || null,
        level: details.level?.trim() || null,
        status: offer.status === "szkic" ? "aktywna" : offer.status,
        draftJson: null,
        draftError: null,
      },
    });
    if (!changed) return current!.version;
    const next = (current?.version ?? 0) + 1;
    await tx.requirementVersion.create({
      data: {
        offerId,
        version: next,
        note: note?.trim() || null,
        requirements: {
          create: requirements.map((r, i) => ({
            code: `R${i + 1}`,
            position: i,
            text: r.text.trim(),
            type: r.type,
            category: r.category,
            weight: r.weight,
            inferred: r.inferred,
            source: r.source ?? null,
          })),
        },
      },
    });
    return next;
  });
  await ensureOfferSlug(offerId);
  return { ok: true, version, changed };
}

export async function setOfferArchived(offerId: string, archived: boolean) {
  await db.jobOffer.update({
    where: { id: offerId },
    data: archived ? { status: "zarchiwizowana", archivedAt: new Date() } : { status: "aktywna", archivedAt: null },
  });
}

/**
 * Usunięcie oferty wraz z jej zgłoszeniami i analizami. Kandydaci, którzy nie mają zgłoszeń
 * w innych ofertach, są usuwani w całości (pliki CV, tekst, notatki).
 */
export async function deleteOffer(offerId: string): Promise<{ deletedCandidates: number }> {
  const offer = await db.jobOffer.findUnique({
    where: { id: offerId },
    include: { applications: { select: { candidateId: true } } },
  });
  if (!offer) return { deletedCandidates: 0 };
  const candidateIds = [...new Set(offer.applications.map((a) => a.candidateId))];

  await db.jobOffer.delete({ where: { id: offerId } }); // kaskada: wersje wymagań, zgłoszenia, analizy
  await deleteStoredFile(offer.storedFilePath);

  let deletedCandidates = 0;
  for (const candidateId of candidateIds) {
    const remaining = await db.application.count({ where: { candidateId } });
    if (remaining === 0) {
      await deleteCandidate(candidateId);
      deletedCandidates++;
    } else {
      // usuń dokumenty CV używane wyłącznie przez usuniętą ofertę
      const orphanDocs = await db.cvDocument.findMany({ where: { candidateId, applications: { none: {} } } });
      for (const d of orphanDocs) {
        await db.cvDocument.delete({ where: { id: d.id } });
        await deleteStoredFile(d.storedFilePath);
      }
    }
  }
  return { deletedCandidates };
}
