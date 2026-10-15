import path from "node:path";

/** Katalog projektu – stąd czytane są config/ i prompts/. */
export const PROJECT_ROOT = process.cwd();

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function num(name: string, fallback: number): number {
  const v = Number(str(name));
  return Number.isFinite(v) && str(name) !== "" ? v : fallback;
}

export const env = {
  get anthropicApiKey() {
    return str("ANTHROPIC_API_KEY");
  },
  get model() {
    return str("ANTHROPIC_MODEL", "claude-opus-5-5");
  },
  get effort() {
    return str("ANTHROPIC_EFFORT", "high") as "low" | "medium" | "high" | "xhigh" | "max";
  },
  /** undefined = nie wysyłamy parametru temperature */
  get temperature(): number | undefined {
    const v = str("ANALYSIS_TEMPERATURE");
    return v === "" ? undefined : Number(v);
  },
  get dataDir() {
    return path.resolve(PROJECT_ROOT, str("DATA_DIR", "./storage"));
  },
  get databaseUrl() {
    return str("DATABASE_URL", "file:./storage/app.db");
  },
  get analysisConcurrency() {
    return Math.max(1, Math.floor(num("ANALYSIS_CONCURRENCY", 2)));
  },
  get ocrEnabled() {
    return str("OCR_ENABLED", "true").toLowerCase() !== "false";
  },
  get sofficePath() {
    return str("SOFFICE_PATH");
  },
};

/**
 * Katalogi konfiguracji edytowanej przez użytkownika (opis firmy, mapa technologii, parametry oceny) i promptów.
 * W wersji do pobrania wskazują na folder danych (CONFIG_DIR / PROMPTS_DIR ustawia program uruchamiający),
 * żeby zmiany użytkownika przetrwały aktualizację aplikacji. Domyślnie: katalogi w projekcie.
 */
export const CONFIG_DIR = () => path.resolve(PROJECT_ROOT, str("CONFIG_DIR", "config"));
export const PROMPTS_DIR = () => path.resolve(PROJECT_ROOT, str("PROMPTS_DIR", "prompts"));
