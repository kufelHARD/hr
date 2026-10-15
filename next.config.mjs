// @ts-check
// Konfiguracja Next.js (plik .mjs – działa bez TypeScriptu także w wersji do pobrania).

/** @type {import("next").NextConfig} */
const nextConfig = {
  // Pakiety z kodem natywnym / workerami ładowane bezpośrednio przez Node (bez bundlowania)
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "tesseract.js",
    "mammoth",
    "undici",
  ],
  experimental: {
    // CV wgrywane są pojedynczo, ale skany PDF bywają duże
    proxyClientMaxBodySize: "30mb",
    serverActions: { bodySizeLimit: "30mb" },
  },
};

export default nextConfig;
