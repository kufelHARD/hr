import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as z from "zod/v4";
import { env } from "@/lib/env";

// Ustawienia użytkownika zapisywane w katalogu danych (DATA_DIR/ustawienia.json), a nie w kodzie aplikacji,
// dzięki czemu przetrwają aktualizację aplikacji. Zmienne środowiskowe (.env) mają pierwszeństwo – wygodne
// w trybie deweloperskim i w Dockerze.

export const AI_PROVIDERS = ["ollama", "claude"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const CLAUDE_MODELS = [
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 – najtańszy (ok. 2 gr za CV)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 – pośredni" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 – najlepsza jakość (ok. 0,70 zł za CV)" },
] as const;

export const OLLAMA_MODEL_SUGGESTIONS = [
  { id: "gemma3:4b", label: "Gemma 3 4B – zwykły laptop (ok. 3 GB, domyślny)" },
  { id: "qwen3:4b", label: "Qwen 3 4B – zwykły laptop (ok. 2,5 GB)" },
  { id: "gemma3:12b", label: "Gemma 3 12B – komputer z kartą graficzną 12 GB+ lub 32 GB RAM (ok. 8 GB)" },
  { id: "qwen3:8b", label: "Qwen 3 8B – komputer z kartą graficzną 8 GB+ (ok. 5 GB)" },
] as const;

const settingsSchema = z.object({
  ai: z
    .object({
      dostawca: z.enum(AI_PROVIDERS).optional(),
      ollama: z
        .object({
          adres: z.string().optional(),
          model: z.string().optional(),
          kontekst: z.number().int().min(4096).max(131072).optional(),
        })
        .optional(),
      claude: z
        .object({
          kluczApi: z.string().optional(),
          model: z.string().optional(),
          effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
        })
        .optional(),
    })
    .optional(),
  hasloHash: z.string().optional(),
  adresPubliczny: z.string().optional(),
});
type StoredSettings = z.infer<typeof settingsSchema>;

export type AiSettings = {
  provider: AiProvider;
  ollama: { baseUrl: string; model: string; contextTokens: number };
  claude: { apiKey: string; apiKeySource: "env" | "ustawienia" | "brak"; model: string; effort: "low" | "medium" | "high" | "xhigh" | "max" };
};

function settingsPath() {
  return path.join(env.dataDir, "ustawienia.json");
}

function readStored(): StoredSettings {
  try {
    const parsed = settingsSchema.safeParse(JSON.parse(fs.readFileSync(settingsPath(), "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function writeStored(s: StoredSettings) {
  fs.mkdirSync(env.dataDir, { recursive: true });
  const tmp = `${settingsPath()}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, settingsPath());
}

export function getAiSettings(): AiSettings {
  const s = readStored().ai ?? {};
  const envKey = env.anthropicApiKey;
  const fileKey = s.claude?.kluczApi?.trim() ?? "";
  const envProvider = process.env.AI_PROVIDER?.trim() as AiProvider | undefined;
  // domyślnie zawsze darmowy model lokalny; płatny Claude tylko po świadomym wyborze w Ustawieniach
  // (lub AI_PROVIDER=claude w .env – tryb deweloperski)
  const provider: AiProvider =
    (envProvider && AI_PROVIDERS.includes(envProvider) ? envProvider : undefined) ?? s.dostawca ?? "ollama";
  return {
    provider,
    ollama: {
      baseUrl: (process.env.OLLAMA_URL?.trim() || s.ollama?.adres || "http://127.0.0.1:11434").replace(/\/+$/, ""),
      model: process.env.OLLAMA_MODEL?.trim() || s.ollama?.model || "gemma3:4b",
      contextTokens: s.ollama?.kontekst ?? 16384,
    },
    claude: {
      apiKey: envKey || fileKey,
      apiKeySource: envKey ? "env" : fileKey ? "ustawienia" : "brak",
      model: process.env.ANTHROPIC_MODEL?.trim() || s.claude?.model || "claude-haiku-5-5",
      effort: (process.env.ANTHROPIC_EFFORT?.trim() as AiSettings["claude"]["effort"]) || s.claude?.effort || "medium",
    },
  };
}

export function saveAiSettings(input: {
  provider: AiProvider;
  ollama: { baseUrl: string; model: string };
  claude: { model: string; effort: AiSettings["claude"]["effort"]; apiKey?: string | null };
}) {
  const current = readStored();
  const prevClaude = current.ai?.claude ?? {};
  writeStored({
    ...current,
    ai: {
      ...current.ai,
      dostawca: input.provider,
      ollama: { ...current.ai?.ollama, adres: input.ollama.baseUrl.trim(), model: input.ollama.model.trim() },
      claude: {
        ...prevClaude,
        model: input.claude.model,
        effort: input.claude.effort,
        // undefined = bez zmian, "" = usuń klucz
        ...(input.claude.apiKey === undefined || input.claude.apiKey === null ? {} : { kluczApi: input.claude.apiKey.trim() }),
      },
    },
  });
}

// ---------- adres publiczny (formularz „Aplikuj”) ----------

/** Adres, pod którym ATS jest dostępny z internetu, np. https://kariera.summ-it.pl (bez ukośnika na końcu). */
export function getPublicUrl(): string | null {
  const v = process.env.PUBLIC_URL?.trim() || readStored().adresPubliczny?.trim();
  return v ? v.replace(/\/+$/, "") : null;
}

export function savePublicUrl(url: string) {
  writeStored({ ...readStored(), adresPubliczny: url.trim().replace(/\/+$/, "") || undefined });
}

// ---------- hasło aplikacji ----------

/** Czy hasło jest skonfigurowane (w .env albo w ustawieniach). */
export function isPasswordConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD) || Boolean(readStored().hasloHash);
}

export function setPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  writeStored({ ...readStored(), hasloHash: `scrypt$${salt.toString("hex")}$${hash.toString("hex")}` });
}

export function verifyStoredPassword(password: string): boolean {
  const stored = readStored().hasloHash;
  if (!stored) return false;
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

/** Sekret do podpisywania sesji: AUTH_SECRET z .env albo losowy, zapisany w katalogu danych. */
export function getAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(env.dataDir, ".sekret-sesji");
  try {
    const s = fs.readFileSync(file, "utf8").trim();
    if (s.length >= 32) return s;
  } catch {
    /* brak – wygeneruj */
  }
  const secret = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(env.dataDir, { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
