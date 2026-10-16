// Natychmiastowe dopasowanie CV do wymagań – bez AI, w ułamku sekundy.
//
// Dla każdego wymagania:
//  1. wyszukuje w jego treści technologie (z mapy technologii pokrewnych + nazwy techniczne typu T-SQL, AZ-104),
//  2. sprawdza, czy CV zawiera te same technologie (pełne), technologie z tej samej grupy (pokrewne)
//     albo tylko część wymienionych (częściowe),
//  3. dla języków porównuje poziom (A1–C2), dla wykształcenia – wzmianki o studiach,
//  4. jeśli wymaganie podaje liczbę lat, porównuje ją z orientacyjnym stażem z dat w CV.
// Wymagania, których nie da się ocenić automatycznie (np. kompetencje miękkie), są pomijane w wyniku
// i oznaczone „do oceny”. To szybkie sito – pogłębioną ocenę daje analiza AI na żądanie.

import { normalizeForSearch } from "@/lib/text";
import type { TechMap } from "@/lib/settings";
import { computeMatchScore, type RequirementStatus, type RequirementType } from "@/lib/scoring";
import type { ScoringConfig } from "@/lib/settings";

export type QuickStatus = RequirementStatus | "do_oceny";

export type QuickRequirement = { code: string; text: string; type: RequirementType; category: string; weight: number };

export type QuickItem = {
  code: string;
  status: QuickStatus;
  /** technologie z wymagania znalezione w CV */
  found: string[];
  /** technologie z wymagania, których w CV nie ma */
  missing: string[];
  /** technologia pokrewna znaleziona w CV (np. „AWS” dla „Azure”) */
  related: string | null;
  /** fragment CV potwierdzający ocenę */
  evidence: string | null;
  note: string;
};

export type QuickMatchResult = {
  score: number | null;
  items: QuickItem[];
  /** orientacyjny łączny staż z dat w CV (lata) */
  experienceYears: number | null;
  technologies: string[];
};

// ---------------------------------------------------------------- słownik technologii

type Term = { label: string; aliases: string[]; group: number | null };

const VENDOR_PREFIX = /^(microsoft|oracle|amazon|aws|google|apache|ibm|sap)\s+/;
// ogólne słowa, które po odcięciu nazwy dostawcy nie identyfikują technologii („Oracle Database” → „database”)
const GENERIC = new Set(["database", "cloud", "server", "linux", "analytics", "monitor", "backup", "sql", "data", "db"]);

const EXTRA_ALIASES: Record<string, string[]> = {
  "microsoft sql server": ["mssql", "ms sql", "sql server"],
  "microsoft azure": ["azure"],
  "google cloud (gcp)": ["gcp", "google cloud"],
  aws: ["amazon web services", "amazon ec2", "ec2"],
  postgresql: ["postgres"],
  kubernetes: ["k8s"],
  "microsoft entra id (azure ad)": ["entra id", "azure ad", "azure active directory"],
  "power bi": ["powerbi"],
  "always on availability groups": ["always on", "availability groups"],
  "always on ag": ["always on", "availability groups"],
  "failover cluster instances (fci)": ["failover cluster", "fci"],
  "oracle database": ["oracle db", "oracle"],
  "terraform": ["terraform"],
  "c# / .net": ["c#", ".net", "dotnet"],
};

function aliasesFor(name: string): string[] {
  const n = normalizeForSearch(name);
  const out = new Set<string>([n]);
  const paren = n.match(/^(.*?)\s*\((.*?)\)\s*$/);
  if (paren) {
    out.add(paren[1].trim());
    for (const p of paren[2].split(/[,/]/)) out.add(p.trim());
  }
  for (const a of [...out]) {
    const stripped = a.replace(VENDOR_PREFIX, "");
    if (stripped !== a && stripped.length >= 3 && !GENERIC.has(stripped)) out.add(stripped);
    if (a.includes(" / ")) for (const p of a.split(" / ")) out.add(p.trim());
  }
  for (const extra of EXTRA_ALIASES[n] ?? []) out.add(extra);
  return [...out].filter((a) => a.length >= 2 && !GENERIC.has(a));
}

