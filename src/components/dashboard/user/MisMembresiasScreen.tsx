// Server: "Mis membresías" — el carnet VIP del jugador por club.
// Trae las membresías reales del user + su perfil (nombre/avatar para el
// carnet) + los tiers de cada club (para comparar planes). El render rico vive
// en MisMembresiasScreenView (client) por el selector de club.
//
// Alcance: secciones con backend real (selector, carnet, beneficios del tier,
// renovación, comparar planes). KPIs del mes e historial de uso quedan fuera
// hasta que exista tracking de uso. Sin PSP: la renovación es transferencia
// manual aprobada por el club (botón "Renovar" → flujo de pago del club).
import { getSession } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { getMyClubMemberships, getClubMembershipTiers } from "@/server/actions/club-memberships";
import { MisMembresiasScreenView, type MembershipRow, type TierRow } from "./MisMembresiasScreenView";

type RawRow = {
  id: string;
  club_id: string;
  status: string;
  member_no: number | null;
  starts_at: string | null;
  expires_at: string | null;
  tier_id: string | null;
  clubs: { name: string | null; slug: string | null; city: string | null } | null;
  club_membership_tiers: {
    name: string | null;
    price_cents: number | null;
    duration_months: number | null;
    discount_pct: number | null;
    benefits: string[] | null;
    card_design: { templateKey?: string; accent?: string } | null;
  } | null;
};

type RawTier = {
  id: string;
  name: string | null;
  description: string | null;
  price_cents: number | null;
  duration_months: number | null;
  discount_pct: number | null;
  benefits: string[] | null;
  is_active: boolean | null;
};

export async function MisMembresiasScreen() {
  const session = await getSession();
  if (!session.authenticated) {
    return <MisMembresiasScreenView memberships={[]} tiersByClub={{}} memberName="" />;
  }
  const userId = session.session.userId;

  const [res, profile] = await Promise.all([getMyClubMemberships({}), getProfileSummary(userId)]);
  const raw = (res.ok ? (res.data as RawRow[]) : []).filter(
    (r) => r.status !== "rejected" && r.status !== "cancelled",
  );

  const memberships: MembershipRow[] = raw.map((r) => ({
    id: r.id,
    clubId: r.club_id,
    clubName: r.clubs?.name ?? "Club",
    clubSlug: r.clubs?.slug ?? null,
    clubCity: r.clubs?.city ?? null,
    status: r.status,
    memberNo: r.member_no,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
    tierId: r.tier_id,
    tierName: r.club_membership_tiers?.name ?? "Membresía",
    priceCents: r.club_membership_tiers?.price_cents ?? 0,
    durationMonths: r.club_membership_tiers?.duration_months ?? 1,
    discountPct: r.club_membership_tiers?.discount_pct ?? 0,
    benefits: (r.club_membership_tiers?.benefits ?? []).filter((b): b is string => typeof b === "string"),
    templateKey: r.club_membership_tiers?.card_design?.templateKey ?? null,
  }));

  // Tiers de cada club (para "comparar planes"). Un solo fetch por club distinto.
  const clubIds = [...new Set(memberships.map((m) => m.clubId))];
  const tiersResults = await Promise.all(clubIds.map((clubId) => getClubMembershipTiers({ clubId })));
  const tiersByClub: Record<string, TierRow[]> = {};
  clubIds.forEach((clubId, i) => {
    const tr = tiersResults[i];
    const list = (tr.ok ? (tr.data as RawTier[]) : []).filter((t) => t.is_active !== false);
    tiersByClub[clubId] = list.map((t) => ({
      id: t.id,
      name: t.name ?? "Plan",
      description: t.description ?? null,
      priceCents: t.price_cents ?? 0,
      durationMonths: t.duration_months ?? 1,
      benefits: (t.benefits ?? []).filter((b): b is string => typeof b === "string"),
    }));
  });

  return (
    <MisMembresiasScreenView
      memberships={memberships}
      tiersByClub={tiersByClub}
      memberName={profile.displayName ?? profile.username ?? "Socio"}
    />
  );
}
