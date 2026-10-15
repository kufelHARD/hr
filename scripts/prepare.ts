// Przygotowanie katalogów danych i aktualizacja bazy (migracje) przed startem aplikacji.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { migrate } from "../launcher/migrate.mjs";

const root = process.cwd();
const dataDir = path.resolve(root, process.env.DATA_DIR?.trim() || "./storage");
for (const dir of [dataDir, path.join(dataDir, "files", "offers"), path.join(dataDir, "files", "cv")]) {
  fs.mkdirSync(dir, { recursive: true });
}
const dbFile = path.resolve(root, (process.env.DATABASE_URL?.trim() || "file:./storage/app.db").replace(/^file:/, ""));
const applied: number = migrate(dbFile, path.join(root, "prisma", "migrations"), root);
if (applied) console.log(`Zastosowano migracje bazy: ${applied}`);
