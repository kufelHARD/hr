// Przygotowanie katalogów danych przed startem aplikacji.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR?.trim() || "./storage");
for (const dir of [dataDir, path.join(dataDir, "files", "offers"), path.join(dataDir, "files", "cv")]) {
  fs.mkdirSync(dir, { recursive: true });
}

if (!fs.existsSync(path.join(process.cwd(), ".env"))) {
  console.warn("⚠ Brak pliku .env – skopiuj .env.example do .env i uzupełnij ANTHROPIC_API_KEY oraz APP_PASSWORD.");
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn("⚠ ANTHROPIC_API_KEY nie jest ustawiony – analiza AI nie zadziała.");
}
