import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AUTO_VERSION_NOTE, currentRequirementVersion, ensureOfferSlug } from "@/lib/services/offers";
import { STAGES, candidateDisplayName } from "@/lib/services/candidates";
import { getPublicUrl } from "@/lib/app-settings";
import { SOURCES, sourceLabel } from "@/lib/apply/sources";
import { CATEGORY_LABELS, RECOMMENDATION_LABELS, type RequirementCategory, type Recommendation } from "@/lib/ai/schemas";
import type { QuickMatchResult } from "@/lib/matching";
import { TYPE_LABELS, type RequirementType } from "@/lib/scoring";
import { firstSentence } from "@/lib/text";
import { ActionButton, AutoRefresh, CopyField, StageSelect } from "@/components/client";
import {
  AI_STATUS,
  APPLICATION_STATUS,
  Alert,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  OFFER_STATUS,
  RECOMMENDATION_TONE,
  STAGE_INFO,
  ScoreBar,
  buttonStyles,
  cx,
  formatDate,
} from "@/components/ui";
import { aiForStageAction, archiveOfferAction, deleteOfferAction, setPublicApplyAction, setStageAction } from "../../actions";
import { CvUploader } from "./cv-uploader";

const FILE_PENDING = ["oczekuje", "ekstrakcja", "analiza"];
const AI_PENDING = ["oczekuje", "analiza"];

