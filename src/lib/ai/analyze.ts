import { callStructured, loadPrompt, type AiUsage } from "./client";
import { analysisSchema, type EvidenceCheck, type StoredAnalysis } from "./schemas";
import { CATEGORY_LABELS, type RequirementCategory } from "./schemas";
import { loadCompanyContext, loadTechMap, techMapToPrompt } from "@/lib/settings";
import { quoteAppearsInText } from "@/lib/text";
import { TYPE_LABELS, type RequirementType } from "@/lib/scoring";

export type RequirementForAnalysis = {
  code: string;
  text: string;
  type: RequirementType;
  category: string;
  weight: number;
};

export type OfferForAnalysis = {
  title: string;
  rawText: string;
  requirements: RequirementForAnalysis[];
};

export type AnalyzeResult = {
  stored: StoredAnalysis;
  usage: AiUsage;
  model: string;
  promptHash: string;
  durationMs: number;
};

function formatRequirements(reqs: RequirementForAnalysis[]): string {
  return reqs
    .map(
      (r) =>
        `${r.code} | ${TYPE_LABELS[r.type]} | waga ${r.weight} | ${CATEGORY_LABELS[r.category as RequirementCategory] ?? r.category} | ${r.text}`,
    )
    .join("\n");
}

/** Sprawdza, czy cytaty-dowody faktycznie występują w CV (ochrona przed „wymyślaniem” doświadczenia). */
export function verifyEvidence(output: StoredAnalysis["output"], cvText: string): Record<string, EvidenceCheck> {
  const result: Record<string, EvidenceCheck> = {};
  for (const w of output.wymagania) {
    if (w.status === "brak") result[w.id_wymagania] = "nie_dotyczy";
    else if (!w.dowod_cytat || !w.dowod_cytat.trim()) result[w.id_wymagania] = "brak_cytatu";
    else result[w.id_wymagania] = quoteAppearsInText(w.dowod_cytat, cvText) ? "zweryfikowany" : "niezweryfikowany";
  }
  return result;
}

/** Analiza CV względem oferty. Wynik procentowy liczy osobno moduł scoring (deterministycznie). */
export async function analyzeCv(offer: OfferForAnalysis, cvText: string): Promise<AnalyzeResult> {
  const [prompt, company, techMap] = await Promise.all([
    loadPrompt("analysis-system.md"),
    loadCompanyContext(),
    loadTechMap(),
  ]);
  const codes = offer.requirements.map((r) => r.code);

  // Kolejność bloków: stały prefiks (firma, mapa, oferta) – cache'owany i współdzielony
  // przez wszystkie CV tej oferty – a na końcu zmienne CV.
  const offerBlock = [
    `<kontekst_firmy>\n${company}\n</kontekst_firmy>`,
    `<mapa_technologii>\n${techMapToPrompt(techMap)}\n</mapa_technologii>`,
    `<oferta>\n<stanowisko>${offer.title}</stanowisko>\n<wymagania>\nID | typ | waga | kategoria | treść\n${formatRequirements(
      offer.requirements,
    )}\n</wymagania>\n<pelna_tresc_oferty>\n${offer.rawText}\n</pelna_tresc_oferty>\n</oferta>`,
  ].join("\n\n");

  const res = await callStructured({
    system: prompt.text,
    content: [
      { text: offerBlock, cache: true },
      {
        text: `<cv>\n${cvText}\n</cv>\n\nOceń powyższe CV względem oferty. Zwróć ocenę dla każdego wymagania: ${codes.join(", ")}.`,
      },
    ],
    schema: analysisSchema,
    validate: (d) => {
      const problems: string[] = [];
      const seen = d.wymagania.map((w) => w.id_wymagania);
      const missing = codes.filter((c) => !seen.includes(c));
      const unknown = seen.filter((c) => !codes.includes(c));
      const dupes = seen.filter((c, i) => seen.indexOf(c) !== i);
      if (missing.length) problems.push(`Brak oceny wymagań: ${missing.join(", ")}`);
      if (unknown.length) problems.push(`Nieznane identyfikatory: ${unknown.join(", ")}`);
      if (dupes.length) problems.push(`Powtórzone identyfikatory: ${dupes.join(", ")}`);
      return problems;
    },
  });

  // porządkowanie: tylko znane wymagania, bez duplikatów, w kolejności z oferty
  const byCode = new Map(res.data.wymagania.filter((w) => codes.includes(w.id_wymagania)).map((w) => [w.id_wymagania, w]));
  const output = { ...res.data, wymagania: codes.flatMap((c) => (byCode.has(c) ? [byCode.get(c)!] : [])) };
  const missingRequirements = codes.filter((c) => !byCode.has(c));

  return {
    stored: { output, evidence: verifyEvidence(output, cvText), missingRequirements },
    usage: res.usage,
    model: res.model,
    promptHash: prompt.hash,
    durationMs: res.durationMs,
  };
}
