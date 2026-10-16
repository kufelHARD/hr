import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { completeDraft, draftFromOffer, parseOfferItems } from "@/lib/offers/sections";
import { extractDocument } from "@/lib/extract";
import type { OfferExtraction } from "@/lib/ai/schemas";

const kinds = (md: string) => parseOfferItems(md).filter((i) => i.kind === "wymagane" || i.kind === "mile_widziane").map((i) => `${i.kind === "wymagane" ? "W" : "M"}: ${i.text}`);

const PRACUJ = `Administrator baz danych
summ-it S.A.
Poznań

Twój zakres obowiązków
Administracja bazami SQL Server
Migracje do Azure

Nasze wymagania
Wymagane
min. 3 lata doświadczenia w administracji SQL Server
znajomość T-SQL
angielski na poziomie B2
Mile widziane
znajomość PowerShell
certyfikat DP-300

To oferujemy
prywatna opieka medyczna
`;

const JUSTJOIN = `## Data Engineer

### Tech stack
- Python – advanced
- SQL – regular

### Requirements
* 3+ years of experience with Python
* Good knowledge of Apache Spark
* English B2+

### Nice to have
* Databricks
* Azure Data Factory

### Responsibilities
* Building data pipelines
`;

const WORD_BOLD = `**Oferta pracy: Analityk BI**

**Czego oczekujemy:**

-   Znajomość Power BI (DAX, Power Query)
-   Min. 2 lata doświadczenia w analizie danych
-   Mile widziana znajomość Pythona
-   Znajomość SQL – dodatkowy atut

**Dodatkowym atutem będzie:**

-   Doświadczenie z Microsoft Fabric

**Oferujemy:**

-   Umowa o pracę
`;

const TABLE = `# DevOps Engineer

| Wymagania | Mile widziane |
| --- | --- |
| Kubernetes | Terraform |
| Docker | ArgoCD |

| Mile widziane | Ansible, Helm |
| --- | --- |
`;

const INLINE = `Wymagania:
- doświadczenie z Oracle Database
- Mile widziane: znajomość Golden Gate
- znajomość Linuxa

Mile widziane: certyfikat OCP
Oferujemy: pracę zdalną
`;

describe("sekcje ogłoszenia (bez AI)", () => {
  it("ogłoszenie wklejone z pracuj.pl (nagłówki bez formatowania)", () => {
    expect(kinds(PRACUJ)).toEqual([
      "W: min. 3 lata doświadczenia w administracji SQL Server",
      "W: znajomość T-SQL",
      "W: angielski na poziomie B2",
      "M: znajomość PowerShell",
      "M: certyfikat DP-300",
    ]);
  });

  it("ogłoszenie z justjoin.it (angielskie nagłówki Markdown)", () => {
    expect(kinds(JUSTJOIN)).toEqual([
      "W: Python – advanced",
      "W: SQL – regular",
      "W: 3+ years of experience with Python",
      "W: Good knowledge of Apache Spark",
      "W: English B2+",
      "M: Databricks",
      "M: Azure Data Factory",
    ]);
  });

  it("Word z pogrubionymi nagłówkami i „mile widziane” w liście wymagań", () => {
    expect(kinds(WORD_BOLD)).toEqual([
      "W: Znajomość Power BI (DAX, Power Query)",
      "W: Min. 2 lata doświadczenia w analizie danych",
      "M: Mile widziana znajomość Pythona",
      "M: Znajomość SQL – dodatkowy atut",
      "M: Doświadczenie z Microsoft Fabric",
    ]);
  });

  it("tabela z kolumnami Wymagania / Mile widziane", () => {
    expect(kinds(TABLE)).toEqual(["W: Kubernetes", "M: Terraform", "W: Docker", "M: ArgoCD", "M: Ansible, Helm"]);
  });

  it("„Mile widziane:” jako prefiks punktu i jako wiersz z treścią", () => {
    expect(kinds(INLINE)).toEqual([
      "W: doświadczenie z Oracle Database",
      "M: znajomość Golden Gate",
      "W: znajomość Linuxa",
      "M: certyfikat OCP",
    ]);
  });

  it("oferta przykładowa (.docx): sekcja „Dodatkowym atutem będzie”", async () => {
    const res = await extractDocument(fs.readFileSync("seed/files/oferta-dba-sql-server-azure.docx"), "oferta.docx");
    const items = kinds(res.text);
    expect(items.filter((i) => i.startsWith("W:"))).toHaveLength(7);
    expect(items.filter((i) => i.startsWith("M:"))).toEqual([
      "M: znajomość Terraform lub Bicep",
      "M: certyfikat DP-300 lub AZ-104",
      "M: doświadczenie z Oracle Database",
      "M: doświadczenie z Azure Data Factory lub SSIS",
    ]);
  });

  it("lista zapasowa bez AI: kategorie i wagi", () => {
    const d = draftFromOffer(PRACUJ)!;
    expect(d.wymagania.map((w) => [w.typ, w.kategoria, w.waga])).toEqual([
      ["wymagane", "doswiadczenie", 2],
      ["wymagane", "technologia", 2],
      ["wymagane", "jezyk", 2],
      ["mile_widziane", "technologia", 1],
      ["mile_widziane", "certyfikaty", 1],
    ]);
  });
});

