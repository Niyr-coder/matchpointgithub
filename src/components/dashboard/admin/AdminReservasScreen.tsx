import { getServerClient } from "@/lib/db/client.server";
import { AdminReservasScreenView, type AdminReservationRow } from "./AdminReservasScreenView";

function parseRange(range: string): { startsAt: string; endsAt: string } {
  const m = /^[\[(]([^,]+),([^)\]]+)[\)\]]$/.exec(range);
  if (!m) return { startsAt: "", endsAt: "" };
  return {
    startsAt: new Date(m[1]).toISOString(),
    endsAt: new Date(m[2]).toISOString(),
  };
}

export async function AdminReservasScreen() {
  const supabase = await getServerClient();
  const [{ data: reservations }, { data: clubs }, { data: courts }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("reservations")
        .select("id,club_id,court_id,organizer_id,during,status,sport,source,created_at,cancellation_reason")
        .order("created_at", { ascending: false })
        .limit(120),
      supabase.from("clubs").select("id,name"),
      supabase.from("courts").select("id,name,code"),
      supabase.from("profiles").select("id,display_name,username"),
    ]);

  const clubName = new Map((clubs ?? []).map((c) => [c.id as string, c.name as string]));
  const courtName = new Map(
    (courts ?? []).map((c) => [
      c.id as string,
      ((c.name as string | null) || (c.code as string | null) || "Cancha") as string,
    ]),
  );
  const profileName = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      ((p.display_name as string | null) || (p.username as string | null) || "Usuario") as string,
    ]),
  );

  const rows: AdminReservationRow[] = (reservations ?? []).map((r) => {
    const { startsAt, endsAt } = parseRange(r.during as string);
    return {
      id: r.id as string,
      clubName: clubName.get(r.club_id as string) ?? "Club",
      courtName: courtName.get(r.court_id as string) ?? "Cancha",
      organizerName: profileName.get(r.organizer_id as string) ?? "Usuario",
      sport: r.sport as string,
      status: r.status as string,
      source: r.source as string,
      startsAt,
      endsAt,
      cancellationReason: (r.cancellation_reason as string | null) ?? null,
    };
  });

  return <AdminReservasScreenView rows={rows} />;
}