/** Słownik technologii z mapy pokrewieństw (grupa = indeks grupy w mapie). */
export function buildTermIndex(map: TechMap): Term[] {
  const terms: Term[] = [];
  map.grupy.forEach((g, gi) => {
    for (const t of g.technologie) terms.push({ label: t, aliases: aliasesFor(t), group: gi });
  });
  return terms;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const reCache = new Map<string, RegExp>();
function termRe(alias: string): RegExp {
  let re = reCache.get(alias);
  if (!re) {
    re = new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}(?=$|[^a-z0-9])`);
    reCache.set(alias, re);
  }
  return re;
}

function containsAlias(normText: string, aliases: string[]): string | null {
  for (const a of aliases) if (termRe(a).test(normText)) return a;
  return null;
}

// Słowa techniczne spoza mapy: PowerShell, T-SQL, IAM, AZ-104, Python…
const STOP = new Set(["min", "max", "it", "np", "ok", "lub", "oraz", "and", "or", "the", "b2", "b1", "c1", "c2", "a1", "a2"]);
function adHocTerms(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9+#.\-/]*[A-Za-z0-9+#]/g)) {
    const w = m[0];
    const technical =
      /[A-Z].*[A-Z]/.test(w.slice(1)) || /^[A-Z]{2,}/.test(w) || /\d/.test(w) || /[+#]/.test(w) || /-/.test(w) && /[A-Z]/.test(w);
    if (!technical) continue;
    const n = normalizeForSearch(w);
    if (n.length < 2 || STOP.has(n) || /^(a|b|c)[12]\+?$/.test(n)) continue;
    out.add(n);
  }
  return [...out];
}

// ---------------------------------------------------------------- staż z dat w CV

/** Orientacyjny łączny staż (lata) – suma rozłącznych okresów „RRRR – RRRR / obecnie” w CV. */
const EDUCATION_LINE = /studia|uniwersytet|politechnik|university|akademi|szkola|liceum|technikum|inzynier|magister|licencjat|bachelor|master|wyksztalcenie|education/;

export function estimateExperienceYears(cvText: string, now = new Date()): number | null {
  // pomijamy linie o wykształceniu (daty studiów to nie staż pracy)
  const t = cvText
    .split("\n")
    .map((l) => normalizeForSearch(l))
    .filter((l) => !EDUCATION_LINE.test(l))
    .join("\n");
  const nowY = now.getFullYear() + now.getMonth() / 12;
  const ranges: Array<[number, number]> = [];
  const re = /(?:(\d{1,2})[./])?((?:19|20)\d{2})\s*(?:-|–|—|do|to)\s*(?:(?:(\d{1,2})[./])?((?:19|20)\d{2})|(obecnie|teraz|nadal|present|now|current|dzis|aktualnie))/g;
  for (const m of t.matchAll(re)) {
    // „SQL Server 2014–2022”, „Windows 2016-2019” – zakres wersji produktu, nie okres pracy
    const before = t.slice(Math.max(0, (m.index ?? 0) - 2), m.index ?? 0);
    if (!m[1] && /[a-z][ \t]$/.test(before)) continue;
    const start = Number(m[2]) + (m[1] ? (Number(m[1]) - 1) / 12 : 0);
    const end = m[5] ? nowY : Number(m[4]) + (m[3] ? (Number(m[3]) - 1) / 12 : 0.99);
    if (end > start && end - start < 45 && start > 1970) ranges.push([start, Math.min(end, nowY)]);
  }
  if (!ranges.length) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = ranges[0];
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  total += ce - cs;
  return Math.round(total * 10) / 10;
}

// ---------------------------------------------------------------- języki i wykształcenie

// rdzenie słów – dopasowanie także odmian („angielskiego”, „angielskim”)
const LANGS: Record<string, string[]> = {
  angielski: ["angielsk", "english"],
  niemiecki: ["niemieck", "german", "deutsch"],
  francuski: ["francusk", "french"],
  hiszpanski: ["hiszpansk", "spanish"],
  rosyjski: ["rosyjsk", "russian"],
  ukrainski: ["ukrainsk", "ukrainian"],
  wloski: ["wlosk", "italian"],
};
const stemRe = (stem: string) => new RegExp(`(^|[^a-z])${stem}`);
const LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"];

function levelIn(s: string): number | null {
  const m = s.match(/\b([abc][12])\b/);
  if (m) return LEVELS.indexOf(m[1]);
  if (/ojczysty|native|natywny/.test(s)) return 5;
  if (/biegl|fluent|zaawansowan|advanced|proficient/.test(s)) return 4;
  if (/komunikatywn|sredniozaawansowan|intermediate|dobr[ay]/.test(s)) return 2;
  if (/podstawow|basic|elementary/.test(s)) return 0;
  return null;
}

// ---------------------------------------------------------------- dopasowanie

const PLANNED = /w przygotowaniu|planowan|w trakcie|in progress|preparing|zamierzam/;
const LEARNING = /laborator|\blab\b|projekt(y)? wlasn|hobby|kurs|szkoleni|praca dyplomow|hackathon|w przygotowaniu|planowan|w trakcie|in progress|samodzielna nauka/;

function evidenceLine(cvText: string, alias: string): string | null {
  for (const line of cvText.split("\n")) {
    if (termRe(alias).test(normalizeForSearch(line))) {
      const l = line.replace(/^[#\s•\-–*]+/, "").trim();
      return l.length > 180 ? `${l.slice(0, 177)}…` : l;
    }
  }
  return null;
}

function judgeLanguage(req: QuickRequirement, cvText: string, normLines: string[]): QuickItem | null {
  const normCv = normLines.join("\n");
  const r = normalizeForSearch(req.text);
  const lang = Object.entries(LANGS).find(([, al]) => al.some((a) => stemRe(a).test(r)));
  if (!lang) return null;
  const need = levelIn(r);
  const base = { code: req.code, found: [] as string[], missing: [] as string[], related: null };
  const alias = lang[1].find((a) => stemRe(a).test(normCv));
  if (!alias) return { ...base, status: "brak", missing: [lang[0]], evidence: null, note: "Brak wzmianki o języku w CV." };
  // poziom szukamy w tej samej linii co nazwa języka
  const line = normLines.find((l) => stemRe(alias).test(l)) ?? "";
  const at = line.search(stemRe(alias));
  const have = levelIn(line.slice(Math.max(0, at), at + 60));
  const evidence = cvText.split("\n").find((l) => stemRe(alias).test(normalizeForSearch(l)))?.trim() ?? null;
  if (need === null || (have !== null && have >= need)) {
    return { ...base, status: "pelne", found: [lang[0]], evidence, note: have !== null ? `Poziom w CV: ${LEVELS[have].toUpperCase()}.` : "Język wymieniony w CV." };
  }
  if (have === null) return { ...base, status: "czesciowe", found: [lang[0]], evidence, note: "Język wymieniony bez poziomu – do weryfikacji." };
  return { ...base, status: "czesciowe", found: [lang[0]], evidence, note: `Poziom w CV (${LEVELS[have].toUpperCase()}) niższy niż wymagany (${LEVELS[need].toUpperCase()}).` };
}

function judgeEducation(req: QuickRequirement, cvText: string, normCv: string): QuickItem {
  const words = ["studia", "uniwersytet", "politechnika", "university", "inzynier", "magister", "licencjat", "bachelor", "master", "akademia", "wyzsza szkola"];
  const hit = words.find((w) => termRe(w).test(normCv));
  const base = { code: req.code, found: [] as string[], missing: [] as string[], related: null };
  if (!hit) return { ...base, status: "brak", evidence: null, note: "Brak informacji o wykształceniu wyższym." };
  const field = normalizeForSearch(req.text).match(/informatyk|matematyk|elektroni|telekomunikac|automatyk|techniczn|scis/);
  const fieldOk = !field || new RegExp(field[0]).test(normCv);
  return {
    ...base,
    status: fieldOk ? "pelne" : "czesciowe",
    found: [hit],
    evidence: evidenceLine(cvText, hit),
    note: fieldOk ? "Wykształcenie wyższe w CV." : "Wykształcenie wyższe, kierunek do weryfikacji.",
  };
}

export function quickMatch(
  requirements: QuickRequirement[],
  cvText: string,
  techMap: TechMap,
  config: ScoringConfig,
  now = new Date(),
): QuickMatchResult {
  const index = buildTermIndex(techMap);
  const normCv = normalizeForSearch(cvText);
  // normalizacja zwija znaki nowej linii – do analizy kontekstu potrzebne są osobne linie
  const normLines = cvText.split("\n").map((l) => normalizeForSearch(l));
  const years = estimateExperienceYears(cvText, now);

  // technologie obecne w CV (do „pokrewnych” i do wyszukiwarki)
  const cvTerms = index.filter((t) => containsAlias(normCv, t.aliases));
  const technologies = [...new Set(cvTerms.map((t) => t.label))];

  const items: QuickItem[] = requirements.map((req) => {
    if (req.category === "jezyk") {
      const lang = judgeLanguage(req, cvText, normLines);
      if (lang) return lang;
    }
    if (req.category === "wyksztalcenie") return judgeEducation(req, cvText, normCv);

    const normReq = normalizeForSearch(req.text);
    // technologie z mapy wymienione w wymaganiu (w kolejności występowania)
    const mapTerms = index
      .map((t) => {
        const a = containsAlias(normReq, t.aliases);
        return a ? { term: t, alias: a, pos: normReq.search(termRe(a)) } : null;
      })
      .filter((x): x is { term: Term; alias: string; pos: number } => x !== null)
      .sort((a, b) => a.pos - b.pos);
    // bez duplikatów i bez krótszych nazw zawartych w dłuższych („azure” w „azure data factory”)
    const matchedAliases = mapTerms.map((m) => m.alias);
    const seenAlias = new Set<string>(matchedAliases.filter((a) => matchedAliases.some((b) => b !== a && b.includes(a))));
    const reqTerms: Array<{ label: string; aliases: string[]; group: number | null }> = [];
    for (const m of mapTerms) {
      if (seenAlias.has(m.alias)) continue;
      seenAlias.add(m.alias);
      reqTerms.push({ label: m.term.label, aliases: m.term.aliases, group: m.term.group });
    }
    for (const w of adHocTerms(req.text)) {
      if ([...seenAlias].some((a) => a.includes(w) || w.includes(a))) continue;
      seenAlias.add(w);
      reqTerms.push({ label: w.toUpperCase() === w ? w : w, aliases: [w], group: null });
    }

    const base = { code: req.code, related: null as string | null };
    if (reqTerms.length === 0) {
      return { ...base, status: "do_oceny", found: [], missing: [], evidence: null, note: "Nie da się ocenić automatycznie – oceń na podstawie CV lub analizy AI." };
    }

    const found = reqTerms.filter((t) => containsAlias(normCv, t.aliases));
    const missing = reqTerms.filter((t) => !found.includes(t));
    const anyOf = /\s(lub|albo|or)\s|\//.test(normReq);
    const primary = reqTerms[0];
    const primaryFound = found.includes(primary);

    // technologia pokrewna: z tej samej grupy co brakująca, obecna w CV
    const relatedFor = (t: (typeof reqTerms)[number]) =>
      t.group === null ? null : cvTerms.find((c) => c.group === t.group && c.label !== t.label && !reqTerms.some((r) => r.label === c.label)) ?? null;

    let status: RequirementStatus;
    let related: string | null = null;
    if (anyOf) {
      if (found.length) status = "pelne";
      else {
        const rel = reqTerms.map(relatedFor).find(Boolean);
        status = rel ? "pokrewne" : "brak";
        related = rel?.label ?? null;
      }
    } else if (primaryFound) {
      const secondary = reqTerms.length - 1;
      const secondaryFound = found.length - 1;
      status = secondary === 0 || secondaryFound / secondary >= 0.5 ? "pelne" : "czesciowe";
    } else {
      const rel = relatedFor(primary);
      if (rel) {
        status = "pokrewne";
        related = rel.label;
      } else status = found.length ? "czesciowe" : "brak";
    }

    // znalezione wyłącznie w kontekście nauki / projektów własnych albo certyfikat dopiero planowany
    if (status === "pelne" && found.length) {
      const learningOnly = found.every((f) => {
        const a = containsAlias(normCv, f.aliases)!;
        const lines = normLines.filter((l) => termRe(a).test(l));
        return lines.length > 0 && lines.every((l) => LEARNING.test(l));
      });
      if (learningOnly) {
        status = "czesciowe";
        const planned = found.some((f) => normLines.some((l) => termRe(containsAlias(normCv, f.aliases)!).test(l) && PLANNED.test(l)));
        const note0 = planned ? "Certyfikat/umiejętność w przygotowaniu – jeszcze nieuzyskane." : "Tylko w projektach własnych, laboratorium lub nauce – bez doświadczenia zawodowego.";
        return { ...base, status, related, found: found.map((f) => f.label), missing: missing.map((m) => m.label), evidence: evidenceLine(cvText, containsAlias(normCv, found[0].aliases)!), note: note0 };
      }
    }

    // wymagany staż (np. „min. 4 lata”) vs orientacyjny staż z CV
    const yearsReq = normReq.match(/(\d+)\s*\+?\s*(?:lat|lata|rok|years?)/);
    let note = "";
    if (yearsReq && status === "pelne") {
      const need = Number(yearsReq[1]);
      if (years !== null && years < need) {
        status = "czesciowe";
        note = `Wymagane ${need} lat, łączny staż w CV ok. ${years} lat (szacunek z dat).`;
      } else if (years !== null) note = `Łączny staż w CV ok. ${years} lat (szacunek z dat).`;
      else note = "Staż do weryfikacji – brak dat w CV.";
    }

    const evidenceAlias = found.length ? containsAlias(normCv, found[0].aliases) : related ? containsAlias(normCv, cvTerms.find((c) => c.label === related)!.aliases) : null;
    if (!note) {
      note =
        status === "pelne"
          ? `Znaleziono: ${found.map((f) => f.label).join(", ")}.`
          : status === "pokrewne"
            ? `Brak ${primary.label}, ale jest pokrewne: ${related}.`
            : status === "czesciowe"
              ? `Znaleziono: ${found.map((f) => f.label).join(", ")}; brak: ${missing.map((m) => m.label).join(", ")}.`
              : `Brak w CV: ${missing.map((m) => m.label).join(", ")}.`;
    }
    return {
      ...base,
      status,
      related,
      found: found.map((f) => f.label),
      missing: missing.map((m) => m.label),
      evidence: evidenceAlias ? evidenceLine(cvText, evidenceAlias) : null,
      note,
    };
  });

  const scored = requirements.filter((_, i) => items[i].status !== "do_oceny");
  const assessments = items
    .filter((i) => i.status !== "do_oceny")
    .map((i) => ({ id_wymagania: i.code, status: i.status as RequirementStatus }));
  const score = scored.length ? computeMatchScore(scored, assessments, config).score : null;
  return { score, items, experienceYears: years, technologies };
}

// ---------------------------------------------------------------- imię i nazwisko z nagłówka CV

export { guessCandidateName, isNameFromText, tidyName, legacyGuessCandidateName } from "./name";
