import { Agent } from "undici";
import * as z from "zod/v4";
import { AiError } from "./errors";

// Lokalny model przez Ollamę (https://ollama.com) – darmowy, dane nie opuszczają komputera.
// Odpowiedź wymuszona schematem JSON (parametr `format`), temperatura 0 dla powtarzalności.

// Na komputerze bez karty graficznej odpowiedź może trwać kilkanaście minut – wydłużone limity czasu.
const dispatcher = new Agent({ headersTimeout: 45 * 60_000, bodyTimeout: 45 * 60_000, connectTimeout: 10_000 });

export type OllamaCallResult = {
  text: string;
  model: string;
  promptTokens: number;
  outputTokens: number;
  doneReason?: string;
};

function connectionError(baseUrl: string) {
  return new AiError(
    `Nie można połączyć się z Ollamą (${baseUrl}). Sprawdź, czy Ollama jest zainstalowana i uruchomiona (ikona w zasobniku systemowym), albo zmień silnik AI w Ustawieniach.`,
  );
}

/** JSON Schema dla Ollamy (bez ograniczeń liczbowych – i tak walidujemy w kodzie). */
export function toOllamaSchema(schema: z.ZodType): object {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node)) {
        if (["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "$schema"].includes(k)) continue;
        out[k] = strip(v);
      }
      return out;
    }
    return node;
  };
  return strip(json) as object;
}

async function ollamaFetch(baseUrl: string, pathname: string, init?: RequestInit & { timeoutMs?: number }) {
  try {
    return await fetch(`${baseUrl}${pathname}`, {
      ...init,
      // @ts-expect-error – dispatcher to rozszerzenie undici dla fetch w Node.js
      dispatcher,
      signal: init?.timeoutMs ? AbortSignal.timeout(init.timeoutMs) : init?.signal,
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw new AiError("Przekroczono czas oczekiwania na odpowiedź Ollamy.");
    throw connectionError(baseUrl);
  }
}

/** Czytanie strumienia NDJSON z Ollamy. */
async function* ndjson(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line);
    }
  }
  if (buf.trim()) yield JSON.parse(buf);
}

export async function ollamaChat(params: {
  baseUrl: string;
  model: string;
  contextTokens: number;
  system: string;
  user: string;
  schema: z.ZodType;
  maxOutputTokens: number;
  onProgress?: (generatedChars: number) => void;
}): Promise<OllamaCallResult> {
  // kontekst musi pomieścić prompt i odpowiedź (szacunek: ok. 3,5 znaku na token)
  const estimatedPrompt = Math.ceil((params.system.length + params.user.length) / 3.5);
  const numCtx = Math.min(65536, Math.max(params.contextTokens, estimatedPrompt + params.maxOutputTokens + 512));

  const res = await ollamaFetch(params.baseUrl, "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      keep_alive: "15m",
      format: toOllamaSchema(params.schema),
      options: { temperature: 0, num_ctx: numCtx, num_predict: params.maxOutputTokens },
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404 || /not found/i.test(body)) {
      throw new AiError(`Model „${params.model}” nie jest pobrany w Ollamie. Pobierz go w Ustawieniach → Silnik AI.`);
    }
    throw new AiError(`Błąd Ollamy (${res.status}): ${body.slice(0, 300)}`, res.status >= 500);
  }

  let text = "";
  let last: Record<string, unknown> = {};
  let lastReport = 0;
  for await (const chunk of ndjson(res)) {
    if (chunk.error) throw new AiError(`Błąd Ollamy: ${String(chunk.error)}`);
    const msg = chunk.message as { content?: string } | undefined;
    if (msg?.content) text += msg.content;
    if (params.onProgress && Date.now() - lastReport > 5000) {
      lastReport = Date.now();
      params.onProgress(text.length);
    }
    if (chunk.done) last = chunk;
  }
  return {
    text,
    model: params.model,
    promptTokens: Number(last.prompt_eval_count ?? 0),
    outputTokens: Number(last.eval_count ?? 0),
    doneReason: last.done_reason as string | undefined,
  };
}

