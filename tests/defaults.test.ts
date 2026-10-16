// Aktualizacja domyślnych promptów i konfiguracji w wersji do pobrania (bez nadpisywania zmian użytkownika).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contentHash, syncDefaults } from "../launcher/defaults.mjs";

function dir(files: Record<string, string>) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "porownywarka-def-"));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(d, name), text);
  return d;
}
const read = (d: string, f: string) => fs.readFileSync(path.join(d, f), "utf8");

describe("pliki domyślne", () => {
  it("kopiuje brakujące, aktualizuje niezmienione, zostawia zmienione przez użytkownika", () => {
    const v1 = dir({ "a.md": "A1\n", "b.md": "B1\n" });
    const data = dir({});
    expect(syncDefaults(v1, data)).toEqual([]);
    expect(read(data, "a.md")).toBe("A1\n");
    fs.writeFileSync(path.join(data, "b.md"), "B – moja wersja\n");

    const v2 = dir({ "a.md": "A2\n", "b.md": "B2\n", "c.md": "C2\n" });
    expect(syncDefaults(v2, data)).toEqual(["a.md"]);
    expect(read(data, "a.md")).toBe("A2\n");
    expect(read(data, "b.md")).toBe("B – moja wersja\n");
    expect(read(data, "c.md")).toBe("C2\n");
  });

  it("rozpoznaje prompt z wersji ≤ 1.1.1 (bez zapisu wersji, także z końcami wierszy CRLF)", () => {
    const old = fs.readFileSync("prompts/analysis-system.md", "utf8"); // niezmieniony od 1.1.1 – brak aktualizacji
    const data = dir({ "requirements-system.md": "stara treść\r\n", "analysis-system.md": old.replace(/\n/g, "\r\n") });
    const updated = syncDefaults(path.resolve("prompts"), data);
    expect(updated).toEqual([]); // „stara treść” to nie wersja dostarczona – zmiana użytkownika
    expect(contentHash(Buffer.from("x\r\ny"))).toBe(contentHash(Buffer.from("x\ny")));
  });
});
