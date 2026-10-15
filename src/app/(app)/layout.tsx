import Link from "next/link";
import { logout } from "../logowanie/actions";
import { NavLink } from "@/components/nav-link";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold text-brand-900">
            Porównywarka CV <span className="font-normal text-slate-400">· summ-it</span>
          </Link>
          <nav className="flex flex-1 gap-1 text-sm">
            <NavLink href="/" exact>Oferty</NavLink>
            <NavLink href="/kandydaci">Kandydaci</NavLink>
            <NavLink href="/ustawienia">Ustawienia</NavLink>
          </nav>
          <form action={logout}>
            <button className="text-sm text-slate-500 hover:text-slate-900">Wyloguj</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-slate-200 py-3 text-center text-xs text-slate-400">
        Ocena AI ma charakter pomocniczy. Decyzję rekrutacyjną podejmuje człowiek.
      </footer>
    </>
  );
}
