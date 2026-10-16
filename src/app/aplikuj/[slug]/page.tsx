import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { loadClause, loadFormConfig } from "@/lib/apply/form-config";
import { Markdown } from "@/components/markdown";
import { ApplyForm } from "./apply-form";

// Publiczna strona oferty z formularzem „Aplikuj” – link wklejany w ogłoszeniach (pracuj.pl, justjoin.it…).

export async function generateMetadata({ params }: PageProps<"/aplikuj/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const offer = await db.jobOffer.findUnique({ where: { slug }, select: { title: true } });
  return { title: offer ? `${offer.title.replace(/^\[.*?\]\s*/, "")} – aplikuj` : "Aplikuj", robots: { index: false, follow: false } };
}

export default async function ApplyPage({ params, searchParams }: PageProps<"/aplikuj/[slug]">) {
  const { slug } = await params;
  const { zrodlo } = await searchParams;
  const offer = await db.jobOffer.findUnique({ where: { slug } });
  if (!offer) notFound();
  const [cfg, clause] = await Promise.all([loadFormConfig(), loadClause()]);
  const open = offer.status === "aktywna" && offer.publicApply;
  const title = offer.title.replace(/^\[.*?\]\s*/, "");

  return (
    <main className="min-h-full bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <p className="text-sm font-medium text-brand-700">{cfg.nazwa_firmy} · Kariera</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{[offer.area, offer.level, offer.location].filter(Boolean).join(" · ")}</p>
        </header>

        {!open ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
            Rekrutacja na to stanowisko jest zakończona. Dziękujemy za zainteresowanie!
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">Wyślij aplikację</h2>
              <ApplyForm
                slug={offer.slug!}
                source={typeof zrodlo === "string" ? zrodlo : null}
                consentText={cfg.zgoda_rekrutacja}
                futureConsentText={cfg.zgoda_przyszle}
                thankYou={cfg.podziekowanie}
                maxMb={cfg.maks_rozmiar_mb}
                clause={<Markdown text={clause} className="space-y-2 text-xs text-slate-600" />}
              />
            </section>
            <details className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <summary className="cursor-pointer px-6 py-4 font-semibold text-slate-800">Treść oferty</summary>
              <div className="border-t border-slate-100 px-6 py-4 text-sm leading-relaxed text-slate-700">
                <Markdown text={offer.rawText} />
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
