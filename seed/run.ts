// Przykładowe dane: 1 oferta (.docx) + 3 fikcyjne CV → pełna analiza AI → raport w konsoli i w storage/raport-seed.md.
// Uruchomienie: npm run seed            (gdy przykład już istnieje – kończy z komunikatem)
//               npm run seed -- --ai     (dodatkowo pogłębiona analiza AI każdego CV)
//               npm run seed -- --reset (usuwa poprzedni przykład i tworzy go od nowa)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createOfferDraft, currentRequirementVersion, deleteOffer } from "@/lib/services/offers";
import { addCvToOffer, requestAiAnalysis } from "@/lib/services/candidates";
import type { QuickMatchResult } from "@/lib/matching";
import { RECOMMENDATION_LABELS, type StoredAnalysis } from "@/lib/ai/schemas";
import { POTENTIAL_COMPONENTS, POTENTIAL_LABELS, STATUS_LABELS, TYPE_LABELS, type RequirementType } from "@/lib/scoring";
import { terminateOcr } from "@/lib/extract/ocr";

const FILES = path.join(__dirname, "files");
const TITLE = "[Przykład] Administrator baz danych SQL Server / Specjalista Azure";
const CVS = [
  { file: "cv-anna-kowalczyk.pdf", profil: "dokładne dopasowanie" },
  { file: "cv-tomasz-nowicki.pdf", profil: "AWS zamiast Azure" },
  { file: "cv-julia-zielinska.docx", profil: "junior z dużym potencjałem" },
];

// Ceny claude-opus-5-5 (USD / 1M tokenów) – tylko do orientacyjnego szacunku kosztu
const PRICE = { input: 4, cacheRead: 0.2, output: 20 };

