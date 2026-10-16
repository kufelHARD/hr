// Imiona kandydatów: poprawa nazw odczytanych przez starszą heurystykę i ochrona nazw wpisanych ręcznie / z formularza.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/queue", () => ({ enqueueApplication: vi.fn(), enqueueAiAnalysis: vi.fn() }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-names-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_URL = `file:${path.join(tmp, "app.db")}`;

let db: typeof import("@/lib/db").db;
let offerId: string;

const SIDEBAR_CV = "Kontakt\n+48 600 100 200\nmagdalena.wrobel87@gmail.com\nZielona Góra\n\nUmiejętności\nSQL Server\n\nMagdalena Wróbel\nSenior Database Administrator";

async function candidate(fullName: string | null, text: string, opts: { source?: string; fileName?: string; nameSource?: string } = {}) {
  const c = await db.candidate.create({ data: { fullName, nameSource: opts.nameSource ?? null } });
  const doc = await db.cvDocument.create({
    data: {
      candidateId: c.id,
      originalFileName: opts.fileName ?? "cv.pdf",
      storedFilePath: "cv/x.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha256: c.id,
      extractedText: text,
      extractionMethod: "tekst",
    },
  });
  await db.application.create({ data: { candidateId: c.id, offerId, cvDocumentId: doc.id, status: "gotowe", source: opts.source ?? "recznie" } });
  return c.id;
}

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "ignore" });
  db = (await import("@/lib/db")).db;
  offerId = (await db.jobOffer.create({ data: { title: "DBA", status: "aktywna", sourceType: "tekst", rawText: "x" } })).id;
});

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("poprawa imion kandydatów", () => {
  it("poprawia nazwy ustawione przez starą heurystykę i chroni pozostałe", async () => {
    const wrong = await candidate("Zielona Góra", SIDEBAR_CV);
    const junk = await candidate("Business Intelligence", "Business Intelligence\nKontakt 600 100 200");
    const empty = await candidate(null, "## Piotr Wiśniewski\nDBA");
    const manual = await candidate("Magda Wróbel-Nowak", SIDEBAR_CV);
    const form = await candidate("Anna Testowa", SIDEBAR_CV, { source: "pracuj" });
    const fresh = await candidate("Ręcznie Wpisane", SIDEBAR_CV, { nameSource: "recznie" });

    const { repairCandidateNames } = await import("@/lib/services/names");
    const res = await repairCandidateNames();
    expect(res).toEqual({ checked: 5, renamed: 3 });

    const get = (id: string) => db.candidate.findUniqueOrThrow({ where: { id } });
    expect(await get(wrong)).toMatchObject({ fullName: "Magdalena Wróbel", nameSource: "cv", fullNameNormalized: "magdalena wrobel" });
    expect(await get(junk)).toMatchObject({ fullName: null, nameSource: "cv" });
    expect(await get(empty)).toMatchObject({ fullName: "Piotr Wiśniewski", nameSource: "cv" });
    expect(await get(manual)).toMatchObject({ fullName: "Magda Wróbel-Nowak", nameSource: "recznie" });
    expect(await get(form)).toMatchObject({ fullName: "Anna Testowa", nameSource: "formularz" });
    expect(await get(fresh)).toMatchObject({ fullName: "Ręcznie Wpisane", nameSource: "recznie" });

    // drugie uruchomienie nie ma nic do zrobienia
    expect(await repairCandidateNames()).toEqual({ checked: 0, renamed: 0 });
  });

  it("ponowny odczyt pliku zmienia imię tylko, gdy ustawił je automat", async () => {
    await db.requirementVersion.create({
      data: { offerId, version: 1, requirements: { create: [{ code: "W1", text: "SQL Server", type: "wymagane", category: "technologia", weight: 3, position: 0 }] } },
    });
    const auto = await candidate("Zielona Góra", SIDEBAR_CV, { nameSource: "cv" });
    const manual = await candidate("Pani Magda", SIDEBAR_CV, { nameSource: "recznie" });
    const { processApplication } = await import("@/lib/jobs/process");
    for (const id of [auto, manual]) {
      const app = await db.application.findFirstOrThrow({ where: { candidateId: id } });
      await processApplication(app.id);
    }
    expect((await db.candidate.findUniqueOrThrow({ where: { id: auto } })).fullName).toBe("Magdalena Wróbel");
    expect((await db.candidate.findUniqueOrThrow({ where: { id: manual } })).fullName).toBe("Pani Magda");
  });

  it("nieczytelny plik – imię z nazwy pliku", async () => {
    const c = await db.candidate.create({ data: {} });
    const doc = await db.cvDocument.create({
      data: { candidateId: c.id, originalFileName: "CV_Wojciech_Kamiński.docx", storedFilePath: "cv/y.docx", mimeType: "x", sizeBytes: 1, sha256: "y", extractionMethod: "nieudana" },
    });
    const app = await db.application.create({ data: { candidateId: c.id, offerId, cvDocumentId: doc.id } });
    const { processApplication } = await import("@/lib/jobs/process");
    await processApplication(app.id);
    expect(await db.candidate.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ fullName: "Wojciech Kamiński", nameSource: "cv" });
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("nieczytelne");
  });
});
