import "server-only";

import { getAdminClient } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";

export type AdminPartnerMember = {
  userId: string;
  name: string;
  username: string | null;
  role: string;
  joinedAt: string;
};

export type AdminPartnerRoleAssignment = {
  id: string;
  userId: string;
  name: string;
  username: string | null;
  grantedAt: string;
  revokedAt: string | null;
};

export type AdminPartnerClub = {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
  revenueSharePct: number;
  linkedAt: string;
};

export type AdminPartnerTournament = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startsAt: string;
  clubName: string | null;
  registrations: number;
  capturedRevenueCents: number;
};

export type AdminPartnerLeague = {
  id: string;
  name: string;
  status: string;
  season: string | null;
};

export type AdminPartnerPayout = {
  id: string;
  status: string;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  currency: string;
  periodStart: string;
  periodEnd: string;
};

export type AdminPartnerRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country: string | null;
  contactEmail: string | null;
  createdAt: string;
  memberCount: number;
  roleAssignmentCount: number;
  clubCount: number;
  tournamentCount: number;
  activeTournamentCount: number;
  leagueCount: number;
  registrationCount: number;
  capturedRevenueCents: number;
  pendingRevenueCents: number;
  payoutPendingCents: number;
  payoutPaidCents: number;
  owners: string[];
  members: AdminPartnerMember[];
  roleAssignments: AdminPartnerRoleAssignment[];
  clubs: AdminPartnerClub[];
  tournaments: AdminPartnerTournament[];
  leagues: AdminPartnerLeague[];
  payouts: AdminPartnerPayout[];
};

export type AdminPartnersData = {
  rows: AdminPartnerRow[];
  totals: {
    partners: number;
    activePartners: number;
    members: number;
    clubs: number;
    tournaments: number;
    activeTournaments: number;
    leagues: number;
    capturedRevenueCents: number;
    pendingPayoutsCents: number;
  };
};

type ProfileLite = {
  id: string;
  display_name: string | null;
  username: string | null;
};

type PartnerOrgRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country: string | null;
  contact_email: string | null;
  created_at: string;
};

type PartnerMemberRow = {
  partner_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

type PartnerRoleAssignmentRow = {
  id: string;
  partner_id: string | null;
  user_id: string;
  granted_at: string;
  revoked_at: string | null;
};

type PartnerClubLinkRow = {
  partner_id: string;
  club_id: string;
  revenue_share_pct: number;
  linked_at: string;
};

type ClubLite = {
  id: string;
  name: string;
  city: string | null;
  status: string | null;
};

type TournamentLite = {
  id: string;
  name: string;
  slug: string;
  status: string;
  starts_at: string;
  partner_id: string | null;
  club_id: string | null;
};

type LeagueLite = {
  id: string;
  name: string;
  status: string;
  season: string | null;
  partner_id: string | null;
};

type RegistrationLite = {
  tournament_id: string;
  status: string;
};

type TransactionLite = {
  ref_id: string | null;
  amount_cents: number;
  status: string;
};

type PayoutLite = {
  id: string;
  partner_id: string | null;
  gross_cents: number;
  commission_cents: number;
  net_cents: number;
  currency: string;
  status: string;
  period_start: string;
  period_end: string;
};

function requireNoError<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data as T;
}

function profileName(profile: ProfileLite | undefined, fallbackId: string): string {
  if (profile?.display_name) return profile.display_name;
  if (profile?.username) return `@${profile.username}`;
  return `Usuario ${fallbackId.slice(0, 8)}`;
}

function pushBy<K extends string, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

