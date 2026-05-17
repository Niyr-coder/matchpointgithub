import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MatchPoint — La comunidad #1 de Pickleball en Ecuador",
  description:
    "Reserva canchas, encuentra rivales de tu nivel y sube al ranking. De cero a cancha en 60 segundos.",
  keywords: ["pickleball", "ecuador", "canchas", "reservas", "ranking"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
