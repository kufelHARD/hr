import * as z from "zod/v4";
import { POTENTIAL_COMPONENTS, REQUIREMENT_STATUSES, REQUIREMENT_TYPES } from "@/lib/scoring";

// Schematy odpowiedzi AI. Wysyłane do API jako JSON Schema (structured outputs) i walidowane w kodzie.
// Ograniczenia liczbowe (min/max) API pomija – SDK sprawdza je po stronie klienta, a my dodatkowo tutaj.

export const REQUIREMENT_CATEGORIES = [
  "technologia",
  "doswiadczenie",
  "wyksztalcenie",
  "jezyk",
  "kompetencje_miekkie",
  "certyfikaty",
] as const;
export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  technologia: "Technologia",
  doswiadczenie: "Doświadczenie",
  wyksztalcenie: "Wykształcenie",
  jezyk: "Język",
  kompetencje_miekkie: "Kompetencje miękkie",
  certyfikaty: "Certyfikaty",
};

// ---------- ekstrakcja wymagań z oferty ----------

export const extractedRequirementSchema = z.object({
  tresc: z.string(),
  typ: z.enum(REQUIREMENT_TYPES),
  kategoria: z.enum(REQUIREMENT_CATEGORIES),
  waga: z.number().int().min(1).max(3),
  wywnioskowane: z.boolean(),
  zrodlo: z.string(),
});

export const offerExtractionSchema = z.object({
  stanowisko: z.string(),
  obszar: z.string(),
  poziom: z.string().nullable(),
  podsumowanie: z.string(),
  wymagania: z.array(extractedRequirementSchema),
});

export type OfferExtraction = z.infer<typeof offerExtractionSchema>;

// ---------- analiza CV ----------

const score = z.number().min(0).max(100);

const potentialComponent = z.object({ ocena: score, uzasadnienie: z.string() });

export const analysisSchema = z.object({
  kandydat: z.object({
    imie_nazwisko: z.string().nullable(),
    obecne_stanowisko: z.string().nullable(),
    lata_doswiadczenia: z.number().nullable(),
    technologie: z.array(z.string()),
  }),
  wymagania: z.array(
    z.object({
      id_wymagania: z.string(),
      status: z.enum(REQUIREMENT_STATUSES),
      dowod_cytat: z.string().nullable(),
      dowod_opis: z.string(),
      technologia_pokrewna: z.string().nullable(),
      uzasadnienie: z.string(),
    }),
  ),
  potencjal: z.object({
    bliskosc_domenowa: potentialComponent,
    umiejetnosci_przenoszalne: potentialComponent,
    trajektoria_rozwoju: potentialComponent,
    czas_wdrozenia: z.object({ ocena: score, szacunek: z.string(), uzasadnienie: z.string() }),
    dopasowanie_do_firmy: potentialComponent,
  }),
  mocne_strony: z.array(z.string()),
  slabe_strony: z.array(z.string()),
  pytania_na_rozmowe: z.array(z.object({ pytanie: z.string(), cel: z.string() })),
  podejrzane_instrukcje: z.object({ wykryto: z.boolean(), opis: z.string().nullable() }),
  rekomendacja: z.enum(["zaprosic", "do_rozwazenia", "slabe_dopasowanie"]),
  opis_kandydata: z.string(),
});

export type AnalysisOutput = z.infer<typeof analysisSchema>;
export type Recommendation = AnalysisOutput["rekomendacja"];

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  zaprosic: "Warto zaprosić na rozmowę",
  do_rozwazenia: "Do rozważenia przy elastycznych wymaganiach",
  slabe_dopasowanie: "Słabe dopasowanie",
};

// sanity check: składowe potencjału w schemacie = składowe w module liczenia
const _componentsMatch: Record<(typeof POTENTIAL_COMPONENTS)[number], true> = {
  bliskosc_domenowa: true,
  umiejetnosci_przenoszalne: true,
  trajektoria_rozwoju: true,
  czas_wdrozenia: true,
  dopasowanie_do_firmy: true,
};
void _componentsMatch;

// ---------- to, co zapisujemy w bazie (Analysis.resultJson) ----------

export type EvidenceCheck = "zweryfikowany" | "niezweryfikowany" | "brak_cytatu" | "nie_dotyczy";

export type StoredAnalysis = {
  output: AnalysisOutput;
  /** wynik sprawdzenia, czy cytat-dowód występuje w tekście CV – per id wymagania */
  evidence: Record<string, EvidenceCheck>;
  /** wymagania pominięte przez AI (liczone jako „brak”) */
  missingRequirements: string[];
};
