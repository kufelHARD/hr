// Aktualizacja bazy w wersji do pobrania: migracje nie mogą usuwać istniejących danych.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "../launcher/migrate.mjs";

const ROOT = path.join(__dirname, "..");
const ALL = path.join(ROOT, "prisma", "migrations");

describe("migracje bazy (program uruchamiający)", () => {
  it("aktualizacja z wersji 1.0.0 zachowuje kandydatów, zgłoszenia i analizy", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-migr-"));
    try {
      // stan bazy wersji 1.0.0 = pierwsze trzy migracje
      const old = path.join(tmp, "stare");
      fs.mkdirSync(old);
      const names = fs.readdirSync(ALL).filter((n) => fs.existsSync(path.join(ALL, n, "migration.sql"))).sort();
      for (const n of names.slice(0, 3)) fs.cpSync(path.join(ALL, n), path.join(old, n), { recursive: true });
      const dbFile = path.join(tmp, "app.db");
      expect(migrate(dbFile, old, ROOT)).toBe(3);

      const db = new Database(dbFile);
      db.exec(`
        INSERT INTO JobOffer (id, title, status, sourceType, rawText, updatedAt) VALUES ('o1', 'Oferta', 'aktywna', 'tekst', 'x', CURRENT_TIMESTAMP);
        INSERT INTO RequirementVersion (id, offerId, version) VALUES ('v1', 'o1', 1);
        INSERT INTO Candidate (id, fullName, updatedAt) VALUES ('c1', 'Jan', CURRENT_TIMESTAMP);
        INSERT INTO CvDocument (id, candidateId, originalFileName, storedFilePath, mimeType, sizeBytes, sha256) VALUES ('d1', 'c1', 'cv.pdf', 'files/cv/x.pdf', 'application/pdf', 1, 'h');
        INSERT INTO Application (id, candidateId, offerId, cvDocumentId, status, notes, updatedAt) VALUES ('a1', 'c1', 'o1', 'd1', 'gotowe', 'notatka', CURRENT_TIMESTAMP);
        INSERT INTO Analysis (id, applicationId, requirementVersionId, model, promptHash, resultJson, potentialScore, recommendation, summary, scoringSnapshot)
          VALUES ('an1', 'a1', 'v1', 'm', 'h', '{}', 50, 'zaprosic', 's', '{}');
      `);
      db.close();

      // aktualizacja do bieżącej wersji
      expect(migrate(dbFile, ALL, ROOT)).toBe(names.length - 3);
      const after = new Database(dbFile, { readonly: true });
      expect(after.prepare("SELECT count(*) n FROM Analysis").get()).toEqual({ n: 1 });
      expect(after.prepare("SELECT notes, stage, source FROM Application WHERE id='a1'").get()).toEqual({
        notes: "notatka",
        stage: "nowe",
        source: "recznie",
      });
      after.close();
      // ponowne uruchomienie nic nie zmienia
      expect(migrate(dbFile, ALL, ROOT)).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
