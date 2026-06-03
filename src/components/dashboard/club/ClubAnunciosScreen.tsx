import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { getClubCommsStaffOverview, listClubGiveaways } from "@/server/actions/club-comms";
import { ClubAnunciosScreenView } from "./ClubAnunciosScreenView";

export async function ClubAnunciosScreen({ roleSegment }: { roleSegment: "owner" | "manager" }) {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
        No encontramos un club activo para esta sesión.
      </div>
    );
  }

  const [overviewRes, giveawaysRes] = await Promise.all([
    getClubCommsStaffOverview({ clubId }),
    listClubGiveaways({ clubId }),
  ]);

  if (!overviewRes.ok) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--danger-fg)" }}>
        {overviewRes.error.message}
      </div>
    );
  }

  const giveaways = giveawaysRes.ok ? giveawaysRes.data : [];

  return (
    <ClubAnunciosScreenView roleSegment={roleSegment} overview={overviewRes.data} giveaways={giveaways} />
  );
}
