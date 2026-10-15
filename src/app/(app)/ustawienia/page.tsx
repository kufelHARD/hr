import { loadCompanyContext, loadScoringConfig, loadTechMap } from "@/lib/settings";
import { env } from "@/lib/env";
import { queueSnapshot } from "@/lib/jobs/queue";
import { POTENTIAL_LABELS, POTENTIAL_COMPONENTS, STATUS_LABELS, REQUIREMENT_STATUSES } from "@/lib/scoring";
import { Alert, Card } from "@/components/ui";
import { CompanyContextForm, TechMapForm } from "./settings-forms";

export default async function SettingsPage() {
  const [company, techMap] = await Promise.all([loadCompanyContext(), loadTechMap()]);
  let scoring = null;
  let scoringError: string | null = null;
  try {
    scoring = await loadScoringConfig();
  } catch (e) {
    scoringError = (e as Error).message;
  }
  const q = queueSnapshot();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Ustawienia</h1>

      <Card title="Mapa technologii pokrewnych">
        <p className="mb-4 text-sm text-slate-500">
          Grupy technologii, których znajomość może zostać zaliczona jako „pokrewna” (np. AWS zamiast Azure). Mapa jest wskazówką dla AI –
          rozpoznaje ona też pokrewieństwa spoza listy. Plik: <code>config/related-technologies.json</code>.
        </p>
        <TechMapForm initial={techMap.grupy} />
      </Card>

      <Card title="Kontekst firmy">
        <p className="mb-4 text-sm text-slate-500">
          Opis dołączany do każdego zapytania do AI (m.in. ocena dopasowania do profilu firmy). Plik: <code>config/company-context.md</code>.
        </p>
        <CompanyContextForm initial={company} />
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
          Parametry zmienia się w pliku <code>config/scoring.json</code> (opis w README). Nowe wartości obowiązują od następnej analizy –
          zapisane analizy zachowują parametry, z którymi je policzono.
        </p>
      </Card>

      <Card title="Model AI">
        <ul className="space-y-1 text-sm text-slate-600">
          <li>
            Model: <strong>{env.model}</strong>, poziom wysiłku: <strong>{env.effort}</strong>
          </li>
          <li>Klucz API: {env.anthropicApiKey ? "ustawiony" : <strong className="text-red-700">brak – ustaw ANTHROPIC_API_KEY w .env</strong>}</li>
          <li>
            Kolejka analiz: {q.running} w toku, {q.pending} oczekuje (równolegle: {env.analysisConcurrency})
          </li>
          <li>OCR skanów: {env.ocrEnabled ? "włączony (polski + angielski)" : "wyłączony"}</li>
        </ul>
        <p className="mt-3 text-sm text-slate-500">
          Prompty AI można edytować w katalogu <code>prompts/</code>. Zmiany w modelu i kluczu – w pliku <code>.env</code> (wymaga restartu).
        </p>
      </Card>
    </div>
  );
}
