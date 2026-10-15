import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pakiety z kodem natywnym / workerami ładowane bezpośrednio przez Node (bez bundlowania)
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "tesseract.js",
    "mammoth",
  ],
  experimental: {
    // CV wgrywane są pojedynczo, ale skany PDF bywają duże
    proxyClientMaxBodySize: "30mb",
    serverActions: { bodySizeLimit: "30mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
