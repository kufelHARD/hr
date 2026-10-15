import path from "node:path";
import { db } from "@/lib/db";
import { detectFileKind, MIME_BY_KIND, UnsupportedFileError } from "@/lib/extract";
import { deleteStoredFile, saveFile, sha256 } from "@/lib/storage";
import { enqueueApplication } from "@/lib/jobs/queue";

export const MAX_CV_BYTES = 25 * 1024 * 1024;

export type AddCvResult =
  | { ok: true; applicationId: string; note?: string }
  | { ok: false; error: string };

/** Wgranie CV do oferty: zapis pliku, utworzenie kandydata i zgłoszenia, zakolejkowanie analizy. */
export async function addCvToOffer(offerId: string, fileName: string, buffer: Buffer): Promise<AddCvResult> {
  const offer = await db.jobOffer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Oferta nie istnieje." };
  if (offer.status !== "aktywna") return { ok: false, error: "CV można dodawać tylko do aktywnej oferty." };
  if (buffer.length === 0) return { ok: false, error: "Plik jest pusty." };
  if (buffer.length > MAX_CV_BYTES) return { ok: false, error: "Plik jest za duży (maks. 25 MB)." };

  let kind;
  try {
    kind = detectFileKind(buffer, fileName);
  } catch (e) {
    if (e instanceof UnsupportedFileError) return { ok: false, error: e.message };
    throw e;
  }

  const hash = sha256(buffer);
  const existingDoc = await db.cvDocument.findFirst({
    where: { sha256: hash },
    include: { applications: { select: { offerId: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (existingDoc) {
    if (existingDoc.applications.some((a) => a.offerId === offerId)) {
      return { ok: false, error: "To samo CV jest już dodane do tej oferty." };
    }
    // ten sam plik w innej ofercie – ponowne użycie kandydata i dokumentu
    const existingApp = await db.application.findUnique({
      where: { candidateId_offerId: { candidateId: existingDoc.candidateId, offerId } },
    });
    if (existingApp) return { ok: false, error: "Ten kandydat jest już przypisany do tej oferty." };
    const app = await db.application.create({
      data: { candidateId: existingDoc.candidateId, offerId, cvDocumentId: existingDoc.id },
    });
    enqueueApplication(app.id);
    return { ok: true, applicationId: app.id, note: "Rozpoznano kandydata z innej oferty – użyto istniejącego CV." };
  }

  const stored = await saveFile("cv", buffer, path.extname(fileName) || `.${kind}`);
  try {
    const app = await db.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({ data: {} });
      const doc = await tx.cvDocument.create({
        data: {
          candidateId: candidate.id,
          originalFileName: fileName,
          storedFilePath: stored,
          mimeType: MIME_BY_KIND[kind],
          sizeBytes: buffer.length,
          sha256: hash,
        },
      });
      return tx.application.create({ data: { candidateId: candidate.id, offerId, cvDocumentId: doc.id } });
    });
    enqueueApplication(app.id);
    return { ok: true, applicationId: app.id };
  } catch (e) {
    await deleteStoredFile(stored);
    throw e;
  }
}

/** Przypisanie istniejącego kandydata do innej oferty (bez ponownego wgrywania pliku). */
export async function assignCandidateToOffer(candidateId: string, offerId: string): Promise<AddCvResult> {
  const offer = await db.jobOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "aktywna") return { ok: false, error: "Wybierz aktywną ofertę." };
  const doc = await db.cvDocument.findFirst({ where: { candidateId }, orderBy: { createdAt: "desc" } });
  if (!doc) return { ok: false, error: "Kandydat nie ma zapisanego CV." };
  const exists = await db.application.findUnique({ where: { candidateId_offerId: { candidateId, offerId } } });
  if (exists) return { ok: false, error: "Kandydat jest już przypisany do tej oferty." };
  const app = await db.application.create({ data: { candidateId, offerId, cvDocumentId: doc.id } });
  enqueueApplication(app.id);
  return { ok: true, applicationId: app.id };
}

/** Ponowna analiza (nowy wpis w historii – poprzednie analizy zostają). */
export async function reanalyzeApplication(applicationId: string): Promise<{ ok: boolean; error?: string }> {
  const app = await db.application.findUnique({ where: { id: applicationId }, include: { offer: true, cvDocument: true } });
  if (!app) return { ok: false, error: "Zgłoszenie nie istnieje." };
  if (app.offer.status !== "aktywna") return { ok: false, error: "Oferta jest zarchiwizowana – tylko do odczytu." };
  if (["oczekuje", "ekstrakcja", "analiza"].includes(app.status)) return { ok: false, error: "Analiza już trwa." };
  // CV, którego nie udało się odczytać, próbujemy wyekstrahować ponownie
  if (app.cvDocument.extractionMethod === "nieudana") {
    await db.cvDocument.update({ where: { id: app.cvDocumentId }, data: { extractionMethod: null } });
  }
  await db.application.update({ where: { id: applicationId }, data: { status: "oczekuje", statusMessage: null } });
  enqueueApplication(applicationId);
  return { ok: true };
}

/**
 * Usunięcie kandydata (RODO): pliki, wyekstrahowany tekst, wszystkie zgłoszenia, analizy i notatki.
 */
export async function deleteCandidate(candidateId: string): Promise<void> {
  const docs = await db.cvDocument.findMany({ where: { candidateId }, select: { storedFilePath: true } });
  await db.candidate.delete({ where: { id: candidateId } }); // kaskada: dokumenty, zgłoszenia, analizy
  for (const d of docs) await deleteStoredFile(d.storedFilePath);
}

/**
 * Usunięcie kandydata z oferty. Jeśli kandydat nie ma innych zgłoszeń – usuwane są wszystkie jego dane.
 */
export async function removeApplication(applicationId: string): Promise<{ candidateDeleted: boolean }> {
  const app = await db.application.findUnique({ where: { id: applicationId } });
  if (!app) return { candidateDeleted: false };
  const others = await db.application.count({ where: { candidateId: app.candidateId, id: { not: applicationId } } });
  if (others === 0) {
    await deleteCandidate(app.candidateId);
    return { candidateDeleted: true };
  }
  await db.application.delete({ where: { id: applicationId } });
  // dokumenty, które nie są już używane przez żadne zgłoszenie
  const orphanDocs = await db.cvDocument.findMany({ where: { candidateId: app.candidateId, applications: { none: {} } } });
  for (const d of orphanDocs) {
    await db.cvDocument.delete({ where: { id: d.id } });
    await deleteStoredFile(d.storedFilePath);
  }
  return { candidateDeleted: false };
}

export function candidateDisplayName(c: { fullName: string | null }, fallbackFile?: string | null): string {
  return c.fullName?.trim() || (fallbackFile ? `(${fallbackFile})` : "(bez nazwiska)");
}
