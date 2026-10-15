import { afterAll, describe, expect, it } from "vitest";
import { detectFileKind, extractDocument } from "@/lib/extract";
import { terminateOcr } from "@/lib/extract/ocr";
import { makeDocx, makeScannedPdf, makeTimelinePdf, makeTwoColumnPdf } from "./helpers/fixtures";

afterAll(async () => {
  await terminateOcr();
});

describe("ekstrakcja DOCX", () => {
  it("zachowuje nagłówki, listy, pogrubienia, tabele i nagłówek dokumentu", async () => {
    const res = await extractDocument(await makeDocx(), "oferta.docx");
    expect(res.method).toBe("tekst");
    const t = res.text;
    expect(t).toContain("# Specjalista ds. Azure");
    expect(t).toContain("**Czego oczekujemy:**");
    expect(t).toMatch(/^- +Min\. 3 lata doświadczenia z Microsoft Azure/m);
    expect(t).toMatch(/^- +Znajomość Terraform lub Bicep/m);
    expect(t).toContain("## Mile widziane");
    expect(t).toContain("| Lokalizacja | Poznań |");
    expect(t).toContain("| Forma pracy | Hybrydowa |");
    expect(t).toContain("Jan Przykładowy");
    // kolejność sekcji zachowana
    expect(t.indexOf("Czego oczekujemy")).toBeLessThan(t.indexOf("Mile widziane"));
  });

  it("rozpoznaje typ pliku po zawartości", async () => {
    expect(detectFileKind(await makeDocx(), "cv.docx")).toBe("docx");
    expect(detectFileKind(await makeTimelinePdf(), "cv.pdf")).toBe("pdf");
    expect(detectFileKind(await makeTimelinePdf(), "cv-bez-rozszerzenia")).toBe("pdf");
    expect(() => detectFileKind(Buffer.from("zwykły tekst"), "cv.txt")).toThrow(/Nieobsługiwany format/);
  });
});

describe("ekstrakcja PDF", () => {
  it("nie miesza kolumn w CV dwukolumnowym", async () => {
    const res = await extractDocument(await makeTwoColumnPdf(), "cv.pdf");
    expect(res.method, res.warnings.join("; ")).toBe("tekst");
    const t = res.text;
    expect(t).toContain("Anna Testowa");
    // polskie znaki
    expect(t).toContain("Umiejętności");
    expect(t).toContain("Doświadczenie zawodowe");

    // cały pasek boczny przed treścią główną (albo odwrotnie), bez przeplatania
    const side = ["SQL Server 2019", "PowerShell", "Always On AG", "Query Store", "Angielski – C1"].map((s) =>
      t.indexOf(`• ${s}`) >= 0 ? t.indexOf(`• ${s}`) : t.indexOf(s),
    );
    const mainStart = t.indexOf("Doświadczenie zawodowe");
    const mainEnd = t.indexOf("replikacji transakcyjnej");
    expect(mainStart).toBeGreaterThan(-1);
    expect(mainEnd).toBeGreaterThan(mainStart);
    for (const pos of side) {
      expect(pos).toBeGreaterThan(-1);
      expect(pos < mainStart || pos > mainEnd).toBe(true);
    }
    // akapit treści głównej jest ciągły – zawinięte wiersze są scalane w jeden
    expect(t).toMatch(/Odpowiedzialność za klaster Always On obejmujący czterdzieści instancji SQL Server\./);
    // pozycje paska bocznego zostają osobno
    expect(t).toMatch(/^• PowerShell$/m);
  });

  it("w układzie „data | opis” zostawia datę przy opisie", async () => {
    const res = await extractDocument(await makeTimelinePdf(), "cv.pdf");
    const lines = res.text.split("\n");
    const line = lines.find((l) => l.includes("Administrator Oracle"));
    expect(line).toBeDefined();
    expect(line).toContain("2017 – 2021");
    const flat = res.text.replace(/\s+/g, " ");
    expect(flat.indexOf("2017 – 2021")).toBeLessThan(flat.indexOf("Data Guard"));
    expect(flat.indexOf("2021 – obecnie")).toBeLessThan(flat.indexOf("2017 – 2021"));
  });

  it("wykrywa skan bez warstwy tekstowej i używa OCR (pol+eng)", async () => {
    const pdf = await makeScannedPdf([
      "Piotr Skanowany",
      "Doświadczenie: administracja SQL Server",
      "Certyfikat Microsoft Azure Administrator",
      "Języki: polski, angielski",
      "Umiejętności: PowerShell, Linux, sieci komputerowe",
    ]);
    const res = await extractDocument(pdf, "skan.pdf");
    expect(res.method, res.warnings.join("; ")).toBe("ocr");
    expect(res.text).toMatch(/Piotr Skanowany/);
    expect(res.text).toMatch(/SQL Server/);
    expect(res.text).toMatch(/Doświadczenie/);
    expect(res.warnings.join(" ")).toMatch(/OCR/);
  });

  it("oznacza pusty skan komunikatem o nieudanym odczycie", async () => {
    const pdf = await makeScannedPdf([]);
    const res = await extractDocument(pdf, "pusty.pdf");
    expect(res.method).toBe("nieudana");
    expect(res.error).toMatch(/Nie udało się odczytać tekstu/);
  });
});
