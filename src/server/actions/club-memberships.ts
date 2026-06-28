"use server";

// Membresías VIP por club — server actions.
// Modelo mirror de MATCHPOINT+ scopeado a un club: el usuario COMPRA un tier
// (cuota recurrente que vence, pago sin PSP). El comprobante lo aprueba el
// OWNER/MANAGER del club (no el admin de plataforma). Una fila por (club,user)
// que se renueva extendiendo expires_at desde el vencimiento vigente.
// Ver docs/product/07-club-memberships.md.
import "server-only";

import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { requireClubPlanWithFlag } from "@/lib/auth/club-plan";
import { notify } from "@/server/notifications/dispatch";
import {
  SaveClubMembershipTierSchema,
  ClubMembershipTierIdSchema,
  RequestClubMembershipSchema,
  ClubMembershipIdSchema,
  RejectClubMembershipSchema,
  RevokeClubMembershipSchema,
  ClubIdSchema,
  MyClubMembershipsSchema,
} from "@/lib/schemas/club-memberships";
import { DEFAULT_MEMBERSHIP_TEMPLATE_KEY } from "@/lib/clubs/membership";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión");
  return user.id;
}

// Valida que el caller sea staff (owner/manager/admin) del club. Lanza si no.
async function assertClubStaff(clubId: string): Promise<void> {
  const supabase = await getServerClient();
  const { data, error } = await (supabase as any).rpc("mp_club_staff", { p_club_id: clubId });
  if (error) throw new MpError("CLUB_MEMBERSHIP.READ_FAILED", error.message, 500);
  if (!data) throw new AuthError("AUTH.ROLE_REQUIRED", "Solo el club gestiona sus membresías");
}

