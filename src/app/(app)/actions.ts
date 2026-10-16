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
  requestAiAnalysis,
  reprocessApplication,
  setStage,
  STAGES,
  removeApplication,
} from "@/lib/services/candidates";
import { enqueueApplication } from "@/lib/jobs/queue";
import { runQuickMatch } from "@/lib/jobs/process";
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

  if (res.changed) {
    // szybkie dopasowanie do nowej wersji wymagań – natychmiast, dla wszystkich kandydatów
    const apps = await db.application.findMany({ where: { offerId: d.offerId, status: "gotowe" }, select: { id: true, aiStatus: true } });
    for (const a of apps) await runQuickMatch(a.id);
    // opcjonalnie: ponowna analiza AI dla kandydatów, którzy ją mieli
    if (d.reanalyze) for (const a of apps.filter((x) => x.aiStatus === "gotowe")) await requestAiAnalysis(a.id);
  }
  revalidatePath(`/oferty/${d.offerId}`);
  redirect(`/oferty/${d.offerId}`);
}

export async function regenerateDraftAction(offerId: string): Promise<Result> {
  const res = await regenerateDraft(offerId);
  revalidatePath(`/oferty/${offerId}/wymagania`);
  return res.ok ? { ok: true, message: res.error ?? "Wymagania wyodrębnione ponownie." } : { error: res.error };
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

export async function aiAnalysisAction(applicationId: string): Promise<Result> {
  const res = await requestAiAnalysis(applicationId);
  return res.ok ? { ok: true, message: "Analiza AI dodana do kolejki." } : { error: res.error };
}

export async function reprocessAction(applicationId: string): Promise<Result> {
  const res = await reprocessApplication(applicationId);
  return res.ok ? { ok: true, message: "Ponowny odczyt pliku w toku." } : { error: res.error };
}

/** Analiza AI dla wybranych kandydatów oferty (np. zakwalifikowanych do selekcji). */
export async function aiForStageAction(offerId: string, stage: string): Promise<Result> {
  const apps = await db.application.findMany({ where: { offerId, stage, status: "gotowe" }, select: { id: true } });
  let n = 0;
  for (const a of apps) if ((await requestAiAnalysis(a.id)).ok) n++;
  return { ok: true, message: n ? `Analiza AI dodana do kolejki: ${n}` : "Brak kandydatów do analizy na tym etapie." };
}

export async function setStageAction(applicationId: string, stage: string): Promise<Result> {
  if (!(STAGES as readonly string[]).includes(stage)) return { error: "Nieznany etap." };
  await setStage(applicationId, stage as (typeof STAGES)[number]);
  return { ok: true };
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
    data: { fullName: name || null, fullNameNormalized: name ? normalizeForSearch(name) : null, nameSource: name ? "recznie" : null },
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

// ---------- silnik AI ----------

import {
  CLAUDE_MODELS,
  getAiSettings,
  saveAiSettings,
  type AiProvider,
} from "@/lib/app-settings";
import { modelInstalled, ollamaStatus, pullStatus, speedTest, startPull } from "@/lib/ai/ollama";

const aiSettingsSchema = z.object({
  provider: z.enum(["ollama", "claude"]),
  ollamaUrl: z.string().trim().url("Nieprawidłowy adres Ollamy"),
  ollamaModel: z.string().trim().min(1, "Podaj nazwę modelu"),
  claudeModel: z.string().trim().min(1),
  claudeEffort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  /** undefined = bez zmian, "" = usuń zapisany klucz */
  claudeApiKey: z.string().optional(),
});

export async function saveAiSettingsAction(input: z.input<typeof aiSettingsSchema>): Promise<Result> {
  const parsed = aiSettingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Niepoprawne dane" };
  const d = parsed.data;
  if (d.claudeApiKey && !d.claudeApiKey.startsWith("sk-ant-")) return { error: "Klucz API Claude powinien zaczynać się od „sk-ant-”." };
  saveAiSettings({
    provider: d.provider as AiProvider,
    ollama: { baseUrl: d.ollamaUrl, model: d.ollamaModel },
    claude: { model: d.claudeModel, effort: d.claudeEffort, apiKey: d.claudeApiKey },
  });
  revalidatePath("/ustawienia");
  const s = getAiSettings();
  if (s.provider === "claude" && !s.claude.apiKey) {
    return { ok: true, message: "Zapisano. Uwaga: wybrano Claude, ale nie ma klucza API – analizy nie zadziałają." };
  }
  return {
    ok: true,
    message: s.provider === "ollama" ? "Zapisano. Analizy wykonuje darmowy model lokalny." : "Zapisano. Analizy wykonuje Claude (płatne).",
  };
}

export async function ollamaStatusAction(baseUrl: string, model: string) {
  const st = await ollamaStatus(baseUrl.replace(/\/+$/, ""));
  return { ...st, hasModel: modelInstalled(st.models, model), pull: pullStatus() };
}

export async function startPullAction(baseUrl: string, model: string): Promise<Result> {
  startPull(baseUrl.replace(/\/+$/, ""), model.trim());
  return { ok: true };
}

export async function pullStatusAction() {
  return pullStatus();
}

export async function speedTestAction(baseUrl: string, model: string) {
  try {
    return { ok: true as const, ...(await speedTest(baseUrl.replace(/\/+$/, ""), model.trim())) };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

/** Sprawdzenie klucza Claude bez kosztów (pobranie informacji o modelu). */
export async function testClaudeAction(apiKey: string | undefined, model: string): Promise<Result> {
  const key = apiKey?.trim() || getAiSettings().claude.apiKey;
  if (!key) return { error: "Brak klucza API." };
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 15000 });
    const m = await client.models.retrieve(model);
    return { ok: true, message: `Klucz działa – model dostępny: ${m.display_name ?? m.id}.` };
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401) return { error: "Nieprawidłowy klucz API." };
    if (status === 404) return { error: `Model ${model} niedostępny dla tego klucza.` };
    return { error: `Nie udało się połączyć z API Anthropic: ${(e as Error).message}` };
  }
}

