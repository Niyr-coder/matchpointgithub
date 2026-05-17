// Server: KPIs financieros del club + barras 30 días + desglose por kind.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { ClubFinanzasScreenView, type FinanzasData } from "./ClubFinanzasScreenView";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfPrevMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}
function nDaysAgo(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - n);
  return x;
}

async function loadData(): Promise<FinanzasData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return {
      clubId: null,
      revenueMonthCents: 0,
      revenueDeltaCents: 0,
      employeesCount: 0,
      breakdownCents: { reservations: 0, events: 0, classes: 0, proshop: 0 },
      bars30: Array(30).fill(0),
    };
  }

  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfPrevMonth(now);
  const thirtyAgo = nDaysAgo(now, 29);

  const [{ data: txMonth }, { data: txPrev }, { data: tx30 }, { count: staffCount }] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount_cents,kind")
      .eq("club_id", clubId)
      .eq("status", "captured")
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents")
      .eq("club_id", clubId)
      .eq("status", "captured")
      .gte("created_at", prevMonthStart.toISOString())
      .lt("created_at", monthStart.toISOString()),
    supabase
      .from("transactions")
      .select("amount_cents,created_at")
      .eq("club_id", clubId)
      .eq("status", "captured")
      .gte("created_at", thirtyAgo.toISOString()),
    supabase
      .from("role_assignments")
      .select("user_id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .in("role", ["employee", "manager"])
      .is("revoked_at", null),
  ]);

  const revenueMonthCents = (txMonth ?? []).reduce(
    (s, r) => s + ((r.amount_cents as number) ?? 0),
    0,
  );
  const revenuePrevCents = (txPrev ?? []).reduce(
    (s, r) => s + ((r.amount_cents as number) ?? 0),
    0,
  );

  const breakdownCents = { reservations: 0, events: 0, classes: 0, proshop: 0 };
  for (const r of txMonth ?? []) {
    const amt = (r.amount_cents as number) ?? 0;
    const k = r.kind as string;
    if (k === "reservation") breakdownCents.reservations += amt;
    else if (k === "event" || k === "tournament") breakdownCents.events += amt;
    else if (k === "class") breakdownCents.classes += amt;
    else if (k === "proshop_sale") breakdownCents.proshop += amt;
  }

  const bars30 = Array(30).fill(0) as number[];
  for (const r of tx30 ?? []) {
    const d = new Date(r.created_at as string);
    d.setHours(0, 0, 0, 0);
    const idx = Math.floor((d.getTime() - thirtyAgo.getTime()) / 86400000);
    if (idx >= 0 && idx < 30) {
      bars30[idx] += ((r.amount_cents as number) ?? 0) / 100;
    }
  }

  return {
    clubId,
    revenueMonthCents,
    revenueDeltaCents: revenueMonthCents - revenuePrevCents,
    employeesCount: staffCount ?? 0,
    breakdownCents,
    bars30,
  };
}

export async function ClubFinanzasScreen() {
  const data = await loadData();
  return <ClubFinanzasScreenView data={data} />;
}
