import { describe, expect, it } from "vitest";
import { quoteAppearsInText, normalizeForSearch } from "@/lib/text";
import { verifyEvidence } from "@/lib/ai/analyze";
import type { AnalysisOutput } from "@/lib/ai/schemas";

const cv = `## Doświadczenie
Starszy administrator baz danych – Firma Alfa (2019 – obecnie)
• Utrzymanie klastra Always On AG (40 instancji SQL Server 2019)
• Migracja środowiska do Azure SQL
  Managed Instance oraz automatyzacja kopii zapasowych w PowerShell.`;

describe("weryfikacja cytatów z CV", () => {
  it("akceptuje cytat dosłowny i z innym łamaniem wierszy / wielkością liter / znakiem listy", () => {
    expect(quoteAppearsInText("Utrzymanie klastra Always On AG (40 instancji SQL Server 2019)", cv)).toBe(true);
    expect(quoteAppearsInText("migracja środowiska do Azure SQL Managed Instance", cv)).toBe(true);
    expect(quoteAppearsInText("• Utrzymanie klastra Always On AG", cv)).toBe(true);
  });

  it("toleruje brak polskich znaków i drobne pominięcia w długim cytacie", () => {
    expect(quoteAppearsInText("Migracja srodowiska do Azure SQL Managed Instance", cv)).toBe(true);
    expect(
      quoteAppearsInText("Migracja środowiska do Azure SQL Managed Instance oraz automatyzacja kopii zapasowych w PowerShell", cv),
    ).toBe(true);
  });

  it("odrzuca cytat, którego nie ma w CV", () => {
    expect(quoteAppearsInText("5 lat doświadczenia z Microsoft Azure i certyfikat AZ-104", cv)).toBe(false);
    expect(quoteAppearsInText("Terraform", cv)).toBe(false);
    expect(quoteAppearsInText("", cv)).toBe(false);
  });

  it("normalizacja do wyszukiwania usuwa polskie znaki", () => {
    expect(normalizeForSearch("  Łukasz   Żółkiewski ")).toBe("lukasz zolkiewski");
  });

  it("verifyEvidence oznacza statusy dowodów per wymaganie", () => {
    const output = {
      wymagania: [
        { id_wymagania: "R1", status: "pelne", dowod_cytat: "Utrzymanie klastra Always On AG", dowod_opis: "", technologia_pokrewna: null, uzasadnienie: "" },
        { id_wymagania: "R2", status: "pokrewne", dowod_cytat: "Praca z AWS przez 5 lat", dowod_opis: "", technologia_pokrewna: "AWS", uzasadnienie: "" },
        { id_wymagania: "R3", status: "czesciowe", dowod_cytat: null, dowod_opis: "", technologia_pokrewna: null, uzasadnienie: "" },
        { id_wymagania: "R4", status: "brak", dowod_cytat: null, dowod_opis: "Brak wzmianki w CV", technologia_pokrewna: null, uzasadnienie: "" },
      ],
    } as unknown as AnalysisOutput;
    expect(verifyEvidence(output, cv)).toEqual({
      R1: "zweryfikowany",
      R2: "niezweryfikowany",
      R3: "brak_cytatu",
      R4: "nie_dotyczy",
    });
  });
});
