// Server: gestión de membresías VIP del club (owner/manager). Resuelve el club
// activo y delega en la vista cliente, que fetchea tiers + miembros vía actions.
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { EmptyState } from "@/components/ui/EmptyState";
import { ClubMembershipsView } from "./ClubMembershipsView";

export async function ClubMembershipsScreen() {
  const clubId = await resolveActiveClubId({ staffRoles: ["owner", "manager", "admin"] });
  if (!clubId) {
    return (
      <EmptyState
        icon="star"
        title="Sin club activo"
        hint="No encontramos un club asociado a tu cuenta para gestionar membresías."
      />
    );
  }
  return <ClubMembershipsView clubId={clubId} />;
}
