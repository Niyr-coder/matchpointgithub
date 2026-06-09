import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { getClubGiveawaysOrgOverview, listOrgGiveaways } from "@/server/actions/giveaways";
import { ClubSorteosScreenView } from "./ClubSorteosScreenView";
import { Icon } from "@/components/Icon";

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
    getClubGiveawaysOrgOverview({ clubId }),
    listOrgGiveaways({ clubId }),
  ]);

  if (!overviewRes.ok) {
    return (
      <div style={{ padding: 28 }}>
        <div
          className="card"
          style={{
            maxWidth: 520,
            margin: "40px auto",
            padding: 28,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "#fef2f2",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="lock" size={22} color="#dc2626" />
          </div>
          <h1 className="font-heading" style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>
            Sorteos no disponibles
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted-fg)", margin: 0, lineHeight: 1.5 }}>
            {overviewRes.error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClubSorteosScreenView
      roleSegment={roleSegment}
      clubId={clubId}
      overview={overviewRes.data}
      giveaways={giveawaysRes.ok ? giveawaysRes.data : []}
      loadError={giveawaysRes.ok ? null : giveawaysRes.error.message}
    />
  );
}
