// Źródła kandydatów – parametr ?zrodlo=… w linku do formularza (osobny link dla każdego portalu).

export const SOURCES = [
  { key: "pracuj", label: "pracuj.pl" },
  { key: "justjoin", label: "justjoin.it" },
  { key: "nofluffjobs", label: "No Fluff Jobs" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "rocketjobs", label: "RocketJobs" },
  { key: "olx", label: "OLX Praca" },
  { key: "strona", label: "Strona firmy" },
  { key: "polecenie", label: "Polecenie" },
] as const;

const LABELS: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.key, s.label]));

export function sourceLabel(key: string | null | undefined): string {
  if (!key || key === "recznie") return "Dodane ręcznie";
  if (key === "formularz") return "Formularz (bez źródła)";
  return LABELS[key] ?? key;
}

/** Normalizacja parametru ?zrodlo= (znane źródła albo „inne:<nazwa>”, bez znaków specjalnych). */
export function normalizeSource(raw: string | null | undefined): string {
  const v = (raw ?? "").toLowerCase().trim().replace(/[^a-z0-9.\-_]/g, "").slice(0, 40);
  if (!v) return "formularz";
  if (LABELS[v]) return v;
  const alias: Record<string, string> = { "pracuj.pl": "pracuj", "justjoin.it": "justjoin", jjit: "justjoin", nfj: "nofluffjobs", li: "linkedin" };
  return alias[v] ?? v;
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "oferta"}-${suffix}`;
}
