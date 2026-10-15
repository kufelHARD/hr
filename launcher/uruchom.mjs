// Program uruchamiający wersję do pobrania (Windows): przygotowuje folder danych, aktualizuje bazę,
// uruchamia serwer aplikacji tylko dla tego komputera (127.0.0.1) i otwiera przeglądarkę.
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "./migrate.mjs";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url)); // …\Porownywarka-CV\program
const ROOT = path.resolve(APP_DIR, "..");
const DATA = path.join(ROOT, "dane");
const LOGS = path.join(DATA, "logi");

const log = (msg) => console.log(`[${new Date().toLocaleTimeString("pl-PL")}] ${msg}`);

function copyMissing(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyMissing(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer().once("error", () => resolve(false)).once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

function openBrowser(url) {
  if (process.platform === "win32") execFile("cmd", ["/c", "start", "", url], { windowsHide: true });
  else if (process.platform === "darwin") execFile("open", [url]);
  else execFile("xdg-open", [url], () => undefined);
}

async function main() {
  console.log("==============================================");
  console.log("  Porównywarka CV – summ-it S.A.");
  console.log("==============================================");

  // 1. folder danych (dane osobowe!) i konfiguracja użytkownika – poza folderem programu,
  //    dzięki czemu aktualizacja programu (podmiana folderu „program”) ich nie nadpisuje
  fs.mkdirSync(path.join(DATA, "files", "cv"), { recursive: true });
  fs.mkdirSync(path.join(DATA, "files", "offers"), { recursive: true });
  fs.mkdirSync(LOGS, { recursive: true });
  copyMissing(path.join(APP_DIR, "config"), path.join(DATA, "konfiguracja"));
  copyMissing(path.join(APP_DIR, "prompts"), path.join(DATA, "prompty"));

  // 2. baza danych
  const dbFile = path.join(DATA, "app.db");
  const applied = migrate(dbFile, path.join(APP_DIR, "prisma", "migrations"), APP_DIR);
  if (applied) log(`Baza danych przygotowana (migracje: ${applied}).`);

  // 3. port – jeśli aplikacja już działa, tylko otwórz przeglądarkę
  let port = Number(process.env.PORT) || 3000;
  for (let p = port; p < port + 20; p++) {
    const existing = await get(`http://127.0.0.1:${p}/logowanie`);
    if (existing?.body.includes("Porównywarka CV")) {
      log(`Aplikacja już działa – otwieram http://localhost:${p}`);
      openBrowser(`http://localhost:${p}`);
      return;
    }
    if (await portFree(p)) {
      port = p;
      break;
    }
  }

  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATA_DIR: DATA,
    DATABASE_URL: `file:${dbFile}`,
    CONFIG_DIR: path.join(DATA, "konfiguracja"),
    PROMPTS_DIR: path.join(DATA, "prompty"),
    BACKUP_DIR: path.join(ROOT, "kopie-zapasowe"),
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    AUTH_SECRET: process.env.AUTH_SECRET || "",
  };
  if (!env.AUTH_SECRET) delete env.AUTH_SECRET; // sekret sesji generowany i zapisywany w folderze danych

  // 4. serwer aplikacji
  const logFile = fs.createWriteStream(path.join(LOGS, "aplikacja.log"), { flags: "a" });
  logFile.write(`\n===== start ${new Date().toISOString()} =====\n`);
  const nextBin = path.join(APP_DIR, "node_modules", "next", "dist", "bin", "next");
  const server = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: APP_DIR,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.pipe(logFile);
  server.stderr.pipe(logFile);
  server.stderr.on("data", (d) => process.stderr.write(d));

  const stop = () => {
    log("Zatrzymywanie…");
    server.kill();
    setTimeout(() => process.exit(0), 1500);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  server.on("exit", (code) => {
    log(`Serwer zakończył działanie (kod ${code}). Szczegóły: ${path.join(LOGS, "aplikacja.log")}`);
    process.exit(code ?? 0);
  });

  // 5. czekanie na gotowość i otwarcie przeglądarki
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) {
    const r = await get(`http://127.0.0.1:${port}/logowanie`);
    if (r && r.status === 200) {
      log(`Aplikacja działa: ${url}`);
      log("Nie zamykaj tego okna – zamknięcie kończy pracę aplikacji.");
      if (!process.env.NIE_OTWIERAJ_PRZEGLADARKI) openBrowser(url);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log("Aplikacja nie uruchomiła się w ciągu 2 minut – sprawdź plik dane\\logi\\aplikacja.log.");
}

main().catch((e) => {
  console.error("Błąd uruchamiania:", e);
  process.exitCode = 1;
});

