"use server";

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

type RawClub = { id: string; name: string | null; city: string | null };
type RawProfile = { id: string; display_name: string | null; username: string | null };
type RawWalkin = {
  id: string;
  club_id: string;
  customer_name: string | null;
  party_size: number | null;
  duration_minutes: number | null;
  created_at: string;
  created_reservation_id: string | null;
  attended_by: string | null;
  sport: string | null;
};
type RawCheckin = {
  id: string;
  club_id: string;
  reservation_id: string | null;
  class_session_id: string | null;
  method: string;
  scanned_by: string | null;
  scanned_at: string;
};
type RawCashSession = {
  id: string;
  club_id: string;
  opened_by: string | null;
  opened_at: string;
  opening_float_cents: number | null;
  status: string;
};
type RawTransaction = {
  id: string;
  club_id: string;
  cash_session_id: string | null;
  kind: string;
  amount_cents: number | null;
  currency: string | null;
  method: string;
  status: string;
  customer_user_id: string | null;
  customer_name: string | null;
  created_by: string | null;
  created_at: string;
};
type RawSale = {
  id: string;
  club_id: string;
  customer_user_id: string | null;
  total_cents: number | null;
  currency: string | null;
  sold_by: string | null;
  created_at: string;
};
type RawProduct = {
  id: string;
  club_id: string | null;
  name: string | null;
  sku: string | null;
  stock: number | null;
  low_stock_threshold: number | null;
  active: boolean | null;
};

export type AdminReceptionClubRow = {
  clubId: string;
  clubName: string;
  city: string;
  activeWalkins: number;
  checkinsToday: number;
  openCashSessions: number;
  capturedTodayCents: number;
  proshopTodayCents: number;
  lowStockProducts: number;
};

export type AdminReceptionOverview = {
  generatedAt: string;
  kpis: {
    activeWalkins: number;
    checkinsToday: number;
    openCashSessions: number;
    capturedTodayCents: number;
    proshopTodayCents: number;
    lowStockProducts: number;
  };
  clubs: AdminReceptionClubRow[];
  activeWalkins: Array<{
    id: string;
    club: string;
    customer: string;
    partySize: number;
    durationMinutes: number;
    waitMinutes: number;
    sport: string | null;
  }>;
  recentCheckins: Array<{
    id: string;
    club: string;
    target: string;
    method: string;
    scannedBy: string;
    scannedAt: string;
  }>;
  openCashSessions: Array<{
    id: string;
    club: string;
    openedBy: string;
    openedAt: string;
    openingFloatCents: number;
    cashCapturedCents: number;
  }>;
  recentSales: Array<{
    id: string;
    club: string;
    customer: string;
    totalCents: number;
    currency: string;
    soldBy: string;
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    club: string;
    name: string;
    sku: string | null;
    stock: number;
    threshold: number;
  }>;
};

async function requireAdminUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");

  const { data } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();

  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Se requiere rol admin");
  return user.id;
}

function displayName(profiles: Map<string, string>, id: string | null | undefined, fallback = "—"): string {
  if (!id) return fallback;
  return profiles.get(id) ?? fallback;
}

function shortRef(id: string | null | undefined, prefix: string): string {
  if (!id) return "Sin referencia";
  return `${prefix}-${id.slice(0, 6).toUpperCase()}`;
}

function minutesSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60000));
}

function clubLabel(clubs: Map<string, { name: string; city: string }>, clubId: string | null | undefined): string {
  if (!clubId) return "Club";
  return clubs.get(clubId)?.name ?? "Club";
}

function assertQuery(error: { message?: string } | null | undefined, code: string): void {
  if (error) throw new MpError(code, error.message ?? "No se pudo cargar recepción", 500);
}

