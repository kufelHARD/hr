import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Porównywarka CV – summ-it",
  description: "Wewnętrzne narzędzie działu HR do porównywania CV z ofertami pracy",
  robots: { index: false, follow: false },
};

// Aplikacja w całości operuje na danych z lokalnej bazy – zawsze renderowana dynamicznie.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
