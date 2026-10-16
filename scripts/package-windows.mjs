// Buduje wersję do pobrania: folder „Porownywarka-CV” z wbudowanym Node.js i plik ZIP.
//
//   node scripts/package-windows.mjs                  → dist/Porownywarka-CV-windows-x64.zip (Windows 10/11, 64-bit)
//   node scripts/package-windows.mjs --target linux   → paczka testowa dla Linuksa (bez pobierania Node.js)
//   opcje: --skip-build (użyj istniejącego .next), --no-zip
//
// Działa na Windows, Linuksie i macOS (zależności dla Windows są instalowane flagami npm --os/--cpu).
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const target = args.includes("--target") ? args[args.indexOf("--target") + 1] : "win32";
const skipBuild = args.includes("--skip-build");
const noZip = args.includes("--no-zip");
const NODE_MAJOR = 22;

const DIST = path.join(ROOT, "dist");
const OUT = path.join(DIST, "Porownywarka-CV");
const APP = path.join(OUT, "program");
const isWin = process.platform === "win32";
const npm = isWin ? "npm.cmd" : "npm";

const step = (m) => console.log(`\n▶ ${m}`);
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: "inherit", cwd: ROOT, shell: isWin, ...opts });

function copy(src, dst, filter = () => true) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const e of fs.readdirSync(src)) {
      const s = path.join(src, e);
      if (filter(s)) copy(s, path.join(dst, e), filter);
    }
  } else fs.copyFileSync(src, dst);
}

function dirSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pobieranie ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchNodeExe(dest) {
  const base = `https://nodejs.org/dist/latest-v${NODE_MAJOR}.x/`;
  const sums = (await download(`${base}SHASUMS256.txt`)).toString("utf8");
  const line = sums.split("\n").find((l) => /node-v[\d.]+-win-x64\.zip$/.test(l.trim()));
  if (!line) throw new Error("Nie znaleziono Node.js dla Windows w SHASUMS256.txt");
  const [sha, file] = line.trim().split(/\s+/);
  console.log(`  ${file}`);
  const zipBuf = await download(base + file);
  if (crypto.createHash("sha256").update(zipBuf).digest("hex") !== sha) throw new Error("Błędna suma kontrolna Node.js");
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(zipBuf);
  const exe = Object.keys(zip.files).find((n) => n.endsWith("/node.exe"));
  const lic = Object.keys(zip.files).find((n) => n.endsWith("/LICENSE"));
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, "node.exe"), await zip.files[exe].async("nodebuffer"));
  if (lic) fs.writeFileSync(path.join(dest, "LICENSE"), await zip.files[lic].async("nodebuffer"));
  return file.match(/node-(v[\d.]+)/)[1];
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

  if (!skipBuild) {
    step("Budowanie aplikacji (next build)");
    run(npm, ["run", "build"]);
  }
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("Brak zbudowanej aplikacji (.next) – uruchom bez --skip-build.");

  step(`Przygotowanie folderu ${path.relative(ROOT, OUT)}`);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });
  copy(path.join(ROOT, ".next"), path.join(APP, ".next"), (p) => !/[\\/]\.next[\\/](cache|dev|trace)/.test(p) && !p.endsWith(".map"));
  for (const item of ["public", "config", "prompts", "next.config.mjs", "package-lock.json"]) {
    if (fs.existsSync(path.join(ROOT, item))) copy(path.join(ROOT, item), path.join(APP, item));
  }
  copy(path.join(ROOT, "prisma", "migrations"), path.join(APP, "prisma", "migrations"));
  copy(path.join(ROOT, "launcher", "uruchom.mjs"), path.join(APP, "uruchom.mjs"));
  copy(path.join(ROOT, "launcher", "migrate.mjs"), path.join(APP, "migrate.mjs"));
  copy(path.join(ROOT, "launcher", "defaults.mjs"), path.join(APP, "defaults.mjs"));
  // uruchom.mjs importuje ./migrate.mjs – w paczce oba pliki leżą obok siebie
  const appPkg = { name: pkg.name, version: pkg.version, private: true, dependencies: pkg.dependencies, overrides: pkg.overrides };
  fs.writeFileSync(path.join(APP, "package.json"), JSON.stringify(appPkg, null, 2));

  step(`Instalacja zależności produkcyjnych (${target}-x64)`);
  run(npm, ["ci", "--omit=dev", "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund", `--os=${target}`, "--cpu=x64"], { cwd: APP });
  // kompilator SWC jest potrzebny tylko do budowania – nie przy uruchamianiu (oszczędność ok. 100 MB)
  const nextScope = path.join(APP, "node_modules", "@next");
  if (fs.existsSync(nextScope)) for (const d of fs.readdirSync(nextScope)) if (d.startsWith("swc-")) fs.rmSync(path.join(nextScope, d), { recursive: true });
  fs.rmSync(path.join(APP, "package-lock.json"), { force: true });

  step("Odchudzanie paczki");
  const nm = path.join(APP, "node_modules");
  const rm = (rel) => fs.rmSync(path.join(nm, rel), { recursive: true, force: true });
  // sharp (optymalizacja obrazów Next.js) – aplikacja z niej nie korzysta
  rm("sharp");
  rm("@img");
  // better-sqlite3: tylko binarka dla platformy docelowej, bez źródeł SQLite
  rm("better-sqlite3/deps");
  rm("better-sqlite3/src");
  const pre = path.join(nm, "better-sqlite3", "prebuilds");
  for (const f of fs.readdirSync(pre)) if (!f.startsWith(`${target}-x64`)) fs.rmSync(path.join(pre, f));
  // pdfjs-dist: używana jest tylko wersja „legacy” dla Node.js
  for (const d of ["web", "types", "build", "image_decoders"]) rm(`pdfjs-dist/${d}`);
  // Prisma: tylko silnik zapytań dla SQLite
  const prt = path.join(nm, "@prisma", "client", "runtime");
  if (fs.existsSync(prt)) {
    for (const f of fs.readdirSync(prt)) {
      if (/\.(postgresql|mysql|sqlserver|cockroachdb)\./.test(f)) fs.rmSync(path.join(prt, f), { force: true });
    }
  }
  // mapy źródeł, deklaracje typów, dokumentacja
  const prune = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) prune(p);
      else if (/\.(map|d\.ts|d\.mts|d\.cts|md|markdown)$/i.test(e.name) && !/^license/i.test(e.name)) fs.rmSync(p);
    }
  };
  prune(nm);

  // kontrola: moduły natywne dla platformy docelowej
  const need = target === "win32"
    ? ["better-sqlite3/prebuilds/win32-x64.node", "@napi-rs/canvas-win32-x64-msvc"]
    : ["better-sqlite3/prebuilds/linux-x64.node", "@napi-rs/canvas-linux-x64-gnu"];
  for (const n of need) {
    if (!fs.existsSync(path.join(APP, "node_modules", n))) throw new Error(`Brak modułu natywnego: ${n}`);
  }

  if (target === "win32") {
    step("Pobieranie Node.js dla Windows (nodejs.org)");
    const v = await fetchNodeExe(path.join(APP, "node"));
    console.log(`  wbudowany Node.js ${v}`);
    fs.writeFileSync(
      path.join(OUT, "Uruchom.cmd"),
      [
        "@echo off",
        "chcp 65001 >nul",
        "title Porównywarka CV",
        'cd /d "%~dp0"',
        '"%~dp0program\\node\\node.exe" "%~dp0program\\uruchom.mjs"',
        "if errorlevel 1 pause",
        "",
      ].join("\r\n"),
    );
  } else {
    fs.writeFileSync(path.join(OUT, "uruchom.sh"), '#!/bin/sh\ncd "$(dirname "$0")"\nexec node program/uruchom.mjs\n', { mode: 0o755 });
  }
  copy(path.join(ROOT, "launcher", "INSTRUKCJA.txt"), path.join(OUT, "INSTRUKCJA.txt"));
  fs.writeFileSync(path.join(APP, "WERSJA.txt"), `Porównywarka CV ${pkg.version}\nZbudowano: ${new Date().toISOString()}\n`);
  console.log(`  rozmiar folderu: ${(dirSize(OUT) / 1024 / 1024).toFixed(0)} MB`);

  if (!noZip) {
    step("Pakowanie ZIP");
    const zipName = `Porownywarka-CV-${target === "win32" ? "windows" : target}-x64.zip`;
    const zipPath = path.join(DIST, zipName);
    fs.rmSync(zipPath, { force: true });
    if (isWin) {
      run("7z", ["a", "-tzip", "-mx=7", zipPath, "Porownywarka-CV"], { cwd: DIST });
    } else {
      run("zip", ["-qr", "-9", zipPath, "Porownywarka-CV"], { cwd: DIST });
    }
    console.log(`\n✔ Gotowe: ${zipPath} (${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(0)} MB)`);
  } else {
    console.log(`\n✔ Gotowe: ${OUT}`);
  }
}

main().catch((e) => {
  console.error(`\n✖ ${e.message}`);
  process.exit(1);
});