export async function listAdminPartnersOverview(): Promise<AdminPartnersData> {
  await requireAdminUserId();
  const admin = getAdminClient();

  const [partnersRes, membersRes, roleAssignmentsRes, clubLinksRes] = await Promise.all([
    admin
      .from("partner_orgs")
      .select("id,name,slug,status,country,contact_email,created_at")
      .order("name")
      .limit(200),
    admin.from("partner_members").select("partner_id,user_id,role,joined_at"),
    admin
      .from("role_assignments")
      .select("id,partner_id,user_id,granted_at,revoked_at")
      .eq("role", "partner")
      .not("partner_id", "is", null),
    admin.from("partner_club_links").select("partner_id,club_id,revenue_share_pct,linked_at"),
  ]);

  const partners = requireNoError<PartnerOrgRow[]>("partner_orgs", partnersRes);
  const partnerIds = partners.map((p) => p.id);
  const members = requireNoError<PartnerMemberRow[]>("partner_members", membersRes).filter((m) =>
    partnerIds.includes(m.partner_id),
  );
  const roleAssignments = requireNoError<PartnerRoleAssignmentRow[]>(
    "role_assignments",
    roleAssignmentsRes,
  ).filter((r) => r.partner_id && partnerIds.includes(r.partner_id));
  const clubLinks = requireNoError<PartnerClubLinkRow[]>("partner_club_links", clubLinksRes).filter((l) =>
    partnerIds.includes(l.partner_id),
  );

  const userIds = Array.from(
    new Set([...members.map((m) => m.user_id), ...roleAssignments.map((r) => r.user_id)]),
  );
  const clubIds = Array.from(new Set(clubLinks.map((l) => l.club_id)));

  const [
    profilesRes,
    clubsRes,
    tournamentsRes,
    leaguesRes,
    payoutsRes,
  ] = await Promise.all([
    userIds.length
      ? admin.from("profiles").select("id,display_name,username").in("id", userIds)
      : Promise.resolve({ data: [] as ProfileLite[], error: null }),
    clubIds.length
      ? admin.from("clubs").select("id,name,city,status").in("id", clubIds)
      : Promise.resolve({ data: [] as ClubLite[], error: null }),
    partnerIds.length
      ? admin
          .from("tournaments")
          .select("id,name,slug,status,starts_at,partner_id,club_id")
          .in("partner_id", partnerIds)
          .order("starts_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as TournamentLite[], error: null }),
    partnerIds.length
      ? admin
          .from("leagues")
          .select("id,name,status,season,partner_id")
          .in("partner_id", partnerIds)
          .order("created_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as LeagueLite[], error: null }),
    partnerIds.length
      ? admin
          .from("payouts")
          .select("id,partner_id,gross_cents,commission_cents,net_cents,currency,status,period_start,period_end")
          .eq("scope", "partner")
          .in("partner_id", partnerIds)
          .order("period_end", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as PayoutLite[], error: null }),
  ]);

  const profiles = new Map(
    requireNoError<ProfileLite[]>("profiles", profilesRes).map((p) => [p.id, p]),
  );
  const clubs = new Map(requireNoError<ClubLite[]>("clubs", clubsRes).map((c) => [c.id, c]));
  const tournaments = requireNoError<TournamentLite[]>("tournaments", tournamentsRes);
  const leagues = requireNoError<LeagueLite[]>("leagues", leaguesRes);
  const payouts = requireNoError<PayoutLite[]>("payouts", payoutsRes);
  const tournamentIds = tournaments.map((t) => t.id);

  const [registrationsRes, transactionsRes] = await Promise.all([
    tournamentIds.length
      ? admin
          .from("registrations")
          .select("tournament_id,status")
          .in("tournament_id", tournamentIds)
          .limit(2000)
      : Promise.resolve({ data: [] as RegistrationLite[], error: null }),
    tournamentIds.length
      ? admin
          .from("transactions")
          .select("ref_id,amount_cents,status")
          .eq("kind", "tournament")
          .in("ref_id", tournamentIds)
          .limit(3000)
      : Promise.resolve({ data: [] as TransactionLite[], error: null }),
  ]);

  const registrations = requireNoError<RegistrationLite[]>("registrations", registrationsRes);
  const transactions = requireNoError<TransactionLite[]>("transactions", transactionsRes);

  const membersByPartner = new Map<string, PartnerMemberRow[]>();
  const rolesByPartner = new Map<string, PartnerRoleAssignmentRow[]>();
  const linksByPartner = new Map<string, PartnerClubLinkRow[]>();
  const tournamentsByPartner = new Map<string, TournamentLite[]>();
  const leaguesByPartner = new Map<string, LeagueLite[]>();
  const payoutsByPartner = new Map<string, PayoutLite[]>();
  const regsByTournament = new Map<string, number>();
  const capturedByTournament = new Map<string, number>();
  const pendingByTournament = new Map<string, number>();

  for (const m of members) pushBy(membersByPartner, m.partner_id, m);
  for (const r of roleAssignments) {
    if (r.partner_id) pushBy(rolesByPartner, r.partner_id, r);
  }
  for (const l of clubLinks) pushBy(linksByPartner, l.partner_id, l);
  for (const t of tournaments) {
    if (t.partner_id) pushBy(tournamentsByPartner, t.partner_id, t);
  }
  for (const l of leagues) {
    if (l.partner_id) pushBy(leaguesByPartner, l.partner_id, l);
  }
  for (const p of payouts) {
    if (p.partner_id) pushBy(payoutsByPartner, p.partner_id, p);
  }
  for (const r of registrations) {
    regsByTournament.set(r.tournament_id, (regsByTournament.get(r.tournament_id) ?? 0) + 1);
  }
  for (const t of transactions) {
    if (!t.ref_id) continue;
    if (t.status === "captured") {
      capturedByTournament.set(t.ref_id, (capturedByTournament.get(t.ref_id) ?? 0) + t.amount_cents);
    } else if (["pending", "authorized", "pending_proof", "proof_submitted"].includes(t.status)) {
      pendingByTournament.set(t.ref_id, (pendingByTournament.get(t.ref_id) ?? 0) + t.amount_cents);
    }
  }

  const rows: AdminPartnerRow[] = partners.map((partner) => {
    const partnerMembers = membersByPartner.get(partner.id) ?? [];
    const partnerRoles = rolesByPartner.get(partner.id) ?? [];
    const partnerLinks = linksByPartner.get(partner.id) ?? [];
    const partnerTournaments = tournamentsByPartner.get(partner.id) ?? [];
    const partnerLeagues = leaguesByPartner.get(partner.id) ?? [];
    const partnerPayouts = payoutsByPartner.get(partner.id) ?? [];

    const mappedTournaments = partnerTournaments.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      startsAt: t.starts_at,
      clubName: t.club_id ? clubs.get(t.club_id)?.name ?? null : null,
      registrations: regsByTournament.get(t.id) ?? 0,
      capturedRevenueCents: capturedByTournament.get(t.id) ?? 0,
    }));

    const capturedRevenueCents = mappedTournaments.reduce((sum, t) => sum + t.capturedRevenueCents, 0);
    const pendingRevenueCents = partnerTournaments.reduce(
      (sum, t) => sum + (pendingByTournament.get(t.id) ?? 0),
      0,
    );

    const mappedMembers = partnerMembers.map((m) => {
      const profile = profiles.get(m.user_id);
      return {
        userId: m.user_id,
        name: profileName(profile, m.user_id),
        username: profile?.username ?? null,
        role: m.role,
        joinedAt: m.joined_at,
      };
    });

    return {
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      status: partner.status,
      country: partner.country,
      contactEmail: partner.contact_email,
      createdAt: partner.created_at,
      memberCount: partnerMembers.length,
      roleAssignmentCount: partnerRoles.filter((r) => !r.revoked_at).length,
      clubCount: partnerLinks.length,
      tournamentCount: partnerTournaments.length,
      activeTournamentCount: partnerTournaments.filter(
        (t) => !["draft", "cancelled", "finished"].includes(t.status),
      ).length,
      leagueCount: partnerLeagues.length,
      registrationCount: mappedTournaments.reduce((sum, t) => sum + t.registrations, 0),
      capturedRevenueCents,
      pendingRevenueCents,
      payoutPendingCents: partnerPayouts
        .filter((p) => ["pending", "approved", "processing"].includes(p.status))
        .reduce((sum, p) => sum + p.net_cents, 0),
      payoutPaidCents: partnerPayouts
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.net_cents, 0),
      owners: mappedMembers.filter((m) => m.role === "owner").map((m) => m.name),
      members: mappedMembers,
      roleAssignments: partnerRoles.map((r) => {
        const profile = profiles.get(r.user_id);
        return {
          id: r.id,
          userId: r.user_id,
          name: profileName(profile, r.user_id),
          username: profile?.username ?? null,
          grantedAt: r.granted_at,
          revokedAt: r.revoked_at,
        };
      }),
      clubs: partnerLinks.map((link) => {
        const club = clubs.get(link.club_id);
        return {
          id: link.club_id,
          name: club?.name ?? "Club sin nombre",
          city: club?.city ?? null,
          status: club?.status ?? null,
          revenueSharePct: Number(link.revenue_share_pct ?? 0),
          linkedAt: link.linked_at,
        };
      }),
      tournaments: mappedTournaments,
      leagues: partnerLeagues.map((l) => ({
        id: l.id,
        name: l.name,
        status: l.status,
        season: l.season,
      })),
      payouts: partnerPayouts.map((p) => ({
        id: p.id,
        status: p.status,
        grossCents: p.gross_cents,
        commissionCents: p.commission_cents,
        netCents: p.net_cents,
        currency: p.currency,
        periodStart: p.period_start,
        periodEnd: p.period_end,
      })),
    };
  });

  return {
    rows,
    totals: {
      partners: rows.length,
      activePartners: rows.filter((r) => r.status === "active").length,
      members: rows.reduce((sum, r) => sum + r.memberCount, 0),
      clubs: rows.reduce((sum, r) => sum + r.clubCount, 0),
      tournaments: rows.reduce((sum, r) => sum + r.tournamentCount, 0),
      activeTournaments: rows.reduce((sum, r) => sum + r.activeTournamentCount, 0),
      leagues: rows.reduce((sum, r) => sum + r.leagueCount, 0),
      capturedRevenueCents: rows.reduce((sum, r) => sum + r.capturedRevenueCents, 0),
      pendingPayoutsCents: rows.reduce((sum, r) => sum + r.payoutPendingCents, 0),
    },
  };
}
