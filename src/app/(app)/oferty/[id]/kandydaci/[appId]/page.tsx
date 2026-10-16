import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { STAGES, candidateDisplayName } from "@/lib/services/candidates";
import { sourceLabel } from "@/lib/apply/sources";
import { getAiSettings } from "@/lib/app-settings";
import type { QuickMatchResult } from "@/lib/matching";
import { RECOMMENDATION_LABELS, CATEGORY_LABELS, type StoredAnalysis, type RequirementCategory, type Recommendation, type EvidenceCheck } from "@/lib/ai/schemas";
import { POTENTIAL_COMPONENTS, POTENTIAL_LABELS, STATUS_LABELS, TYPE_LABELS, type RequirementType } from "@/lib/scoring";
import type { ScoringConfig } from "@/lib/settings";
import { ActionButton, AutoRefresh, StageSelect } from "@/components/client";
import { formatPln } from "@/lib/ai/pricing";
import {
  AI_STATUS,
  APPLICATION_STATUS,
  AiDisclaimer,
  STAGE_INFO,
  Alert,
  Badge,
  Card,
  REQUIREMENT_STATUS_TONE,
  RECOMMENDATION_TONE,
  ScoreBar,
  ScoreGauge,
  buttonStyles,
  cx,
  formatDate,
} from "@/components/ui";
import { aiAnalysisAction, deleteCandidateAction, removeApplicationAction, reprocessAction, setStageAction } from "../../../../actions";
import { AssignForm, ConsentToggle, NotesForm, RenameForm } from "./candidate-forms";

const PENDING = ["oczekuje", "ekstrakcja", "analiza"];
const AI_PENDING = ["oczekuje", "analiza"];

const QUICK_NOTE: Record<string, string> = {
  pelne: "Znaleziono",
  pokrewne: "Pokrewne",
  czesciowe: "Częściowe",
  brak: "Brak",
  do_oceny: "Do oceny",
};

const EVIDENCE_INFO: Record<EvidenceCheck, { icon: string; title: string; className: string } | null> = {
  zweryfikowany: { icon: "✓", title: "Cytat odnaleziony w tekście CV", className: "text-emerald-600" },
  niezweryfikowany: { icon: "?", title: "Nie odnaleziono tego cytatu w tekście CV – sprawdź w oryginale", className: "text-amber-600" },
  brak_cytatu: { icon: "?", title: "AI nie podało cytatu z CV – sprawdź w oryginale", className: "text-amber-600" },
  nie_dotyczy: null,
};

