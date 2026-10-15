// Kopia zapasowa (ZIP): baza danych + pliki CV i ofert + konfiguracja i prompty.
// Uruchomienie: npm run backup   (opcjonalnie: npm run backup -- --dir D:\kopie)
import "dotenv/config";
import path from "node:path";
import { createBackup, backupDir } from "@/lib/services/backup";

(async () => {
  const i = process.argv.indexOf("--dir");
  const out = i > 0 ? path.resolve(process.argv[i + 1]) : backupDir();
  const res = await createBackup(out);
  console.log(`✔ Kopia zapasowa: ${res.file} (${(res.sizeBytes / 1024 / 1024).toFixed(1)} MB, plików: ${res.files})`);
  console.log("  Zawiera dane osobowe kandydatów – przechowuj ją w bezpiecznym miejscu.");
  console.log("  Instrukcja przywracania: plik PRZYWRACANIE.txt w archiwum.");
})().catch((e) => {
  console.error("Błąd kopii zapasowej:", e.message);
  process.exit(1);
});
