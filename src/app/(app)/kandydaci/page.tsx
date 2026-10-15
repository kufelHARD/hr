import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { normalizeForSearch } from "@/lib/text";
import { candidateDisplayName } from "@/lib/services/candidates";
import { Badge, EmptyState, ScoreBar, cx, formatDate } from "@/components/ui";

const FILTERS = [
  { key: "", label: "Wszyscy" },
  { key: "zgoda", label: "Ze zgodą na przyszłe rekrutacje" },
  { key: "bez-zgody", label: "Bez zgody" },
  { key: "do-usuniecia", label: "Do usunięcia (bez zgody, oferty zakończone)" },
] as const;

function snippet(text: string | null, terms: string[]): string | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0) {
      const start = Math.max(0, i - 70);
      const end = Math.min(text.length, i + t.length + 90);
      return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
    }
  }
  return null;
}

export default async function CandidatesSearchPage({ searchParams }: PageProps<"/kandydaci">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = typeof sp.filtr === "string" ? sp.filtr : "";
  const terms = normalizeForSearch(q)
    .split(" ")
    .filter((t) => t.length >= 2)
    .slice(0, 6);

  const and: Prisma.CandidateWhereInput[] = terms.map((t) => ({
    OR: [
      { fullNameNormalized: { contains: t } },
      { documents: { some: { textNormalized: { contains: t } } } },
      { applications: { some: { analyses: { some: { technologiesNormalized: { contains: t } } } } } },
    ],
  }));
  if (filter === "zgoda") and.push({ consentFuture: true });
  if (filter === "bez-zgody") and.push({ consentFuture: false });
  if (filter === "do-usuniecia") {
    and.push({ consentFuture: false }, { applications: { every: { offer: { status: "zarchiwizowana" } } } });
  }

  const candidates = await db.candidate.findMany({
    where: { AND: and },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      documents: { orderBy: { createdAt: "desc" }, take: 1, select: { originalFileName: true, extractedText: true } },
      applications: {
        include: {
          offer: { select: { id: true, title: true, status: true } },
          analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { matchScore: true, potentialScore: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Kandydaci</h1>

      <form className="flex flex-wrap gap-2" action="/kandydaci">
        <input
          name="q"
          defaultValue={q}
          placeholder="Imię i nazwisko, technologia lub słowo kluczowe (np. „Oracle Data Guard”)"
          className="min-w-[280px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        {filter && <input type="hidden" name="filtr" value={filter} />}
        <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Szukaj</button>
      </form>

      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (f.key) params.set("filtr", f.key);
          return (
            <Link
              key={f.key}
              href={`/kandydaci${params.size ? `?${params}` : ""}`}
              className={cx("rounded-full px-3 py-1 ring-1", filter === f.key ? "bg-brand-50 text-brand-700 ring-brand-100" : "text-slate-600 ring-slate-200 hover:bg-white")}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {filter === "do-usuniecia" && (
        <p className="text-sm text-slate-500">
          Kandydaci bez zgody na przyszłe rekrutacje, których wszystkie oferty są zarchiwizowane. Usuń ich dane z poziomu karty kandydata
          („Usuń wszystkie dane”) albo włącz automatyczną retencję w <code>config/scoring.json</code>.
        </p>
      )}

      {candidates.length === 0 ? (
        <EmptyState title={terms.length || filter ? "Brak kandydatów spełniających kryteria" : "Brak kandydatów"} />
      ) : (
        <ul className="space-y-3">
          {candidates.map((c) => {
            const doc = c.documents[0];
            const snip = terms.length ? snippet(doc?.extractedText ?? null, q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)) : null;
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{candidateDisplayName(c, doc?.originalFileName)}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.consentFuture ? <Badge tone="green">zgoda na przyszłe rekrutacje</Badge> : <Badge>bez zgody</Badge>}
                    <span className="text-xs text-slate-400">dodany {formatDate(c.createdAt)}</span>
                  </div>
                </div>
                {snip && <p className="mt-2 text-sm italic text-slate-500">{snip}</p>}
                <ul className="mt-3 space-y-1.5">
                  {c.applications.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      <Link href={`/oferty/${a.offerId}/kandydaci/${a.id}`} className="min-w-[220px] flex-1 text-brand-700 hover:underline">
                        {a.offer.title}
                      </Link>
                      {a.offer.status === "zarchiwizowana" && <Badge>archiwum – tylko odczyt</Badge>}
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        Dopasowanie <ScoreBar score={a.analyses[0]?.matchScore} />
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        Potencjał <ScoreBar score={a.analyses[0]?.potentialScore} />
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {candidates.length === 100 && <p className="text-sm text-slate-500">Pokazano pierwszych 100 wyników – zawęź wyszukiwanie.</p>}
    </div>
  );
}
