// Migracje bazy SQLite bez narzędzi Prismy (wersja do pobrania nie zawiera Prisma CLI).
// Zgodne z tabelą _prisma_migrations – baza może być dalej obsługiwana przez `prisma migrate`.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export function migrate(dbFile, migrationsDir, appDir) {
  const require = createRequire(path.join(appDir, "package.json"));
  const Database = require("better-sqlite3");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  try {
    db.pragma("journal_mode = WAL");
    db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);
    const applied = new Set(
      db.prepare(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).all().map((r) => r.migration_name),
    );
    const names = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
      .map((d) => d.name)
      .sort();
    let count = 0;
    for (const name of names) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const run = db.transaction(() => {
        db.exec(sql);
        db.prepare(
          `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES (?, ?, datetime('now'), ?, datetime('now'), 1)`,
        ).run(crypto.randomUUID(), checksum, name);
      });
      run();
      count++;
    }
    return count;
  } finally {
    db.close();
  }
}

// Uruchomienie bezpośrednie: node launcher/migrate.mjs <plik-bazy>
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("migrate.mjs")) {
  const appDir = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
  const dbFile = path.resolve(process.argv[2] ?? path.join(appDir, "storage", "app.db"));
  const n = migrate(dbFile, path.join(appDir, "prisma", "migrations"), appDir);
  console.log(n ? `Zastosowano migracje: ${n}` : "Baza danych jest aktualna.");
}
