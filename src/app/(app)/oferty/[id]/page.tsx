import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentRequirementVersion } from "@/lib/services/offers";
import { candidateDisplayName } from "@/lib/services/candidates";
import { CATEGORY_LABELS, RECOMMENDATION_LABELS, type RequirementCategory, type Recommendation } from "@/lib/ai/schemas";
import { TYPE_LABELS, type RequirementType } from "@/lib/scoring";
import { firstSentence } from "@/lib/text";
import { ActionButton, AutoRefresh } from "@/components/client";
import {
  APPLICATION_STATUS,
  Alert,
  Badge,
  Card,
  EmptyState,
  LinkButton,
  OFFER_STATUS,
  RECOMMENDATION_TONE,
  ScoreBar,
  buttonStyles,
  cx,
  formatDate,
} from "@/components/ui";
import { archiveOfferAction, deleteOfferAction, reanalyzeAllAction } from "../../actions";
import { CvUploader } from "./cv-uploader";

const PENDING = ["oczekuje", "ekstrakcja", "analiza"];

export default async function OfferPage({ params, searchParams }: PageProps<"/oferty/[id]">) {
  const { id } = await params;
  const { sort: sortParam } = await searchParams;
  const sort = sortParam === "potencjal" ? "potencjal" : "dopasowanie";

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
            select: {
              matchScore: true,
              potentialScore: true,
              summary: true,
              recommendation: true,
              requirementVersionId: true,
              unverifiedEvidence: true,
              injectionDetected: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!offer) notFound();
  if (offer.status === "szkic") redirect(`/oferty/${id}/wymagania`);

  const version = await currentRequirementVersion(id);
  const readOnly = offer.status === "zarchiwizowana";

  const rows = offer.applications.map((a) => ({ app: a, analysis: a.analyses[0] ?? null }));
  rows.sort((x, y) => {
    const key = sort === "potencjal" ? "potentialScore" : "matchScore";
    const other = sort === "potencjal" ? "matchScore" : "potentialScore";
    const xv = x.analysis?.[key] ?? -1;
    const yv = y.analysis?.[key] ?? -1;
    if (yv !== xv) return yv - xv;
    return (y.analysis?.[other] ?? -1) - (x.analysis?.[other] ?? -1);
  });
  const anyPending = offer.applications.some((a) => PENDING.includes(a.status));

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
              {version && <span>· wymagania w wersji {version.version}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {offer.storedFilePath && (
              <a href={`/api/pliki/oferta/${offer.id}`} className={buttonStyles.secondary}>
                Pobierz oryginał
              </a>
            )}
            {!readOnly && <LinkButton href={`/oferty/${offer.id}/wymagania`}>Edytuj wymagania</LinkButton>}
            <ActionButton action={archiveOfferAction.bind(null, offer.id, !readOnly)}>
              {readOnly ? "Przywróć z archiwum" : "Archiwizuj"}
            </ActionButton>
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

      {readOnly && <Alert>Oferta jest zarchiwizowana – kandydaci i wyniki są dostępni tylko do odczytu.</Alert>}

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
        <Card title="Dodaj CV kandydatów">
          <CvUploader offerId={offer.id} />
        </Card>
      )}

      <Card
        title={`Kandydaci (${offer.applications.length})`}
        actions={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Sortuj:</span>
            {(["dopasowanie", "potencjal"] as const).map((s) => (
              <Link
                key={s}
                href={s === "dopasowanie" ? `/oferty/${id}` : `/oferty/${id}?sort=${s}`}
                className={cx("rounded-md px-2.5 py-1", sort === s ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100")}
              >
                {s === "dopasowanie" ? "Dopasowanie" : "Potencjał"}
              </Link>
            ))}
            {!readOnly && offer.applications.length > 0 && (
              <ActionButton
                variant="ghost"
                action={reanalyzeAllAction.bind(null, offer.id)}
                confirm="Przeanalizować ponownie wszystkich kandydatów tej oferty? Poprzednie analizy zostaną w historii. Każda analiza zużywa tokeny API."
              >
                ↻ Analizuj wszystkich ponownie
              </ActionButton>
            )}
          </div>
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="Brak kandydatów">{!readOnly && "Wgraj CV powyżej – analiza uruchomi się automatycznie."}</EmptyState>
        ) : (
          <ul className="-my-3 divide-y divide-slate-100">
            {rows.map(({ app, analysis }) => {
              const st = APPLICATION_STATUS[app.status] ?? { label: app.status, tone: "slate" as const };
              const outdated = analysis && version && analysis.requirementVersionId !== version.id;
              return (
                <li key={app.id} className="py-3">
                  <Link href={`/oferty/${id}/kandydaci/${app.id}`} className="-mx-2 block rounded-lg px-2 py-1 hover:bg-slate-50">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                      <div className="min-w-[200px] flex-1">
                        <div className="font-medium text-slate-900">
                          {candidateDisplayName(app.candidate, app.cvDocument.originalFileName)}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {app.status !== "gotowe" && <Badge tone={st.tone}>{st.label}</Badge>}
                          {analysis && (
                            <Badge tone={RECOMMENDATION_TONE[analysis.recommendation]}>
                              {RECOMMENDATION_LABELS[analysis.recommendation as Recommendation]}
                            </Badge>
                          )}
                          {app.cvDocument.extractionMethod === "ocr" && <Badge tone="violet">OCR</Badge>}
                          {outdated && <Badge tone="amber">starsza wersja wymagań</Badge>}
                          {analysis && analysis.unverifiedEvidence > 0 && (
                            <Badge tone="amber" title="Część cytatów-dowodów nie została odnaleziona w tekście CV">
                              {analysis.unverifiedEvidence} niezweryfikowane dowody
                            </Badge>
                          )}
                          {analysis?.injectionDetected && <Badge tone="red">podejrzane instrukcje w CV</Badge>}
                          {app.candidate.consentFuture && <Badge tone="green">zgoda na przyszłe rekrutacje</Badge>}
                        </div>
                      </div>
                      <div className="grid grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>Dopasowanie</span>
                        <ScoreBar score={analysis?.matchScore} />
                        <span>Potencjał</span>
                        <ScoreBar score={analysis?.potentialScore} />
                      </div>
                    </div>
                    {analysis && <p className="mt-2 text-sm text-slate-600">{firstSentence(analysis.summary)}</p>}
                    {!analysis && app.statusMessage && <p className="mt-2 text-sm text-red-700">{app.statusMessage}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
