// Domyślne pliki konfiguracji i promptów w folderze danych wersji do pobrania.
//
// Przy pierwszym uruchomieniu są kopiowane z programu. Po aktualizacji programu plik jest podmieniany
// na nową wersję tylko wtedy, gdy użytkownik go nie zmieniał (jego treść to któraś z wcześniej
// dostarczonych wersji) – własne zmiany użytkownika zostają nietknięte.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const RECORD = ".domyslne.json";

// Wersje plików dostarczane przed wprowadzeniem zapisu w .domyslne.json (≤ 1.1.1).
const LEGACY = {
  "requirements-system.md": ["afae6df5397448fbdede70e5dc7b3a1d308d358bdd4a020e84c6360f3257fdc2"],
  "analysis-system.md": ["4cba0bd0e966b27cc7543dfc585cb7c78519af5e65e0631da2658ae171edf54d"],
};

/** Skrót treści niezależny od końców wierszy (Windows/Git potrafią zamienić LF na CRLF). */
export function contentHash(buffer) {
  return crypto.createHash("sha256").update(buffer.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
}

/**
 * Kopiuje brakujące pliki z `src` do `dst` i aktualizuje niezmienione przez użytkownika.
 * Zwraca listę zaktualizowanych plików (ścieżki względne).
 */
export function syncDefaults(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const recordFile = path.join(dst, RECORD);
  let record = {};
  try {
    record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
  } catch {
    /* brak zapisu – pierwsze uruchomienie albo wersja ≤ 1.1.1 */
  }
  const updated = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(src, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name;
      const s = path.join(src, r);
      const d = path.join(dst, r);
      if (entry.isDirectory()) {
        fs.mkdirSync(d, { recursive: true });
        walk(r);
        continue;
      }
      const shipped = contentHash(fs.readFileSync(s));
      if (!fs.existsSync(d)) {
        fs.copyFileSync(s, d);
      } else {
        const current = contentHash(fs.readFileSync(d));
        const known = record[r] ? [record[r]] : (LEGACY[r] ?? []);
        if (current !== shipped && known.includes(current)) {
          fs.copyFileSync(s, d);
          updated.push(r);
        } else if (current !== shipped) {
          continue; // plik zmieniony przez użytkownika – zostawiamy i nie zapisujemy nowej wersji jako „jego”
        }
      }
      record[r] = shipped;
    }
  };
  walk("");
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));
  return updated;
}