export async function claudeModelsList() {
  return CLAUDE_MODELS;
}

// ---------- kopia zapasowa ----------

export async function createBackupAction(): Promise<Result & { fileName?: string }> {
  try {
    const { createBackup } = await import("@/lib/services/backup");
    const r = await createBackup();
    const name = r.file.split(/[\\/]/).pop()!;
    return { ok: true, fileName: name, message: `Utworzono ${name} (${(r.sizeBytes / 1024 / 1024).toFixed(1)} MB) w folderze ${r.file.slice(0, -name.length - 1)}` };
  } catch (e) {
    return { error: `Nie udało się utworzyć kopii: ${(e as Error).message}` };
  }
}

// ---------- formularz „Aplikuj” ----------

import { setPublicApply } from "@/lib/services/offers";
import { savePublicUrl } from "@/lib/app-settings";
import { formConfigSchema, saveClause, saveFormConfig } from "@/lib/apply/form-config";

export async function setPublicApplyAction(offerId: string, enabled: boolean): Promise<Result> {
  await setPublicApply(offerId, enabled);
  revalidatePath(`/oferty/${offerId}`);
  return { ok: true, message: enabled ? "Formularz przyjmuje zgłoszenia." : "Formularz zamknięty." };
}

export async function saveApplyFormAction(input: { publicUrl: string; config: unknown; clause: string }): Promise<Result> {
  const url = input.publicUrl.trim();
  if (url && !/^https?:\/\/[^\s/]+/.test(url)) return { error: "Adres publiczny musi zaczynać się od https:// (np. https://kariera.summ-it.pl)." };
  const cfg = formConfigSchema.safeParse(input.config);
  if (!cfg.success) return { error: `Niepoprawne ustawienia formularza: ${cfg.error.issues[0]?.message}` };
  if (input.clause.trim().length < 50) return { error: "Klauzula informacyjna jest za krótka." };
  savePublicUrl(url);
  await saveFormConfig(cfg.data);
  await saveClause(input.clause);
  return { ok: true, message: "Zapisano ustawienia formularza." };
}
