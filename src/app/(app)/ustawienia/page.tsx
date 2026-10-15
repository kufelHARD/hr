import { loadCompanyContext, loadScoringConfig, loadTechMap } from "@/lib/settings";
import { env } from "@/lib/env";
import { CLAUDE_MODELS, OLLAMA_MODEL_SUGGESTIONS, getAiSettings } from "@/lib/app-settings";
import { queueSnapshot } from "@/lib/jobs/queue";
import { modelInstalled, ollamaStatus, pullStatus } from "@/lib/ai/ollama";
import { costSummary } from "@/lib/services/costs";
import { formatPln, formatUsd, USD_PLN } from "@/lib/ai/pricing";
import { POTENTIAL_LABELS, POTENTIAL_COMPONENTS, STATUS_LABELS, REQUIREMENT_STATUSES } from "@/lib/scoring";
import { Alert, Card } from "@/components/ui";
import { CompanyContextForm, TechMapForm } from "./settings-forms";
import { AiSettingsForm } from "./ai-settings-form";
import { BackupButton } from "./backup-button";

export default async function SettingsPage() {
  const [company, techMap, costs] = await Promise.all([loadCompanyContext(), loadTechMap(), costSummary()]);
  let scoring = null;
  let scoringError: string | null = null;
  try {
    scoring = await loadScoringConfig();
  } catch (e) {
    scoringError = (e as Error).message;
  }
  const ai = getAiSettings();
  const st = await ollamaStatus(ai.ollama.baseUrl);
  const initialStatus = { ...st, hasModel: modelInstalled(st.models, ai.ollama.model), pull: pullStatus() };
  const q = queueSnapshot();
  const key = ai.claude.apiKey;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ustawienia</h1>

      <Card title="Silnik AI">
        <AiSettingsForm
          initial={{
            provider: ai.provider,
            ollamaUrl: ai.ollama.baseUrl,
            ollamaModel: ai.ollama.model,
            claudeModel: ai.claude.model,
            claudeEffort: ai.claude.effort,
            claudeKeySource: ai.claude.apiKeySource,
            claudeKeyHint: key ? `…${key.slice(-4)}` : null,
          }}
          initialStatus={initialStatus}
          claudeModels={CLAUDE_MODELS}
          ollamaSuggestions={OLLAMA_MODEL_SUGGESTIONS}
        />
        <p className="mt-4 text-sm text-slate-500">
          Kolejka analiz: {q.running} w toku, {q.pending} oczekuje. OCR skanów: {env.ocrEnabled ? "włączony (polski + angielski)" : "wyłączony"}.
        </p>
      </Card>

      <Card title="Koszty AI">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Okres</th>
                <th className="py-2 text-right">Koszt</th>
                <th className="py-2 text-right">≈ zł</th>
                <th className="py-2 text-right">Analizy CV</th>
                <th className="py-2 text-right">Wywołania lokalne (0 zł)</th>
                <th className="py-2 text-right">Wywołania Claude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {costs.periods.map((p) => (
                <tr key={p.label}>
                  <td className="py-2 font-medium">{p.label}</td>
                  <td className="py-2 text-right tabular-nums">{formatUsd(p.costUsd)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPln(p.costUsd)}</td>
                  <td className="py-2 text-right tabular-nums">{p.cvAnalyses}</td>
                  <td className="py-2 text-right tabular-nums">{p.localCalls}</td>
                  <td className="py-2 text-right tabular-nums">{p.claudeCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {costs.claudeCvCount > 0 && (
            <>
              Średni koszt analizy jednego CV w Claude: <strong>{formatUsd(costs.avgClaudeCvUsd)}</strong> (≈ {formatPln(costs.avgClaudeCvUsd)}).{" "}
            </>
          )}
          Kwoty są szacunkiem na podstawie liczby tokenów i cennika (kurs {USD_PLN.toFixed(2).replace(".", ",")} zł/USD). Oficjalne rozliczenie i
          limit wydatków: console.anthropic.com → Usage / Limits. Model lokalny jest bezpłatny. Koszt każdej analizy widać też w historii analiz
          kandydata.
        </p>
      </Card>

      <Card title="Mapa technologii pokrewnych">
        <p className="mb-4 text-sm text-slate-500">
          Grupy technologii, których znajomość może zostać zaliczona jako „pokrewna” (np. AWS zamiast Azure). Mapa jest wskazówką dla AI –
          rozpoznaje ona też pokrewieństwa spoza listy.
        </p>
        <TechMapForm initial={techMap.grupy} />
      </Card>

      <Card title="Kontekst firmy">
        <p className="mb-4 text-sm text-slate-500">Opis dołączany do każdego zapytania do AI (m.in. ocena dopasowania do profilu firmy).</p>
        <CompanyContextForm initial={company} />
      </Card>

      <Card title="Kopia zapasowa">
        <p className="mb-3 text-sm text-slate-500">
          Tworzy plik ZIP z bazą danych, wszystkimi plikami CV i ofert oraz konfiguracją. Kopia zawiera dane osobowe – przechowuj ją w bezpiecznym
          miejscu.
        </p>
        <BackupButton />
      </Card>

      <Card title="Parametry oceny">
        {scoringError ? (
          <Alert tone="red">{scoringError}</Alert>
        ) : (
          scoring && (
            <div className="grid gap-6 text-sm md:grid-cols-3">
              <div>
                <div className="mb-1 font-medium">Wartości statusów (dopasowanie)</div>
                <ul className="space-y-0.5 text-slate-600">
                  {REQUIREMENT_STATUSES.map((s) => (
                    <li key={s}>
                      {STATUS_LABELS[s]}: <strong>{scoring.dopasowanie.wartosci_statusow[s]}</strong>
                    </li>
                  ))}
                  <li className="pt-1">
                    Mnożnik „wymagane”: <strong>×{scoring.dopasowanie.mnozniki_typow.wymagane}</strong>, „mile widziane”:{" "}
                    <strong>×{scoring.dopasowanie.mnozniki_typow.mile_widziane}</strong>
                  </li>
                </ul>
              </div>
              <div>
                <div className="mb-1 font-medium">Wagi składowych potencjału</div>
                <ul className="space-y-0.5 text-slate-600">
                  {POTENTIAL_COMPONENTS.map((k) => (
                    <li key={k}>
                      {POTENTIAL_LABELS[k]}: <strong>{scoring.potencjal.wagi_skladowych[k]}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1 font-medium">Retencja danych</div>
                <p className="text-slate-600">
                  {scoring.retencja.wlaczona
                    ? `Włączona: usuwanie po ${scoring.retencja.dni} dniach od ostatniego zgłoszenia${scoring.retencja.tylko_bez_zgody ? " (tylko kandydaci bez zgody)" : ""}.`
                    : "Wyłączona – dane przechowywane bezterminowo."}
                </p>
              </div>
            </div>
          )
        )}
        <p className="mt-4 text-sm text-slate-500">
          Parametry zmienia się w pliku <code>scoring.json</code> w folderze konfiguracji (opis w instrukcji). Nowe wartości obowiązują od następnej
          analizy.
        </p>
      </Card>
    </div>
  );
}
