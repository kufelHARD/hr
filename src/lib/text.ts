/** Normalizacja do wyszukiwania i porównań: małe litery, bez polskich znaków, pojedyncze spacje. */
export function normalizeForSearch(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalizacja do weryfikacji cytatów: dodatkowo usuwa interpunkcję i znaki list. */
function normalizeForQuote(input: string): string {
  return normalizeForSearch(input)
    .replace(/[^\p{L}\p{N}+#.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sprawdza, czy cytat (dowód z CV) faktycznie występuje w tekście CV.
 * Tolerancyjne: ignoruje wielkość liter, polskie znaki, interpunkcję i łamanie wierszy.
 * Dla dłuższych cytatów akceptuje dopasowanie, gdy ≥ 80% kolejnych słów występuje w tekście
 * (AI czasem pomija wtrącenia lub skleja punkty listy).
 */
export function quoteAppearsInText(quote: string, text: string): boolean {
  const q = normalizeForQuote(quote);
  if (!q) return false;
  const t = normalizeForQuote(text);
  if (t.includes(q)) return true;

  const words = q.split(" ").filter((w) => w.length > 0);
  if (words.length < 4) return false;
  // przesuwne okna 4-wyrazowe – ile z nich występuje w tekście
  const windows: string[] = [];
  for (let i = 0; i + 4 <= words.length; i++) windows.push(words.slice(i, i + 4).join(" "));
  const hits = windows.filter((w) => t.includes(w)).length;
  return hits / windows.length >= 0.8;
}

// Skróty, po których kropka nie kończy zdania
const ABBREVIATIONS = new Set([
  "ok", "np", "m.in", "tj", "tzn", "itd", "itp", "r", "min", "maks", "max", "ds", "ul", "godz", "nr", "tys", "mln",
  "mld", "prof", "dr", "inż", "mgr", "wg", "ww", "zob", "por", "jw", "tzw", "pn", "ang", "pol", "wyd", "św", "lic",
]);

/** Pierwsze zdanie tekstu – z pominięciem kropek w skrótach („ok.”, „np.”) i liczbach („2.5”). */
export function firstSentence(text: string): string {
  const t = text.trim();
  const re = /[.!?](?=\s+[\p{Lu}„"(]|\s*$)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    if (t[m.index] === ".") {
      const before = t.slice(0, m.index);
      const word = (before.match(/(\S+)$/)?.[1] ?? "").toLowerCase().replace(/^[(„"]/, "");
      if (ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word)) continue; // skrót lub inicjał
    }
    return t.slice(0, m.index + 1);
  }
  return t;
}
