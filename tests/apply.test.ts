// Publiczny formularz „Aplikuj”: zgłoszenia z linków w ogłoszeniach (tymczasowa baza, bez przetwarzania plików).
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeTimelinePdf } from "./helpers/fixtures";

vi.mock("@/lib/jobs/queue", () => ({ enqueueApplication: vi.fn(), enqueueAiAnalysis: vi.fn() }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-apply-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_URL = `file:${path.join(tmp, "app.db")}`;

let db: typeof import("@/lib/db").db;
let submit: typeof import("@/lib/apply/submit").submitApplication;
let slug: string;
let pdf: Buffer;

const fields = (over: Record<string, string> = {}) => ({ imie: "Anna Testowa", email: "Anna@Example.com", telefon: "+48 600 100 200", zgoda: "tak", ...over });

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "ignore" });
  db = (await import("@/lib/db")).db;
  submit = (await import("@/lib/apply/submit")).submitApplication;
  const offer = await db.jobOffer.create({ data: { title: "[Przykład] DBA SQL Server", status: "aktywna", sourceType: "tekst", rawText: "x" } });
  slug = await (await import("@/lib/services/offers")).ensureOfferSlug(offer.id);
  pdf = await makeTimelinePdf();
});

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("formularz „Aplikuj”", () => {
  it("adres formularza powstaje z tytułu oferty", () => {
    expect(slug).toMatch(/^dba-sql-server-[a-z0-9]{4}$/);
  });

  it("przyjmuje zgłoszenie: kandydat, CV, źródło, zgody", async () => {
    const res = await submit({ slug, source: "pracuj", fields: fields({ zgodaPrzyszle: "tak" }), file: { name: "cv.pdf", buffer: pdf } });
    expect(res).toEqual({ ok: true });
    const app = await db.application.findFirstOrThrow({ include: { candidate: true, cvDocument: true } });
    expect(app.source).toBe("pracuj");
    expect(app.consentAt).not.toBeNull();
    expect(app.consentText).toMatch(/bieżącego procesu rekrutacji/);
    expect(app.consentText).toMatch(/przyszłych procesów/);
    expect(app.consentText).toMatch(/Klauzula informacyjna/);
    expect(app.candidate).toMatchObject({ fullName: "Anna Testowa", email: "anna@example.com", phone: "+48 600 100 200", consentFuture: true });
    expect(app.cvDocument.mimeType).toBe("application/pdf");
    expect(fs.existsSync(path.join(tmp, app.cvDocument.storedFilePath))).toBe(true);
  });

  it("odrzuca ponowną aplikację tego samego e-maila na tę samą ofertę", async () => {
    const res = await submit({ slug, source: "justjoin", fields: fields({ email: "anna@example.com" }), file: { name: "cv.pdf", buffer: pdf } });
    expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/już do nas dotarła/) });
  });

  it("wymaga zgody, poprawnego e-maila i pliku PDF/Word", async () => {
    expect(await submit({ slug, source: null, fields: fields({ email: "b@x.pl", zgoda: "" }), file: { name: "cv.pdf", buffer: pdf } })).toMatchObject({ ok: false, field: "zgoda" });
    expect(await submit({ slug, source: null, fields: fields({ email: "zly-email" }), file: { name: "cv.pdf", buffer: pdf } })).toMatchObject({ ok: false, field: "email" });
    expect(await submit({ slug, source: null, fields: fields({ email: "c@x.pl" }), file: { name: "cv.txt", buffer: Buffer.from("tekst") } })).toMatchObject({
      ok: false,
      field: "plik",
    });
    expect(await submit({ slug, source: null, fields: fields({ email: "d@x.pl" }), file: null })).toMatchObject({ ok: false, field: "plik" });
  });

  it("nie przyjmuje zgłoszeń, gdy formularz lub oferta są zamknięte", async () => {
    await db.jobOffer.update({ where: { slug }, data: { publicApply: false } });
    expect(await submit({ slug, source: null, fields: fields({ email: "e@x.pl" }), file: { name: "cv.pdf", buffer: pdf } })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/zamknięta/),
    });
    await db.jobOffer.update({ where: { slug }, data: { publicApply: true, status: "zarchiwizowana" } });
    expect(await submit({ slug, source: null, fields: fields({ email: "e@x.pl" }), file: { name: "cv.pdf", buffer: pdf } })).toMatchObject({ ok: false });
    expect(await submit({ slug: "nie-istnieje", source: null, fields: fields(), file: { name: "cv.pdf", buffer: pdf } })).toMatchObject({ ok: false });
  });

  it("źródła z linków i limit zgłoszeń z jednego adresu", async () => {
    const { normalizeSource, sourceLabel } = await import("@/lib/apply/sources");
    expect(normalizeSource("pracuj")).toBe("pracuj");
    expect(normalizeSource("pracuj.pl")).toBe("pracuj");
    expect(normalizeSource("JJIT")).toBe("justjoin");
    expect(normalizeSource("<script>")).toBe("script");
    expect(normalizeSource(null)).toBe("formularz");
    expect(sourceLabel("justjoin")).toBe("justjoin.it");
    const { rateLimit } = await import("@/lib/apply/rate-limit");
    const results = Array.from({ length: 7 }, () => rateLimit("test-ip", 5, 60_000));
    expect(results).toEqual([true, true, true, true, true, false, false]);
  });
});
