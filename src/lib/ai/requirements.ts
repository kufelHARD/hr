import { callStructured, loadPrompt } from "./client";
import { offerExtractionSchema, type OfferExtraction } from "./schemas";
import { loadCompanyContext } from "@/lib/settings";
import { completeDraft } from "@/lib/offers/sections";

/**
 * AI wyciąga z treści oferty listę wymagań (do przejrzenia i edycji przez rekrutera).
 * Wynik jest uzgadniany z sekcjami ogłoszenia odczytanymi bez AI: punkty z „Mile widziane”
 * dostają właściwy typ, a pominięte przez AI punkty wymagań są dopisywane.
 */
export async function extractRequirements(offerText: string): Promise<OfferExtraction> {
  const [prompt, company] = await Promise.all([loadPrompt("requirements-system.md"), loadCompanyContext()]);
  const res = await callStructured({
    kind: "wymagania",
    system: prompt.text,
    content: [
      { text: `<kontekst_firmy>\n${company}\n</kontekst_firmy>` },
      { text: `<oferta>\n${offerText}\n</oferta>\n\nWyodrębnij wymagania z powyższej oferty.` },
    ],
    schema: offerExtractionSchema,
    maxTokens: 32000,
    validate: (d) => (d.wymagania.length === 0 ? ["Nie wyodrębniono żadnych wymagań."] : []),
  });
  return completeDraft(res.data, offerText).draft;
}
