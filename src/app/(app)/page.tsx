import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, EmptyState, LinkButton, OFFER_STATUS, cx, formatDate } from "@/components/ui";

const TABS = [
  { key: "aktywna", label: "Aktywne" },
  { key: "szkic", label: "Szkice" },
  { key: "zarchiwizowana", label: "Archiwum" },
] as const;

export default async function OffersPage({ searchParams }: PageProps<"/">) {
  const { status: statusParam } = await searchParams;
  const status = TABS.some((t) => t.key === statusParam) ? (statusParam as string) : "aktywna";

  const [offers, counts] = await Promise.all([
    db.jobOffer.findMany({
      where: { status },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { applications: true } },
        applications: { where: { status: "gotowe" }, select: { id: true } },
      },
    }),
    db.jobOffer.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countFor = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Oferty pracy</h1>
        <LinkButton href="/oferty/nowa" variant="primary">
          + Nowa oferta
        </LinkButton>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "aktywna" ? "/" : `/?status=${t.key}`}
            className={cx(
              "-mb-px border-b-2 px-4 py-2 text-sm",
              status === t.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label} <span className="text-slate-400">({countFor(t.key)})</span>
          </Link>
        ))}
      </div>

      {offers.length === 0 ? (
        <EmptyState title={status === "aktywna" ? "Brak aktywnych ofert" : "Brak ofert w tej zakładce"}>
          {status === "aktywna" && (
            <>
              Dodaj ofertę z pliku Word (.docx) – AI wyodrębni wymagania, które możesz poprawić przed zapisaniem.
            </>
          )}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Stanowisko</th>
                <th className="px-4 py-3">Dział / obszar</th>
                <th className="px-4 py-3">Dodana</th>
                <th className="px-4 py-3 text-right">Przeanalizowane CV</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      href={o.status === "szkic" ? `/oferty/${o.id}/wymagania` : `/oferty/${o.id}`}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {o.title}
                    </Link>
                    {o.level && <span className="ml-2 text-xs text-slate-400">{o.level}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{o.area ?? "–"}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {o.applications.length}
                    {o._count.applications > o.applications.length && (
                      <span className="text-slate-400"> / {o._count.applications}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={OFFER_STATUS[o.status]?.tone}>{OFFER_STATUS[o.status]?.label ?? o.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
