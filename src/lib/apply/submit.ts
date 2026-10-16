import path from "node:path";
import * as z from "zod/v4";
import { db } from "@/lib/db";
import { detectFileKind, MIME_BY_KIND, UnsupportedFileError } from "@/lib/extract";
import { enqueueApplication } from "@/lib/jobs/queue";
import { deleteStoredFile, saveFile, sha256 } from "@/lib/storage";
import { normalizeForSearch } from "@/lib/text";
import { loadClause, loadFormConfig } from "./form-config";
import { normalizeSource } from "./sources";

// Zgłoszenie z publicznego formularza „Aplikuj” (link z pracuj.pl, justjoin.it itd.).

export const applyFieldsSchema = z.object({
  imie: z.string().trim().min(2, "Podaj imię i nazwisko.").max(120),
  email: z.email("Podaj poprawny adres e-mail.").max(200),
  telefon: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d\s()\-]*$/, "Numer telefonu może zawierać tylko cyfry, spacje, +, - i nawiasy.")
    .optional()
    .or(z.literal("")),
  zgoda: z.literal("tak", { error: "Zgoda na przetwarzanie danych w tej rekrutacji jest wymagana." }),
  zgodaPrzyszle: z.string().optional(),
});

export type SubmitResult = { ok: true } | { ok: false; error: string; field?: string };

export async function submitApplication(input: {
  slug: string;
  source: string | null;
  fields: Record<string, unknown>;
  file: { name: string; buffer: Buffer } | null;
}): Promise<SubmitResult> {
  const offer = await db.jobOffer.findUnique({ where: { slug: input.slug } });
  if (!offer || offer.status !== "aktywna" || !offer.publicApply) {
    return { ok: false, error: "Rekrutacja na to stanowisko jest zamknięta." };
  }
  const parsed = applyFieldsSchema.safeParse(input.fields);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Uzupełnij formularz.", field: String(issue?.path[0] ?? "") };
  }
  const f = parsed.data;
  const cfg = await loadFormConfig();

  if (!input.file || input.file.buffer.length === 0) return { ok: false, error: "Dołącz plik CV (PDF lub Word).", field: "plik" };
  if (input.file.buffer.length > cfg.maks_rozmiar_mb * 1024 * 1024) {
    return { ok: false, error: `Plik jest za duży (maks. ${cfg.maks_rozmiar_mb} MB).`, field: "plik" };
  }
  let kind;
  try {
    kind = detectFileKind(input.file.buffer, input.file.name);
  } catch (e) {
    if (e instanceof UnsupportedFileError) return { ok: false, error: "Dozwolone formaty CV: PDF, DOCX, DOC.", field: "plik" };
    throw e;
  }

  const email = f.email.toLowerCase();
  const duplicate = await db.application.findFirst({ where: { offerId: offer.id, candidate: { email } } });
  if (duplicate) return { ok: false, error: "Twoja aplikacja na to stanowisko już do nas dotarła – dziękujemy!" };

  const consentFuture = f.zgodaPrzyszle === "tak";
  const clause = await loadClause();
  const consentText = [cfg.zgoda_rekrutacja, consentFuture ? cfg.zgoda_przyszle : null, "---", clause].filter(Boolean).join("\n\n");

  const hash = sha256(input.file.buffer);
  const stored = await saveFile("cv", input.file.buffer, path.extname(input.file.name) || `.${kind}`);
  try {
    const app = await db.$transaction(async (tx) => {
      // ten sam kandydat (e-mail) z innej oferty – aktualizujemy dane, nowe CV jako osobny dokument
      const existing = await tx.candidate.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
      const candidate = existing
        ? await tx.candidate.update({
            where: { id: existing.id },
            data: {
              fullName: f.imie,
              fullNameNormalized: normalizeForSearch(f.imie),
              nameSource: "formularz",
              phone: f.telefon || existing.phone,
              ...(consentFuture ? { consentFuture: true, consentAt: new Date() } : {}),
            },
          })
        : await tx.candidate.create({
            data: {
              fullName: f.imie,
              fullNameNormalized: normalizeForSearch(f.imie),
              nameSource: "formularz",
              email,
              phone: f.telefon || null,
              consentFuture,
              consentAt: consentFuture ? new Date() : null,
            },
          });
      const doc = await tx.cvDocument.create({
        data: {
          candidateId: candidate.id,
          originalFileName: input.file!.name.slice(0, 200),
          storedFilePath: stored,
          mimeType: MIME_BY_KIND[kind],
          sizeBytes: input.file!.buffer.length,
          sha256: hash,
        },
      });
      return tx.application.create({
        data: {
          candidateId: candidate.id,
          offerId: offer.id,
          cvDocumentId: doc.id,
          source: normalizeSource(input.source),
          consentAt: new Date(),
          consentText,
        },
      });
    });
    enqueueApplication(app.id);
    return { ok: true };
  } catch (e) {
    await deleteStoredFile(stored);
    throw e;
  }
}
