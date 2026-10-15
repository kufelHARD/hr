"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href || pathname.startsWith("/oferty") : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 ${active ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </Link>
  );
}
