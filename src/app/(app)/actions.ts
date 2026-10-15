"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod/v4";
import { db } from "@/lib/db";
import {
  deleteOffer,
  regenerateDraft,
  requirementInputSchema,
  saveRequirements,
  setOfferArchived,
} from "@/lib/services/offers";
import {
  assignCandidateToOffer,
  deleteCandidate,
  reanalyzeApplication,
  removeApplication,
} from "@/lib/services/candidates";
import { enqueueApplication } from "@/lib/jobs/queue";
import { normalizeForSearch } from "@/lib/text";
import { saveCompanyContext, saveTechMap, techMapSchema } from "@/lib/settings";

type Result = { ok?: boolean; error?: string; message?: string };

// ---------- oferty ----------

const saveRequirementsSchema = z.object({
  offerId: z.string(),
  title: z.string(),
  area: z.string().nullish(),
  level: z.string().nullish(),
  note: z.string().nullish(),
  reanalyze: z.boolean().default(false),
  requirements: z.array(requirementInputSchema),
});

export async function saveRequirementsAction(input: z.input<typeof saveRequirementsSchema>): Promise<Result> {
  const parsed = saveRequirementsSchema.safeParse(input);
  if (!parsed.success) return { error: `Niepoprawne dane: ${parsed.error.issues[0]?.message}` };
  const d = parsed.data;
  const res = await saveRequirements(d.offerId, { title: d.title, area: d.area, level: d.level }, d.requirements, d.note ?? undefined);
  if (!res.ok) return { error: res.error };

  if (res.changed && d.reanalyze) {
    const apps = await db.application.findMany({
      where: { offerId: d.offerId, status: { in: ["gotowe", "blad"] } },
      select: { id: true },
    });
    for (const a of apps) await reanalyzeApplication(a.id);
  }
  revalidatePath(`/oferty/${d.offerId}`);
  redirect(`/oferty/${d.offerId}`);
}

export async function regenerateDraftAction(offerId: string): Promise<Result> {
  const res = await regenerateDraft(offerId);
  revalidatePath(`/oferty/${offerId}/wymagania`);
  return res.ok ? { ok: true, message: "Wymagania wyodrębnione ponownie." } : { error: res.error };
}

export async function archiveOfferAction(offerId: string, archived: boolean): Promise<Result> {
  await setOfferArchived(offerId, archived);
  revalidatePath("/");
  revalidatePath(`/oferty/${offerId}`);
  return { ok: true };
}

export async function deleteOfferAction(offerId: string): Promise<Result> {
  await deleteOffer(offerId);
  revalidatePath("/");
  redirect("/");
}

// ---------- kandydaci ----------

export async function reanalyzeAction(applicationId: string): Promise<Result> {
  const res = await reanalyzeApplication(applicationId);
  return res.ok ? { ok: true, message: "Analiza dodana do kolejki." } : { error: res.error };
}

export async function reanalyzeAllAction(offerId: string): Promise<Result> {
  const apps = await db.application.findMany({
    where: { offerId, status: { in: ["gotowe", "blad", "nieczytelne"] } },
    select: { id: true },
  });
  let n = 0;
  for (const a of apps) if ((await reanalyzeApplication(a.id)).ok) n++;
  return { ok: true, message: `Dodano do kolejki: ${n}` };
}

export async function retryStuckAction(applicationId: string): Promise<Result> {
  enqueueApplication(applicationId);
  return { ok: true };
}

export async function removeApplicationAction(applicationId: string, offerId: string): Promise<Result> {
  await removeApplication(applicationId);
  revalidatePath(`/oferty/${offerId}`);
  redirect(`/oferty/${offerId}`);
}

export async function deleteCandidateAction(candidateId: string, redirectTo: string): Promise<Result> {
  await deleteCandidate(candidateId);
  revalidatePath("/kandydaci");
  redirect(redirectTo);
}

export async function saveNotesAction(applicationId: string, notes: string): Promise<Result> {
  await db.application.update({ where: { id: applicationId }, data: { notes: notes.slice(0, 20000) } });
  return { ok: true, message: "Zapisano" };
}

export async function setConsentAction(candidateId: string, consent: boolean): Promise<Result> {
  await db.candidate.update({
    where: { id: candidateId },
    data: { consentFuture: consent, consentAt: consent ? new Date() : null },
  });
  return { ok: true };
}

export async function renameCandidateAction(candidateId: string, fullName: string): Promise<Result> {
  const name = fullName.trim();
  await db.candidate.update({
    where: { id: candidateId },
    data: { fullName: name || null, fullNameNormalized: name ? normalizeForSearch(name) : null },
  });
  return { ok: true, message: "Zapisano" };
}

export async function assignToOfferAction(candidateId: string, offerId: string): Promise<Result> {
  const res = await assignCandidateToOffer(candidateId, offerId);
  if (!res.ok) return { error: res.error };
  redirect(`/oferty/${offerId}/kandydaci/${res.applicationId}`);
}

// ---------- ustawienia ----------

export async function saveCompanyContextAction(content: string): Promise<Result> {
  if (content.trim().length < 20) return { error: "Opis firmy jest za krótki." };
  await saveCompanyContext(content);
  return { ok: true, message: "Zapisano. Zmiana obowiązuje od następnej analizy." };
}

export async function saveTechMapAction(groups: unknown): Promise<Result> {
  const parsed = techMapSchema.safeParse({ grupy: groups });
  if (!parsed.success) {
    return { error: "Każda grupa musi mieć nazwę i co najmniej dwie technologie." };
  }
  await saveTechMap({
    _opis:
      "Grupy technologii pokrewnych. Znajomość jednej technologii z grupy może zostać zaliczona jako 'pokrewne' dla innej z tej samej grupy. To wskazówka dla AI – może ona rozpoznawać też pokrewieństwa spoza listy. Edytowalne w aplikacji: Ustawienia.",
    grupy: parsed.data.grupy,
  });
  return { ok: true, message: "Zapisano mapę technologii." };
}
