import type { Metadata } from "next";
import { PublicChrome } from "@/components/landing/PublicChrome";
import { PreciosPageView } from "@/components/landing/precios/PreciosPageView";

export const metadata: Metadata = {
  title: "Precios — MATCHPOINT",
  description:
    "Planes para jugadores, clubes, partners y coaches. Sin permanencia y sin comisión por reserva del club. Empieza gratis.",
  openGraph: {
    title: "Precios — MATCHPOINT",
    description:
      "Planes para jugadores, clubes, partners y coaches. Sin permanencia y sin comisión por reserva del club.",
    url: "https://matchpoint.top/precios",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Precios — MATCHPOINT",
    description:
      "Planes para jugadores, clubes, partners y coaches. Sin permanencia y sin comisión por reserva del club.",
  },
  alternates: { canonical: "/precios" },
};

export default function PreciosPage() {
  return (
    <PublicChrome>
      <PreciosPageView />
    </PublicChrome>
  );
}
