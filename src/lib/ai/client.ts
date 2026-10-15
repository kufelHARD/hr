import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { env, PROMPTS_DIR } from "@/lib/env";

// Wspólna warstwa wywołań Claude API:
// - structured outputs (schemat JSON wymuszony przez API) + walidacja zod w kodzie,
// - jedna ponowna próba przy niepoprawnej odpowiedzi,
// - streaming (długie odpowiedzi nie przekraczają limitów czasu HTTP),
// - serwerowy fallback przy odmowie modelu (fallbacks: "default").

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.anthropicApiKey) {
    throw new AiError("Brak klucza ANTHROPIC_API_KEY w pliku .env – analiza AI jest niedostępna.");
  }
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 4, timeout: 15 * 60 * 1000 });
  return client;
}

export async function loadPrompt(name: string): Promise<{ text: string; hash: string }> {
  const text = await fs.readFile(path.join(PROMPTS_DIR, name), "utf8");
  return { text, hash: crypto.createHash("sha256").update(text).digest("hex").slice(0, 12) };
}

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type StructuredCallResult<T> = {
  data: T;
  usage: AiUsage;
  model: string;
  durationMs: number;
  attempts: number;
};

type CallParams<S extends z.ZodType> = {
  system: string;
  /** bloki treści wiadomości użytkownika; blok z `cache: true` kończy cache'owany prefiks */
  content: Array<{ text: string; cache?: boolean }>;
  schema: S;
  maxTokens?: number;
  /** dodatkowa walidacja semantyczna – zwraca listę problemów (pusta = OK) */
  validate?: (data: z.infer<S>) => string[];
};

function translateApiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AiError("Nieprawidłowy klucz API Anthropic (ANTHROPIC_API_KEY).");
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError("Klucz API nie ma uprawnień do wybranego modelu.");
  if (e instanceof Anthropic.NotFoundError) return new AiError(`Model „${env.model}” nie istnieje lub jest niedostępny.`);
  if (e instanceof Anthropic.RateLimitError) return new AiError("Przekroczono limit zapytań do API – spróbuj ponownie za chwilę.", true);
  if (e instanceof Anthropic.BadRequestError) return new AiError(`Błędne zapytanie do API: ${e.message}`);
  if (e instanceof Anthropic.InternalServerError) return new AiError("Błąd po stronie API Anthropic – spróbuj ponownie.", true);
  if (e instanceof Anthropic.APIConnectionError) return new AiError("Brak połączenia z API Anthropic.", true);
  if (e instanceof Anthropic.APIError) return new AiError(`Błąd API (${e.status ?? "?"}): ${e.message}`, true);
  return new AiError(`Nieoczekiwany błąd: ${(e as Error)?.message ?? String(e)}`);
}

async function callOnce<S extends z.ZodType>(params: CallParams<S>) {
  const anthropic = getClient();
  const content: Anthropic.Beta.BetaTextBlockParam[] = params.content.map((c) => ({
    type: "text",
    text: c.text,
    ...(c.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));

  const stream = anthropic.beta.messages.stream({
    model: env.model,
    max_tokens: params.maxTokens ?? 64000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
    output_config: { effort: env.effort, format: betaZodOutputFormat(params.schema) },
    // temperatura tylko gdy jawnie ustawiona (aktualne modele odrzucają ten parametr)
    ...(env.temperature !== undefined ? { temperature: env.temperature } : {}),
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new AiError("Model odmówił przetworzenia tego dokumentu (refusal). Spróbuj ponownie lub sprawdź treść pliku.");
  }
  if (message.stop_reason === "max_tokens") {
    return { message, data: null, problems: ["Odpowiedź modelu została ucięta (max_tokens)."] };
  }
  const text = message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { message, data: null, problems: ["Odpowiedź nie jest poprawnym JSON."] };
  }
  const parsed = params.schema.safeParse(json);
  if (!parsed.success) {
    return {
      message,
      data: null,
      problems: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  const problems = params.validate?.(parsed.data) ?? [];
  return { message, data: parsed.data as z.infer<S>, problems };
}

/**
 * Wywołanie modelu z wymuszonym schematem odpowiedzi.
 * Przy niepoprawnej odpowiedzi (schemat / walidacja semantyczna) wykonuje jedną ponowną próbę.
 * Jeśli po ponownej próbie zostały tylko problemy semantyczne – zwraca dane z listą `problems`.
 */
export async function callStructured<S extends z.ZodType>(
  params: CallParams<S>,
): Promise<StructuredCallResult<z.infer<S>> & { problems: string[] }> {
  const started = Date.now();
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let last: Awaited<ReturnType<typeof callOnce<S>>> | null = null;
  let model = env.model;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      last = await callOnce(params);
    } catch (e) {
      const err = translateApiError(e);
      if (attempt === 1 && err.retryable) continue;
      throw err;
    }
    const u = last.message.usage;
    usage.inputTokens += u.input_tokens ?? 0;
    usage.outputTokens += u.output_tokens ?? 0;
    usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
    model = last.message.model ?? model;

    if (last.data && last.problems.length === 0) {
      return { data: last.data, usage, model, durationMs: Date.now() - started, attempts: attempt, problems: [] };
    }
    console.warn(`[ai] próba ${attempt}: niepoprawna odpowiedź (${last.problems.join("; ")})`);
  }

  if (last?.data) {
    return { data: last.data, usage, model, durationMs: Date.now() - started, attempts: 2, problems: last.problems };
  }
  throw new AiError(`Model zwrócił niepoprawną odpowiedź także w ponownej próbie: ${last?.problems.join("; ") ?? "brak odpowiedzi"}`);
}
