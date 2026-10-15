import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeMatchScore,
  computePotentialScore,
  type RequirementAssessment,
  type ScoredRequirement,
} from "@/lib/scoring";
import { scoringConfigSchema, type ScoringConfig } from "@/lib/settings";

// Testy na rzeczywistym pliku konfiguracyjnym (domyślne wartości z briefu)
const config: ScoringConfig = scoringConfigSchema.parse(
  JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "scoring.json"), "utf8")),
);

const reqs: ScoredRequirement[] = [
  { code: "R1", type: "wymagane", weight: 3 },
  { code: "R2", type: "wymagane", weight: 2 },
  { code: "R3", type: "mile_widziane", weight: 1 },
  { code: "R4", type: "mile_widziane", weight: 2 },
];

const assess = (statuses: string[]): RequirementAssessment[] =>
  statuses.map((s, i) => ({ id_wymagania: `R${i + 1}`, status: s as RequirementAssessment["status"] }));

describe("ogólne dopasowanie", () => {
  it("domyślne mnożniki zgodne z briefem", () => {
    expect(config.dopasowanie.wartosci_statusow).toEqual({ pelne: 1, pokrewne: 0.6, czesciowe: 0.4, brak: 0 });
    expect(config.dopasowanie.mnozniki_typow).toEqual({ wymagane: 2, mile_widziane: 1 });
  });

  it("wszystko pełne = 100%, wszystko brak = 0%", () => {
    expect(computeMatchScore(reqs, assess(["pelne", "pelne", "pelne", "pelne"]), config).score).toBe(100);
    expect(computeMatchScore(reqs, assess(["brak", "brak", "brak", "brak"]), config).score).toBe(0);
  });

  it("liczy przykład ręczny: (6·1 + 4·0.6 + 1·0 + 2·0.4) / 13 = 70.8%", () => {
    const r = computeMatchScore(reqs, assess(["pelne", "pokrewne", "brak", "czesciowe"]), config);
    expect(r.max).toBe(13); // 3·2 + 2·2 + 1·1 + 2·1
    expect(r.earned).toBeCloseTo(9.2, 10);
    expect(r.score).toBe(70.8);
    expect(r.items.map((i) => i.effectiveWeight)).toEqual([6, 4, 1, 2]);
  });

  it("pokrewne (np. AWS zamiast Azure) daje realną, obniżoną wartość – nie zero", () => {
    const one: ScoredRequirement[] = [{ code: "R1", type: "wymagane", weight: 3 }];
    expect(computeMatchScore(one, assess(["pokrewne"]), config).score).toBe(60);
    expect(computeMatchScore(one, assess(["czesciowe"]), config).score).toBe(40);
  });

  it("wymaganie „wymagane” waży 2× więcej niż „mile widziane” o tej samej wadze", () => {
    const two: ScoredRequirement[] = [
      { code: "R1", type: "wymagane", weight: 2 },
      { code: "R2", type: "mile_widziane", weight: 2 },
    ];
    expect(computeMatchScore(two, assess(["pelne", "brak"]), config).score).toBe(66.7);
    expect(computeMatchScore(two, assess(["brak", "pelne"]), config).score).toBe(33.3);
  });

  it("brak oceny wymagania od AI liczy się jako „brak” i jest raportowany", () => {
    const r = computeMatchScore(reqs, assess(["pelne", "pelne", "pelne"]), config);
    expect(r.missing).toEqual(["R4"]);
    expect(r.score).toBe(84.6); // 11/13
  });

  it("oferta bez wymagań daje wynik null", () => {
    expect(computeMatchScore([], [], config).score).toBeNull();
  });

  it("odrzuca wagę spoza zakresu 1-3", () => {
    expect(() => computeMatchScore([{ code: "R1", type: "wymagane", weight: 5 }], [], config)).toThrow(/1-3/);
  });

  it("respektuje zmienione parametry w configu", () => {
    const custom: ScoringConfig = {
      ...config,
      dopasowanie: {
        wartosci_statusow: { pelne: 1, pokrewne: 0.8, czesciowe: 0.5, brak: 0 },
        mnozniki_typow: { wymagane: 3, mile_widziane: 1 },
      },
    };
    // (3·3·1 + 2·3·0.8 + 1·0 + 2·0.5) / (9+6+1+2) = (9 + 4.8 + 0 + 1) / 18 = 82.2%
    expect(computeMatchScore(reqs, assess(["pelne", "pokrewne", "brak", "czesciowe"]), custom).score).toBe(82.2);
  });
});

describe("potencjał", () => {
  const input = {
    bliskosc_domenowa: { ocena: 80 },
    umiejetnosci_przenoszalne: { ocena: 60 },
    trajektoria_rozwoju: { ocena: 40 },
    czas_wdrozenia: { ocena: 100 },
    dopasowanie_do_firmy: { ocena: 50 },
  };

  it("średnia ważona z domyślnymi wagami: 0.25·80 + 0.25·60 + 0.2·40 + 0.15·100 + 0.15·50 = 65.5", () => {
    expect(computePotentialScore(input, config).score).toBe(65.5);
  });

  it("normalizuje wagi, które nie sumują się do 1", () => {
    const custom: ScoringConfig = {
      ...config,
      potencjal: {
        wagi_skladowych: {
          bliskosc_domenowa: 1,
          umiejetnosci_przenoszalne: 1,
          trajektoria_rozwoju: 1,
          czas_wdrozenia: 1,
          dopasowanie_do_firmy: 1,
        },
      },
    };
    expect(computePotentialScore(input, custom).score).toBe(66); // zwykła średnia
  });

  it("przycina oceny spoza 0-100", () => {
    const r = computePotentialScore({ ...input, czas_wdrozenia: { ocena: 140 }, trajektoria_rozwoju: { ocena: -10 } }, config);
    expect(r.components.find((c) => c.key === "czas_wdrozenia")!.score).toBe(100);
    expect(r.components.find((c) => c.key === "trajektoria_rozwoju")!.score).toBe(0);
  });

  it("niskie dopasowanie i wysoki potencjał są od siebie niezależne", () => {
    const junior = {
      bliskosc_domenowa: { ocena: 75 },
      umiejetnosci_przenoszalne: { ocena: 85 },
      trajektoria_rozwoju: { ocena: 90 },
      czas_wdrozenia: { ocena: 60 },
      dopasowanie_do_firmy: { ocena: 80 },
    };
    const match = computeMatchScore(reqs, assess(["czesciowe", "brak", "pelne", "brak"]), config).score!;
    const potential = computePotentialScore(junior, config).score;
    expect(match).toBeLessThan(30);
    expect(potential).toBeGreaterThan(75);
  });

  it("zgłasza brak składowej", () => {
    const { czas_wdrozenia: _, ...partial } = input;
    expect(() => computePotentialScore(partial as typeof input, config)).toThrow(/czas_wdrozenia/);
  });

  it("odrzuca konfigurację z zerowymi wagami", () => {
    const zero: ScoringConfig = {
      ...config,
      potencjal: {
        wagi_skladowych: {
          bliskosc_domenowa: 0,
          umiejetnosci_przenoszalne: 0,
          trajektoria_rozwoju: 0,
          czas_wdrozenia: 0,
          dopasowanie_do_firmy: 0,
        },
      },
    };
    expect(() => computePotentialScore(input, zero)).toThrow(/większa od zera/);
  });
});
