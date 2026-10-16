import { describe, expect, it } from "vitest";
import { guessCandidateName, isNameFromText, legacyGuessCandidateName, tidyName } from "@/lib/matching";

const cases: Array<[string, string, string | null, string?]> = [
  ["nagłówek Markdown", "## Anna Kowalczyk\nSenior DBA", "Anna Kowalczyk"],
  ["po „Curriculum Vitae”", "Curriculum Vitae\nJan Maria Nowak-Kowalski\njan@x.pl", "Jan Maria Nowak-Kowalski"],
  ["brak imienia", "Kontakt\nanna@x.pl\nPoznań", null],
  ["WIELKIE LITERY", "ANNA KOWALCZYK\nData Engineer\n+48 600 000 000", "Anna Kowalczyk"],
  ["nazwisko WIELKIMI", "Anna KOWALSKA-NOWAK\nanalityk danych", "Anna Kowalska-Nowak"],
  ["litery rozstrzelone", "A N N A   K O W A L C Z Y K\nDBA", "Anna Kowalczyk"],
  ["tytuł zawodowy", "mgr inż. Piotr Wiśniewski\nAdministrator baz danych", "Piotr Wiśniewski"],
  ["stanowisko przed imieniem", "Senior Data Engineer\nZielona Góra\nMarek Lis\nmarek.lis@gmail.com", "Marek Lis"],
  ["miasto nie jest imieniem", "Zielona Góra\nKontakt: 600 100 200", null],
  ["nagłówek sekcji w Title Case", "Doświadczenie Zawodowe\nInformacje Dodatkowe\nBusiness Intelligence", null],
  ["imię i nazwisko w jednym wierszu ze stanowiskiem", "Katarzyna Wójcik | Database Administrator | Kraków", "Katarzyna Wójcik"],
  ["wiersz z adresem", "Tomasz Lewandowski, ul. Długa 5, 61-001 Poznań", "Tomasz Lewandowski"],
  ["etykieta", "Dane osobowe\nImię i nazwisko: Ewa Mazur\nTelefon: 600 000 000", "Ewa Mazur"],
  ["etykiety w osobnych wierszach", "Imię: Ewa\nNazwisko: Mazur\nTelefon: 600 000 000", "Ewa Mazur"],
  ["tabela", "| Imię i nazwisko | Michał Kaczmarek |\n| --- | --- |\n| E-mail | m@x.pl |", "Michał Kaczmarek"],
  ["kolejność nazwisko imię", "KOWALSKA ANNA\nkontakt", "Kowalska Anna"],
  ["imię i nazwisko w dwóch wierszach", "PAWEŁ\nZIELIŃSKI\nDevOps Engineer", "Paweł Zieliński"],
  ["rzadkie imię potwierdzone e-mailem", "Kontakt\n+48 600 000 001\nbozydar.cwiklinski@example.com\nPoznań\n\nTechnologie\nSQL Server\n\nBożydar Ćwikliński\nDBA", "Bożydar Ćwikliński"],
  [
    "CV dwukolumnowe – imię po pasku bocznym",
    "Kontakt\nanna.kowalczyk@example.com\n+48 600 000 001\nPoznań\n\nTechnologie\nSQL Server 2014–2022\nAlways On AG, FCI\nAzure SQL Managed Instance\nPowerShell, T-SQL\n\nJęzyki\nPolski – ojczysty\nAngielski – C1\n\nAnna Kowalczyk\nSenior Database Administrator",
    "Anna Kowalczyk",
  ],
  ["imię ukraińskie", "Oleksandr Shevchenko\nJava Developer", "Oleksandr Shevchenko"],
  ["firma z imieniem w doświadczeniu nie wygrywa", "Julia Zielińska\nDoświadczenie\nRobert Bosch Sp. z o.o.\nPraktyki", "Julia Zielińska"],
  ["referencje są pomijane", "Kontakt\n600 100 200\nReferencje\nJan Nowak – kierownik", null],
  ["nazwa pliku jako ostatnia deska ratunku", "Kontakt\n600 100 200\nPoznań", "Anna Kowalczyk", "CV_Anna_Kowalczyk_2024.pdf"],
  ["nazwa pliku nazwisko_imie", "Doświadczenie\nSQL", "Anna Kowalczyk", "kowalczyk_anna_cv.pdf"],
  ["nazwa pliku bez imienia", "Doświadczenie\nSQL", null, "cv (3).pdf"],
  ["sama technologia", "Microsoft Azure\nAmazon Web Services", null],
  ["stanowisko w Title Case", "Agile Coach\nScrum Master", null],
];

describe("rozpoznawanie imienia i nazwiska", () => {
  for (const [title, text, expected, file] of cases) {
    it(title, () => {
      expect(guessCandidateName(text, file)).toBe(expected);
    });
  }

  it("imię z treści ma pierwszeństwo przed nazwą pliku", () => {
    expect(guessCandidateName("Julia Zielińska\nanalityczka", "cv-julia-zielinska.docx")).toBe("Julia Zielińska");
  });

  it("imię z AI musi występować w CV", () => {
    const cv = "ANNA KOWALCZYK\nSenior DBA";
    expect(isNameFromText("Anna Kowalczyk", cv)).toBe(true);
    expect(isNameFromText("Kandydat", cv)).toBe(false);
    expect(isNameFromText("Nie podano", cv)).toBe(false);
    expect(isNameFromText("Anna Nowak", cv)).toBe(false);
    expect(tidyName("ANNA KOWALCZYK")).toBe("Anna Kowalczyk");
  });

  it("stara heurystyka – do rozpoznania automatycznie ustawionych nazw", () => {
    expect(legacyGuessCandidateName("Zielona Góra\nJan Kowalski")).toBe("Zielona Góra");
  });
});
