// Landing wrapper. Recibe data ya fetcheada del server component (page.tsx).
"use client";
import { PublicChrome, usePaywall } from "./PublicChrome";
import { Home } from "./Home";
import type { ComponentProps } from "react";

type HomeProps = ComponentProps<typeof Home>;
type LandingProps = {
  clubs?: HomeProps["clubs"];
  events?: HomeProps["events"];
  stats?: HomeProps["stats"];
  marqueeClubs?: HomeProps["marqueeClubs"];
};

function HomeWithPaywall({ clubs, events, stats, marqueeClubs }: LandingProps) {
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

export function LandingShell({ clubs, events, stats, marqueeClubs }: LandingProps = {}) {
  return (
    <PublicChrome>
      <HomeWithPaywall
        clubs={clubs}
        events={events}
        stats={stats}
        marqueeClubs={marqueeClubs}
      />
    </PublicChrome>
  );
}
