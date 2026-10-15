import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CONFIG_DIR } from "@/lib/env";

// ---------- config/scoring.json ----------

const nonNeg = z.number().min(0);

export const scoringConfigSchema = z.object({
  dopasowanie: z.object({
    wartosci_statusow: z.object({
      pelne: z.number().min(0).max(1),
      pokrewne: z.number().min(0).max(1),
      czesciowe: z.number().min(0).max(1),
      brak: z.number().min(0).max(1),
    }),
    mnozniki_typow: z.object({ wymagane: nonNeg, mile_widziane: nonNeg }),
  }),
  potencjal: z.object({
    wagi_skladowych: z.object({
      bliskosc_domenowa: nonNeg,
      umiejetnosci_przenoszalne: nonNeg,
      trajektoria_rozwoju: nonNeg,
      czas_wdrozenia: nonNeg,
      dopasowanie_do_firmy: nonNeg,
    }),
  }),
  retencja: z.object({
    wlaczona: z.boolean(),
    dni: z.number().int().min(1),
    tylko_bez_zgody: z.boolean(),
  }),
});

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const SCORING_PATH = path.join(CONFIG_DIR, "scoring.json");
export const TECH_MAP_PATH = path.join(CONFIG_DIR, "related-technologies.json");
export const COMPANY_CONTEXT_PATH = path.join(CONFIG_DIR, "company-context.md");

export async function loadScoringConfig(): Promise<ScoringConfig> {
  const raw = JSON.parse(await fs.readFile(SCORING_PATH, "utf8"));
  const parsed = scoringConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Niepoprawny plik config/scoring.json: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

// ---------- config/related-technologies.json ----------

export const techMapSchema = z.object({
  _opis: z.string().optional(),
  grupy: z.array(
    z.object({
      nazwa: z.string().min(1),
      technologie: z.array(z.string().min(1)).min(2),
      uwagi: z.string().optional(),
    }),
  ),
});

export type TechMap = z.infer<typeof techMapSchema>;

export async function loadTechMap(): Promise<TechMap> {
  const raw = JSON.parse(await fs.readFile(TECH_MAP_PATH, "utf8"));
  return techMapSchema.parse(raw);
}

export async function saveTechMap(map: TechMap): Promise<void> {
  const valid = techMapSchema.parse(map);
  await writeAtomic(TECH_MAP_PATH, JSON.stringify(valid, null, 2) + "\n");
}

/** Mapa w zwięzłej formie tekstowej do promptu. */
export function techMapToPrompt(map: TechMap): string {
  return map.grupy
    .map((g) => `- ${g.nazwa}: ${g.technologie.join(", ")}${g.uwagi ? ` (${g.uwagi})` : ""}`)
    .join("\n");
}

// ---------- config/company-context.md ----------

export async function loadCompanyContext(): Promise<string> {
  return fs.readFile(COMPANY_CONTEXT_PATH, "utf8");
}

export async function saveCompanyContext(content: string): Promise<void> {
  await writeAtomic(COMPANY_CONTEXT_PATH, content.replace(/\r\n/g, "\n"));
}

async function writeAtomic(file: string, content: string) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}
