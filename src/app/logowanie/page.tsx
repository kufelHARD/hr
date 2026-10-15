import { LoginForm } from "./login-form";
import { isPasswordConfigured } from "@/lib/app-settings";

export default async function LoginPage({ searchParams }: PageProps<"/logowanie">) {
  const { powrot } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Porównywarka CV</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">summ-it S.A. · narzędzie wewnętrzne działu HR</p>
        {!isPasswordConfigured() && (
          <p className="mb-4 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Pierwsze uruchomienie – ustaw hasło, które będzie chronić dostęp do danych kandydatów.
          </p>
        )}
        <LoginForm back={typeof powrot === "string" ? powrot : "/"} setup={!isPasswordConfigured()} />
      </div>
    </main>
  );
}
