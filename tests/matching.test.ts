import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estimateExperienceYears, guessCandidateName, quickMatch, type QuickRequirement } from "@/lib/matching";
import { scoringConfigSchema, techMapSchema } from "@/lib/settings";

const cfg = scoringConfigSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "scoring.json"), "utf8")));
const map = techMapSchema.parse(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "related-technologies.json"), "utf8")));
const NOW = new Date("2026-10-16");

const req = (code: string, text: string, category = "technologia", type: "wymagane" | "mile_widziane" = "wymagane", weight = 2): QuickRequirement => ({
  code,
  text,
  category,
  type,
  weight,
});

const cvAws = `Tomasz Nowicki
Database Engineer
2021 – obecnie   Senior Database Engineer, CloudRetail
– Bazy SQL Server na Amazon RDS i EC2, Terraform, IAM, VPC
2017 – 2021   Administrator SQL Server, FinSoft
– Always On Availability Groups, T-SQL, PowerShell
Języki: angielski – B2+, niemiecki – A2
AGH Kraków – Informatyka, inżynier (2013–2017)`;

describe("szybkie dopasowanie (bez AI)", () => {
  it("rozpoznaje pełne, pokrewne (AWS zamiast Azure) i brakujące wymagania", () => {
    const r = quickMatch(
      [
        req("R1", "Administracja Microsoft SQL Server"),
        req("R2", "Doświadczenie z Microsoft Azure"),
        req("R3", "Znajomość Kubernetes"),
        req("R4", "Terraform lub Bicep"),
      ],
      cvAws,
      map,
      cfg,
      NOW,
    );
    expect(r.items.map((i) => i.status)).toEqual(["pelne", "pokrewne", "brak", "pelne"]);
    expect(r.items[1].related).toBe("AWS");
    expect(r.items[0].evidence).toMatch(/SQL Server/);
    // (1 + 0.6 + 0 + 1) / 4 = 65%
    expect(r.score).toBe(65);
  });

  it("liczy staż z dat pracy, pomijając studia i wersje produktów", () => {
    expect(estimateExperienceYears(cvAws, NOW)).toBeCloseTo(9.8, 0);
    expect(estimateExperienceYears("Umiejętności: SQL Server 2014–2022\nStudia 2015–2020", NOW)).toBeNull();
    expect(estimateExperienceYears("Stażystka 07.2024 – 01.2025\nAnalityczka 02.2025 – obecnie", NOW)).toBeCloseTo(2.2, 0);
  });

  it("porównuje wymagany staż z CV", () => {
    const r = quickMatch([req("R1", "Min. 12 lat doświadczenia z SQL Server", "doswiadczenie")], cvAws, map, cfg, NOW);
    expect(r.items[0].status).toBe("czesciowe");
    expect(r.items[0].note).toMatch(/Wymagane 12 lat/);
  });

  it("porównuje poziom języka i rozpoznaje odmianę („angielskiego”)", () => {
    const r = quickMatch(
      [req("R1", "Znajomość języka angielskiego na poziomie min. B2", "jezyk"), req("R2", "Język niemiecki B1", "jezyk"), req("R3", "Język francuski", "jezyk")],
      cvAws,
      map,
      cfg,
      NOW,
    );
    expect(r.items.map((i) => i.status)).toEqual(["pelne", "czesciowe", "brak"]);
  });

  it("umiejętność tylko z projektów własnych / certyfikat w przygotowaniu to „częściowe”", () => {
    const cv = "Domowe laboratorium: SQL Server 2022 i Always On AG\nW przygotowaniu: DP-300\nPraca: obsługa zgłoszeń";
    const r = quickMatch([req("R1", "Always On Availability Groups"), req("R2", "Certyfikat DP-300", "certyfikaty")], cv, map, cfg, NOW);
    expect(r.items.map((i) => i.status)).toEqual(["czesciowe", "czesciowe"]);
    expect(r.items[1].note).toMatch(/w przygotowaniu/i);
  });

  it("kompetencje miękkie oznacza „do oceny” i pomija w wyniku", () => {
    const r = quickMatch([req("R1", "Samodzielność w pracy", "kompetencje_miekkie"), req("R2", "PowerShell")], cvAws, map, cfg, NOW);
    expect(r.items[0].status).toBe("do_oceny");
    expect(r.score).toBe(100);
  });

  it("rozpoznaje imię i nazwisko z nagłówka CV", () => {
    expect(guessCandidateName("## Anna Kowalczyk\nSenior DBA")).toBe("Anna Kowalczyk");
    expect(guessCandidateName("Curriculum Vitae\nJan Maria Nowak-Kowalski\njan@x.pl")).toBe("Jan Maria Nowak-Kowalski");
    expect(guessCandidateName("Kontakt\nanna@x.pl\nPoznań")).toBeNull();
  });

  it("działa szybko (poniżej 50 ms na CV)", () => {
    const reqs = Array.from({ length: 17 }, (_, i) => req(`R${i + 1}`, "Microsoft Azure, SQL Server, PowerShell, Terraform"));
    const t = performance.now();
    for (let i = 0; i < 10; i++) quickMatch(reqs, cvAws.repeat(5), map, cfg, NOW);
    expect((performance.now() - t) / 10).toBeLessThan(50);
  });
});
