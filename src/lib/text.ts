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

export function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/s);
  return (m ? m[0] : text).trim();
}
