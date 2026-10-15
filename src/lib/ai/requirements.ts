import { callStructured, loadPrompt } from "./client";
import { offerExtractionSchema, type OfferExtraction } from "./schemas";
import { loadCompanyContext } from "@/lib/settings";

/** AI wyciąga z treści oferty listę wymagań (do przejrzenia i edycji przez rekrutera). */
export async function extractRequirements(offerText: string): Promise<OfferExtraction> {
  const [prompt, company] = await Promise.all([loadPrompt("requirements-system.md"), loadCompanyContext()]);
  const res = await callStructured({
    system: prompt.text,
    content: [
      { text: `<kontekst_firmy>\n${company}\n</kontekst_firmy>` },
      { text: `<oferta>\n${offerText}\n</oferta>\n\nWyodrębnij wymagania z powyższej oferty.` },
    ],
    schema: offerExtractionSchema,
    maxTokens: 32000,
    validate: (d) => (d.wymagania.length === 0 ? ["Nie wyodrębniono żadnych wymagań."] : []),
  });
  return res.data;
}
