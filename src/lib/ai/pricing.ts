// Cennik modeli Claude (USD za 1 mln tokenów) – do szacowania kosztów w aplikacji.
// Oficjalne rozliczenie: console.anthropic.com → Usage / Cost. Ceny mogą się zmienić – zaktualizuj tutaj.
// cacheWrite = zapis do cache (5 min), cacheRead = odczyt z cache.

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

const PRICES: Array<[prefix: string, price: Price]> = [
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  ["claude-opus-5-5", { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  ["claude-fable-5-1", { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }],
  ["claude-haiku-4-5", { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
];

export type TokenUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

/** Szacowany koszt w USD; 0 dla modeli lokalnych; null, gdy model nie ma cennika. */
export function estimateCostUsd(provider: string, model: string, u: TokenUsage): number | null {
  if (provider === "ollama") return 0;
  const price = PRICES.find(([prefix]) => model === prefix || model.startsWith(`${prefix}-`))?.[1];
  if (!price) return null;
  return (
    (u.inputTokens * price.input +
      u.outputTokens * price.output +
      u.cacheReadTokens * price.cacheRead +
      u.cacheWriteTokens * price.cacheWrite) /
    1e6
  );
}

export function formatUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  if (v === 0) return "0 $";
  return v < 0.01 ? `${v.toFixed(4)} $` : `${v.toFixed(2)} $`;
}

/** Kurs do orientacyjnego przeliczenia na złotówki (zmień w razie potrzeby). */
export const USD_PLN = 3.7;

export function formatPln(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "–";
  if (usd === 0) return "0 zł";
  const pln = usd * USD_PLN;
  return pln < 0.1 ? `${(pln * 100).toFixed(1).replace(".", ",")} gr` : `${pln.toFixed(2).replace(".", ",")} zł`;
}
