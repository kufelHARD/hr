// Test startu paczki do pobrania (uruchamiany w CI na Windows):
// moduły natywne, migracja bazy, start serwera i ekran pierwszego uruchomienia.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "dist/Porownywarka-CV");
const program = path.join(root, "program");
const node = process.platform === "win32" ? path.join(program, "node", "node.exe") : process.execPath;
const fail = (m) => {
  console.error(`✖ ${m}`);
  process.exit(1);
};

console.log("1. Moduły natywne");
execFileSync(
  node,
  [
    "-e",
    [
      "const D=require('better-sqlite3');new D(':memory:').prepare('select 1').get();",
      "const {createCanvas}=require('@napi-rs/canvas');createCanvas(10,10).toBuffer('image/png');",
      "import('pdfjs-dist/legacy/build/pdf.mjs').then(()=>console.log('   better-sqlite3, canvas, pdfjs: OK'));",
    ].join(""),
  ],
  { cwd: program, stdio: "inherit" },
);

console.log("2. Start aplikacji");
const port = 3456;
const proc = spawn(node, [path.join(program, "uruchom.mjs")], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NIE_OTWIERAJ_PRZEGLADARKI: "1" },
  stdio: "inherit",
});
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const res = await fetch(`http://127.0.0.1:${port}/logowanie`);
    const html = await res.text();
    if (res.status === 200 && html.includes("Pierwsze uruchomienie")) ok = true;
  } catch {
    /* jeszcze nie działa */
  }
}
proc.kill();
if (!ok) {
  const logFile = path.join(root, "dane", "logi", "aplikacja.log");
  if (fs.existsSync(logFile)) console.log(fs.readFileSync(logFile, "utf8"));
  fail("Aplikacja nie odpowiedziała ekranem pierwszego uruchomienia.");
}
if (!fs.existsSync(path.join(root, "dane", "app.db"))) fail("Nie utworzono bazy danych.");
if (!fs.existsSync(path.join(root, "dane", "konfiguracja", "scoring.json"))) fail("Nie skopiowano konfiguracji.");
console.log("✔ Paczka działa: baza utworzona, serwer odpowiada, ekran pierwszego uruchomienia OK.");
process.exit(0);
