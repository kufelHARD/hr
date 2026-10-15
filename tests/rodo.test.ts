// Test integracyjny usuwania danych (RODO) na tymczasowej bazie i katalogu plików.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeDocx, makeTimelinePdf } from "./helpers/fixtures";

// analiza AI nie jest tu potrzebna – kolejka zastąpiona atrapą
vi.mock("@/lib/jobs/queue", () => ({ enqueueApplication: vi.fn() }));

// retencja włączona tylko na potrzeby testu
vi.mock("@/lib/settings", async (orig) => {
  const mod = await orig<typeof import("@/lib/settings")>();
  return {
    ...mod,
    loadScoringConfig: async () => ({
      ...(await mod.loadScoringConfig()),
      retencja: { wlaczona: true, dni: 30, tylko_bez_zgody: true },
    }),
  };
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-test-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_URL = `file:${path.join(tmp, "app.db")}`;

type Services = {
  db: typeof import("@/lib/db").db;
  candidates: typeof import("@/lib/services/candidates");
  offers: typeof import("@/lib/services/offers");
  retention: typeof import("@/lib/services/retention");
};
let s: Services;

async function makeOffer(title: string) {
  return s.db.jobOffer.create({
    data: {
      title,
      status: "aktywna",
      sourceType: "tekst",
      rawText: "treść",
      requirementVersions: {
        create: { version: 1, requirements: { create: [{ code: "R1", position: 0, text: "SQL", type: "wymagane", category: "technologia", weight: 3 }] } },
      },
    },
  });
}

const fileExists = (rel: string) => fs.existsSync(path.join(tmp, rel));

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "ignore" });
  s = {
    db: (await import("@/lib/db")).db,
    candidates: await import("@/lib/services/candidates"),
    offers: await import("@/lib/services/offers"),
    retention: await import("@/lib/services/retention"),
  };
});

afterAll(async () => {
  await s?.db.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("przechowywanie i usuwanie danych kandydatów", () => {
  it("odrzuca duplikat CV w tej samej ofercie, a w innej ofercie używa istniejącego kandydata", async () => {
    const o1 = await makeOffer("Oferta A");
    const o2 = await makeOffer("Oferta B");
    const pdf = await makeTimelinePdf();
    const r1 = await s.candidates.addCvToOffer(o1.id, "cv.pdf", pdf);
    expect(r1.ok).toBe(true);
    const dup = await s.candidates.addCvToOffer(o1.id, "cv-kopia.pdf", pdf);
    expect(dup).toEqual({ ok: false, error: "To samo CV jest już dodane do tej oferty." });
    const r2 = await s.candidates.addCvToOffer(o2.id, "cv.pdf", pdf);
    expect(r2.ok && r2.note).toMatch(/Rozpoznano kandydata/);
    expect(await s.db.candidate.count()).toBe(1);
    expect(await s.db.cvDocument.count()).toBe(1);
  });

  it("usunięcie kandydata z jednej oferty zostawia dane w drugiej; usunięcie oferty kasuje osierocone dane", async () => {
    const [o1, o2] = await s.db.jobOffer.findMany({ orderBy: { createdAt: "asc" } });
    const doc = await s.db.cvDocument.findFirstOrThrow();
    const app1 = await s.db.application.findFirstOrThrow({ where: { offerId: o1.id } });
    await s.db.analysis.create({
      data: {
        applicationId: app1.id,
        requirementVersionId: (await s.db.requirementVersion.findFirstOrThrow({ where: { offerId: o1.id } })).id,
        model: "test",
        promptHash: "x",
        resultJson: "{}",
        potentialScore: 50,
        recommendation: "do_rozwazenia",
        summary: "x",
        scoringSnapshot: "{}",
      },
    });
    await s.db.application.update({ where: { id: app1.id }, data: { notes: "notatka" } });

    const res = await s.candidates.removeApplication(app1.id);
    expect(res.candidateDeleted).toBe(false);
    expect(await s.db.analysis.count()).toBe(0); // analizy i notatki zgłoszenia usunięte
    expect(fileExists(doc.storedFilePath)).toBe(true); // CV nadal potrzebne w ofercie B

    const del = await s.offers.deleteOffer(o2.id);
    expect(del.deletedCandidates).toBe(1);
    expect(await s.db.candidate.count()).toBe(0);
    expect(await s.db.cvDocument.count()).toBe(0);
    expect(fileExists(doc.storedFilePath)).toBe(false); // plik usunięty z dysku
  });

  it("deleteCandidate usuwa pliki, tekst, zgłoszenia, analizy i notatki we wszystkich ofertach", async () => {
    const o = await makeOffer("Oferta C");
    const o2 = await makeOffer("Oferta D");
    const r = await s.candidates.addCvToOffer(o.id, "cv.docx", await makeDocx());
    if (!r.ok) throw new Error(r.error);
    const app = await s.db.application.findUniqueOrThrow({ where: { id: r.applicationId }, include: { cvDocument: true } });
    await s.candidates.assignCandidateToOffer(app.candidateId, o2.id);
    expect(await s.db.application.count({ where: { candidateId: app.candidateId } })).toBe(2);

    await s.candidates.deleteCandidate(app.candidateId);
    expect(await s.db.application.count()).toBe(0);
    expect(await s.db.cvDocument.count()).toBe(0);
    expect(fileExists(app.cvDocument.storedFilePath)).toBe(false);
  });

  it("retencja usuwa tylko kandydatów bez zgody, starszych niż limit", async () => {
    const o = await makeOffer("Oferta E");
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    const mk = async (consent: boolean, createdAt: Date, name: string) => {
      const c = await s.db.candidate.create({ data: { fullName: name, consentFuture: consent, createdAt } });
      const d = await s.db.cvDocument.create({
        data: { candidateId: c.id, originalFileName: "x.pdf", storedFilePath: "files/cv/nieistniejacy.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: name },
      });
      await s.db.application.create({ data: { candidateId: c.id, offerId: o.id, cvDocumentId: d.id, createdAt } });
      return c;
    };
    const staryBezZgody = await mk(false, old, "stary-bez-zgody");
    await mk(true, old, "stary-ze-zgoda");
    await mk(false, new Date(), "nowy-bez-zgody");

    const dry = await s.retention.runRetention({ dryRun: true });
    expect(dry.candidates).toEqual([staryBezZgody.id]);
    expect(await s.db.candidate.count()).toBe(3);

    await s.retention.runRetention();
    const left = (await s.db.candidate.findMany()).map((c) => c.fullName).sort();
    expect(left).toEqual(["nowy-bez-zgody", "stary-ze-zgoda"]);
  });
});