describe("uzgodnienie wyniku AI z sekcjami ogłoszenia", () => {
  const req = (tresc: string, typ: "wymagane" | "mile_widziane", zrodlo: string, extra: Partial<OfferExtraction["wymagania"][number]> = {}) => ({
    tresc,
    typ,
    kategoria: "technologia" as const,
    waga: 2,
    wywnioskowane: false,
    zrodlo,
    ...extra,
  });

  it("dopisuje pominięte „mile widziane” i poprawia typ", () => {
    const ai: OfferExtraction = {
      stanowisko: "DBA",
      obszar: "Bazy danych",
      poziom: null,
      podsumowanie: "",
      wymagania: [
        req("Min. 3 lata administracji SQL Server", "wymagane", "min. 3 lata doświadczenia w administracji SQL Server"),
        req("Znajomość T-SQL", "wymagane", "znajomość T-SQL"),
        req("Angielski B2", "wymagane", "angielski na poziomie B2", { kategoria: "jezyk" }),
        // AI oznaczyło punkt z „Mile widziane” jako wymagany
        req("Znajomość PowerShell", "wymagane", "znajomość PowerShell"),
        // wywnioskowane z obowiązków – zostaje bez zmian
        req("Doświadczenie z migracjami do Azure", "mile_widziane", "Migracje do Azure", { wywnioskowane: true, waga: 1 }),
      ],
    };
    const { draft, added, retyped } = completeDraft(ai, PRACUJ);
    expect(retyped).toBe(1);
    expect(added).toBe(1);
    expect(draft.wymagania.map((w) => `${w.typ}: ${w.tresc}`)).toEqual([
      "wymagane: Min. 3 lata administracji SQL Server",
      "wymagane: Znajomość T-SQL",
      "wymagane: Angielski B2",
      "mile_widziane: Znajomość PowerShell",
      "mile_widziane: Doświadczenie z migracjami do Azure",
      "mile_widziane: Certyfikat DP-300",
    ]);
  });

  it("wymaganie wydzielone przez AI z dłuższego punktu pokrywa ten punkt", () => {
    const md = "Wymagania:\n- znajomość SQL Server, Azure oraz PowerShell\n";
    const ai: OfferExtraction = {
      stanowisko: "",
      obszar: "",
      poziom: null,
      podsumowanie: "",
      wymagania: [req("Znajomość SQL Server", "wymagane", "SQL Server"), req("Znajomość Azure", "wymagane", "Azure"), req("Znajomość PowerShell", "wymagane", "PowerShell")],
    };
    expect(completeDraft(ai, md).added).toBe(0);
  });
});
