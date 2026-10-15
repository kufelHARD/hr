// Ręczne uruchomienie retencji danych (RODO) zgodnie z config/scoring.json → "retencja".
// npm run retention            – usuwa kandydatów spełniających kryteria
// npm run retention -- --dry   – tylko pokazuje, ilu kandydatów zostałoby usuniętych
import "dotenv/config";
import { runRetention } from "@/lib/services/retention";
import { db } from "@/lib/db";

(async () => {
  const dry = process.argv.includes("--dry");
  const res = await runRetention({ dryRun: dry });
  if (!res.enabled) {
    console.log('Retencja jest wyłączona (config/scoring.json → "retencja.wlaczona": false). Nic nie usunięto.');
  } else {
    console.log(`${dry ? "Do usunięcia" : "Usunięto"}: ${res.candidates.length} kandydatów.`);
  }
  await db.$disconnect();
})();
