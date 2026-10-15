// Deterministyczne liczenie wyników na podstawie ocen AI i parametrów z config/scoring.json.
// AI zwraca statusy wymagań i oceny składowych potencjału – wynik procentowy liczy wyłącznie ten kod.

import type { ScoringConfig } from "@/lib/settings";

export const REQUIREMENT_STATUSES = ["pelne", "pokrewne", "czesciowe", "brak"] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const REQUIREMENT_TYPES = ["wymagane", "mile_widziane"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const POTENTIAL_COMPONENTS = [
  "bliskosc_domenowa",
  "umiejetnosci_przenoszalne",
  "trajektoria_rozwoju",
  "czas_wdrozenia",
  "dopasowanie_do_firmy",
] as const;
export type PotentialComponent = (typeof POTENTIAL_COMPONENTS)[number];

export type ScoredRequirement = { code: string; type: RequirementType; weight: number };
export type RequirementAssessment = { id_wymagania: string; status: RequirementStatus };

export type MatchBreakdownItem = {
  code: string;
  status: RequirementStatus;
  effectiveWeight: number;
  value: number;
  contribution: number;
};

export type MatchResult = {
  /** 0-100, null gdy oferta nie ma wymagań */
  score: number | null;
  earned: number;
  max: number;
  items: MatchBreakdownItem[];
  /** wymagania, dla których AI nie zwróciło oceny (liczone jako „brak”) */
  missing: string[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Ogólne dopasowanie:
 *   waga_efektywna = waga(1-3) × mnożnik_typu (domyślnie wymagane ×2, mile widziane ×1)
 *   wynik = Σ(wartość_statusu × waga_efektywna) / Σ(waga_efektywna) × 100
 */
export function computeMatchScore(
  requirements: ScoredRequirement[],
  assessments: RequirementAssessment[],
  config: ScoringConfig,
): MatchResult {
  const { wartosci_statusow, mnozniki_typow } = config.dopasowanie;
  const byCode = new Map(assessments.map((a) => [a.id_wymagania, a]));
  const items: MatchBreakdownItem[] = [];
  const missing: string[] = [];
  let earned = 0;
  let max = 0;

  for (const req of requirements) {
    if (!Number.isInteger(req.weight) || req.weight < 1 || req.weight > 3) {
      throw new Error(`Waga wymagania ${req.code} musi być liczbą całkowitą 1-3 (jest: ${req.weight}).`);
    }
    const typeMultiplier = mnozniki_typow[req.type];
    if (typeMultiplier === undefined) throw new Error(`Nieznany typ wymagania: ${req.type}`);
    const effectiveWeight = req.weight * typeMultiplier;
    const assessment = byCode.get(req.code);
    const status: RequirementStatus = assessment?.status ?? "brak";
    if (!assessment) missing.push(req.code);
    const value = wartosci_statusow[status];
    const contribution = value * effectiveWeight;
    earned += contribution;
    max += effectiveWeight;
    items.push({ code: req.code, status, effectiveWeight, value, contribution });
  }

  return {
    score: max > 0 ? round1((earned / max) * 100) : null,
    earned,
    max,
    items,
    missing,
  };
}

export type PotentialInput = Record<PotentialComponent, { ocena: number }>;

export type PotentialResult = {
  score: number;
  components: Array<{ key: PotentialComponent; score: number; weight: number; normalizedWeight: number }>;
};

/** Potencjał = średnia ważona ocen składowych (0-100). Wagi z configu są normalizowane do sumy 1. */
export function computePotentialScore(input: PotentialInput, config: ScoringConfig): PotentialResult {
  const weights = config.potencjal.wagi_skladowych;
  const total = POTENTIAL_COMPONENTS.reduce((s, k) => s + weights[k], 0);
  if (total <= 0) throw new Error("Suma wag składowych potencjału musi być większa od zera.");

  let score = 0;
  const components = POTENTIAL_COMPONENTS.map((key) => {
    const raw = input[key]?.ocena;
    if (typeof raw !== "number" || Number.isNaN(raw)) throw new Error(`Brak oceny składowej potencjału: ${key}`);
    const clamped = Math.min(100, Math.max(0, raw));
    const normalizedWeight = weights[key] / total;
    score += clamped * normalizedWeight;
    return { key, score: clamped, weight: weights[key], normalizedWeight };
  });

  return { score: round1(score), components };
}

export const STATUS_LABELS: Record<RequirementStatus, string> = {
  pelne: "Pełne",
  pokrewne: "Pokrewne",
  czesciowe: "Częściowe",
  brak: "Brak",
};

export const TYPE_LABELS: Record<RequirementType, string> = {
  wymagane: "Wymagane",
  mile_widziane: "Mile widziane",
};

export const POTENTIAL_LABELS: Record<PotentialComponent, string> = {
  bliskosc_domenowa: "Bliskość domenowa",
  umiejetnosci_przenoszalne: "Umiejętności przenoszalne",
  trajektoria_rozwoju: "Trajektoria rozwoju",
  czas_wdrozenia: "Czas wdrożenia",
  dopasowanie_do_firmy: "Dopasowanie do profilu firmy",
};
