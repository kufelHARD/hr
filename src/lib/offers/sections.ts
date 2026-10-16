import { normalizeForSearch } from "@/lib/text";
import type { OfferExtraction } from "@/lib/ai/schemas";
import type { RequirementCategory } from "@/lib/ai/schemas";

// Odczyt sekcji ogłoszenia bez AI: „Wymagania”, „Mile widziane”, „Obowiązki”, „Oferujemy”…
// Służy do (1) uzupełnienia i poprawienia listy wymagań od AI – małe modele lokalne potrafią pominąć
// sekcję „mile widziane” albo oznaczyć jej punkty jako wymagane – oraz (2) jako lista zapasowa,
// gdy AI jest niedostępne.

export type SectionKind = "wymagane" | "mile_widziane" | "obowiazki" | "oferujemy" | "inne";
export type OfferItem = { text: string; kind: SectionKind };

const NICE = /mile widzian|nice[ -]to[ -]have|atut|plusem|bedzie plus|is a plus|be a plus|bonus|docenimy|preferowan|optional|dodatkowe wymagania|wymagania dodatkowe|dodatkow\w* (umiejetnosci|kompetencje|kwalifikacje)|great if|fajnie,? jesli|dobrze,? jesli|nie jest wymagan|not required|would be nice/;
const REQUIRED = /wymagani|wymagane|niezbedn|konieczn|obowiazkowe|wymagamy|oczekujemy|oczekiwania|kogo szukamy|szukamy (osoby|kogos|ciebie)|kompetencje|kwalifikacje|umiejetnosci|requirements|required|must[ -]have|musisz|potrzebujemy|profil kandydat|your (skills|profile)|what you need|what we expect|we expect|who you are|o tobie|idealn\w* kandydat|powinienes|powinnas|twoje doswiadczenie|czego od ciebie|tech stack|our stack|stack technologiczny|technologie/;
const DUTIES = /obowiazki\b|obowiazkow\b|zakres (prac|zadan|obowiazkow)|zadania|czym bedziesz|twoja rola|twoje zadania|responsibilit|your (tasks|role|responsibilities)|what you('ll| will) do|bedziesz odpowiedzialn|na co dzien|projekt\b|o projekcie|about the project/;
const OFFER = /oferujemy|we offer|benefit|co zyskujesz|dajemy|zapewniamy|what we offer|warunki|wynagrodzenie|perks|co oferujemy|w zamian/;
const OTHER = /o nas|o firmie|about us|kim jestesmy|about the company|proces rekrutacji|rekrutacja|klauzula|aplikuj|kontakt|informacje dodatkowe|lokalizacja|location/;

function headingKind(title: string): SectionKind {
  const t = normalizeForSearch(title);
  if (NICE.test(t)) return "mile_widziane";
  if (OFFER.test(t)) return "oferujemy";
  if (DUTIES.test(t)) return "obowiazki";
  if (REQUIRED.test(t)) return "wymagane";
  if (OTHER.test(t)) return "inne";
  return "inne";
}

// Zwykły wiersz (bez znaczników Markdown) uznajemy za nagłówek tylko, gdy w całości jest typową nazwą sekcji.
const PLAIN_HEADING = new RegExp(
  "^(?:" +
    [
      String.raw`(?:(?:nasze|twoje|nasza|twoja|twoj|dodatkowe|kluczowe|wymagane|oczekiwane|podstawowe)\s+)?(?:wymagania|oczekiwania|kwalifikacje|kompetencje|umiejetnosci|obowiazki|zadania|atuty|benefity)(?:\s+(?:od kandydata|kandydata|techniczne|miekkie|dodatkowe|i umiejetnosci|i kompetencje|i doswiadczenie))?`,
      String.raw`(?:wymagane|niezbedne|obowiazkowe|konieczne)(?:\s+(?:umiejetnosci|kompetencje|wymagania))?`,
      String.raw`(?:wymagania|umiejetnosci|kompetencje)\s+(?:obowiazkowe|niezbedne|konieczne|wymagane)`,
      String.raw`mile widzian\w*(?:\s+(?:umiejetnosci|kompetencje|doswiadczenie|bedzie|beda))?`,
      String.raw`(?:dodatkowym|duzym)\s+(?:atutem|plusem)\s+(?:bedzie|beda|bedzie dla nas)`,
      String.raw`(?:atutem|plusem)\s+(?:bedzie|beda)`,
      String.raw`docenimy(?:\s+rowniez|\s+takze)?`,
      String.raw`(?:co\s+|to\s+|w zamian\s+)?oferujemy`,
      String.raw`(?:twoj\s+)?zakres (?:obowiazkow|zadan|prac)`,
      String.raw`czym (?:bedziesz sie|sie bedziesz) zajmowac`,
      String.raw`(?:czego|co) (?:od ciebie )?oczekujemy`,
      String.raw`kogo szukamy`,
      String.raw`(?:wymagamy|oczekujemy)`,
      String.raw`(?:our |key |your )?(?:requirements|responsibilities|benefits|qualifications)`,
      String.raw`(?:must|nice)[ -](?:to[ -])?have`,
      String.raw`your (?:skills|tasks|profile|role)`,
      String.raw`what (?:you need|we offer|we expect|you will do|you'll do)`,
      String.raw`who you are`,
      String.raw`(?:we offer|about (?:us|the company|the project)|o nas|o firmie|o projekcie|proces rekrutacji)`,
      String.raw`(?:tech stack|technologie|stack technologiczny|nasz stack)`,
    ].join("|") +
    ")$",
);

const BULLET = /^\s*(?:[-*•·▪●◦–—+]|\d{1,2}[.)]|[a-z][.)])\s+/;