function monthsFromNow(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ── Tiers (gestión del club) ─────────────────────────────────────────────────
export async function getClubMembershipTiers(input: unknown): Promise<ActionResult<unknown[]>> {
  return runAction(ClubIdSchema, input, async ({ clubId }) => {
    const supabase = await getServerClient();
    const { data, error } = await (supabase as any)
      .from("club_membership_tiers")
      .select("id,club_id,name,description,price_cents,duration_months,discount_pct,benefits,card_design,sort_order,is_active")
      .eq("club_id", clubId)
      .order("sort_order", { ascending: true });
    if (error) throw new MpError("CLUB_MEMBERSHIP.READ_FAILED", error.message, 500);
    return (data ?? []) as unknown[];
  });
}

export async function saveClubMembershipTier(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(SaveClubMembershipTierSchema, input, async (d) => {
    await requireUserId();
    await assertClubStaff(d.clubId);
    const supabase = await getServerClient();
    if (!d.tierId) {
      await requireClubPlanWithFlag(supabase, d.clubId, "paywall_enforce_club_memberships", "pro");
    }
    const card_design = { templateKey: d.cardTemplateKey || DEFAULT_MEMBERSHIP_TEMPLATE_KEY, ...(d.cardAccent ? { accent: d.cardAccent } : {}) };
    const base: Record<string, unknown> = {
      name: d.name,
      description: d.description ?? null,
      price_cents: d.priceCents,
      duration_months: d.durationMonths,
      discount_pct: d.discountPct,
      benefits: d.benefits,
      card_design,
      updated_at: new Date().toISOString(),
    };
    if (d.sortOrder !== undefined) base.sort_order = d.sortOrder;
    if (d.isActive !== undefined) base.is_active = d.isActive;

    if (d.tierId) {
      const { data, error } = await (supabase as any)
        .from("club_membership_tiers")
        .update(base)
        .eq("id", d.tierId)
        .eq("club_id", d.clubId)
        .select("id")
        .single();
      if (error || !data) throw new MpError("CLUB_MEMBERSHIP.TIER_FAILED", error?.message ?? "No se pudo guardar", 500);
      return { id: data.id as string };
    }
    const { data, error } = await (supabase as any)
      .from("club_membership_tiers")
      .insert({ ...base, club_id: d.clubId })
      .select("id")
      .single();
    if (error || !data) throw new MpError("CLUB_MEMBERSHIP.TIER_FAILED", error?.message ?? "No se pudo crear", 500);
    return { id: data.id as string };
  });
}

export async function deleteClubMembershipTier(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ClubMembershipTierIdSchema, input, async ({ tierId }) => {
    await requireUserId();
    const supabase = await getServerClient();
    // RLS (cmt_write = mp_club_staff) gatea el delete por club.
    const { error } = await (supabase as any).from("club_membership_tiers").delete().eq("id", tierId);
    if (error) throw new MpError("CLUB_MEMBERSHIP.TIER_DELETE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Compra (usuario) ─────────────────────────────────────────────────────────
export async function requestClubMembership(
  input: unknown,
): Promise<ActionResult<{ transactionId: string; membershipId: string }>> {
  return runAction(RequestClubMembershipSchema, input, async ({ clubId, tierId }) => {
    const userId = await requireUserId();
    const admin = getAdminClient();

    const { data: tier } = await (admin as any)
      .from("club_membership_tiers")
      .select("id,club_id,name,price_cents,is_active")
      .eq("id", tierId)
      .maybeSingle();
    if (!tier || tier.club_id !== clubId) throw new MpError("CLUB_MEMBERSHIP.TIER_NOT_FOUND", "Membresía no encontrada", 404);
    if (!tier.is_active) throw new MpError("CLUB_MEMBERSHIP.TIER_INACTIVE", "Esa membresía no está disponible", 409);

    // ¿Ya tiene una membresía activa o pendiente en este club?
    const { data: existing } = await (admin as any)
      .from("club_memberships")
      .select("id,status")
      .eq("club_id", clubId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing && existing.status === "pending") {
      throw new MpError("CLUB_MEMBERSHIP.PENDING_EXISTS", "Ya tienes una compra pendiente en este club. Sube el comprobante.", 409);
    }

    await setAuditActor(admin, userId, "user");

    // 1. Transaction pending_proof (kind club_membership, ligada al club).
    const { data: tx, error: txErr } = await (admin as any)
      .from("transactions")
      .insert({
        club_id: clubId,
        kind: "club_membership",
        ref_id: null,
        customer_user_id: userId,
        amount_cents: tier.price_cents,
        currency: "USD",
        method: "transfer",
        status: "pending_proof",
        created_by: userId,
      })
      .select("id")
      .single();
    if (txErr || !tx) throw new MpError("CLUB_MEMBERSHIP.TX_FAILED", txErr?.message ?? "No se pudo crear el pago", 500);
    const transactionId = tx.id as string;

    // 2. Membership pending (una fila por club,user → upsert que reusa la previa).
    const { data: mem, error: memErr } = await (admin as any)
      .from("club_memberships")
      .upsert(
        { club_id: clubId, user_id: userId, tier_id: tierId, status: "pending", transaction_id: transactionId, cancelled_reason: null, updated_at: new Date().toISOString() },
        { onConflict: "club_id,user_id" },
      )
      .select("id")
      .single();
    if (memErr || !mem) throw new MpError("CLUB_MEMBERSHIP.CREATE_FAILED", memErr?.message ?? "No se pudo crear la membresía", 500);
    const membershipId = mem.id as string;

    // 3. ref_id de la tx → membership (para la cascada de aprobación).
    await (admin as any).from("transactions").update({ ref_id: membershipId }).eq("id", transactionId);

    // 4. Avisar al staff del club.
    const { data: name } = await (admin as any).from("profiles").select("display_name,username").eq("id", userId).maybeSingle();
    const memberName = name?.display_name ?? (name?.username ? `@${name.username}` : "Un usuario");
    const { data: staff } = await (admin as any)
      .from("role_assignments")
      .select("user_id,role")
      .eq("club_id", clubId)
      .in("role", ["owner", "manager"])
      .is("revoked_at", null);
    await Promise.all(
      ((staff ?? []) as Array<{ user_id: string; role: string }>).map((s) =>
        notify({
          userId: s.user_id,
          role: s.role as any,
          kind: "club_membership_requested",
          title: "Nueva solicitud de membresía",
          payload: { club_id: clubId, membership_id: membershipId, member_name: memberName, tier_name: tier.name },
        }),
      ),
    );

    return { transactionId, membershipId };
  });
}

// ── Aprobación / rechazo / revocación (club staff) ───────────────────────────
export async function approveClubMembership(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ClubMembershipIdSchema, input, async ({ membershipId }) => {
    const callerId = await requireUserId();
    const admin = getAdminClient();
    const { data: mem } = await (admin as any)
      .from("club_memberships")
      .select("id,club_id,user_id,tier_id,status,expires_at,member_no,transaction_id")
      .eq("id", membershipId)
      .maybeSingle();
    if (!mem) throw new MpError("CLUB_MEMBERSHIP.NOT_FOUND", "Membresía no encontrada", 404);
    await assertClubStaff(mem.club_id as string);

    const { data: tier } = await (admin as any)
      .from("club_membership_tiers")
      .select("name,duration_months")
      .eq("id", mem.tier_id)
      .maybeSingle();
    const durationMonths = (tier?.duration_months as number) ?? 1;

    // Renovación: extiende desde el vencimiento vigente si sigue en el futuro.
    const now = new Date();
    const base = mem.expires_at && new Date(mem.expires_at) > now ? new Date(mem.expires_at) : now;
    const expiresAt = monthsFromNow(base, durationMonths);

    // member_no correlativo por club (se asigna una sola vez).
    let memberNo = mem.member_no as number | null;
    if (memberNo == null) {
      const { data: maxRow } = await (admin as any)
        .from("club_memberships")
        .select("member_no")
        .eq("club_id", mem.club_id)
        .not("member_no", "is", null)
        .order("member_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      memberNo = ((maxRow?.member_no as number) ?? 0) + 1;
    }

    await setAuditActor(admin, callerId, "owner");

    if (mem.transaction_id) {
      await (admin as any).from("transactions").update({ status: "captured", proof_reviewed_at: now.toISOString(), proof_reviewed_by: callerId }).eq("id", mem.transaction_id);
    }
    const { error } = await (admin as any)
      .from("club_memberships")
      .update({ status: "active", member_no: memberNo, starts_at: now.toISOString(), expires_at: expiresAt.toISOString(), updated_at: now.toISOString() })
      .eq("id", membershipId);
    if (error) throw new MpError("CLUB_MEMBERSHIP.APPROVE_FAILED", error.message, 500);

    const { data: club } = await (admin as any).from("clubs").select("name").eq("id", mem.club_id).maybeSingle();
    await (admin as any).rpc("fn_club_comms_sync_user", {
      p_club_id: mem.club_id,
      p_user_id: mem.user_id,
    });
    const { data: communityConv } = await admin
      .from("conversations")
      .select("id")
      .eq("club_id", mem.club_id as string)
      .eq("kind", "club_channel")
      .maybeSingle();
    const communityConvId = (communityConv?.id as string | undefined) ?? null;
    await notify({
      userId: mem.user_id as string,
      role: "user",
      kind: "club_membership_activated",
      title: "Tu membresía VIP está activa",
      payload: {
        club_id: mem.club_id,
        membership_id: membershipId,
        tier_name: tier?.name ?? "VIP",
        club_name: club?.name ?? "",
        expires_label: expiresAt.toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }),
        conversation_id: communityConvId,
      },
    });
    if (communityConvId) {
      await notify({
        userId: mem.user_id as string,
        role: "user",
        kind: "club_membership_chat_welcome",
        title: "Ya estás en el chat del club",
        body: `Entra a la comunidad de ${club?.name ?? "tu club"}`,
        payload: {
          club_id: mem.club_id,
          conversation_id: communityConvId,
          club_name: club?.name ?? "",
        },
      });
    }
    return { ok: true as const };
  });
}

export async function rejectClubMembership(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RejectClubMembershipSchema, input, async ({ membershipId, reason }) => {
    const callerId = await requireUserId();
    const admin = getAdminClient();
    const { data: mem } = await (admin as any)
      .from("club_memberships")
      .select("id,club_id,user_id,transaction_id")
      .eq("id", membershipId)
      .maybeSingle();
    if (!mem) throw new MpError("CLUB_MEMBERSHIP.NOT_FOUND", "Membresía no encontrada", 404);
    await assertClubStaff(mem.club_id as string);
    await setAuditActor(admin, callerId, "owner");

    // Devuelve la tx a pending_proof (el usuario re-sube comprobante).
    if (mem.transaction_id) {
      await (admin as any)
        .from("transactions")
        .update({ status: "pending_proof", proof_url: null, proof_rejection_reason: reason ?? "Comprobante rechazado por el club" })
        .eq("id", mem.transaction_id);
      await notify({
        userId: mem.user_id as string,
        role: "user",
        kind: "payment_proof_rejected",
        title: "Comprobante de pago rechazado",
        payload: { rejection_reason: reason ?? "El club rechazó tu comprobante. Sube uno nuevo." },
      });
    }
    return { ok: true as const };
  });
}

export async function revokeClubMembership(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(RevokeClubMembershipSchema, input, async ({ membershipId, reason }) => {
    const callerId = await requireUserId();
    const admin = getAdminClient();
    const { data: mem } = await (admin as any)
      .from("club_memberships")
      .select("id,club_id")
      .eq("id", membershipId)
      .maybeSingle();
    if (!mem) throw new MpError("CLUB_MEMBERSHIP.NOT_FOUND", "Membresía no encontrada", 404);
    await assertClubStaff(mem.club_id as string);
    await setAuditActor(admin, callerId, "owner");
    const { error } = await (admin as any)
      .from("club_memberships")
      .update({ status: "cancelled", cancelled_reason: reason ?? null, updated_at: new Date().toISOString() })
      .eq("id", membershipId);
    if (error) throw new MpError("CLUB_MEMBERSHIP.REVOKE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

// ── Lecturas ─────────────────────────────────────────────────────────────────
// Membresías del usuario (para "Mis membresías").
export async function getMyClubMemberships(input: unknown): Promise<ActionResult<unknown[]>> {
  return runAction(MyClubMembershipsSchema, input ?? {}, async () => {
    const userId = await requireUserId();
    const supabase = await getServerClient();
    const { data, error } = await (supabase as any)
      .from("club_memberships")
      .select("id,club_id,status,member_no,starts_at,expires_at,tier_id,clubs(name,slug,city),club_membership_tiers(name,price_cents,duration_months,discount_pct,benefits,card_design)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new MpError("CLUB_MEMBERSHIP.READ_FAILED", error.message, 500);
    return (data ?? []) as unknown[];
  });
}

// Oversight admin: membresías de TODOS los clubes (governance).
export async function adminListClubMemberships(input: unknown): Promise<ActionResult<unknown[]>> {
  return runAction(MyClubMembershipsSchema, input ?? {}, async () => {
    const userId = await requireUserId();
    const admin = getAdminClient();
    const { data: isAdmin } = await (admin as any)
      .from("role_assignments").select("role").eq("user_id", userId).eq("role", "admin").is("revoked_at", null).maybeSingle();
    if (!isAdmin) throw new AuthError("AUTH.ROLE_REQUIRED", "Admin required");
    const { data, error } = await (admin as any)
      .from("club_memberships")
      .select("id,status,member_no,expires_at,created_at,clubs(name,city),profiles(display_name,username),club_membership_tiers(name,price_cents,duration_months)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new MpError("CLUB_MEMBERSHIP.READ_FAILED", error.message, 500);
    return (data ?? []) as unknown[];
  });
}

// Miembros de un club (para la gestión del staff).
export async function getClubMembers(input: unknown): Promise<ActionResult<unknown[]>> {
  return runAction(ClubIdSchema, input, async ({ clubId }) => {
    await requireUserId();
    await assertClubStaff(clubId);
    const supabase = await getServerClient();
    const { data, error } = await (supabase as any)
      .from("club_memberships")
      .select("id,user_id,status,member_no,starts_at,expires_at,tier_id,profiles(display_name,username),club_membership_tiers(name)")
      .eq("club_id", clubId)
      .order("member_no", { ascending: true, nullsFirst: false });
    if (error) throw new MpError("CLUB_MEMBERSHIP.READ_FAILED", error.message, 500);
    return (data ?? []) as unknown[];
  });
}

// W2 (MAT-5): cola de aprobación de pagos de membresía para el club staff.
// Espejo de listPendingPlanSubscriptionsAdmin (MP+) pero scopeado a un club y
// gateado por proof_submitted. Si la membresía está pending pero el usuario
// todavía no subió comprobante, no aparece — owner no tiene nada que aprobar.
const SIGNED_URL_TTL = 60 * 10; // 10 min

export type PendingClubMembershipPaymentRow = {
  membershipId: string;
  userId: string;
  displayName: string;
  username: string | null;
  tierId: string;
  tierName: string;
  durationMonths: number;
  priceCents: number;
  createdAt: string;
  transactionId: string | null;
  amountCents: number | null;
  currency: string | null;
  transactionStatus: string | null;
  proofUrl: string | null;
  proofSignedUrl: string | null;
  proofSubmittedAt: string | null;
};

export async function listPendingClubMembershipPaymentsForClub(
  input: unknown,
): Promise<ActionResult<PendingClubMembershipPaymentRow[]>> {
  return runAction(ClubIdSchema, input, async ({ clubId }) => {
    await requireUserId();
    await assertClubStaff(clubId);
    const admin = getAdminClient();

    const { data: mems, error } = await (admin as any)
      .from("club_memberships")
      .select(
        "id,user_id,tier_id,status,transaction_id,created_at,club_membership_tiers(name,price_cents,duration_months)",
      )
      .eq("club_id", clubId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new MpError("CLUB_MEMBERSHIP.READ_FAILED", error.message, 500);
    const rows = (mems ?? []) as Array<Record<string, any>>;

    const txIds = rows
      .map((r) => r.transaction_id as string | null)
      .filter((v): v is string => !!v);
    const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));

    const [{ data: txs }, { data: profiles }] = await Promise.all([
      txIds.length
        ? (admin as any)
            .from("transactions")
            .select("id,amount_cents,currency,status,proof_url,proof_submitted_at")
            .in("id", txIds)
        : Promise.resolve({ data: [] as Array<Record<string, any>> }),
      userIds.length
        ? (admin as any)
            .from("profiles")
            .select("id,display_name,username")
            .in("id", userIds)
        : Promise.resolve({ data: [] as Array<Record<string, any>> }),
    ]);

    const txMap = new Map<string, Record<string, any>>();
    for (const t of (txs ?? []) as Array<Record<string, any>>) {
      txMap.set(t.id as string, t);
    }
    const profMap = new Map<string, { displayName: string; username: string | null }>();
    for (const p of (profiles ?? []) as Array<Record<string, any>>) {
      profMap.set(p.id as string, {
        displayName: (p.display_name as string) ?? "Sin nombre",
        username: (p.username as string | null) ?? null,
      });
    }

    // Solo memberships con comprobante subido (proof_submitted): si el usuario
    // todavía no subió el comprobante, el owner no tiene nada que aprobar.
    const visible = rows.filter((r) => {
      const txId = r.transaction_id as string | null;
      if (!txId) return false;
      const tx = txMap.get(txId);
      return tx?.status === "proof_submitted";
    });

    const result: PendingClubMembershipPaymentRow[] = await Promise.all(
      visible.map(async (r) => {
        const userId = r.user_id as string;
        const tier = r.club_membership_tiers ?? {};
        const txId = (r.transaction_id as string | null) ?? null;
        const tx = txId ? txMap.get(txId) ?? null : null;
        const prof = profMap.get(userId);
        let signed: string | null = null;
        const proofUrl = (tx?.proof_url as string | null) ?? null;
        if (proofUrl) {
          const { data: s } = await admin.storage
            .from("payment_proofs")
            .createSignedUrl(proofUrl, SIGNED_URL_TTL);
          signed = s?.signedUrl ?? null;
        }
        return {
          membershipId: r.id as string,
          userId,
          displayName: prof?.displayName ?? "Sin nombre",
          username: prof?.username ?? null,
          tierId: r.tier_id as string,
          tierName: (tier.name as string) ?? "—",
          durationMonths: (tier.duration_months as number) ?? 1,
          priceCents: (tier.price_cents as number) ?? 0,
          createdAt: r.created_at as string,
          transactionId: txId,
          amountCents: (tx?.amount_cents as number | null) ?? null,
          currency: (tx?.currency as string | null) ?? null,
          transactionStatus: (tx?.status as string | null) ?? null,
          proofUrl,
          proofSignedUrl: signed,
          proofSubmittedAt: (tx?.proof_submitted_at as string | null) ?? null,
        };
      }),
    );

    return result;
  });
}

// W2 (MAT-5): alias semántico que matchea el nombre de la acción descrita en el
// plan ("approveClubMembershipPayment"). Internamente reusa
// approveClubMembership: ambos activan la membresía y capturan la transacción.
export const approveClubMembershipPayment = approveClubMembership;
