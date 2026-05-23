// Server: gestión de membresías VIP del club (owner/manager) — rediseño v2
// cableado a datos reales. Resuelve el club activo, carga tiers + miembros reales
// (vía las actions de club-memberships) y los pasa al rediseño como prop `data`.
// El rediseño (ClubMembresiasScreenView) conserva TODO el diseño del prototipo y
// suma lo operativo real: CRUD de tiers + cola de aprobación de pagos de socios
// (aprobar/rechazar/revocar). Patrón espejo de admin-roles y club-finanzas.
// Ver docs/product/07-club-memberships.md.
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { getClubMembershipTiers, getClubMembers } from "@/server/actions/club-memberships";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ClubMembresiasScreenView,
  type ClubMembresiasData,
  type RealTier,
  type RealMember,
} from "./ClubMembresiasScreenView";

export async function ClubMembresiasScreen() {
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

  const [tiersRes, membersRes] = await Promise.all([
    getClubMembershipTiers({ clubId }),
    getClubMembers({ clubId }),
  ]);

  const data: ClubMembresiasData = {
    clubId,
    tiers: tiersRes.ok ? (tiersRes.data as RealTier[]) : [],
    members: membersRes.ok ? (membersRes.data as RealMember[]) : [],
  };

  return <ClubMembresiasScreenView data={data} />;
}
