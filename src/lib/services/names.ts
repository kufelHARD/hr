import { db } from "@/lib/db";
import { guessCandidateName, legacyGuessCandidateName } from "@/lib/matching";
import { normalizeForSearch } from "@/lib/text";

/**
 * Jednorazowe uporządkowanie imion kandydatów zapisanych przed wprowadzeniem pola `nameSource` (wersje ≤ 1.1.0).
 *
 * - zgłoszenie z formularza „Aplikuj” → „formularz” (imię podał kandydat),
 * - imię identyczne z wynikiem poprzedniej heurystyki → odczytane automatycznie: odczytujemy je ponownie
 *   nową heurystyką; nazwa, której nowa heurystyka nie uznaje za imię i nazwisko (np. „Zielona Góra”), jest czyszczona,
 * - brak imienia → próba odczytu,
 * - pozostałe (wpisane ręcznie albo przez AI w wersji 1.0) → bez zmian.
 *
 * Działa tylko dla kandydatów bez `nameSource`, więc po pierwszym uruchomieniu nie ma już nic do zrobienia.
 */
export async function repairCandidateNames(): Promise<{ checked: number; renamed: number }> {
  const candidates = await db.candidate.findMany({
    where: { nameSource: null },
    include: {
      applications: { select: { source: true, _count: { select: { analyses: true } } } },
      documents: { orderBy: { createdAt: "desc" }, take: 1, select: { extractedText: true, originalFileName: true } },
    },
  });
  let renamed = 0;
  for (const c of candidates) {
    const doc = c.documents[0];
    const text = doc?.extractedText ?? "";
    let data: { fullName?: string | null; fullNameNormalized?: string | null; nameSource: string };

    if (c.applications.some((a) => a.source !== "recznie")) {
      data = { nameSource: "formularz" };
    } else if (!c.fullName || c.fullName === legacyGuessCandidateName(text)) {
      const name = text ? guessCandidateName(text, doc?.originalFileName) : null;
      if (name) data = { fullName: name, fullNameNormalized: normalizeForSearch(name), nameSource: "cv" };
      else if (c.fullName && !guessCandidateName(c.fullName)) data = { fullName: null, fullNameNormalized: null, nameSource: "cv" };
      else data = { nameSource: "cv" };
      if (data.fullName !== undefined && data.fullName !== c.fullName) renamed++;
    } else {
      data = { nameSource: c.applications.some((a) => a._count.analyses > 0) ? "ai" : "recznie" };
    }
    await db.candidate.update({ where: { id: c.id }, data });
  }
  return { checked: candidates.length, renamed };
}
