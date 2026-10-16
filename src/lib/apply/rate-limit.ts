// Prosty limit zgłoszeń z jednego adresu IP (ochrona formularza publicznego przed spamem).
type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __rateLimit?: Map<string, Bucket> };
const buckets = (g.__rateLimit ??= new Map());

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= max;
}

/** Adres IP klienta (za reverse proxy – nagłówek X-Forwarded-For / X-Real-IP). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "nieznany";
}
