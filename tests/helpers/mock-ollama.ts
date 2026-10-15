// Atrapa serwera Ollama (to samo API HTTP) – do testów bez pobierania modelu.
// Odpowiada poprawnym JSON-em zgodnym ze schematem wymagań lub analizy CV, strumieniując go w kawałkach.
import http from "node:http";

export type MockOllama = { url: string; requests: Array<{ path: string; body: Record<string, unknown> }>; close: () => Promise<void> };

function requirementsAnswer() {
  return {
    stanowisko: "Administrator baz danych",
    obszar: "Bazy danych",
    poziom: "mid",
    podsumowanie: "Administracja SQL Server.",
    wymagania: [
      { tresc: "Min. 3 lata administracji SQL Server", typ: "wymagane", kategoria: "doswiadczenie", waga: 3, wywnioskowane: false, zrodlo: "3 lata SQL Server" },
      { tresc: "Znajomość Microsoft Azure", typ: "wymagane", kategoria: "technologia", waga: 2, wywnioskowane: false, zrodlo: "Azure" },
      { tresc: "Certyfikat AZ-104", typ: "mile_widziane", kategoria: "certyfikaty", waga: 1, wywnioskowane: false, zrodlo: "AZ-104" },
    ],
  };
}

function analysisAnswer(userText: string) {
  const codes = userText.match(/Zwróć ocenę dla każdego wymagania: ([^.]+)\./)?.[1].split(",").map((c) => c.trim()) ?? [];
  const cv = userText.match(/<cv>\n([\s\S]*?)\n<\/cv>/)?.[1] ?? "";
  const quote = cv.split("\n").map((l) => l.trim()).find((l) => l.length > 25) ?? null;
  const comp = (ocena: number) => ({ ocena, uzasadnienie: "Ocena testowa." });
  return {
    kandydat: { imie_nazwisko: "Kandydat Testowy", obecne_stanowisko: "DBA", lata_doswiadczenia: 4, technologie: ["SQL Server", "AWS"] },
    wymagania: codes.map((id, i) => ({
      id_wymagania: id,
      status: i === 0 ? "pelne" : i === 1 ? "pokrewne" : "brak",
      dowod_cytat: i < 2 ? quote : null,
      dowod_opis: i < 2 ? "Opis dowodu." : "Brak wzmianki w CV",
      technologia_pokrewna: i === 1 ? "AWS zamiast Azure" : null,
      uzasadnienie: "Uzasadnienie testowe.",
    })),
    potencjal: {
      bliskosc_domenowa: comp(80),
      umiejetnosci_przenoszalne: comp(70),
      trajektoria_rozwoju: comp(60),
      czas_wdrozenia: { ocena: 50, szacunek: "1–3 miesiące", uzasadnienie: "Ocena testowa." },
      dopasowanie_do_firmy: comp(70),
    },
    mocne_strony: ["SQL Server"],
    slabe_strony: ["Brak Azure"],
    pytania_na_rozmowe: [{ pytanie: "Jak AWS przekłada się na Azure?", cel: "Weryfikacja R2" }],
    podejrzane_instrukcje: { wykryto: false, opis: null },
    rekomendacja: "do_rozwazenia",
    opis_kandydata: "Kandydat testowy z ok. 4 latami doświadczenia. Rekomendacja: do rozważenia przy elastycznych wymaganiach.",
  };
}

export function startMockOllama(opts: { installedModels?: string[]; delayMs?: number; port?: number } = {}): Promise<MockOllama> {
  const installed = new Set(opts.installedModels ?? ["gemma3:4b"]);
  const requests: MockOllama["requests"] = [];
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ path: req.url ?? "", body });
    const json = (code: number, data: unknown) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
    };

    if (req.url === "/api/version") return json(200, { version: "0.0.0-mock" });
    if (req.url === "/api/tags") return json(200, { models: [...installed].map((name) => ({ name, size: 3.3e9 })) });
    if (req.url === "/api/pull") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const completed of [0, 1e9, 2e9, 3.3e9]) res.write(JSON.stringify({ status: "pulling", total: 3.3e9, completed }) + "\n");
      installed.add(body.model);
      res.end(JSON.stringify({ status: "success" }) + "\n");
      return;
    }
    if (req.url === "/api/generate") {
      if (!installed.has(body.model)) return json(404, { error: `model '${body.model}' not found` });
      return json(200, { response: "OK", prompt_eval_count: 1500, prompt_eval_duration: 10e9, eval_count: 100, eval_duration: 10e9 });
    }
    if (req.url === "/api/chat") {
      if (!installed.has(body.model)) return json(404, { error: `model '${body.model}' not found` });
      const user = body.messages.find((m: { role: string }) => m.role === "user").content as string;
      const answer = user.includes("<cv>") ? analysisAnswer(user) : requirementsAnswer();
      const text = JSON.stringify(answer);
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (let i = 0; i < text.length; i += 200) {
        res.write(JSON.stringify({ message: { role: "assistant", content: text.slice(i, i + 200) }, done: false }) + "\n");
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      res.end(JSON.stringify({ message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 9000, eval_count: 2500 }) + "\n");
      return;
    }
    json(404, { error: "not found" });
  });
  return new Promise((resolve) =>
    server.listen(opts.port ?? 0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(() => r())) });
    }),
  );
}
