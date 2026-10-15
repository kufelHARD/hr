"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ollamaStatusAction,
  pullStatusAction,
  saveAiSettingsAction,
  speedTestAction,
  startPullAction,
  testClaudeAction,
} from "../actions";
import { Alert, Badge, Button, cx } from "@/components/ui";

type Initial = {
  provider: "ollama" | "claude";
  ollamaUrl: string;
  ollamaModel: string;
  claudeModel: string;
  claudeEffort: "low" | "medium" | "high" | "xhigh" | "max";
  claudeKeySource: "env" | "ustawienia" | "brak";
  claudeKeyHint: string | null;
};

type Status = Awaited<ReturnType<typeof ollamaStatusAction>>;

export function AiSettingsForm({
  initial,
  initialStatus,
  claudeModels,
  ollamaSuggestions,
}: {
  initial: Initial;
  initialStatus: Status;
  claudeModels: ReadonlyArray<{ id: string; label: string }>;
  ollamaSuggestions: ReadonlyArray<{ id: string; label: string }>;
}) {
  const [provider, setProvider] = useState(initial.provider);
  const [ollamaUrl, setOllamaUrl] = useState(initial.ollamaUrl);
  const [ollamaModel, setOllamaModel] = useState(initial.ollamaModel);
  const [claudeModel, setClaudeModel] = useState(initial.claudeModel);
  const [claudeEffort, setClaudeEffort] = useState(initial.claudeEffort);
  const [apiKey, setApiKey] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [speed, setSpeed] = useState<string | null>(null);
  const [claudeTest, setClaudeTest] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const [checking, setChecking] = useState(false);

  const refresh = useCallback(async () => {
    setChecking(true);
    setStatus(await ollamaStatusAction(ollamaUrl, ollamaModel));
    setChecking(false);
  }, [ollamaUrl, ollamaModel]);

  // postęp pobierania modelu
  const pulling = status?.pull && !status.pull.done;
  useEffect(() => {
    if (!pulling) return;
    const t = setInterval(async () => {
      const p = await pullStatusAction();
      setStatus((s) => (s ? { ...s, pull: p } : s));
      if (p?.done) {
        clearInterval(t);
        void refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [pulling, refresh]);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveAiSettingsAction({
        provider,
        ollamaUrl,
        ollamaModel,
        claudeModel,
        claudeEffort,
        claudeApiKey: removeKey ? "" : apiKey.trim() || undefined,
      });
      setMsg(r.error ? { text: r.error, error: true } : { text: r.message ?? "Zapisano", error: false });
      if (!r.error) {
        setApiKey("");
        setRemoveKey(false);
      }
    });
  }

  const pull = status?.pull;
  const pct = pull && pull.total ? Math.round((pull.completed / pull.total) * 100) : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-2">
        {(
          [
            ["ollama", "Model lokalny (Ollama)", "Darmowy · CV nie opuszczają komputera · wolniejszy na komputerach bez karty graficznej"],
            ["claude", "Claude API (Anthropic)", "Płatny (od ok. 2 gr za CV) · najlepsza jakość · 1–2 min na CV · wymaga klucza API"],
          ] as const
        ).map(([value, label, desc]) => (
          <label
            key={value}
            className={cx(
              "flex cursor-pointer gap-3 rounded-lg border p-4",
              provider === value ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-slate-200 hover:bg-slate-50",
            )}
          >
            <input type="radio" name="provider" className="mt-1" checked={provider === value} onChange={() => setProvider(value)} />
            <span>
              <span className="flex items-center gap-2 font-medium text-slate-900">
                {label}
                {value === "ollama" ? <Badge tone="green">0 zł</Badge> : <Badge tone="amber">płatny</Badge>}
              </span>
              <span className="mt-1 block text-sm text-slate-500">{desc}</span>
            </span>
          </label>
        ))}
      </div>

      {/* ---------------- Ollama ---------------- */}
      <section className={cx("space-y-4 rounded-lg border border-slate-200 p-4", provider !== "ollama" && "opacity-70")}>
        <h3 className="font-semibold text-slate-800">Model lokalny (Ollama)</h3>

        {status && !status.reachable && (
          <Alert tone="amber">
            <p className="font-medium">Ollama nie jest uruchomiona lub nie jest zainstalowana.</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>
                Pobierz bezpłatny program Ollama dla Windows ze strony <strong>https://ollama.com/download</strong> i zainstaluj go.
              </li>
              <li>Po instalacji Ollama działa w tle (ikona lamy w zasobniku obok zegara).</li>
              <li>Wróć tutaj i kliknij „Sprawdź połączenie”, a potem „Pobierz model”.</li>
            </ol>
          </Alert>
        )}
        {status?.reachable && (
          <p className="text-sm text-emerald-700">
            ✓ Ollama działa (wersja {status.version}). Pobrane modele:{" "}
            {status.models.length ? status.models.map((m) => `${m.name} (${m.sizeGb} GB)`).join(", ") : "brak"}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Model</span>
            <input
              list="ollama-models"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <datalist id="ollama-models">
              {ollamaSuggestions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </datalist>
            <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
              {ollamaSuggestions.map((m) => (
                <li key={m.id}>
                  <button type="button" className="text-brand-700 hover:underline" onClick={() => setOllamaModel(m.id)}>
                    {m.id}
                  </button>{" "}
                  – {m.label.split(" – ")[1]}
                </li>
              ))}
            </ul>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Adres Ollamy</span>
            <input value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <span className="mt-1 block text-xs text-slate-500">Domyślnie http://127.0.0.1:11434 – zmieniaj tylko, jeśli Ollama działa na innym komputerze.</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => refresh()} disabled={checking}>
            {checking ? "Sprawdzanie…" : "Sprawdź połączenie"}
          </Button>
          {status?.reachable && !status.hasModel && !pulling && (
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                await startPullAction(ollamaUrl, ollamaModel);
                setStatus((s) => (s ? { ...s, pull: { model: ollamaModel, status: "rozpoczynanie…", completed: 0, total: 0, done: false } } : s));
              }}
            >
              Pobierz model {ollamaModel}
            </Button>
          )}
          {status?.reachable && status.hasModel && <Badge tone="green">model {ollamaModel} jest pobrany</Badge>}
          {status?.reachable && status.hasModel && (
            <Button
              type="button"
              onClick={async () => {
                setSpeed("Test trwa (do kilku minut przy pierwszym wczytaniu modelu)…");
                const r = await speedTestAction(ollamaUrl, ollamaModel);
                if (!r.ok) return setSpeed(`Błąd: ${r.error}`);
                const verdict =
                  r.estimatedMinutes <= 4
                    ? "Bardzo dobrze – ten komputer poradzi sobie także z większym modelem (np. gemma3:12b)."
                    : r.estimatedMinutes <= 12
                      ? "Akceptowalnie – analizy działają w tle, możesz w tym czasie pracować."
                      : "Wolno – rozważ mniejszy model (np. qwen3:4b) albo analizę na komputerze z kartą graficzną.";
                setSpeed(
                  `Czytanie: ${r.promptRate} tokenów/s, pisanie: ${r.genRate} tokenów/s. Szacowany czas analizy jednego CV: ok. ${r.estimatedMinutes} min. ${verdict}`,
                );
              }}
            >
              Test szybkości
            </Button>
          )}
        </div>
        {pull && (
          <div className="text-sm">
            {pull.error ? (
              <span className="text-red-700">Pobieranie nie powiodło się: {pull.error}</span>
            ) : pull.done ? (
              <span className="text-emerald-700">✓ Model {pull.model} pobrany.</span>
            ) : (
              <div className="space-y-1">
                <div className="text-slate-600">
                  Pobieranie {pull.model}: {pull.status} {pct !== null && `– ${pct}%`} (jednorazowo, kilka GB)
                </div>
                <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct ?? 2}%` }} />
                </div>
              </div>
            )}
          </div>
        )}
        {speed && <p className="text-sm text-slate-700">{speed}</p>}
      </section>

      {/* ---------------- Claude ---------------- */}
      <section className={cx("space-y-4 rounded-lg border border-slate-200 p-4", provider !== "claude" && "opacity-70")}>
        <h3 className="font-semibold text-slate-800">Claude API (płatne – opcjonalnie)</h3>
        <p className="text-sm text-slate-500">
          Koszty obciążają konto Anthropic, do którego należy wpisany klucz. Klucz utworzysz na console.anthropic.com → API Keys; tam też
          ustawisz miesięczny limit wydatków. Klucz jest zapisywany tylko na tym komputerze (w folderze danych).
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Klucz API</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={initial.claudeKeySource === "env"}
              placeholder={
                initial.claudeKeySource === "env"
                  ? "ustawiony w pliku .env"
                  : initial.claudeKeyHint
                    ? `zapisany (${initial.claudeKeyHint}) – wpisz nowy, aby zmienić`
                    : "sk-ant-…"
              }
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {initial.claudeKeySource === "ustawienia" && (
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={removeKey} onChange={(e) => setRemoveKey(e.target.checked)} /> usuń zapisany klucz
              </label>
            )}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Model</span>
              <select value={claudeModel} onChange={(e) => setClaudeModel(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm">
                {claudeModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Wysiłek</span>
              <select
                value={claudeEffort}
                onChange={(e) => setClaudeEffort(e.target.value as Initial["claudeEffort"])}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="low">niski (najtaniej)</option>
                <option value="medium">średni</option>
                <option value="high">wysoki</option>
              </select>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={async () => {
              setClaudeTest(null);
              const r = await testClaudeAction(apiKey || undefined, claudeModel);
              setClaudeTest(r.error ? { text: r.error, error: true } : { text: r.message ?? "OK", error: false });
            }}
          >
            Sprawdź klucz (bezpłatnie)
          </Button>
          {claudeTest && <span className={claudeTest.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{claudeTest.text}</span>}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" onClick={save} disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz ustawienia AI"}
        </Button>
        {msg && <span className={msg.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{msg.text}</span>}
      </div>
    </div>
  );
}
