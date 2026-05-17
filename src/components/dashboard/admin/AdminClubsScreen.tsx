// Server: lista global de clubes + solicitudes pendientes para el rol admin.
import { getServerClient } from "@/lib/db/client.server";
import {
  AdminClubsScreenView,
  type ClubsData,
  type ClubRow,
  type PendingApplication,
} from "./AdminClubsScreenView";

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtFounded(iso: string, now: Date): string {
  const d = new Date(iso);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return "hoy";
  if (diffDays === 1) return "ayer";
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function mapStatus(dbStatus: string): "verified" | "pending" | "rejected" {
  if (dbStatus === "active") return "verified";
  if (dbStatus === "pending") return "pending";
  return "rejected";
}

function tierFor(status: "verified" | "pending" | "rejected", revCents: number, createdAt: Date, now: Date): "PRO" | "NEW" | "STD" | "X" {
  if (status === "rejected") return "X";
  const ageDays = (now.getTime() - createdAt.getTime()) / 86400000;
  if (ageDays < 7) return "NEW";
  if (revCents >= 1_000_000) return "PRO"; // $10k+
  return "STD";
}

async function loadData(): Promise<ClubsData> {
  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: clubs } = await supabase
    .from("clubs")
    .select("id,name,city,country,status,created_at")
    .order("created_at", { ascending: false });

  const clubIds = (clubs ?? []).map((c) => c.id as string);
  const courtsByClub = new Map<string, number>();
  const membersByClub = new Map<string, number>();
  const revByClub = new Map<string, number>();

  if (clubIds.length > 0) {
    const [{ data: courts }, { data: reservations }, { data: txns }] = await Promise.all([
      supabase.from("courts").select("club_id").in("club_id", clubIds).eq("active", true),
      supabase
        .from("reservations")
        .select("club_id,organizer_id")
        .in("club_id", clubIds)
        .neq("status", "cancelled"),
      supabase
        .from("transactions")
        .select("club_id,amount_cents")
        .in("club_id", clubIds)
        .eq("status", "captured")
        .gte("created_at", monthStart.toISOString()),
    ]);

    for (const c of courts ?? []) {
      const id = c.club_id as string;
      courtsByClub.set(id, (courtsByClub.get(id) ?? 0) + 1);
    }
    const memberSets = new Map<string, Set<string>>();
    for (const r of reservations ?? []) {
      const id = r.club_id as string;
      if (!memberSets.has(id)) memberSets.set(id, new Set());
      memberSets.get(id)!.add(r.organizer_id as string);
    }
    for (const [id, set] of memberSets) membersByClub.set(id, set.size);
    for (const t of txns ?? []) {
      const id = t.club_id as string;
      revByClub.set(id, (revByClub.get(id) ?? 0) + ((t.amount_cents as number) ?? 0));
    }
  }

  // Solicitudes en curso (no draft, no aprobadas/rechazadas finales).
  const PENDING_STATUSES = [
    "submitted",
    "docs_review",
    "field_verification",
    "final_review",
  ] as const;
  const { data: pendingApps } = await supabase
    .from("club_applications")
    .select("id,name,district,country,status,submitted_at,applicant_id,contact_person,contact_email")
    .in("status", [...PENDING_STATUSES])
    .order("submitted_at", { ascending: true });

  const applicantIds = Array.from(
    new Set((pendingApps ?? []).map((a) => a.applicant_id as string).filter(Boolean)),
  );
  const applicantNames = new Map<string, string>();
  if (applicantIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name,username")
      .in("id", applicantIds);
    for (const p of profs ?? []) {
      applicantNames.set(p.id as string, (p.display_name as string) ?? (p.username as string));
    }
  }

  const pending: PendingApplication[] = (pendingApps ?? []).map((a) => ({
    id: a.id as string,
    name: (a.name as string) ?? "Sin nombre",
    city: [(a.district as string | null) ?? null, (a.country as string | null) ?? null]
      .filter(Boolean)
      .join(" · ") || "—",
    status: a.status as string,
    submittedAt: a.submitted_at as string | null,
    applicantName: a.applicant_id ? applicantNames.get(a.applicant_id as string) ?? "—" : "—",
    contactPerson: (a.contact_person as string | null) ?? null,
    contactEmail: (a.contact_email as string | null) ?? null,
  }));

  const rows: ClubRow[] = (clubs ?? []).map((c) => {
    const status = mapStatus(c.status as string);
    const createdAt = new Date(c.created_at as string);
    const revCents = revByClub.get(c.id as string) ?? 0;
    return {
      id: c.id as string,
      name: c.name as string,
      city: `${(c.city as string) ?? "—"} · ${(c.country as string) ?? ""}`.trim(),
      courts: courtsByClub.get(c.id as string) ?? 0,
      members: membersByClub.get(c.id as string) ?? 0,
      rev: `$${Math.round(revCents / 100).toLocaleString("en-US")}`,
      status,
      founded: fmtFounded(c.created_at as string, now),
      tier: tierFor(status, revCents, createdAt, now),
    };
  });

  return { rows, pending };
}

export async function AdminClubsScreen() {
  const data = await loadData();
  return <AdminClubsScreenView data={data} />;
}