export default async function CandidatePage({ params, searchParams }: PageProps<"/oferty/[id]/kandydaci/[appId]">) {
  const { id, appId } = await params;
  const { analiza: analysisParam } = await searchParams;

  const app = await db.application.findUnique({
    where: { id: appId },
    include: {
      offer: true,
      cvDocument: true,
      candidate: {
        include: { applications: { include: { offer: { select: { id: true, title: true, status: true } } } } },
      },
      analyses: {
        orderBy: { createdAt: "desc" },
        include: { requirementVersion: { include: { requirements: { orderBy: { position: "asc" } } } } },
      },
      quickMatches: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { requirementVersion: { include: { requirements: { orderBy: { position: "asc" } } } } },
      },
      stageEvents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!app || app.offerId !== id) notFound();

  const readOnly = app.offer.status !== "aktywna";
  const analysis = app.analyses.find((a) => a.id === analysisParam) ?? app.analyses[0] ?? null;
  const isLatest = analysis?.id === app.analyses[0]?.id;
  const stored: StoredAnalysis | null = analysis ? JSON.parse(analysis.resultJson) : null;
  const scoring: ScoringConfig | null = analysis ? JSON.parse(analysis.scoringSnapshot) : null;
  const out = stored?.output;
  const latestVersion = await db.requirementVersion.findFirst({ where: { offerId: id }, orderBy: { version: "desc" } });
  const outdated = analysis && latestVersion && analysis.requirementVersionId !== latestVersion.id;

  const filePending = PENDING.includes(app.status);
  const aiPending = AI_PENDING.includes(app.aiStatus ?? "");
  const pending = filePending || aiPending;
  const quick = app.quickMatches[0] ?? null;
  const quickResult: QuickMatchResult | null = quick ? JSON.parse(quick.resultJson) : null;
  const quickReqs = new Map(quick?.requirementVersion.requirements.map((r) => [r.code, r]) ?? []);
  const aiProvider = getAiSettings().provider;
  const st = APPLICATION_STATUS[app.status];
  const warnings: string[] = app.cvDocument.extractionWarnings ? JSON.parse(app.cvDocument.extractionWarnings) : [];
  const name = candidateDisplayName(app.candidate, app.cvDocument.originalFileName);
  const isPdf = app.cvDocument.mimeType === "application/pdf";

  const assignedOfferIds = new Set(app.candidate.applications.map((a) => a.offerId));
  const otherActiveOffers = await db.jobOffer.findMany({
    where: { status: "aktywna", id: { notIn: [...assignedOfferIds] } },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });
  const otherApplications = app.candidate.applications.filter((a) => a.id !== app.id);

  const reqs = analysis?.requirementVersion.requirements ?? [];
  const assessmentByCode = new Map(out?.wymagania.map((w) => [w.id_wymagania, w]) ?? []);
  const related = reqs
    .map((r) => ({ r, w: assessmentByCode.get(r.code) }))
    .filter((x) => x.w?.status === "pokrewne");

  return (
    <div className="space-y-6">
      <AutoRefresh active={pending} />

      <div>
        <Link href={`/oferty/${id}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← {app.offer.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
              {name}
              {app.candidate.nameSource === "cv" && (
                <Badge tone="slate" title="Imię i nazwisko odczytane automatycznie z CV – jeśli jest błędne, popraw je przyciskiem obok.">
                  odczytane z CV
                </Badge>
              )}
              {!readOnly && <RenameForm candidateId={app.candidateId} initial={app.candidate.fullName ?? ""} />}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {out?.kandydat.obecne_stanowisko && <span>{out.kandydat.obecne_stanowisko}</span>}
              {out?.kandydat.lata_doswiadczenia != null && <span>· ok. {out.kandydat.lata_doswiadczenia} lat doświadczenia</span>}
              <span>· CV: {app.cvDocument.originalFileName}</span>
              <span>· wgrane {formatDate(app.createdAt)}</span>
              {app.cvDocument.extractionMethod === "ocr" && <Badge tone="violet">tekst z OCR</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isPdf && (
              <a href={`/api/pliki/cv/${app.cvDocumentId}`} target="_blank" rel="noopener" className={buttonStyles.secondary}>
                Podgląd CV
              </a>
            )}
            <a href={`/api/pliki/cv/${app.cvDocumentId}?pobierz=1`} className={buttonStyles.secondary}>
              Pobierz CV
            </a>
            {!readOnly && !filePending && app.status !== "gotowe" && (
              <ActionButton action={reprocessAction.bind(null, app.id)}>↻ Odczytaj plik ponownie</ActionButton>
            )}
            {!readOnly && !pending && app.status === "gotowe" && (
              <ActionButton
                variant={analysis ? "secondary" : "primary"}
                action={aiAnalysisAction.bind(null, app.id)}
                confirm={
                  aiProvider === "ollama"
                    ? "Uruchomić analizę AI na modelu lokalnym? Na komputerze bez karty graficznej może potrwać kilka–kilkanaście minut (w tle)."
                    : "Uruchomić analizę AI (Claude – płatne, zwykle 1–2 min)?"
                }
              >
                {analysis ? "↻ Ponów analizę AI" : "✨ Analiza AI"}
              </ActionButton>
            )}
          </div>
        </div>
      </div>

      {readOnly && <Alert>Oferta jest zarchiwizowana – widok tylko do odczytu.</Alert>}
      {st && app.status !== "gotowe" && (
        <Alert tone={app.status === "blad" || app.status === "nieczytelne" ? "red" : "blue"}>
          <strong>{st.label}</strong>
          {app.statusMessage && <> – {app.statusMessage}</>}
          {pending && <span className="ml-1">Strona odświeży się automatycznie.</span>}
        </Alert>
      )}
      {app.status === "gotowe" && app.statusMessage && <Alert>{app.statusMessage}</Alert>}
      {app.aiStatus && app.aiStatus !== "gotowe" && (
        <Alert tone={app.aiStatus === "blad" ? "red" : "blue"}>
          <strong>{AI_STATUS[app.aiStatus]?.label ?? app.aiStatus}</strong>
          {app.aiStatusMessage && <> – {app.aiStatusMessage}</>}
          {aiPending && <span className="ml-1">Możesz w tym czasie pracować – strona odświeży się sama.</span>}
        </Alert>
      )}

      <AiDisclaimer />

      {quickResult && (
        <details className="group rounded-xl border border-slate-200 bg-white shadow-sm" open={!analysis}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
            <span className="font-semibold text-slate-800">
              <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>Szybkie dopasowanie (bez AI)
            </span>
            <ScoreBar score={quickResult.score} />
            {quickResult.experienceYears !== null && <span className="text-sm text-slate-500">staż w CV ok. {quickResult.experienceYears} lat</span>}
          </summary>
          <div className="border-t border-slate-100 p-5">
            <p className="mb-3 text-sm text-slate-500">
              Automatyczne porównanie słów kluczowych, technologii pokrewnych, certyfikatów i języków – natychmiastowe, ale mniej dokładne niż
              analiza AI. Staż liczony z dat w CV (łącznie, nie dla konkretnej technologii). Pozycje „do oceny” nie wpływają na wynik.
            </p>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <tbody className="divide-y divide-slate-100 align-top">
                  {quickResult.items.map((i) => {
                    const r = quickReqs.get(i.code);
                    return (
                      <tr key={i.code}>
                        <td className="w-2/5 px-5 py-2">
                          <div className="text-slate-800">{r?.text ?? i.code}</div>
                          {r && <div className="text-xs text-slate-400">{TYPE_LABELS[r.type as RequirementType]} · waga {r.weight}</div>}
                        </td>
                        <td className="px-2 py-2">
                          <Badge tone={i.status === "do_oceny" ? "slate" : REQUIREMENT_STATUS_TONE[i.status]}>{QUICK_NOTE[i.status]}</Badge>
                        </td>
                        <td className="px-5 py-2 text-slate-600">
                          {i.note}
                          {i.evidence && <div className="mt-1 border-l-2 border-slate-200 pl-2 text-xs text-slate-500">„{i.evidence}”</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}

      {analysis && out && stored ? (
        <>
          {!isLatest && (
            <Alert>
              Wyświetlasz archiwalną analizę z {formatDate(analysis.createdAt, true)}.{" "}
              <Link href={`/oferty/${id}/kandydaci/${appId}`} className="font-medium underline">
                Pokaż najnowszą
              </Link>
            </Alert>
          )}
          {outdated && isLatest && (
            <Alert>
              Ta analiza dotyczy wersji {analysis.requirementVersion.version} wymagań, a aktualna to wersja {latestVersion!.version}.
              {!readOnly && " Użyj „Analizuj ponownie”, aby ocenić kandydata według aktualnych wymagań."}
            </Alert>
          )}
          {out.podejrzane_instrukcje.wykryto && (
            <Alert tone="red">
              <strong>CV zawiera treść, która może próbować wpłynąć na ocenę automatyczną.</strong>{" "}
              {out.podejrzane_instrukcje.opis} Instrukcje zostały zignorowane przez AI – zweryfikuj CV ręcznie.
            </Alert>
          )}

          <Card>
            <div className="flex flex-wrap items-start gap-3">
              <Badge tone={RECOMMENDATION_TONE[out.rekomendacja]}>{RECOMMENDATION_LABELS[out.rekomendacja as Recommendation]}</Badge>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-800">{out.opis_kandydata}</p>
            <div className="mt-5 flex flex-wrap gap-x-12 gap-y-4">
              <ScoreGauge label="Dopasowanie" score={analysis.matchScore} hint="Pokrycie wymagań oferty (liczone z ocen wymagań i wag)" />
              <ScoreGauge label="Potencjał" score={analysis.potentialScore} hint="Bliskość profilu i tempo wdrożenia w brakujące obszary" />
            </div>
          </Card>

          <Card title="Wymagania">
            {analysis.unverifiedEvidence > 0 && (
              <div className="mb-4">
                <Alert>
                  {analysis.unverifiedEvidence} {analysis.unverifiedEvidence === 1 ? "dowód nie został" : "dowody nie zostały"} odnalezione dosłownie w
                  tekście CV (oznaczone „?”). Może to wynikać z parafrazy lub błędów odczytu – sprawdź w oryginale.
                </Alert>
              </div>
            )}
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2">Wymaganie</th>
                    <th className="px-2 py-2">Typ</th>
                    <th className="px-2 py-2 text-center">Waga</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Dowód z CV</th>
                    <th className="px-5 py-2">Uzasadnienie</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {reqs.map((r) => {
                    const w = assessmentByCode.get(r.code);
                    const ev = EVIDENCE_INFO[stored.evidence[r.code] ?? "nie_dotyczy"];
                    return (
                      <tr key={r.id}>
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-800">{r.text}</div>
                          <div className="text-xs text-slate-400">
                            {r.code} · {CATEGORY_LABELS[r.category as RequirementCategory]}
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <Badge tone={r.type === "wymagane" ? "blue" : "slate"}>{TYPE_LABELS[r.type as RequirementType]}</Badge>
                        </td>
                        <td className="px-2 py-3 text-center tabular-nums">{r.weight}</td>
                        <td className="px-2 py-3">
                          {w ? (
                            <Badge tone={REQUIREMENT_STATUS_TONE[w.status]}>{STATUS_LABELS[w.status]}</Badge>
                          ) : (
                            <Badge tone="red" title="AI nie oceniło tego wymagania">Brak oceny</Badge>
                          )}
                          {w?.technologia_pokrewna && <div className="mt-1 text-xs text-sky-700">{w.technologia_pokrewna}</div>}
                        </td>
                        <td className="max-w-xs px-2 py-3">
                          {w?.dowod_cytat && (
                            <blockquote className="border-l-2 border-slate-200 pl-2 text-slate-700">
                              „{w.dowod_cytat}”
                              {ev && (
                                <span title={ev.title} className={cx("ml-1 font-bold", ev.className)}>
                                  {ev.icon}
                                </span>
                              )}
                            </blockquote>
                          )}
                          {w && <div className={cx("text-xs text-slate-500", w.dowod_cytat && "mt-1")}>{w.dowod_opis}</div>}
                          {w && !w.dowod_cytat && ev && (
                            <span title={ev.title} className={cx("text-xs font-bold", ev.className)}>
                              {ev.icon} brak cytatu
                            </span>
                          )}
                        </td>
                        <td className="max-w-sm px-5 py-3 text-slate-600">{w?.uzasadnienie}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Potencjał – składowe">
              <ul className="space-y-4">
                {POTENTIAL_COMPONENTS.map((key) => {
                  const c = out.potencjal[key];
                  const weight = scoring?.potencjal.wagi_skladowych[key];
                  return (
                    <li key={key}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800">
                          {POTENTIAL_LABELS[key]}
                          {weight !== undefined && <span className="ml-2 text-xs font-normal text-slate-400">waga {weight}</span>}
                        </span>
                        <ScoreBar score={c.ocena} />
                      </div>
                      {"szacunek" in c && <div className="mt-1 text-sm font-medium text-slate-700">Szacunek: {c.szacunek}</div>}
                      <p className="mt-1 text-sm text-slate-600">{c.uzasadnienie}</p>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <div className="space-y-6">
              <Card title="Mocne strony">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {out.mocne_strony.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Card>
              <Card title="Słabe strony / luki">
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {out.slabe_strony.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </Card>
              <Card title="Technologie pokrewne zaliczone częściowo">
                {related.length === 0 ? (
                  <p className="text-sm text-slate-500">Brak – żadne wymaganie nie zostało zaliczone jako „pokrewne”.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {related.map(({ r, w }) => (
                      <li key={r.id}>
                        <span className="text-slate-500">{r.text}:</span>{" "}
                        <span className="font-medium text-sky-800">{w?.technologia_pokrewna ?? "pokrewne"}</span>
                        {scoring && (
                          <span className="text-xs text-slate-400">
                            {" "}
                            (zaliczone w {Math.round(scoring.dopasowanie.wartosci_statusow.pokrewne * 100)}%)
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          <Card title="Sugerowane pytania na rozmowę">
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              {out.pytania_na_rozmowe.map((q, i) => (
                <li key={i}>
                  <div className="font-medium text-slate-800">{q.pytanie}</div>
                  <div className="text-slate-500">Cel: {q.cel}</div>
                </li>
              ))}
            </ol>
          </Card>
        </>
      ) : (
        !pending &&
        app.status === "gotowe" && (
          <Alert tone="blue">
            Ten kandydat nie ma jeszcze analizy AI (opis, potencjał, pytania na rozmowę). Uruchom ją przyciskiem „✨ Analiza AI” u góry – zwykle
            warto robić to dla kandydatów wybranych do selekcji.
          </Alert>
        )
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card title="Notatki rekrutera">
          <NotesForm applicationId={app.id} initial={app.notes} readOnly={readOnly} />
        </Card>
        <div className="space-y-6">
          <Card title="Kandydat">
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-16 text-slate-500">Etap</span>
                  <StageSelect
                    value={app.stage}
                    stages={STAGES.map((s) => ({ key: s, label: STAGE_INFO[s].label }))}
                    action={setStageAction.bind(null, app.id)}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <span className="inline-block w-16 text-slate-500">Źródło</span> {sourceLabel(app.source)}
                </div>
                {app.candidate.email && (
                  <div>
                    <span className="inline-block w-16 text-slate-500">E-mail</span>{" "}
                    <a href={`mailto:${app.candidate.email}`} className="text-brand-700 hover:underline">
                      {app.candidate.email}
                    </a>
                  </div>
                )}
                {app.candidate.phone && (
                  <div>
                    <span className="inline-block w-16 text-slate-500">Telefon</span>{" "}
                    <a href={`tel:${app.candidate.phone}`} className="text-brand-700 hover:underline">
                      {app.candidate.phone}
                    </a>
                  </div>
                )}
                {app.consentAt && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-slate-600">Zgoda na przetwarzanie danych: {formatDate(app.consentAt, true)}</summary>
                    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-xs text-slate-600">{app.consentText}</pre>
                  </details>
                )}
                {app.stageEvents.length > 0 && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-slate-600">Historia etapów ({app.stageEvents.length})</summary>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {app.stageEvents.map((e) => (
                        <li key={e.id}>
                          {formatDate(e.createdAt, true)}: {STAGE_INFO[e.fromStage ?? ""]?.label ?? "–"} → {STAGE_INFO[e.toStage]?.label ?? e.toStage}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <ConsentToggle
                candidateId={app.candidateId}
                initial={app.candidate.consentFuture}
                consentAt={app.candidate.consentAt ? formatDate(app.candidate.consentAt) : null}
              />
              {otherApplications.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-700">Inne oferty kandydata</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {otherApplications.map((a) => (
                      <li key={a.id}>
                        <Link href={`/oferty/${a.offerId}/kandydaci/${a.id}`} className="text-brand-700 hover:underline">
                          {a.offer.title}
                        </Link>
                        {a.offer.status === "zarchiwizowana" && <span className="text-slate-400"> (archiwum)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <div className="mb-1 text-sm font-medium text-slate-700">Przypisz do innej oferty</div>
                <AssignForm candidateId={app.candidateId} offers={otherActiveOffers} />
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                {!readOnly && (
                  <ActionButton
                    variant="danger"
                    action={removeApplicationAction.bind(null, app.id, id)}
                    confirm={
                      otherApplications.length > 0
                        ? "Usunąć kandydata z tej oferty? Analizy i notatki dla tej oferty zostaną usunięte. Zgłoszenia w innych ofertach pozostaną."
                        : "Usunąć kandydata? Kandydat nie ma innych zgłoszeń, więc zostaną usunięte WSZYSTKIE jego dane: plik CV, tekst, analizy i notatki."
                    }
                  >
                    Usuń z oferty
                  </ActionButton>
                )}
                <ActionButton
                  variant="danger"
                  action={deleteCandidateAction.bind(null, app.candidateId, `/oferty/${id}`)}
                  confirm="Usunąć WSZYSTKIE dane kandydata (RODO)? Zostaną usunięte pliki CV, wyekstrahowany tekst, wszystkie analizy i notatki we wszystkich ofertach. Tej operacji nie można cofnąć."
                >
                  Usuń wszystkie dane
                </ActionButton>
              </div>
            </div>
          </Card>

          {app.analyses.length > 0 && (
            <Card title={`Historia analiz (${app.analyses.length})`}>
              <ul className="space-y-2 text-sm">
                {app.analyses.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/oferty/${id}/kandydaci/${appId}?analiza=${a.id}`}
                      className={cx(
                        "block rounded-md px-2 py-1.5",
                        a.id === analysis?.id ? "bg-brand-50 ring-1 ring-brand-100" : "hover:bg-slate-50",
                      )}
                    >
                      <div className="flex justify-between gap-2">
                        <span>{formatDate(a.createdAt, true)}</span>
                        <span className="tabular-nums text-slate-600">
                          {a.matchScore === null ? "–" : Math.round(a.matchScore)}% / {Math.round(a.potentialScore)}%
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        wymagania v{a.requirementVersion.version} · {a.model}
                        {a.durationMs ? ` · ${a.durationMs >= 120000 ? `${Math.round(a.durationMs / 60000)} min` : `${Math.round(a.durationMs / 1000)} s`}` : ""}
                        {" · koszt: "}
                        {a.provider === "ollama" ? "0 zł (lokalnie)" : a.costUsd != null ? `≈ ${formatPln(a.costUsd)}` : "–"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-5 py-3 font-semibold text-slate-800">Tekst odczytany z CV</summary>
        <div className="border-t border-slate-100 p-5">
          {warnings.length > 0 && (
            <ul className="mb-3 list-disc pl-5 text-sm text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600">
            {app.cvDocument.extractedText || "(brak tekstu)"}
          </pre>
        </div>
      </details>
    </div>
  );
}