// ---------- zarządzanie modelami (Ustawienia) ----------

export async function ollamaStatus(baseUrl: string): Promise<{ reachable: boolean; version?: string; models: Array<{ name: string; sizeGb: number }> }> {
  try {
    const [v, tags] = await Promise.all([
      ollamaFetch(baseUrl, "/api/version", { timeoutMs: 4000 }).then((r) => r.json() as Promise<{ version: string }>),
      ollamaFetch(baseUrl, "/api/tags", { timeoutMs: 4000 }).then((r) => r.json() as Promise<{ models: Array<{ name: string; size: number }> }>),
    ]);
    return {
      reachable: true,
      version: v.version,
      models: (tags.models ?? []).map((m) => ({ name: m.name, sizeGb: Math.round((m.size / 1e9) * 10) / 10 })),
    };
  } catch {
    return { reachable: false, models: [] };
  }
}

export function modelInstalled(models: Array<{ name: string }>, model: string): boolean {
  const want = model.includes(":") ? model : `${model}:latest`;
  return models.some((m) => m.name === want || m.name === model);
}

type PullState = { model: string; status: string; completed: number; total: number; done: boolean; error?: string };
const g = globalThis as unknown as { __ollamaPull?: PullState | null };

export function pullStatus(): PullState | null {
  return g.__ollamaPull ?? null;
}

/** Pobieranie modelu w tle (postęp odczytywany przez pullStatus). */
export function startPull(baseUrl: string, model: string) {
  if (g.__ollamaPull && !g.__ollamaPull.done) return;
  const state: PullState = { model, status: "rozpoczynanie…", completed: 0, total: 0, done: false };
  g.__ollamaPull = state;
  (async () => {
    try {
      const res = await ollamaFetch(baseUrl, "/api/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: true }),
      });
      if (!res.ok) throw new AiError(`Błąd pobierania (${res.status}): ${(await res.text()).slice(0, 200)}`);
      for await (const chunk of ndjson(res)) {
        if (chunk.error) throw new AiError(String(chunk.error));
        state.status = String(chunk.status ?? "");
        if (typeof chunk.total === "number") state.total = chunk.total;
        if (typeof chunk.completed === "number") state.completed = chunk.completed;
      }
      state.status = "gotowe";
    } catch (e) {
      state.error = (e as Error).message;
    } finally {
      state.done = true;
    }
  })();
}

/**
 * Test szybkości: krótka generacja z promptem ~1500 tokenów. Zwraca tempo przetwarzania i generowania
 * oraz szacowany czas analizy jednego CV (ok. 12 tys. tokenów wejścia i 5 tys. wyjścia).
 */
export async function speedTest(baseUrl: string, model: string) {
  const filler = "Administrator baz danych SQL Server, Always On, Azure, PowerShell, kopie zapasowe, strojenie zapytań. ".repeat(80);
  const res = await ollamaFetch(baseUrl, "/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      keep_alive: "15m",
      prompt: `${filler}\n\nNapisz jedno zdanie po polsku o tym, czym zajmuje się administrator baz danych.`,
      options: { temperature: 0, num_predict: 120, num_ctx: 4096 },
    }),
    timeoutMs: 20 * 60_000,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404 || /not found/i.test(body)) throw new AiError(`Model „${model}” nie jest pobrany.`);
    throw new AiError(`Błąd Ollamy (${res.status}): ${body.slice(0, 200)}`);
  }
  const d = (await res.json()) as { prompt_eval_count: number; prompt_eval_duration: number; eval_count: number; eval_duration: number };
  const promptRate = d.prompt_eval_count / (d.prompt_eval_duration / 1e9 || 1);
  const genRate = d.eval_count / (d.eval_duration / 1e9 || 1);
  const estimatedSeconds = 12000 / promptRate + 5000 / genRate;
  return { promptRate: Math.round(promptRate), genRate: Math.round(genRate * 10) / 10, estimatedMinutes: Math.round((estimatedSeconds / 60) * 10) / 10 };
}