export async function listAdminReceptionOverview(): Promise<ActionResult<AdminReceptionOverview>> {
  return runAction(z.object({}).optional(), undefined, async () => {
    await requireAdminUserId();
    const admin = getAdminClient() as unknown as LooseClient;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayIso = todayStart.toISOString();

    const [
      walkinsRes,
      checkinsRes,
      cashSessionsRes,
      transactionsRes,
      salesRes,
      productsRes,
      clubsRes,
    ] = await Promise.all([
      admin
        .from("walkins")
        .select("id,club_id,customer_name,party_size,duration_minutes,created_at,created_reservation_id,attended_by,sport")
        .gte("created_at", todayIso)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("check_ins")
        .select("id,club_id,reservation_id,class_session_id,method,scanned_by,scanned_at")
        .gte("scanned_at", todayIso)
        .order("scanned_at", { ascending: false })
        .limit(100),
      admin
        .from("cash_sessions")
        .select("id,club_id,opened_by,opened_at,opening_float_cents,status")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(100),
      admin
        .from("transactions")
        .select("id,club_id,cash_session_id,kind,amount_cents,currency,method,status,customer_user_id,customer_name,created_by,created_at")
        .gte("created_at", todayIso)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("sales")
        .select("id,club_id,customer_user_id,total_cents,currency,sold_by,created_at")
        .gte("created_at", todayIso)
        .order("created_at", { ascending: false })
        .limit(80),
      admin
        .from("products")
        .select("id,club_id,name,sku,stock,low_stock_threshold,active")
        .eq("active", true)
        .order("stock", { ascending: true })
        .limit(120),
      admin.from("clubs").select("id,name,city").eq("status", "active").limit(500),
    ]);

    assertQuery(walkinsRes.error, "ADMIN_RECEPTION.WALKINS_FAILED");
    assertQuery(checkinsRes.error, "ADMIN_RECEPTION.CHECKINS_FAILED");
    assertQuery(cashSessionsRes.error, "ADMIN_RECEPTION.CASH_FAILED");
    assertQuery(transactionsRes.error, "ADMIN_RECEPTION.TRANSACTIONS_FAILED");
    assertQuery(salesRes.error, "ADMIN_RECEPTION.SALES_FAILED");
    assertQuery(productsRes.error, "ADMIN_RECEPTION.PRODUCTS_FAILED");
    assertQuery(clubsRes.error, "ADMIN_RECEPTION.CLUBS_FAILED");

    const walkins = ((walkinsRes.data ?? []) as RawWalkin[]).filter(Boolean);
    const activeWalkins = walkins.filter((w) => !w.created_reservation_id);
    const checkins = ((checkinsRes.data ?? []) as RawCheckin[]).filter(Boolean);
    const cashSessions = ((cashSessionsRes.data ?? []) as RawCashSession[]).filter(Boolean);
    const transactions = ((transactionsRes.data ?? []) as RawTransaction[]).filter(Boolean);
    const sales = ((salesRes.data ?? []) as RawSale[]).filter(Boolean);
    const lowStockProducts = ((productsRes.data ?? []) as RawProduct[])
      .filter((p) => p.active !== false)
      .filter((p) => (p.stock ?? 0) <= (p.low_stock_threshold ?? 0));

    const clubMap = new Map<string, { name: string; city: string }>();
    for (const c of (clubsRes.data ?? []) as RawClub[]) {
      clubMap.set(c.id, { name: c.name ?? "Club", city: c.city ?? "—" });
    }

    const profileIds = new Set<string>();
    for (const w of activeWalkins) if (w.attended_by) profileIds.add(w.attended_by);
    for (const c of checkins) if (c.scanned_by) profileIds.add(c.scanned_by);
    for (const s of cashSessions) if (s.opened_by) profileIds.add(s.opened_by);
    for (const s of sales) {
      if (s.sold_by) profileIds.add(s.sold_by);
      if (s.customer_user_id) profileIds.add(s.customer_user_id);
    }
    for (const t of transactions) {
      if (t.created_by) profileIds.add(t.created_by);
      if (t.customer_user_id) profileIds.add(t.customer_user_id);
    }

    const profilesRes =
      profileIds.size > 0
        ? await admin.from("profiles").select("id,display_name,username").in("id", Array.from(profileIds))
        : { data: [], error: null };
    assertQuery(profilesRes.error, "ADMIN_RECEPTION.PROFILES_FAILED");
    const profileMap = new Map<string, string>();
    for (const p of (profilesRes.data ?? []) as RawProfile[]) {
      profileMap.set(p.id, p.display_name ?? p.username ?? "Usuario");
    }

    const byClub = new Map<string, AdminReceptionClubRow>();
    const ensureClub = (clubId: string): AdminReceptionClubRow => {
      const existing = byClub.get(clubId);
      if (existing) return existing;
      const meta = clubMap.get(clubId);
      const row: AdminReceptionClubRow = {
        clubId,
        clubName: meta?.name ?? "Club",
        city: meta?.city ?? "—",
        activeWalkins: 0,
        checkinsToday: 0,
        openCashSessions: 0,
        capturedTodayCents: 0,
        proshopTodayCents: 0,
        lowStockProducts: 0,
      };
      byClub.set(clubId, row);
      return row;
    };

    for (const w of activeWalkins) ensureClub(w.club_id).activeWalkins += 1;
    for (const c of checkins) ensureClub(c.club_id).checkinsToday += 1;
    for (const s of cashSessions) ensureClub(s.club_id).openCashSessions += 1;
    for (const t of transactions) {
      if (t.status !== "captured") continue;
      const row = ensureClub(t.club_id);
      row.capturedTodayCents += t.amount_cents ?? 0;
      if (t.kind === "proshop_sale") row.proshopTodayCents += t.amount_cents ?? 0;
    }
    for (const p of lowStockProducts) {
      if (p.club_id) ensureClub(p.club_id).lowStockProducts += 1;
    }

    const openSessionIds = new Set(cashSessions.map((s) => s.id));
    const cashBySession = new Map<string, number>();
    for (const t of transactions) {
      if (!t.cash_session_id || !openSessionIds.has(t.cash_session_id)) continue;
      if (t.status !== "captured" || t.method !== "cash") continue;
      cashBySession.set(t.cash_session_id, (cashBySession.get(t.cash_session_id) ?? 0) + (t.amount_cents ?? 0));
    }

    return {
      generatedAt: now.toISOString(),
      kpis: {
        activeWalkins: activeWalkins.length,
        checkinsToday: checkins.length,
        openCashSessions: cashSessions.length,
        capturedTodayCents: transactions
          .filter((t) => t.status === "captured")
          .reduce((sum, t) => sum + (t.amount_cents ?? 0), 0),
        proshopTodayCents: transactions
          .filter((t) => t.status === "captured" && t.kind === "proshop_sale")
          .reduce((sum, t) => sum + (t.amount_cents ?? 0), 0),
        lowStockProducts: lowStockProducts.length,
      },
      clubs: Array.from(byClub.values()).sort((a, b) => {
        const scoreA = a.activeWalkins * 5 + a.openCashSessions * 2 + a.lowStockProducts;
        const scoreB = b.activeWalkins * 5 + b.openCashSessions * 2 + b.lowStockProducts;
        return scoreB - scoreA || a.clubName.localeCompare(b.clubName);
      }),
      activeWalkins: activeWalkins.slice(0, 12).map((w) => ({
        id: w.id,
        club: clubLabel(clubMap, w.club_id),
        customer: w.customer_name ?? "Walk-in",
        partySize: w.party_size ?? 1,
        durationMinutes: w.duration_minutes ?? 60,
        waitMinutes: minutesSince(w.created_at, now),
        sport: w.sport,
      })),
      recentCheckins: checkins.slice(0, 12).map((c) => ({
        id: c.id,
        club: clubLabel(clubMap, c.club_id),
        target: c.reservation_id
          ? shortRef(c.reservation_id, "RV")
          : c.class_session_id
            ? shortRef(c.class_session_id, "CL")
            : "Sin referencia",
        method: c.method,
        scannedBy: displayName(profileMap, c.scanned_by, "Recepción"),
        scannedAt: c.scanned_at,
      })),
      openCashSessions: cashSessions.slice(0, 12).map((s) => ({
        id: s.id,
        club: clubLabel(clubMap, s.club_id),
        openedBy: displayName(profileMap, s.opened_by, "Recepción"),
        openedAt: s.opened_at,
        openingFloatCents: s.opening_float_cents ?? 0,
        cashCapturedCents: cashBySession.get(s.id) ?? 0,
      })),
      recentSales: sales.slice(0, 12).map((s) => ({
        id: s.id,
        club: clubLabel(clubMap, s.club_id),
        customer: displayName(profileMap, s.customer_user_id, "Walk-in"),
        totalCents: s.total_cents ?? 0,
        currency: s.currency ?? "USD",
        soldBy: displayName(profileMap, s.sold_by, "Recepción"),
        createdAt: s.created_at,
      })),
      lowStockProducts: lowStockProducts.slice(0, 12).map((p) => ({
        id: p.id,
        club: clubLabel(clubMap, p.club_id),
        name: p.name ?? "Producto",
        sku: p.sku,
        stock: p.stock ?? 0,
        threshold: p.low_stock_threshold ?? 0,
      })),
    };
  });
}
