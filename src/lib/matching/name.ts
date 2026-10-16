import { normalizeForSearch } from "@/lib/text";

// Rozpoznawanie imienia i nazwiska kandydata z tekstu CV (bez AI).
//
// Każdy fragment z początku CV, który wygląda jak „Imię Nazwisko”, dostaje punkty:
//  - imię ze słownika (polskie, angielskie, ukraińskie/rosyjskie w transkrypcji…),
//  - zgodność z adresem e-mail i nazwą pliku,
//  - etykieta „Imię i nazwisko:”, położenie w dokumencie, typowa końcówka nazwiska.
// Fragmenty zawierające słowa typowe dla nagłówków, stanowisk, miast czy technologii są odrzucane.
// Wygrywa fragment z najwyższą liczbą punktów; poniżej progu – brak wyniku (lepiej pusto niż źle).

const FIRST_NAMES = new Set(
  `
anna maria katarzyna malgorzata agnieszka barbara ewa krystyna elzbieta zofia joanna magdalena monika aleksandra
natalia karolina marta beata dorota danuta jadwiga teresa halina irena janina alicja julia zuzanna wiktoria oliwia
maja lena amelia hanna emilia laura nikola weronika martyna paulina justyna iwona renata sylwia patrycja dominika
kinga klaudia angelika andzelika izabela kamila edyta grazyna jolanta urszula bozena lucyna wioletta wiola aneta ilona
marzena mariola ewelina gabriela daria milena adrianna adriana sandra sara wanda stanislawa helena jagoda roksana
kornelia antonina liliana lilianna marianna nina pola iga ada lidia bogumila genowefa henryka irmina jowita kalina
karina klara ludmila magda michalina mirella nadia olga regina rozalia sabina stefania tamara wieslawa zaneta zyta
aurelia blanka celina czeslawa eliza eugenia felicja franciszka honorata ida inga judyta lucja luiza malwina marcelina
matylda melania oktawia otylia pamela tekla zdzislawa bernadeta agata alina anastazja aniela apolonia berenika dagmara
diana elwira estera hanna jagna kaja leokadia marlena miroslawa nela paula roza sonia violetta anita bianka eryka gaja
julianna juliana klementyna liwia malina noemi rita zoja lea jessika jessica wiktorina bogna boguslawa jaroslawa
radoslawa leszka teodora dobroslawa ksenia kseniia dominika emila gizela lilia liliia nikoleta nikoletta oriana
piotr krzysztof andrzej tomasz pawel jan michal marcin stanislaw jakub adam marek lukasz grzegorz mateusz wojciech
mariusz dariusz zbigniew jerzy maciej rafal robert kamil jozef janusz dawid damian sebastian artur slawomir kacper
bartosz bartlomiej daniel patryk przemyslaw szymon filip hubert jacek ryszard roman tadeusz henryk kazimierz
mieczyslaw wieslaw waldemar zdzislaw bogdan leszek jaroslaw miroslaw radoslaw arkadiusz adrian konrad karol krystian
norbert oskar igor antoni franciszek aleksander wiktor ignacy leon nikodem stefan szczepan witold wladyslaw zenon
bronislaw boleslaw czeslaw edward eugeniusz feliks gabriel ireneusz juliusz julian kajetan kornel leonard lech ludwik
marian mikolaj milosz olaf oliwer oliver remigiusz sergiusz tymon tymoteusz wincenty zygmunt albert alan alex aleks
borys cezary dominik emil ernest fabian gracjan hieronim jedrzej joachim lucjan maksymilian marcel natan seweryn
tobiasz wit ksawery benedykt bernard blazej eryk gustaw jaromir maurycy milan nataniel olgierd oktawian roch rudolf
teodor walenty waclaw denis dennis bruno aureliusz arnold anatol ambrozy alfred edmund florian fryderyk gerard gwidon
hilary horacy jeremi jeremiasz jonasz klaudiusz konstanty kordian leopold longin marceli max miron rajmund samuel
sylwester teofil urban wawrzyniec wlodzimierz boguslaw lechoslaw zdzislaw dobromir przemek bartek kuba
john james michael david william richard thomas mark paul peter george andrew steven stephen kevin brian chris
christopher matthew anthony joseph charles jason ryan eric scott simon mary jennifer linda elizabeth susan sarah
karen emily emma sophia sophie ashley rachel rebecca kate kathryn katherine catherine lucy alice claire chloe megan amy
nicole jane helen patricia benjamin jack harry oscar henry luke samuel alexander nicholas jonathan timothy martin
lukas luca lucas marco giovanni francesco alessandro andrea matteo pierre jean louis hans jurgen stefan markus
oleksandr oleksii oleksiy olexandr aleksandr alexandr andrii andriy andrey andrei dmytro dmitry dmitrii dmitri
serhii serhiy sergey sergii sergei mykola nikolai volodymyr vladimir vladyslav vladislav vitalii vitaliy taras bohdan
yurii yuriy yuri ivan maksym maxim artem denys ihor pavlo pavel yevhen yevgen evgeny evgenii eugene oleh oleg anton
kyrylo kirill mykhailo mikhail vasyl vasily viktor yaroslav stanislav illia ilya nazar rostyslav ruslan valentyn
valerii anatolii petro olena elena olha iryna irina nataliia natalya tetiana tatiana tatyana oksana yuliia yulia
kateryna ekaterina anastasiia anastasia mariia svitlana svetlana halyna galina liudmyla lyudmila viktoriia victoria
dariia khrystyna kristina yana inna larysa larisa nadiia valentyna sofiia sofia polina veronika zhanna alla mykyta
nikita vadym vadim yehor egor hennadii gennady eduard aliaksandr aliaksei siarhei uladzimir yauheni katsiaryna
rahul amit ankit priya rohit vikram ravi sanjay deepak arjun ananya neha pooja aditya karan nikhil abhishek sandeep
rajesh suresh mehmet ahmet mustafa ali emre
`
    .split(/\s+/)
    .filter(Boolean),
);

