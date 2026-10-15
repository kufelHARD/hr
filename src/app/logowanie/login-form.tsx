"use client";

import { useActionState } from "react";
import { login, setupPassword, type LoginState } from "./actions";

export function LoginForm({ back, setup }: { back: string; setup?: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(setup ? setupPassword : login, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="powrot" value={back} />
      <label className="block">
        <span className="text-sm font-medium text-slate-700">{setup ? "Nowe hasło (min. 8 znaków)" : "Hasło"}</span>
        <input
          type="password"
          name="haslo"
          required
          autoFocus
          autoComplete={setup ? "new-password" : "current-password"}
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>
      {setup && (
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Powtórz hasło</span>
          <input
            type="password"
            name="haslo2"
            required
            autoComplete="new-password"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      )}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Proszę czekać…" : setup ? "Ustaw hasło i wejdź" : "Zaloguj"}
      </button>
    </form>
  );
}
