import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { PROMPTS_DIR, env } from "@/lib/env";
import { getAiSettings, type AiProvider } from "@/lib/app-settings";
import { AiError } from "./errors";
import { ollamaChat } from "./ollama";
import { estimateCostUsd, type TokenUsage } from "./pricing";

export { AiError } from "./errors";

// Wspólna warstwa wywołań AI dla dwóch silników:
// - „ollama” – lokalny, darmowy model (dane nie opuszczają komputera),
// - „claude” – Claude API (płatne, wyższa jakość).
// W obu: wymuszony schemat JSON + walidacja zod w kodzie + jedna ponowna próba przy błędnej odpowiedzi.
// Każde wywołanie jest zapisywane w dzienniku kosztów (tabela AiUsage – bez danych osobowych).

// Modele Claude obsługujące serwerowy fallback przy odmowie (fallbacks: "default").
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"];
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let anthropic: { key: string; client: Anthropic } | null = null;

function getAnthropic(apiKey: string): Anthropic {
  if (!apiKey) {
    throw new AiError("Brak klucza API Claude. Wpisz go w Ustawieniach → Silnik AI albo wybierz darmowy model lokalny.");
  }
  if (anthropic?.key !== apiKey) anthropic = { key: apiKey, client: new Anthropic({ apiKey, maxRetries: 4, timeout: 15 * 60 * 1000 }) };
  return anthropic.client;
}

export async function loadPrompt(name: string): Promise<{ text: string; hash: string }> {
  const text = await fs.readFile(path.join(PROMPTS_DIR(), name), "utf8");
  return { text, hash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 12) };
}

export type AiUsage = TokenUsage;

export type StructuredCallResult<T> = {
  data: T;
  usage: AiUsage;
  provider: AiProvider;
  model: string;
  costUsd: number | null;
  durationMs: number;
  attempts: number;
  problems: string[];
};

export type ProgressInfo = { generatedChars: number; elapsedMs: number; provider: AiProvider };

type CallParams<S extends z.ZodType> = {
  /** rodzaj wywołania – do zestawienia kosztów */
  kind: "analiza" | "wymagania";
  system: string;
  /** bloki treści wiadomości użytkownika; blok z `cache: true` kończy cache'owany prefiks (Claude) */
  content: Array<{ text: string; cache?: boolean }>;
  schema: S;
  maxTokens?: number;
  /** dodatkowa walidacja semantyczna – zwraca listę problemów (pusta = OK) */
  validate?: (data: z.infer<S>) => string[];
  onProgress?: (p: ProgressInfo) => void;
};

function translateApiError(e: unknown, model: string): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError("Nieprawidłowy klucz API Claude – sprawdź go w Ustawieniach.");
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("Klucz API nie ma uprawnień do wybranego modelu.");
  if (e instanceof Anthropic.NotFoundError) return new AiError(`Model „${model}” nie istnieje lub jest niedostępny.`);
  if (e instanceof Anthropic.RateLimitError) return new AiError("Przekroczono limit zapytań do API – spróbuj ponownie za chwilę.", true);
  if (e instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(e.message)) return new AiError("Brak środków na koncie Anthropic – doładuj konto w console.anthropic.com.");
    return new AiError(`Błędne zapytanie do API: ${e.message}`);
  }
  if (e instanceof Anthropic.InternalServerError) return new AiError("Błąd po stronie API Anthropic – spróbuj ponownie.", true);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("Brak połączenia z API Anthropic (internet?).", true);
  if (e instanceof Anthropic.APIError) return new AiError(`Błąd API (${e.status ?? "?"}): ${e.message}`, true);
  return new AiError(`Nieoczekiwany błąd: ${(e as Error)?.message ?? String(e)}`);
}

type RawResult = { text: string; usage: AiUsage; model: string; truncated: boolean };