// Słowa, które nie występują w imionach i nazwiskach, a często w nagłówkach CV (forma znormalizowana).
const STOP_WORDS = new Set(
  `
curriculum vitae cv resume zyciorys kontakt contact profil profile o mnie about me doswiadczenie experience zawodowe
zawodowy professional work wyksztalcenie education umiejetnosci skills skill jezyki jezyk languages language obce
certyfikaty certyfikat certificates certificate certifications certification zainteresowania hobby interests projekty
projekt projects project kursy kurs courses course szkolenia szkolenie trainings training dane osobowe personal
informacje information dodatkowe additional summary podsumowanie cel objective referencje references osiagniecia
achievements techniczne technical kompetencje competencies competences miekkie soft twarde hard klauzula zgoda
wyrazam oswiadczenie urodzenia adres address telefon tel phone mobile email mail linkedin github portfolio www ul
ulica polska poland warszawa warsaw krakow cracow wroclaw poznan gdansk gdynia lodz katowice szczecin lublin bialystok
bydgoszcz torun rzeszow kielce olsztyn opole zielona gorzow wielkopolski sopot gliwice zabrze bytom czestochowa
radom sosnowiec tychy elblag plock tarnow legnica koszalin slupsk chorzow rybnik bielsko nowy sacz
remote zdalnie zdalna hybrydowo praca job stanowisko position firma company sp zoo ltd inc gmbh llc corp group
university uniwersytet politechnika akademia szkola school college technikum liceum wydzial faculty instytut institute
informatyka informatyki computer science inzynier inzynierka engineer engineering developer programista programistka
administrator administratorka analityk analityczka analyst specjalista specjalistka specialist manager kierownik
kierowniczka menedzer menadzer lead leader head director dyrektor dyrektorka architekt architect konsultant
konsultantka consultant tester testerka qa devops senior junior mid regular intern stazysta stazystka praktykant
asystent asystentka assistant koordynator koordynatorka coordinator owner product scrum master team zespol data
database databases bazy baz danych sql server oracle microsoft azure aws amazon google cloud java javascript python
net business intelligence power bi software full stack frontend backend front end back system systems network sieci
security support help desk administration administracja obecnie present current teraz angielski english polski polish niemiecki german francuski french hiszpanski
spanish rosyjski russian ukrainski ukrainian native ojczysty poziom level prawo jazdy driving licence license kat
the and of for with in on at to from a an dla oraz lub i w z na do od we
strona page main glowne kluczowe key responsibilities obowiazki zakres achievements wybrane selected
nauka learning rozwoj development osobisty personal agile coach mentor trener trainer recruiter rekruter hr
sales sprzedaz marketing finanse finance ksiegowosc accounting logistyka logistics produkcja production
excel word office windows linux unix docker kubernetes terraform git jira confluence
`
    .split(/\s+/)
    .filter(Boolean),
);