function stripMarkdown(s: string): string {
  return s
    .replace(/\*\*|__|`/g, "")
    .replace(/(^|\s)_+|_+(\s|$)/g, "$1$2")
    .replace(/\\([[\]().\-*_#>+!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Czy wiersz jest nagłówkiem sekcji; zwraca jego treść (bez znaczników) albo null. */
function headingText(line: string): { title: string; rest: string } | null {
  if (BULLET.test(line) && !/^\s*#/.test(line)) return null;
  const md = line.match(/^\s*#{1,6}\s+(.+)$/);
  if (md) return { title: stripMarkdown(md[1]).replace(/:$/, ""), rest: "" };
  const bold = line.match(/^\s*(?:\*\*|__)(.+?)(?:\*\*|__)\s*:?\s*(.*)$/);
  // pogrubiony wiersz to nagłówek, jeśli jest krótki albo wygląda na nazwę sekcji (a nie wyróżniony punkt listy)
  if (bold && bold[1].split(/\s+/).length <= 10 && (headingKind(bold[1]) !== "inne" || (bold[1].length <= 40 && !bold[1].includes(","))))
    return { title: stripMarkdown(bold[1]).replace(/:$/, ""), rest: stripMarkdown(bold[2] ?? "") };
  const plain = stripMarkdown(line);
  const colon = plain.match(/^([^:]{3,70}):\s*(.*)$/);
  if (colon && colon[1].split(/\s+/).length <= 8 && headingKind(colon[1]) !== "inne") return { title: colon[1], rest: colon[2] };
  // wiersz będący w całości nazwą sekcji, np. „Mile widziane”, „Nasze wymagania”, „Oferujemy:”
  if (PLAIN_HEADING.test(normalizeForSearch(plain).replace(/[:.!]+$/, "").trim())) return { title: plain, rest: "" };
  return null;
}

function cleanItem(s: string): string {
  return stripMarkdown(s.replace(BULLET, ""))
    .replace(/^[-–—:]\s*/, "")
    .replace(/[;,.]+$/, "")
    .trim();
}

/** Prefiks w punkcie listy wymagań: „Mile widziane: Python” → mile widziane. */
const INLINE_NICE_PREFIX = /^(?:mile widzian\w*|nice[ -]to[ -]have|dodatkowy atut|atut|plus)\s*[:–-]\s*/i;

function itemKind(text: string, sectionKind: SectionKind): SectionKind {
  if (sectionKind !== "wymagane") return sectionKind;
  const n = normalizeForSearch(text);
  return /mile widzian|nice[ -]to[ -]have|(bedzie|dodatkowym|duzym) (atutem|plusem)|\batut\b|is a plus|be a plus|docenimy|preferowan|optional|\(plus\)|\bplus\b$/.test(n) ? "mile_widziane" : "wymagane";
}

/** Dzieli treść ogłoszenia (Markdown z ekstrakcji dokumentu albo wklejony tekst) na punkty z rodzajem sekcji. */
export function parseOfferItems(markdown: string): OfferItem[] {
  const items: OfferItem[] = [];
  let kind: SectionKind = "inne";
  let tableKinds: SectionKind[] | null = null;
  const push = (raw: string, k: SectionKind) => {
    let text = cleanItem(raw);
    let finalKind = itemKind(text, k);
    if (INLINE_NICE_PREFIX.test(text) && (k === "wymagane" || k === "mile_widziane")) {
      text = text.replace(INLINE_NICE_PREFIX, "");
      finalKind = "mile_widziane";
    }
    if (text.length < 2 || text.length > 400) return;
    items.push({ text, kind: finalKind });
  };

  for (const line of markdown.split("\n")) {
    if (!line.trim()) {
      tableKinds = null;
      continue;
    }
    // tabele: wiersz nagłówkowy z nazwami sekcji ustala rodzaj kolumn
    if (/^\s*\|/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => stripMarkdown(c));
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || !c)) continue;
      const headingCells = cells.map((c) => (c ? headingKind(c) : "inne"));
      const isHeaderRow = cells.every((c) => !c || (c.split(/\s+/).length <= 6 && headingKind(c) !== "inne"));
      if (isHeaderRow) {
        tableKinds = headingCells;
        continue;
      }
      if (tableKinds) {
        cells.forEach((c, i) => c && push(c, tableKinds![i] ?? kind));
      } else if (cells.length >= 2 && headingKind(cells[0]) !== "inne" && cells[0].split(/\s+/).length <= 6) {
        // | Mile widziane | Python, Docker |
        push(cells.slice(1).join(" "), headingKind(cells[0]));
      } else {
        cells.forEach((c) => c && push(c, kind));
      }
      continue;
    }
    tableKinds = null;
    const heading = headingText(line);
    if (heading) {
      const k = headingKind(heading.title);
      // wiersz z dwukropkiem bez rozpoznanego rodzaju („Od kandydatów oczekujemy:” już rozpoznany) nie zmienia sekcji
      if (k !== "inne" || /^\s*(#|\*\*|__)/.test(line)) kind = k;
      if (heading.rest) push(heading.rest, kind);
      continue;
    }
    if (kind === "wymagane" || kind === "mile_widziane") {
      // zwykły akapit wprowadzający („Szukamy osoby, która:”) pomijamy
      if (!BULLET.test(line) && /:\s*$/.test(line)) continue;
      push(line, kind);
    } else if (kind === "obowiazki") {
      push(line, kind);
    }
  }
  return items;
}

// ---------------------------------------------------------------- wymagania z punktów (bez AI)

function guessCategory(text: string): RequirementCategory {
  const n = normalizeForSearch(text);
  if (/certyfika|certified|certification|\b(az|dp|pl|ai|sc|ms)-\d{3}\b|istqb|pmp|prince2|itil|ocp\b|ccna|cissp/.test(n)) return "certyfikaty";
  if (/\bjezyk\w* (angielsk|niemieck|francusk|hiszpansk|wlosk|polsk|rosyjsk|ukrainsk)|\b(angielsk|niemieck|francusk|english|german|french|polish)\w*\b|\b[abc][12]\b/.test(n)) return "jezyk";
  if (/wyksztalc|studi[ao]|studiow|absolwent|degree|bachelor|master'?s|licencjat|magist|kierunk/.test(n)) return "wyksztalcenie";
  if (/komunikatywn|samodzieln|odpowiedzialn|prac\w* w zespole|teamwork|team player|analityczn\w* myslen|zaangazowan|dokladn|organizacj\w* (pracy|czasu)|proaktywn|kreatywn|chec\w* (do )?(nauki|rozwoju)|motywac|soft skills|communication|otwartosc|elastycznosc|odpornosc na stres|dociekliw|sumienn/.test(n)) return "kompetencje_miekkie";
  if (/\d+\+?\s*(lat|lata|roku|years?)\b|doswiadczeni|experience/.test(n)) return "doswiadczenie";
  return "technologia";
}

export function requirementsFromItems(items: OfferItem[]): OfferExtraction["wymagania"] {
  const out: OfferExtraction["wymagania"] = [];
  for (const it of items) {
    if (it.kind !== "wymagane" && it.kind !== "mile_widziane") continue;
    const kategoria = guessCategory(it.text);
    const waga = it.kind === "mile_widziane" || kategoria === "kompetencje_miekkie" ? 1 : 2;
    out.push({ tresc: capitalize(it.text), typ: it.kind, kategoria, waga, wywnioskowane: false, zrodlo: it.text });
  }
  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Wymagania z ogłoszenia bez AI (gdy AI jest niedostępne). */
export function draftFromOffer(markdown: string): OfferExtraction | null {
  const wymagania = requirementsFromItems(parseOfferItems(markdown));
  if (!wymagania.length) return null;
  const titleLine = markdown.split("\n").map((l) => stripMarkdown(l.replace(/^#+\s*/, ""))).find((l) => l.length >= 3 && l.length <= 120);
  return { stanowisko: titleLine ?? "", obszar: "", poziom: null, podsumowanie: "", wymagania };
}

// ---------------------------------------------------------------- uzgodnienie z wynikiem AI

const STOP = new Set(
  "oraz lub and or the of in with w z na do i a min minimum co najmniej znajomosc znajomosci doswiadczenie doswiadczenia umiejetnosc umiejetnosci praktyczna praktycznej dobra dobrej bardzo experience knowledge of mile widziane widziana widziany".split(" "),
);

function tokens(s: string): Set<string> {
  return new Set(
    normalizeForSearch(s)
      .split(/[^a-z0-9+#]+/)
      .filter((t) => (t.length >= 2 || /\d/.test(t)) && !STOP.has(t)),
  );
}

function flat(s: string): string {
  return normalizeForSearch(s).replace(/[^a-z0-9+# ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Podobieństwo wymagania od AI do punktu ogłoszenia (0–1). */
function similarity(req: { tresc: string; zrodlo: string }, item: OfferItem): number {
  const src = flat(req.zrodlo ?? "");
  const it = flat(item.text);
  if (src.length >= 6 && it.length >= 3 && (it.includes(src) || src.includes(it))) return 1;
  const a = tokens(`${req.tresc} ${req.zrodlo ?? ""}`);
  const own = tokens(req.tresc);
  const b = tokens(item.text);
  if (!b.size || !a.size) return 0;
  let common = 0;
  for (const t of b) if (a.has(t)) common++;
  let ownCommon = 0;
  for (const t of own) if (b.has(t)) ownCommon++;
  // punkt w całości pokryty przez wymaganie albo wymaganie wydzielone z dłuższego punktu
  return Math.max(common / b.size, own.size ? ownCommon / own.size : 0);
}

const MATCH = 0.6;

/**
 * Poprawia listę wymagań od AI na podstawie sekcji ogłoszenia:
 * - typ wymagania wynika z sekcji, z której pochodzi (np. punkt z „Mile widziane” → mile_widziane),
 * - punkty z sekcji wymagań i „mile widziane”, których AI nie uwzględniło, są dopisywane.
 */
export function completeDraft(draft: OfferExtraction, markdown: string): { draft: OfferExtraction; added: number; retyped: number } {
  const items = parseOfferItems(markdown).filter((i) => i.kind === "wymagane" || i.kind === "mile_widziane");
  if (!items.length) return { draft, added: 0, retyped: 0 };
  let retyped = 0;
  const covered = new Set<number>();
  const wymagania = draft.wymagania.map((r) => {
    let best = -1;
    let bestScore = 0;
    items.forEach((it, i) => {
      const sc = similarity(r, it);
      if (sc >= MATCH) covered.add(i);
      if (sc > bestScore) [best, bestScore] = [i, sc];
    });
    if (best < 0 || bestScore < MATCH) return r;
    const kind = items[best].kind as "wymagane" | "mile_widziane";
    if (!r.wywnioskowane && r.typ !== kind) {
      retyped++;
      return { ...r, typ: kind, waga: kind === "mile_widziane" ? Math.min(r.waga, 2) : r.waga };
    }
    return r;
  });
  const missing = requirementsFromItems(items.filter((_, i) => !covered.has(i)));
  const all = [...wymagania, ...missing];
  // wymagane przed mile widzianymi, z zachowaniem kolejności z oferty
  const sorted = [...all.filter((r) => r.typ === "wymagane"), ...all.filter((r) => r.typ !== "wymagane")];
  return { draft: { ...draft, wymagania: sorted }, added: missing.length, retyped };
}