export default async function OfferPage({ params, searchParams }: PageProps<"/oferty/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const sort = sp.sort === "potencjal" ? "potencjal" : sp.sort === "data" ? "data" : "dopasowanie";
  const stageFilter = typeof sp.etap === "string" && STAGES.includes(sp.etap as (typeof STAGES)[number]) ? sp.etap : null;

  const offer = await db.jobOffer.findUnique({
    where: { id },
    include: {
      applications: {
        include: {
          candidate: true,
          cvDocument: { select: { originalFileName: true, extractionMethod: true } },
          analyses: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { matchScore: true, potentialScore: true, summary: true, recommendation: true, requirementVersionId: true, unverifiedEvidence: true, injectionDetected: true },
          },
          quickMatches: { orderBy: { createdAt: "desc" }, take: 1, select: { score: true, resultJson: true, requirementVersionId: true } },
        },
      },
    },
  });
  if (!offer) notFound();
  if (offer.status === "szkic") redirect(`/oferty/${id}/wymagania`);

  const version = await currentRequirementVersion(id);
  const readOnly = offer.status === "zarchiwizowana";
  const slug = offer.slug ?? (readOnly ? null : await ensureOfferSlug(id));
  const h = await headers();
  const configuredUrl = getPublicUrl();
  const baseUrl = configuredUrl ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const rows = offer.applications.map((a) => {
    const analysis = a.analyses[0] ?? null;
    const quick = a.quickMatches[0] ?? null;
    const quickResult: QuickMatchResult | null = quick ? JSON.parse(quick.resultJson) : null;
    return { app: a, analysis, quick, quickResult, match: analysis?.matchScore ?? quick?.score ?? null };
  });
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, rows.filter((r) => r.app.stage === s).length]));
  const visible = rows
    .filter((r) => !stageFilter || r.app.stage === stageFilter)
    .sort((x, y) => {
      if (sort === "data") return y.app.createdAt.getTime() - x.app.createdAt.getTime();
      const xv = sort === "potencjal" ? (x.analysis?.potentialScore ?? -1) : (x.match ?? -1);
      const yv = sort === "potencjal" ? (y.analysis?.potentialScore ?? -1) : (y.match ?? -1);
      return yv - xv;
    });
  const anyPending = offer.applications.some((a) => FILE_PENDING.includes(a.status) || AI_PENDING.includes(a.aiStatus ?? ""));
  const stageOptions = STAGES.map((s) => ({ key: s, label: STAGE_INFO[s].label }));
  const link = (params: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { sort: sort === "dopasowanie" ? null : sort, etap: stageFilter, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/oferty/${id}${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <AutoRefresh active={anyPending} />
      <div>
        <Link href={readOnly ? "/?status=zarchiwizowana" : "/"} className="text-sm text-slate-500 hover:text-slate-800">
          ← Oferty
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{offer.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Badge tone={OFFER_STATUS[offer.status].tone}>{OFFER_STATUS[offer.status].label}</Badge>
              {offer.area && <span>{offer.area}</span>}
              {offer.level && <span>· {offer.level}</span>}
              <span>· dodana {formatDate(offer.createdAt)}</span>
              {version && (
                <span>
                  · wymagania w wersji {version.version}
                  {version.note === AUTO_VERSION_NOTE && " (odczytane automatycznie)"}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {offer.storedFilePath && (
              <a href={`/api/pliki/oferta/${offer.id}`} className={buttonStyles.secondary}>
                Pobierz oryginał
              </a>
            )}
            {!readOnly && <LinkButton href={`/oferty/${offer.id}/wymagania`}>Edytuj wymagania</LinkButton>}
            <ActionButton action={archiveOfferAction.bind(null, offer.id, !readOnly)}>{readOnly ? "Przywróć z archiwum" : "Archiwizuj"}</ActionButton>
            <ActionButton
              variant="danger"
              action={deleteOfferAction.bind(null, offer.id)}
              confirm={`Usunąć ofertę „${offer.title}”?\n\nZostaną usunięte także wszystkie zgłoszenia (${offer.applications.length}) i analizy. Kandydaci bez zgłoszeń w innych ofertach zostaną usunięci w całości (pliki CV, notatki). Tej operacji nie można cofnąć.`}
            >
              Usuń
            </ActionButton>
          </div>
        </div>
      </div>

      {readOnly && <Alert>Oferta jest zarchiwizowana – kandydaci i wyniki są dostępni tylko do odczytu, formularz „Aplikuj” nie przyjmuje zgłoszeń.</Alert>}
      {!readOnly && version?.note === AUTO_VERSION_NOTE && (
        <Alert tone="blue">
          Wymagania zostały odczytane automatycznie z pliku oferty.{" "}
          <Link href={`/oferty/${offer.id}/wymagania`} className="font-medium underline">
            Sprawdź i popraw wymagania
          </Link>{" "}
          – zapis przeliczy dopasowanie kandydatów.
        </Alert>
      )}

      {!readOnly && slug && (
        <Card
          title="Linki „Aplikuj” do ogłoszeń"
          actions={
            <ActionButton action={setPublicApplyAction.bind(null, offer.id, !offer.publicApply)} variant={offer.publicApply ? "secondary" : "primary"}>
              {offer.publicApply ? "Zamknij formularz" : "Otwórz formularz"}
            </ActionButton>
          }
        >
          {!offer.publicApply ? (
            <p className="text-sm text-slate-600">Formularz jest zamknięty – kandydaci zobaczą informację o zakończonej rekrutacji.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Wklej link w ogłoszeniu jako zewnętrzny adres aplikowania („aplikuj na stronie pracodawcy”). Każdy portal ma osobny link – system
                zapisze, skąd przyszedł kandydat. CV trafi tutaj automatycznie.{" "}
                <a href={`/aplikuj/${slug}`} target="_blank" rel="noopener" className="font-medium text-brand-700 underline">
                  Podgląd formularza
                </a>
              </p>
              {!configuredUrl && (
                <Alert>
                  Nie ustawiono adresu publicznego – linki wskazują na <code>{baseUrl}</code>. Kandydaci z internetu muszą mieć dostęp do tego
                  adresu: ustaw go w Ustawieniach → Formularz „Aplikuj” (np. https://kariera.summ-it.pl).
                </Alert>
              )}
              {SOURCES.filter((s) => !["polecenie"].includes(s.key)).map((s) => (
                <CopyField key={s.key} label={s.label} value={`${baseUrl}/aplikuj/${slug}?zrodlo=${s.key}`} />
              ))}
            </div>
          )}
        </Card>
      )}

      <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-5 py-3 font-semibold text-slate-800">
          <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
          Wymagania ({version?.requirements.length ?? 0})
          <span className="ml-2 text-sm font-normal text-slate-500">
            {version?.requirements.filter((r) => r.type === "wymagane").length ?? 0} wymaganych ·{" "}
            {version?.requirements.filter((r) => r.type === "mile_widziane").length ?? 0} mile widzianych
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {version?.requirements.map((r) => (
                <tr key={r.id}>
                  <td className="w-12 px-5 py-2 text-slate-400">{r.code}</td>
                  <td className="px-2 py-2">{r.text}</td>
                  <td className="px-2 py-2">
                    <Badge tone={r.type === "wymagane" ? "blue" : "slate"}>{TYPE_LABELS[r.type as RequirementType]}</Badge>
                  </td>
                  <td className="px-2 py-2 text-slate-500">{CATEGORY_LABELS[r.category as RequirementCategory]}</td>
                  <td className="px-5 py-2 text-right text-slate-500">waga {r.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {!readOnly && (
        <Card title="Dodaj CV ręcznie">
          <CvUploader offerId={offer.id} />
        </Card>
      )}

      <Card
        title={`Kandydaci (${offer.applications.length})`}
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Sortuj:</span>
            {(
              [
                ["dopasowanie", "Dopasowanie"],
                ["potencjal", "Potencjał (AI)"],
                ["data", "Najnowsze"],
              ] as const
            ).map(([key, label]) => (
              <Link
                key={key}
                href={link({ sort: key === "dopasowanie" ? null : key })}
                className={cx("rounded-md px-2.5 py-1", sort === key ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100")}
              >
                {label}
              </Link>
            ))}
          </div>
        }
      >
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-1 border-b border-slate-100 pb-3 text-sm">
          <Link href={link({ etap: null })} className={cx("rounded-full px-3 py-1", !stageFilter ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")}>
            Wszyscy ({rows.length})
          </Link>
          {STAGES.map((s) => (
            <Link
              key={s}
              href={link({ etap: s })}
              className={cx("rounded-full px-3 py-1", stageFilter === s ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")}
            >
              {STAGE_INFO[s].label} ({stageCounts[s]})
            </Link>
          ))}
          {!readOnly && stageFilter && stageCounts[stageFilter] > 0 && (
            <span className="ml-auto">
              <ActionButton
                variant="ghost"
                action={aiForStageAction.bind(null, offer.id, stageFilter)}
                confirm={`Uruchomić analizę AI dla kandydatów na etapie „${STAGE_INFO[stageFilter].label}” (${stageCounts[stageFilter]})? Model lokalny analizuje po kolei – na laptopie kilka minut na CV.`}
              >
                Analiza AI dla tego etapu
              </ActionButton>
            </span>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState title={rows.length ? "Brak kandydatów na tym etapie" : "Brak kandydatów"}>
            {!readOnly && !rows.length && "Udostępnij link „Aplikuj” w ogłoszeniach albo wgraj CV ręcznie."}
          </EmptyState>
        ) : (
          <ul className="-my-3 divide-y divide-slate-100">
            {visible.map(({ app, analysis, quickResult, quick, match }) => {
              const st = APPLICATION_STATUS[app.status] ?? { label: app.status, tone: "slate" as const };
              const ai = app.aiStatus ? AI_STATUS[app.aiStatus] : null;
              const outdated = version && ((analysis && analysis.requirementVersionId !== version.id) || (!analysis && quick && quick.requirementVersionId !== version.id));
              const missingRequired = quickResult?.items.filter((i) => i.status === "brak").length ?? 0;
              return (
                <li key={app.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <Link href={`/oferty/${id}/kandydaci/${app.id}`} className="min-w-[220px] flex-1 rounded-lg hover:bg-slate-50">
                      <div className="font-medium text-slate-900">{candidateDisplayName(app.candidate, app.cvDocument.originalFileName)}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge tone="slate">{sourceLabel(app.source)}</Badge>
                        {app.status !== "gotowe" && <Badge tone={st.tone}>{st.label}</Badge>}
                        {ai && <Badge tone={ai.tone}>{ai.label}</Badge>}
                        {analysis && <Badge tone={RECOMMENDATION_TONE[analysis.recommendation]}>{RECOMMENDATION_LABELS[analysis.recommendation as Recommendation]}</Badge>}
                        {app.cvDocument.extractionMethod === "ocr" && <Badge tone="violet">OCR</Badge>}
                        {outdated && <Badge tone="amber">starsza wersja wymagań</Badge>}
                        {analysis?.injectionDetected && <Badge tone="red">podejrzane instrukcje w CV</Badge>}
                        {app.candidate.consentFuture && <Badge tone="green">zgoda na przyszłe rekrutacje</Badge>}
                        <span className="text-xs text-slate-400">{formatDate(app.createdAt)}</span>
                      </div>
                      {analysis ? (
                        <p className="mt-2 text-sm text-slate-600">{firstSentence(analysis.summary)}</p>
                      ) : quickResult ? (
                        <p className="mt-2 text-sm text-slate-500">
                          {quickResult.experienceYears !== null && `Staż ok. ${quickResult.experienceYears} lat · `}
                          {missingRequired ? `brak ${missingRequired} z ${quickResult.items.length} wymagań` : "wszystkie wymagania znalezione lub pokrewne"}
                        </p>
                      ) : (
                        app.statusMessage && <p className="mt-2 text-sm text-red-700">{app.statusMessage}</p>
                      )}
                    </Link>
                    <div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span title={analysis ? "Dopasowanie wg analizy AI" : "Szybkie dopasowanie (bez AI)"}>Dopasowanie{analysis ? " (AI)" : ""}</span>
                      <ScoreBar score={match} />
                      <span>Potencjał (AI)</span>
                      <ScoreBar score={analysis?.potentialScore} />
                    </div>
                    <StageSelect value={app.stage} stages={stageOptions} action={setStageAction.bind(null, app.id)} disabled={readOnly} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
