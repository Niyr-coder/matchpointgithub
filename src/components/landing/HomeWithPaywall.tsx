// Wrapper client mínimo: lee el handler de Paywall por contexto y se lo
// pasa al componente Home. Extraído de LandingShell para que LandingShell
// pueda ser server async (necesario ahora que PublicChrome también lo es).
"use client";
import type { ComponentProps } from "react";
import { usePaywall } from "./PublicChromeClient";
import { Home } from "./Home";

type HomeProps = ComponentProps<typeof Home>;

export function HomeWithPaywall({
  clubs,
  events,
  stats,
  marqueeClubs,
}: {
  clubs?: HomeProps["clubs"];
  events?: HomeProps["events"];
  stats?: HomeProps["stats"];
  marqueeClubs?: HomeProps["marqueeClubs"];
}) {
  const onPaywall = usePaywall();
  return (
    <Home
      onPaywall={onPaywall}
      clubs={clubs}
      events={events}
      stats={stats}
      marqueeClubs={marqueeClubs}
    />
  );
}
