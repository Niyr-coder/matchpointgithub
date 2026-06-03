import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { listOrgGiveaways } from "@/server/actions/giveaways";
import { getClubCommsStaffOverview } from "@/server/actions/club-comms";
import { ClubSorteosScreenView } from "./ClubSorteosScreenView";

export async function ClubSorteosScreen({ roleSegment }: { roleSegment: "owner" | "manager" }) {
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
    listOrgGiveaways({ clubId }),
  ]);

  if (!overviewRes.ok) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--danger-fg)" }}>
        {overviewRes.error.message}
      </div>
    );
  }

  return (
    <ClubSorteosScreenView
      roleSegment={roleSegment}
      clubId={clubId}
      overview={overviewRes.data}
      giveaways={giveawaysRes.ok ? giveawaysRes.data : []}
    />
  );
}
