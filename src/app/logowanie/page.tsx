import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/logowanie">) {
  const { powrot } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Porównywarka CV</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">summ-it S.A. · narzędzie wewnętrzne działu HR</p>
        <LoginForm back={typeof powrot === "string" ? powrot : "/"} />
      </div>
    </main>
  );
}
