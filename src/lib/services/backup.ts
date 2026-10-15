import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import JSZip from "jszip";
import { CONFIG_DIR, PROJECT_ROOT, PROMPTS_DIR, env } from "@/lib/env";

// Kopia zapasowa jako plik ZIP: spójna migawka bazy (VACUUM INTO – działa przy uruchomionej aplikacji),
// pliki CV i ofert, konfiguracja i prompty. Bez zewnętrznych programów (działa także na Windows).

export function backupDir(): string {
  return path.resolve(PROJECT_ROOT, process.env.BACKUP_DIR?.trim() || "backups");
}

function dbPath(): string {
  return path.resolve(PROJECT_ROOT, env.databaseUrl.replace(/^file:/, ""));
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function addDir(zip: JSZip, dir: string, prefix: string) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) n += addDir(zip, full, name);
    else if (entry.isFile() && !entry.name.endsWith(".tmp")) {
      zip.file(name, fs.createReadStream(full));
      n++;
    }
  }
  return n;
}

export async function createBackup(outDir = backupDir()): Promise<{ file: string; sizeBytes: number; files: number }> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-kopia-"));
  try {
    const snapshot = path.join(tmp, "app.db");
    const db = new Database(dbPath(), { readonly: true, fileMustExist: true });
    db.prepare("VACUUM INTO ?").run(snapshot);
    db.close();

    const zip = new JSZip();
    zip.file("app.db", fs.createReadStream(snapshot));
    let files = 1;
    files += addDir(zip, path.join(env.dataDir, "files"), "files");
    files += addDir(zip, CONFIG_DIR(), "config");
    files += addDir(zip, PROMPTS_DIR(), "prompts");
    zip.file(
      "PRZYWRACANIE.txt",
      [
        "Kopia zapasowa Porównywarki CV",
        `Utworzona: ${new Date().toLocaleString("pl-PL")}`,
        "",
        "Przywracanie:",
        "1. Zamknij aplikację.",
        "2. Skopiuj app.db i folder files/ do folderu danych aplikacji (w wersji do pobrania: folder „dane”).",
        "3. Skopiuj zawartość config/ i prompts/ do folderów konfiguracji (w wersji do pobrania: dane/konfiguracja i dane/prompty).",
        "4. Uruchom aplikację.",
        "",
        "UWAGA: kopia zawiera dane osobowe kandydatów.",
      ].join("\r\n"),
    );

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `kopia-${stamp()}.zip`);
    await pipeline(zip.generateNodeStream({ type: "nodebuffer", streamFiles: true, compression: "DEFLATE", compressionOptions: { level: 6 } }), fs.createWriteStream(file));
    return { file, sizeBytes: fs.statSync(file).size, files };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
