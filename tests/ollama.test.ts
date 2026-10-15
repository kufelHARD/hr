// Silnik lokalny (Ollama) na atrapie serwera: ekstrakcja wymagań, analiza CV, koszty = 0, zarządzanie modelem.
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startMockOllama, type MockOllama } from "./helpers/mock-ollama";
import { estimateCostUsd } from "@/lib/ai/pricing";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-ollama-"));
process.env.DATA_DIR = tmp;
process.env.DATABASE_URL = `file:${path.join(tmp, "app.db")}`;
process.env.AI_PROVIDER = "ollama";
delete process.env.ANTHROPIC_API_KEY;

let mock: MockOllama;

beforeAll(async () => {
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "ignore" });
  mock = await startMockOllama();
  process.env.OLLAMA_URL = mock.url;
});

afterAll(async () => {
  await mock?.close();
  const { db } = await import("@/lib/db");
  await db.$disconnect();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("silnik lokalny (Ollama)", () => {
  it("domyślnym silnikiem jest darmowy model lokalny", async () => {
    const saved = process.env.AI_PROVIDER;
    delete process.env.AI_PROVIDER;
    const { getAiSettings } = await import("@/lib/app-settings");
    expect(getAiSettings().provider).toBe("ollama");
    expect(getAiSettings().ollama.model).toBe("gemma3:4b");
    process.env.AI_PROVIDER = saved;
  });

  it("odczytuje wymagania z oferty przez lokalny model ze schematem JSON i temperaturą 0", async () => {
    const { extractRequirements } = await import("@/lib/ai/requirements");
    const res = await extractRequirements("Szukamy administratora SQL Server z 3 latami doświadczenia i znajomością Azure. Mile widziany AZ-104.");
    expect(res.wymagania).toHaveLength(3);
    const call = mock.requests.find((r) => r.path === "/api/chat")!;
    expect(call.body.model).toBe("gemma3:4b");
    expect((call.body.options as { temperature: number }).temperature).toBe(0);
    expect(call.body.format).toMatchObject({ type: "object" });
    expect(JSON.stringify(call.body.format)).not.toMatch(/"minimum"|"maximum"/);
    expect((call.body.options as { num_ctx: number }).num_ctx).toBeGreaterThanOrEqual(16384);
  });

  it("analizuje CV, raportuje postęp i zapisuje koszt 0", async () => {
    const { analyzeCv } = await import("@/lib/ai/analyze");
    const progress: number[] = [];
    const cv = "Jan Testowy\nAdministrator SQL Server w firmie Alfa od 2020 roku, utrzymanie klastrów\nAWS RDS, EC2";
    const res = await analyzeCv(
      {
        title: "DBA",
        rawText: "oferta",
        requirements: [
          { code: "R1", text: "SQL Server", type: "wymagane", category: "technologia", weight: 3 },
          { code: "R2", text: "Azure", type: "wymagane", category: "technologia", weight: 2 },
          { code: "R3", text: "AZ-104", type: "mile_widziane", category: "certyfikaty", weight: 1 },
        ],
      },
      cv,
      (p) => progress.push(p.generatedChars),
    );
    expect(res.provider).toBe("ollama");
    expect(res.costUsd).toBe(0);
    expect(res.stored.output.wymagania.map((w) => w.status)).toEqual(["pelne", "pokrewne", "brak"]);
    expect(res.stored.evidence.R1).toBe("zweryfikowany");
    expect(res.model).toBe("ollama:gemma3:4b");

    const { db } = await import("@/lib/db");
    const usage = await db.aiUsage.findMany();
    expect(usage.length).toBeGreaterThanOrEqual(2);
    expect(usage.every((u) => u.provider === "ollama" && u.costUsd === 0)).toBe(true);
  });

  it("czytelny komunikat, gdy model nie jest pobrany lub Ollama nie działa", async () => {
    const { ollamaChat } = await import("@/lib/ai/ollama");
    const { z } = await import("zod");
    const base = { contextTokens: 4096, system: "s", user: "u", schema: z.object({ a: z.string() }), maxOutputTokens: 10 };
    await expect(ollamaChat({ ...base, baseUrl: mock.url, model: "brak:1b" })).rejects.toThrow(/nie jest pobrany/);
    await expect(ollamaChat({ ...base, baseUrl: "http://127.0.0.1:9", model: "gemma3:4b" })).rejects.toThrow(/Nie można połączyć się z Ollamą/);
  });

  it("status, pobieranie modelu i test szybkości", async () => {
    const { ollamaStatus, startPull, pullStatus, modelInstalled, speedTest } = await import("@/lib/ai/ollama");
    const st = await ollamaStatus(mock.url);
    expect(st.reachable).toBe(true);
    expect(modelInstalled(st.models, "gemma3:12b")).toBe(false);
    startPull(mock.url, "gemma3:12b");
    for (let i = 0; i < 50 && !pullStatus()?.done; i++) await new Promise((r) => setTimeout(r, 20));
    expect(pullStatus()).toMatchObject({ done: true, status: "gotowe" });
    expect(modelInstalled((await ollamaStatus(mock.url)).models, "gemma3:12b")).toBe(true);
    const speed = await speedTest(mock.url, "gemma3:4b");
    expect(speed).toEqual({ promptRate: 150, genRate: 10, estimatedMinutes: 9.7 });
    expect((await ollamaStatus("http://127.0.0.1:9")).reachable).toBe(false);
  });
});

describe("szacowanie kosztów", () => {
  it("model lokalny jest darmowy, Claude liczony z cennika", () => {
    const u = { inputTokens: 1000, outputTokens: 7000, cacheReadTokens: 11000, cacheWriteTokens: 0 };
    expect(estimateCostUsd("ollama", "ollama:gemma3:4b", u)).toBe(0);
    // Haiku 5.5: 1000×0.1 + 7000×0.5 + 11000×0.01 = 3710 / 1e6
    expect(estimateCostUsd("claude", "claude-haiku-5-5", u)).toBeCloseTo(0.00371, 6);
    // Opus 5.5: 1000×4 + 7000×20 + 11000×0.2 = 146200 / 1e6
    expect(estimateCostUsd("claude", "claude-opus-5-5", u)).toBeCloseTo(0.1462, 6);
    expect(estimateCostUsd("claude", "nieznany-model", u)).toBeNull();
  });
});
