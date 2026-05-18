// Landing wrapper (server async). Recibe data ya fetcheada del server
// component page.tsx y la compone con PublicChrome + HomeWithPaywall.
// HomeWithPaywall vive en su propio archivo client porque usa usePaywall.
import type { ComponentProps } from "react";
import { PublicChrome } from "./PublicChrome";
import { HomeWithPaywall } from "./HomeWithPaywall";
import type { Home } from "./Home";

type HomeProps = ComponentProps<typeof Home>;

type LandingProps = {
  clubs?: HomeProps["clubs"];
  events?: HomeProps["events"];
  stats?: HomeProps["stats"];
  marqueeClubs?: HomeProps["marqueeClubs"];
};

export async function LandingShell({
  clubs,
  events,
  stats,
  marqueeClubs,
}: LandingProps = {}) {
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
