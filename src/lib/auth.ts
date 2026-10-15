// Prosta ochrona hasłem (aplikacja wewnętrzna). Używa Web Crypto, więc działa w proxy i w Node.

export const SESSION_COOKIE = "porownywarka_sesja";
const SESSION_DAYS = 7;

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function secretKey(): Promise<CryptoKey> {
  let secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    // awaryjnie: sekret wyprowadzony z hasła (zmiana hasła unieważnia sesje)
    const pw = process.env.APP_PASSWORD ?? "";
    secret = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(`porownywarka:${pw}`)));
  }
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(payload: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", await secretKey(), encoder.encode(payload)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<{ token: string; expires: Date }> {
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const payload = String(expires.getTime());
  return { token: `${payload}.${await sign(payload)}`, expires };
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(sig, await sign(payload));
}

export async function checkPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  // porównanie skrótów – stały czas niezależnie od długości
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return safeEqual(toHex(a), toHex(b));
}
