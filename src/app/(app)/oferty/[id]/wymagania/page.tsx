import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentRequirementVersion } from "@/lib/services/offers";
import { offerExtractionSchema, type RequirementCategory } from "@/lib/ai/schemas";
import { ActionButton } from "@/components/client";
import { Alert, Card } from "@/components/ui";
import { regenerateDraftAction } from "../../../actions";
import { RequirementsEditor, type EditableRequirement } from "./requirements-editor";

export default async function RequirementsPage({ params }: PageProps<"/oferty/[id]/wymagania">) {
  const { id } = await params;
  const offer = await db.jobOffer.findUnique({ where: { id }, include: { _count: { select: { applications: true } } } });
  if (!offer) notFound();
  if (offer.status === "zarchiwizowana") {
    return <Alert>Oferta jest zarchiwizowana – wymagania są tylko do odczytu.</Alert>;
  }

  const isDraft = offer.status === "szkic";
  let initial: EditableRequirement[] = [];
  let fromAi = false;

  if (offer.draftJson) {
    const draft = offerExtractionSchema.safeParse(JSON.parse(offer.draftJson));
    if (draft.success) {
      fromAi = true;
      initial = draft.data.wymagania.map((w, i) => ({
        key: `ai${i}`,
        text: w.tresc,
        type: w.typ,
        category: w.kategoria,
        weight: w.waga,
        inferred: w.wywnioskowane,
        source: w.zrodlo,
      }));
    }
  } else {
    const version = await currentRequirementVersion(id);
    initial =
      version?.requirements.map((r) => ({
        key: r.id,
        text: r.text,
        type: r.type as EditableRequirement["type"],
        category: r.category as RequirementCategory,
        weight: r.weight,
        inferred: r.inferred,
        source: r.source,
      })) ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={isDraft ? "/?status=szkic" : `/oferty/${id}`} className="text-sm text-slate-500 hover:text-slate-800">
          ← {isDraft ? "Szkice ofert" : offer.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{isDraft ? "Krok 2 z 2: sprawdź wymagania" : "Edycja wymagań"}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isDraft
            ? "AI wyodrębniło wymagania z oferty. Popraw typ, kategorię i wagę, dodaj lub usuń pozycje, a następnie zapisz."
            : "Zapis tworzy nową wersję wymagań. Wcześniejsze analizy kandydatów zostają w historii z informacją o wersji."}
        </p>
      </div>

      {offer.draftError && (
        <Alert tone="red">
          <p>Nie udało się automatycznie wyodrębnić wymagań: {offer.draftError}</p>
          <p className="mt-1">Możesz spróbować ponownie albo dodać wymagania ręcznie.</p>
        </Alert>
      )}
      {(offer.draftError || fromAi) && (
        <div>
          <ActionButton
            action={regenerateDraftAction.bind(null, id)}
            confirm={fromAi ? "Wygenerować wymagania ponownie? Bieżące zmiany zostaną utracone." : undefined}
            pendingLabel="AI analizuje ofertę…"
          >
            ↻ Wyodrębnij wymagania ponownie (AI)
          </ActionButton>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card>
          <RequirementsEditor
            key={offer.draftJson ?? "saved"}
            offerId={id}
            initial={initial}
            details={{ title: offer.title, area: offer.area ?? "", level: offer.level ?? "" }}
            isDraft={isDraft}
            candidateCount={offer._count.applications}
          />
        </Card>
        <Card title="Treść oferty" className="xl:sticky xl:top-4 xl:self-start">
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-600">{offer.rawText}</pre>
        </Card>
      </div>
    </div>
  );
}
