import Link from "next/link";
import { Card } from "@/components/ui";
import { NewOfferForm } from "./new-offer-form";

export default function NewOfferPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Oferty
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Nowa oferta pracy</h1>
        <p className="mt-1 text-sm text-slate-500">
          Krok 1 z 2: wgraj ofertę. W kolejnym kroku przejrzysz i poprawisz wymagania wyodrębnione przez AI.
        </p>
      </div>
      <Card>
        <NewOfferForm />
      </Card>
    </div>
  );
}