async function callClaude<S extends z.ZodType>(params: CallParams<S>, started: number): Promise<RawResult> {
  const s = getAiSettings().claude;
  const client = getAnthropic(s.apiKey);
  const useFallback = FALLBACK_MODELS.includes(s.model);
  const content: Anthropic.Beta.BetaTextBlockParam[] = params.content.map((c) => ({
    type: "text",
    text: c.text,
    ...(c.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
  try {
    const stream = client.beta.messages.stream({
      model: s.model,
      max_tokens: params.maxTokens ?? 64000,
      ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
      system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
      output_config: { effort: s.effort, format: betaZodOutputFormat(params.schema) },
      // temperatura tylko gdy jawnie ustawiona (aktualne modele odrzucają ten parametr)
      ...(env.temperature !== undefined ? { temperature: env.temperature } : {}),
    });
    let chars = 0;
    let lastReport = 0;
    stream.on("text", (delta) => {
      chars += delta.length;
      if (params.onProgress && Date.now() - lastReport > 5000) {
        lastReport = Date.now();
        params.onProgress({ generatedChars: chars, elapsedMs: Date.now() - started, provider: "claude" });
      }
    });
    const message = await stream.finalMessage();
    const usage: AiUsage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    };
    if (message.stop_reason === "refusal") {
      throw new AiError("Model odmówił przetworzenia tego dokumentu (refusal). Spróbuj ponownie lub sprawdź treść pliku.");
    }
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, usage, model: message.model ?? s.model, truncated: message.stop_reason === "max_tokens" };
  } catch (e) {
    throw translateApiError(e, s.model);
  }
}

async function callOllama<S extends z.ZodType>(params: CallParams<S>, started: number): Promise<RawResult> {
  const s = getAiSettings().ollama;
  const res = await ollamaChat({
    baseUrl: s.baseUrl,
    model: s.model,
    contextTokens: s.contextTokens,
    system: params.system,
    user: params.content.map((c) => c.text).join("\n\n"),
    schema: params.schema,
    maxOutputTokens: Math.min(params.maxTokens ?? 12000, 12000),
    onProgress: (generatedChars) => params.onProgress?.({ generatedChars, elapsedMs: Date.now() - started, provider: "ollama" }),
  });
  return {
    text: res.text,
    model: `ollama:${res.model}`,
    usage: { inputTokens: res.promptTokens, outputTokens: res.outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
    truncated: res.doneReason === "length",
  };
}

async function logUsage(entry: {
  kind: string;
  provider: AiProvider;
  model: string;
  usage: AiUsage;
  costUsd: number | null;
  durationMs: number;
  success: boolean;
}) {
  try {
    const { db } = await import("@/lib/db");
    await db.aiUsage.create({
      data: {
        kind: entry.kind,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.usage.inputTokens,
        outputTokens: entry.usage.outputTokens,
        cacheReadTokens: entry.usage.cacheReadTokens,
        cacheWriteTokens: entry.usage.cacheWriteTokens,
        costUsd: entry.costUsd,
        durationMs: entry.durationMs,
        success: entry.success,
      },
    });
  } catch (e) {
    console.error("[koszty] nie udało się zapisać zużycia:", (e as Error).message);
  }
}

/**
 * Wywołanie modelu z wymuszonym schematem odpowiedzi.
 * Przy niepoprawnej odpowiedzi (schemat / walidacja semantyczna) wykonuje jedną ponowną próbę.
 * Jeśli po ponownej próbie zostały tylko problemy semantyczne – zwraca dane z listą `problems`.
 */
export async function callStructured<S extends z.ZodType>(params: CallParams<S>): Promise<StructuredCallResult<z.infer<S>>> {
  const provider = getAiSettings().provider;
  const started = Date.now();
  const total: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let totalCost: number | null = 0;
  let model: string = provider;
  let lastData: z.infer<S> | null = null;
  let lastProblems: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptStart = Date.now();
    let raw: RawResult;
    try {
      raw = provider === "ollama" ? await callOllama(params, started) : await callClaude(params, started);
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError((e as Error).message);
      if (attempt === 1 && err.retryable) continue;
      throw err;
    }
    model = raw.model;
    const cost = estimateCostUsd(provider, raw.model, raw.usage);
    total.inputTokens += raw.usage.inputTokens;
    total.outputTokens += raw.usage.outputTokens;
    total.cacheReadTokens += raw.usage.cacheReadTokens;
    total.cacheWriteTokens += raw.usage.cacheWriteTokens;
    totalCost = totalCost === null || cost === null ? null : totalCost + cost;

    let problems: string[] = [];
    let data: z.infer<S> | null = null;
    if (raw.truncated) problems = ["Odpowiedź modelu została ucięta (limit długości)."];
    else {
      try {
        const parsed = params.schema.safeParse(JSON.parse(raw.text));
        if (parsed.success) {
          data = parsed.data as z.infer<S>;
          problems = params.validate?.(data) ?? [];
        } else {
          problems = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
        }
      } catch {
        problems = ["Odpowiedź nie jest poprawnym JSON."];
      }
    }
    await logUsage({
      kind: params.kind,
      provider,
      model: raw.model,
      usage: raw.usage,
      costUsd: cost,
      durationMs: Date.now() - attemptStart,
      success: data !== null && problems.length === 0,
    });

    if (data && problems.length === 0) {
      return { data, usage: total, provider, model, costUsd: totalCost, durationMs: Date.now() - started, attempts: attempt, problems: [] };
    }
    if (data) lastData = data;
    lastProblems = problems;
    console.warn(`[ai] próba ${attempt}: niepoprawna odpowiedź (${problems.join("; ")})`);
  }

  if (lastData) {
    return { data: lastData, usage: total, provider, model, costUsd: totalCost, durationMs: Date.now() - started, attempts: 2, problems: lastProblems };
  }
  throw new AiError(`Model zwrócił niepoprawną odpowiedź także w ponownej próbie: ${lastProblems.join("; ") || "brak odpowiedzi"}`);
}
