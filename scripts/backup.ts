// Kopia zapasowa: baza SQLite (spójna migawka, także przy działającej aplikacji) + pliki z katalogu storage/
// + konfiguracja (config/, prompts/). Wynik: backups/backup-RRRRMMDD-GGMM.tar.gz
// Uruchomienie: npm run backup   (opcjonalnie: npm run backup -- --dir D:\kopie)
import "dotenv/config";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.DATA_DIR?.trim() || "./storage");
const dbUrl = process.env.DATABASE_URL?.trim() || "file:./storage/app.db";
const dbPath = path.resolve(root, dbUrl.replace(/^file:/, ""));
const dirArg = process.argv.indexOf("--dir");
const outDir = path.resolve(root, dirArg > 0 ? process.argv[dirArg + 1] : "backups");

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

if (!fs.existsSync(dbPath)) {
  console.error(`Nie znaleziono bazy danych: ${dbPath}`);
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-backup-"));
try {
  // spójna migawka bazy (bez blokowania aplikacji)
  const snapshot = path.join(tmp, "app.db");
  const db = new Database(dbPath, { readonly: true });
  db.prepare("VACUUM INTO ?").run(snapshot);
  db.close();

  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `backup-${stamp()}.tar.gz`);
  const args = ["-czf", out, "-C", tmp, "app.db"];
  if (fs.existsSync(path.join(dataDir, "files"))) args.push("-C", dataDir, "files");
  args.push("-C", root, "config", "prompts");
  execFileSync("tar", args, { stdio: "inherit" });

  const size = fs.statSync(out).size;
  console.log(`✔ Kopia zapasowa: ${out} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  console.log("  Zawiera dane osobowe kandydatów – przechowuj ją w bezpiecznym miejscu.");
  console.log("  Odtwarzanie: zatrzymaj aplikację, rozpakuj archiwum, skopiuj app.db i files/ do katalogu DATA_DIR");
  console.log(`  (${dataDir}), a config/ i prompts/ do katalogu aplikacji.`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