async function main() {
  if (!env.anthropicApiKey) {
    console.error("Brak ANTHROPIC_API_KEY w .env – seed wymaga dostępu do Claude API.");
    process.exit(1);
  }
  for (const f of ["oferta-dba-sql-server-azure.docx", ...CVS.map((c) => c.file)]) {
    if (!fs.existsSync(path.join(FILES, f))) {
      console.error(`Brak pliku seed/files/${f} – uruchom najpierw: npm run seed:generate`);
      process.exit(1);
    }
  }

  const existing = await db.jobOffer.findMany({ where: { title: TITLE } });
  if (existing.length) {
    if (!process.argv.includes("--reset")) {
      console.log("Przykładowa oferta już istnieje. Aby utworzyć ją od nowa: npm run seed -- --reset");
      return;
    }
    for (const o of existing) await deleteOffer(o.id);
    console.log("Usunięto poprzedni przykład.");
  }

  console.log(`Model: ${env.model}, effort: ${env.effort}`);
  console.log("1/3 Oferta: ekstrakcja tekstu i wymagań (AI)…");
  const offerFile = "oferta-dba-sql-server-azure.docx";
  const created = await createOfferDraft({
    title: TITLE,
    file: { name: offerFile, buffer: fs.readFileSync(path.join(FILES, offerFile)) },
    autoActivate: true,
  });
  if (!created.ok) throw new Error(created.error);
  if (!created.activated) throw new Error(`AI nie wyodrębniło wymagań: ${created.aiError ?? "nieznany błąd"}`);
  const offer = await db.jobOffer.findUniqueOrThrow({ where: { id: created.offerId } });

  const withAi = process.argv.includes("--ai");
  console.log(`2/3 Wgrywanie CV, szybkie dopasowanie${withAi ? " i analiza AI (to potrwa kilka minut)" : ""}…`);
  const appIds: string[] = [];
  for (const cv of CVS) {
    const res = await addCvToOffer(offer.id, cv.file, fs.readFileSync(path.join(FILES, cv.file)));
    if (!res.ok) throw new Error(`${cv.file}: ${res.error}`);
    appIds.push(res.applicationId);
  }
  const started = Date.now();
  for (;;) {
    const apps = await db.application.findMany({ where: { id: { in: appIds } }, select: { status: true, aiStatus: true } });
    const pending = apps.filter((a) => ["oczekuje", "ekstrakcja"].includes(a.status) || ["oczekuje", "analiza"].includes(a.aiStatus ?? "")).length;
    process.stdout.write(`\r   gotowe: ${apps.length - pending}/${apps.length} (${Math.round((Date.now() - started) / 1000)} s)   `);
    if (pending === 0) {
      // po szybkim dopasowaniu – opcjonalnie analiza AI dla wszystkich
      if (withAi && apps.every((a) => a.aiStatus === null)) {
        for (const id of appIds) await requestAiAnalysis(id);
        continue;
      }
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("\n3/3 Raport\n");

  const version = await currentRequirementVersion(offer.id);
  const lines: string[] = [];
  const log = (s = "") => lines.push(s);
  log(`# Raport seed – ${TITLE}`);
  log(`Model: ${env.model} · effort: ${env.effort} · ${new Date().toLocaleString("pl-PL")}`);
  log("\n## Wymagania wyodrębnione z oferty (wersja " + version!.version + ")\n");
  log("| ID | Wymaganie | Typ | Kategoria | Waga |");
  log("|---|---|---|---|---|");
  for (const r of version!.requirements) log(`| ${r.code} | ${r.text}${r.inferred ? " _(wywnioskowane)_" : ""} | ${TYPE_LABELS[r.type as RequirementType]} | ${r.category} | ${r.weight} |`);

  let totalCost = 0;
  for (let i = 0; i < appIds.length; i++) {
    const app = await db.application.findUniqueOrThrow({
      where: { id: appIds[i] },
      include: {
        candidate: true,
        analyses: { orderBy: { createdAt: "desc" }, take: 1 },
        quickMatches: { orderBy: { createdAt: "desc" }, take: 1 },
        cvDocument: true,
      },
    });
    log(`\n## ${i + 1}. ${app.candidate.fullName ?? app.cvDocument.originalFileName} – profil: ${CVS[i].profil}`);
    const q = app.quickMatches[0];
    if (q) {
      const qr: QuickMatchResult = JSON.parse(q.resultJson);
      log(`\n**Szybkie dopasowanie (bez AI): ${qr.score}%** · staż z dat w CV: ${qr.experienceYears ?? "–"} lat`);
      log("\n| ID | Status | Uwagi |");
      log("|---|---|---|");
      for (const it of qr.items) log(`| ${it.code} | ${it.status} | ${it.note} |`);
    }
    const a = app.analyses[0];
    if (!a) {
      if (app.status !== "gotowe") log(`Status: ${app.status} – ${app.statusMessage ?? ""}`);
      if (app.aiStatus === "blad") log(`Analiza AI: błąd – ${app.aiStatusMessage ?? ""}`);
      continue;
    }
    const s: StoredAnalysis = JSON.parse(a.resultJson);
    const uncached = (a.inputTokens ?? 0) - (a.cacheReadTokens ?? 0);
    const cost = (uncached * PRICE.input + (a.cacheReadTokens ?? 0) * PRICE.cacheRead + (a.outputTokens ?? 0) * PRICE.output) / 1e6;
    totalCost += cost;
    log(`Plik: ${app.cvDocument.originalFileName} (${app.cvDocument.extractionMethod}) · czas analizy ${Math.round((a.durationMs ?? 0) / 1000)} s · tokeny: wej. ${a.inputTokens} (z cache ${a.cacheReadTokens}), wyj. ${a.outputTokens} · ok. $${cost.toFixed(3)}`);
    log(`\n**Dopasowanie: ${a.matchScore}%  ·  Potencjał: ${a.potentialScore}%  ·  ${RECOMMENDATION_LABELS[s.output.rekomendacja]}**`);
    log(`\n> ${s.output.opis_kandydata}`);
    log("\n| ID | Status | Dowód (cytat) | Weryfikacja | Uzasadnienie |");
    log("|---|---|---|---|---|");
    for (const w of s.output.wymagania) {
      const extra = w.technologia_pokrewna ? ` (${w.technologia_pokrewna})` : "";
      log(`| ${w.id_wymagania} | ${STATUS_LABELS[w.status]}${extra} | ${w.dowod_cytat ?? "–"} | ${s.evidence[w.id_wymagania]} | ${w.uzasadnienie} |`);
    }
    log("\nPotencjał:");
    for (const k of POTENTIAL_COMPONENTS) {
      const c = s.output.potencjal[k];
      log(`- ${POTENTIAL_LABELS[k]}: **${c.ocena}**${"szacunek" in c ? ` (${c.szacunek})` : ""} – ${c.uzasadnienie}`);
    }
    log("\nMocne strony: " + s.output.mocne_strony.join("; "));
    log("\nSłabe strony: " + s.output.slabe_strony.join("; "));
    log("\nPytania na rozmowę:");
    s.output.pytania_na_rozmowe.forEach((q, j) => log(`${j + 1}. ${q.pytanie} _(cel: ${q.cel})_`));
    if (s.output.podejrzane_instrukcje.wykryto) log(`\n⚠ Podejrzane instrukcje: ${s.output.podejrzane_instrukcje.opis}`);
  }
  log(`\nŁączny szacunkowy koszt analiz CV: $${totalCost.toFixed(2)} (ceny ${env.model === "claude-opus-5-5" ? "claude-opus-5-5" : "przyjęte dla claude-opus-5-5"})`);

  const report = lines.join("\n");
  console.log(report);
  const out = path.join(env.dataDir, "raport-seed.md");
  fs.writeFileSync(out, report + "\n");
  console.log(`\nRaport zapisany: ${out}`);
  console.log(`Oferta w aplikacji: /oferty/${offer.id}`);
}

main()
  .catch((e) => {
    console.error("Błąd seed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await terminateOcr();
    await db.$disconnect();
    process.exit();
  });
