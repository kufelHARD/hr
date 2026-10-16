import fs from "node:fs/promises";
import path from "node:path";
import * as z from "zod/v4";
import { CONFIG_DIR, PROJECT_ROOT } from "@/lib/env";

// Konfiguracja formularza „Aplikuj” (edytowalna w Ustawieniach / pliku config/formularz.json)
// oraz klauzula informacyjna RODO (config/klauzula-rodo.md).

export const formConfigSchema = z.object({
  nazwa_firmy: z.string().min(1),
  zgoda_rekrutacja: z.string().min(10),
  zgoda_przyszle: z.string().min(10),
  podziekowanie: z.string().min(5),
  maks_rozmiar_mb: z.number().min(1).max(30),
});
export type FormConfig = z.infer<typeof formConfigSchema>;

const FORM_PATH = () => path.join(CONFIG_DIR(), "formularz.json");
const CLAUSE_PATH = () => path.join(CONFIG_DIR(), "klauzula-rodo.md");

/** Plik z folderu konfiguracji użytkownika, a gdy go brak (starsza instalacja) – domyślny z programu. */
async function readWithDefault(file: string): Promise<string> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fs.readFile(path.join(PROJECT_ROOT, "config", path.basename(file)), "utf8");
  }
}

export async function loadFormConfig(): Promise<FormConfig> {
  return formConfigSchema.parse(JSON.parse(await readWithDefault(FORM_PATH())));
}

export async function saveFormConfig(cfg: FormConfig) {
  await fs.writeFile(FORM_PATH(), JSON.stringify(formConfigSchema.parse(cfg), null, 2) + "\n", "utf8");
}

export async function loadClause(): Promise<string> {
  return readWithDefault(CLAUSE_PATH());
}

export async function saveClause(text: string) {
  await fs.writeFile(CLAUSE_PATH(), text.replace(/\r\n/g, "\n"), "utf8");
}
