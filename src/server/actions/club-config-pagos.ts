"use server";

import "server-only";

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type {
  PagosData,
  PayoutAccount,
  PayoutSchedule,
  PaymentMethods,
} from "@/components/dashboard/owner/config-sections/PagosSection";

async function requireClubManagerUserId(clubId: string): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Sign in required");
  const { data: roles } = await supabase
    .from("role_assignments")
    .select("role,club_id")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  const ok = (roles ?? []).some(
    (r) =>
      r.role === "admin" ||
      (r.club_id === clubId && (r.role === "owner" || r.role === "manager")),
  );
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff role required");
  return user.id;
}

const DEFAULT_METHODS: PaymentMethods = {
  transfer: true,
  deuna: true,
  wallet: true,
  cash: true,
  card: false,
  credit_mp: false,
};

const COMMISSION_PCT = 10;

function mapAccount(row: Record<string, unknown>): PayoutAccount {
  return {
    id: row.id as string,
    bankCode: (row.bank_code as string) ?? "",
    bankName: (row.bank_name as string) ?? "",
    accountLast4: (row.account_last4 as string) ?? "",
    holderName: (row.holder_name as string) ?? "",
    accountType: (row.account_type as "savings" | "checking") ?? "savings",
    isPrimary: Boolean(row.is_primary),
    status: (row.status as "active" | "backup" | "inactive") ?? "backup",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPagosData(supabase: SupabaseClient<any>, clubId: string): Promise<PagosData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [accountsRes, settingsRes] = await Promise.all([
    db
      .from("club_payout_accounts")
      .select("*")
      .eq("club_id", clubId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    db
      .from("club_settings")
      .select("payout_schedule,payment_methods,min_payout_cents")
      .eq("club_id", clubId)
      .maybeSingle(),
  ]);

  const accounts = ((accountsRes.data ?? []) as Record<string, unknown>[]).map(mapAccount);
  const settings = (settingsRes.data ?? null) as Record<string, unknown> | null;

  const schedule = ((settings?.payout_schedule as PayoutSchedule | null) ?? "weekly") as PayoutSchedule;
  const paymentMethods = {
    ...DEFAULT_METHODS,
    ...((settings?.payment_methods as Partial<PaymentMethods> | null) ?? {}),
  };
  const minPayoutCents = (settings?.min_payout_cents as number | null) ?? 5000;

  // Volumen del mes desde transactions (status=captured) y comisión = vol * pct.
  const firstOfMonth = new Date();
  firstOfMonth.setUTCDate(1);
  firstOfMonth.setUTCHours(0, 0, 0, 0);
  let monthVolumeCents = 0;
  try {
    const { data: txs } = await db
      .from("transactions")
      .select("amount_cents")
      .eq("club_id", clubId)
      .eq("status", "captured")
      .gte("created_at", firstOfMonth.toISOString());
    monthVolumeCents = ((txs ?? []) as Array<{ amount_cents: number | null }>).reduce(
      (acc, r) => acc + (r.amount_cents ?? 0),
      0,
    );
  } catch {
    monthVolumeCents = 0;
  }
  const monthCommissionCents = Math.round(monthVolumeCents * (COMMISSION_PCT / 100));

  return {
    clubId,
    accounts,
    schedule,
    minPayoutCents,
    paymentMethods,
    commissionPct: COMMISSION_PCT,
    monthVolumeCents,
    monthCommissionCents,
  };
}

const AddAccountSchema = z.object({
  clubId: UuidSchema,
  bankCode: z.string().min(1).max(8),
  bankName: z.string().min(1).max(80),
  accountLast4: z.string().regex(/^\d{4}$/, "Deben ser 4 dígitos"),
  holderName: z.string().min(1).max(120),
  accountType: z.enum(["savings", "checking"]),
});

export async function addPayoutAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(AddAccountSchema, input, async (data) => {
    const userId = await requireClubManagerUserId(data.clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const { data: existing } = await db
      .from("club_payout_accounts")
      .select("id")
      .eq("club_id", data.clubId)
      .limit(1);
    const isFirst = ((existing ?? []) as unknown[]).length === 0;

    const { data: row, error } = await db
      .from("club_payout_accounts")
      .insert({
        club_id: data.clubId,
        bank_code: data.bankCode,
        bank_name: data.bankName,
        account_last4: data.accountLast4,
        holder_name: data.holderName,
        account_type: data.accountType,
        is_primary: isFirst,
        status: isFirst ? "active" : "backup",
      })
      .select("id")
      .single();
    if (error) throw new MpError("PAYOUT.ACCOUNT_CREATE_FAILED", error.message, 500);
    return { id: (row as { id: string }).id };
  });
}

const IdAndClubSchema = z.object({ clubId: UuidSchema, accountId: UuidSchema });

export async function setPrimaryAccount(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(IdAndClubSchema, input, async ({ clubId, accountId }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const { error: e1 } = await db
      .from("club_payout_accounts")
      .update({ is_primary: false, status: "backup" })
      .eq("club_id", clubId)
      .eq("is_primary", true);
    if (e1) throw new MpError("PAYOUT.UNSET_PRIMARY_FAILED", e1.message, 500);

    const { error: e2 } = await db
      .from("club_payout_accounts")
      .update({ is_primary: true, status: "active" })
      .eq("id", accountId)
      .eq("club_id", clubId);
    if (e2) throw new MpError("PAYOUT.SET_PRIMARY_FAILED", e2.message, 500);
    return { ok: true as const };
  });
}

export async function removePayoutAccount(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(IdAndClubSchema, input, async ({ clubId, accountId }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const { data: row } = await db
      .from("club_payout_accounts")
      .select("is_primary")
      .eq("id", accountId)
      .eq("club_id", clubId)
      .maybeSingle();
    if (!row) throw new MpError("PAYOUT.ACCOUNT_NOT_FOUND", "Cuenta no encontrada", 404);
    if ((row as { is_primary: boolean }).is_primary) {
      throw new MpError(
        "PAYOUT.PRIMARY_CANNOT_DELETE",
        "No puedes eliminar la cuenta primaria; activa otra primero",
        409,
      );
    }
    const { error } = await db
      .from("club_payout_accounts")
      .delete()
      .eq("id", accountId)
      .eq("club_id", clubId);
    if (error) throw new MpError("PAYOUT.ACCOUNT_DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

const ScheduleSchema = z.object({
  clubId: UuidSchema,
  schedule: z.enum(["daily", "weekly", "biw", "manual"]),
});

export async function updatePayoutSchedule(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ScheduleSchema, input, async ({ clubId, schedule }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;
    const { error } = await db
      .from("club_settings")
      .upsert({ club_id: clubId, payout_schedule: schedule }, { onConflict: "club_id" });
    if (error) throw new MpError("PAYOUT.SCHEDULE_UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

const MethodKeyEnum = z.enum(["transfer", "deuna", "wallet", "cash", "card", "credit_mp"]);
const MethodsSchema = z.object({
  clubId: UuidSchema,
  key: MethodKeyEnum,
  enabled: z.boolean(),
});

export async function updatePaymentMethods(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(MethodsSchema, input, async ({ clubId, key, enabled }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    const { data: current } = await db
      .from("club_settings")
      .select("payment_methods")
      .eq("club_id", clubId)
      .maybeSingle();
    const currentRow = current as { payment_methods: Partial<PaymentMethods> | null } | null;
    const prev = {
      ...DEFAULT_METHODS,
      ...((currentRow?.payment_methods ?? {}) as Partial<PaymentMethods>),
    };
    const next = { ...prev, [key]: enabled };

    const { error } = await db
      .from("club_settings")
      .upsert({ club_id: clubId, payment_methods: next }, { onConflict: "club_id" });
    if (error) throw new MpError("PAYOUT.METHODS_UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}
