import type { Metadata } from "next";
import "./globals.css";
import { SportsProvider } from "@/components/SportsProvider";
import { getMultisportEnabled } from "@/lib/sports.server";

export const metadata: Metadata = {
  title: "MatchPoint — La comunidad #1 de Pickleball en Ecuador",
  description:
    "Reserva canchas, encuentra rivales de tu nivel y sube al ranking. De cero a cancha en 60 segundos.",
  keywords: ["pickleball", "ecuador", "canchas", "reservas", "ranking"],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const multisport = await getMultisportEnabled();
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <SportsProvider multisport={multisport}>{children}</SportsProvider>
      </body>
    </html>
  );
}