// Partykuły w nazwiskach (van der Berg, de Souza).
const PARTICLES = new Set(["van", "von", "de", "da", "del", "der", "di", "du", "la", "le", "ten", "ter", "bin", "al", "el", "dos"]);

const TITLES = /^(?:(?:mgr|inż|inz|dr|hab|prof|lic|msc|bsc|ma|ba|phd|eng|mba|ing)\.?,?\s+)+/i;
const TRAILING_TITLES = /(?:,?\s+(?:phd|mba|msc|bsc|ma|ba|cpa|pmp|eng)\.?)+$/i;
const LABEL_WORDS = String.raw`(?:imi[eę] i nazwisko|imi[eę],? nazwisko|nazwisko i imi[eę]|full name|name|kandydat(?:ka)?)`;
const LABEL = new RegExp(String.raw`^${LABEL_WORDS}\s*[:\-–]\s*(.+)$`, "i");
const LABEL_ONLY = new RegExp(String.raw`^${LABEL_WORDS}\s*:?$`, "i");
const FIRST_LABEL = /^imi[eę]\s*:\s*(\S+)$/i;
const LAST_LABEL = /^nazwisko\s*:\s*(.+)$/i;
const CLAUSE = /^(?:klauzula|wyrażam zgodę|wyrazam zgode|oświadczam|oswiadczam|i hereby|i agree)\b/i;
const REFERENCES = /^(?:referencje|references|osoby polecające|polecenia)\s*:?$/i;
const SURNAME_ENDING = /(?:ski|ska|cki|cka|dzki|dzka|wicz|czyk|czak|niak|siak|enko|chuk|czuk|iuk|uk|ak|ek|ik|yk|ko|ow|ov|ova|eva|ew|in|yn|ny|na|ec)$/;

const TOKEN = /^[\p{L}][\p{L}'’]*(?:-[\p{L}][\p{L}'’]*)*$/u;

type Candidate = { tokens: string[]; score: number; index: number };
type Line = { text: string; inReferences: boolean };

function isUpper(w: string) {
  return w === w.toUpperCase() && w !== w.toLowerCase();
}
function isTitle(w: string) {
  return /^\p{Lu}/u.test(w) && /\p{Ll}/u.test(w);
}

function titleCase(w: string): string {
  if (!isUpper(w)) return w;
  return w
    .toLowerCase()
    .replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Odstrzelone litery („A N N A   K O W A L S K A”) → „ANNA KOWALSKA”. */
function collapseLetterSpacing(line: string): string {
  if (!/^(?:\p{L}\s+){3,}\p{L}$/u.test(line)) return line;
  if (!/\s{2,}/.test(line)) return line.replace(/\s+/g, "");
  return line
    .split(/\s{2,}/)
    .map((w) => w.replace(/\s+/g, ""))
    .join(" ");
}

function cleanLine(raw: string): string {
  return collapseLetterSpacing(
    raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(?:#+|[-*•▪●◦–]\s)\s*/, "")
      .replace(/\*\*|__|\\/g, "")
      .replace(/(^|\s)_+|_+(\s|$)/g, "$1$2")
      .trim(),
  );
}

function segmentsOf(line: string): string[] {
  return line
    .split(/\s*[|•·;,\t▪●]\s*|\s+[–—-]\s+|\s{3,}/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Zamienia fragment tekstu na listę słów „imię nazwisko” albo null, jeśli to na pewno nie jest imię i nazwisko. */
function nameTokens(segment: string): string[] | null {
  const s = segment.replace(TITLES, "").replace(TRAILING_TITLES, "").replace(/[.,:;!]+$/, "").trim();
  if (!s || s.length > 60 || /[@\d/\\()+=<>#&]/.test(s)) return null;
  const tokens = s.split(/\s+/).filter((t) => !/^\p{Lu}\.$/u.test(t)); // inicjał drugiego imienia
  const core = tokens.filter((t) => !PARTICLES.has(t.toLowerCase()));
  if (core.length < 2 || core.length > 4 || tokens.length > 5) return null;
  for (const t of tokens) {
    if (PARTICLES.has(t.toLowerCase())) continue;
    if (t.length < 2 || !TOKEN.test(t)) return null;
    if (!isUpper(t) && !isTitle(t)) return null;
    const n = normalizeForSearch(t);
    if (n.split("-").some((p) => STOP_WORDS.has(p))) return null;
  }
  return tokens;
}

function emailParts(text: string): string[] {
  const parts = new Set<string>();
  for (const m of text.matchAll(/([a-z0-9._%+-]+)@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const local = normalizeForSearch(m[1]);
    parts.add(local.replace(/[^a-z]/g, ""));
    for (const p of local.split(/[^a-z]+/)) if (p.length >= 2) parts.add(p);
  }
  return [...parts];
}

function fileNameParts(fileName: string | null | undefined): string[] {
  if (!fileName) return [];
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/([\p{Ll}])(\p{Lu})/gu, "$1 $2");
  return normalizeForSearch(base)
    .split(/[^a-z]+/)
    .filter((p) => p.length >= 2);
}

function score(tokens: string[], index: number, ctx: { emails: string[]; files: string[]; labeled: boolean; wholeLine: boolean }): number {
  const norm = tokens.filter((t) => !PARTICLES.has(t.toLowerCase())).map((t) => normalizeForSearch(t));
  let s = index === 0 ? 3 : index < 4 ? 2.5 : index < 10 ? 1.5 : index < 25 ? 0.5 : 0;
  if (ctx.labeled) s += 10;
  if (ctx.wholeLine) s += 0.5;
  const firstKnown = FIRST_NAMES.has(norm[0]);
  const lastKnown = FIRST_NAMES.has(norm[norm.length - 1]);
  if (firstKnown) s += 5;
  else if (lastKnown) s += 4; // „Kowalska Anna”
  const surnames = firstKnown ? norm.slice(1) : lastKnown ? norm.slice(0, -1) : norm;
  if (surnames.some((n) => !FIRST_NAMES.has(n) && SURNAME_ENDING.test(n.split("-").pop()!))) s += 1;
  // zgodność z adresem e-mail (anna.kowalczyk@, akowalczyk@) i nazwą pliku (CV_Anna_Kowalczyk.pdf)
  let mail = 0;
  for (const n of norm.flatMap((x) => x.split("-"))) {
    if (n.length >= 3 && ctx.emails.some((e) => e.includes(n))) mail += 3;
  }
  s += Math.min(mail, 6);
  let file = 0;
  for (const n of norm.flatMap((x) => x.split("-"))) if (ctx.files.includes(n)) file += 2;
  s += Math.min(file, 4);
  return s;
}

const THRESHOLD = 4.5;

function format(tokens: string[]): string {
  return tokens.map((t) => (PARTICLES.has(t.toLowerCase()) ? t.toLowerCase() : titleCase(t))).join(" ");
}

/** Imię i nazwisko z nazwy pliku („CV_Anna_Kowalczyk_2024.pdf”) – gdy w treści CV nie ma pewnego kandydata. */
function fromFileName(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const words = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/([\p{Ll}])(\p{Lu})/gu, "$1 $2")
    .split(/[^\p{L}'’-]+/u)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(normalizeForSearch(w)) && !/^(?:final|new|nowe|nowy|aktualne|aktualny|updated|pl|en|eng|ang)$/i.test(w));
  for (let i = 0; i < words.length - 1; i++) {
    const a = normalizeForSearch(words[i]);
    const b = normalizeForSearch(words[i + 1]);
    if (FIRST_NAMES.has(a) && !FIRST_NAMES.has(b)) return [words[i], words[i + 1]].map(capitalize).join(" ");
    if (FIRST_NAMES.has(b) && !FIRST_NAMES.has(a) && i + 2 === words.length) return [words[i + 1], words[i]].map(capitalize).join(" ");
  }
  return null;
}

function capitalize(w: string): string {
  return titleCase(w === w.toLowerCase() ? w.toUpperCase() : w);
}

/** Imię i nazwisko kandydata z treści CV (bez AI); null, gdy nie ma pewności. */
export function guessCandidateName(cvText: string, fileName?: string | null): string | null {
  // klauzula zgody kończy CV; osoby z sekcji „Referencje” to nie kandydat
  const entries: Line[] = [];
  let inReferences = false;
  for (const raw of cvText.split("\n")) {
    const l = cleanLine(raw);
    if (!l) continue;
    if (CLAUSE.test(l)) break;
    if (REFERENCES.test(l)) inReferences = true;
    entries.push({ text: l, inReferences });
    if (entries.length >= 80) break;
  }
  const lines = entries.map((e) => e.text);
  const ctx = { emails: emailParts(cvText), files: fileNameParts(fileName) };
  const found: Candidate[] = [];
  const consider = (tokens: string[] | null, index: number, labeled: boolean, wholeLine: boolean) => {
    if (!tokens) return;
    const penalty = entries[index].inReferences ? 6 : 0;
    found.push({ tokens, index, score: score(tokens, index, { ...ctx, labeled, wholeLine }) - penalty });
  };

  lines.forEach((line, i) => {
    // „Imię: Jan” + „Nazwisko: Kowalski” w osobnych wierszach
    const first = line.match(FIRST_LABEL);
    if (first) {
      const last = lines.slice(i + 1, i + 3).map((l) => l.match(LAST_LABEL)).find(Boolean);
      if (last) consider(nameTokens(`${first[1]} ${last[1]}`), i, true, false);
      return;
    }
    const segs = segmentsOf(line);
    segs.forEach((seg, k) => {
      const label = seg.match(LABEL); // „Imię i nazwisko: Jan Kowalski”
      if (label) consider(nameTokens(label[1]), i, true, false);
      // tabela: | Imię i nazwisko | Jan Kowalski |
      else consider(nameTokens(seg), i, k > 0 && LABEL_ONLY.test(segs[k - 1]), segs.length === 1);
    });
    // imię i nazwisko w dwóch wierszach (duża czcionka w nagłówku)
    const next = lines[i + 1];
    if (next && /^\S+$/.test(line) && /^\S+$/.test(next) && FIRST_NAMES.has(normalizeForSearch(line))) {
      consider(nameTokens(`${line} ${next}`), i, false, true);
    }
  });

  found.sort((a, b) => b.score - a.score || a.index - b.index);
  const best = found[0];
  if (best && best.score >= THRESHOLD) return format(best.tokens);
  return fromFileName(fileName);
}

/** Ujednolicenie zapisu: „ANNA KOWALSKA” → „Anna Kowalska”. */
export function tidyName(name: string): string {
  return format(name.trim().split(/\s+/));
}

/**
 * Czy imię i nazwisko podane przez AI jest wiarygodne: 2–5 słów, same litery,
 * a każde słowo występuje w tekście CV (chroni przed „Kandydat”, „Nie podano” itp.).
 */
export function isNameFromText(name: string, cvText: string): boolean {
  const tokens = name.trim().split(/\s+/);
  if (tokens.length < 2 || tokens.length > 5) return false;
  if (!tokens.every((t) => TOKEN.test(t.replace(/\.$/, "")))) return false;
  const text = ` ${normalizeForSearch(cvText).replace(/[^a-z'-]+/g, " ")} `;
  return tokens.every((t) => text.includes(` ${normalizeForSearch(t).replace(/\.$/, "")} `));
}

/** Poprzednia wersja heurystyki (1.1.0) – używana tylko do rozpoznania nazw ustawionych przez nią automatycznie. */
export function legacyGuessCandidateName(cvText: string): string | null {
  const NOT_NAME =
    /curriculum|vitae|\bcv\b|resume|zyciorys|życiorys|kontakt|profil|o mnie|doswiadczenie|doświadczenie|umiejetnosci|umiejętności|engineer|administrator|developer|analityk|specjalist|manager|kierownik|senior|junior/i;
  const lines = cvText
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").replace(/\[.*?\]/g, "").trim())
    .filter(Boolean)
    .slice(0, 12);
  for (const l of lines) {
    if (l.length > 40 || /[@\d:|/•·]/.test(l) || NOT_NAME.test(l)) continue;
    const words = l.split(/\s+/);
    if (words.length < 2 || words.length > 3) continue;
    if (words.every((w) => /^[\p{Lu}][\p{Ll}]+(-[\p{Lu}][\p{Ll}]+)?$/u.test(w))) return l;
  }
  return null;
}
