"use server";

// "Busco partido" (match seeks / LFG).
// Un jugador publica un aviso buscando rival; otros se postulan; el autor
// acepta a uno → se crea un match (reusando createMatch). El chat del partido
// lo crea el trigger fn_create_match_channel (mig 118) al insertarse el match.
//
// Gate: todo pasa por el feature flag `match_seeks_enabled` (mig 120). Mientras
// esté apagado, las actions devuelven MATCH_SEEK.DISABLED.
//
// Ver docs/product/03-match-seeks.md.
import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { getProfileSummary } from "@/lib/auth/profile";
import { notify } from "@/server/notifications/dispatch";
import { createMatch } from "@/server/actions/matches";
import {
  AcceptApplicantSchema,
  ApplyToMatchSeekSchema,
  CancelMatchSeekSchema,
  CreateMatchSeekSchema,
  ListMatchSeeksParamsSchema,
  UpdateMatchSeekSchema,
  WithdrawApplicationSchema,
  RespondMatchSeekPartnerSchema,
  type MatchSeek,
  type MatchSeekApplication,
} from "@/lib/schemas/match-seeks";

// Los tipos generados de Supabase aún no incluyen match_seeks / match_seek_-
// applications (se regeneran al aplicar las migrations 117+). Shim laxo igual
// que en matches.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const DEFAULT_EXPIRY_DAYS = 7;
const FALLBACK_MAX_OPEN = 5;

async function requireUserId(): Promise<string> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AuthError("AUTH.UNAUTHENTICATED", "Inicia sesión para continuar");
  return user.id;
}

// Gate por feature flag. Lanza si el feature está apagado para este usuario.
async function assertFeatureEnabled(): Promise<void> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("fn_my_effective_flags");
  if (error) throw new MpError("MATCH_SEEK.FLAG_ERROR", error.message, 500);
  const on = ((data ?? []) as { key: string; enabled: boolean }[]).some(
    (r) => r.key === "match_seeks_enabled" && r.enabled,
  );
  if (!on) {
    throw new MpError("MATCH_SEEK.DISABLED", "El tablón \"Busco partido\" aún no está disponible.", 403);
  }
}

// Lee un entero de platform_config vía service role (RLS admin-only). Best-effort.
async function readConfigInt(key: string, fallback: number): Promise<number> {
  try {
    const admin = getAdminClient() as unknown as LooseClient;
    const { data } = await admin.from("platform_config").select("value").eq("key", key).maybeSingle();
    const raw = (data as { value: unknown } | null)?.value;
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

// ── mappers ────────────────────────────────────────────────────────────────
type DbSeek = {
  id: string;
  created_by: string;
  sport: MatchSeek["sport"];
  mode: MatchSeek["mode"];
  partner_id: string | null;
  partner_status: MatchSeek["partnerStatus"];
  city: string | null;
  club_id: string | null;
  skill_min: number | string | null;
  skill_max: number | string | null;
  ranked: boolean;
  window_start: string;
  window_end: string | null;
  notes: string | null;
  status: MatchSeek["status"];
  match_id: string | null;
  expires_at: string;
  created_at: string;
};

function toSeek(
  row: DbSeek,
  authorName: string | null,
  applicantsCount: number,
  myApplicationStatus: MatchSeek["myApplicationStatus"] = null,
): MatchSeek {
  return {
    id: row.id,
    createdBy: row.created_by,
    sport: row.sport,
    mode: row.mode,
    partnerId: row.partner_id,
    partnerStatus: row.partner_status ?? null,
    city: row.city,
    clubId: row.club_id,
    skillMin: row.skill_min == null ? null : Number(row.skill_min),
    skillMax: row.skill_max == null ? null : Number(row.skill_max),
    ranked: row.ranked,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    notes: row.notes,
    status: row.status,
    matchId: row.match_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    authorName,
    applicantsCount,
    myApplicationStatus,
  };
}

async function notifyPartnerInvite(
  authorId: string,
  authorName: string | null,
  partnerId: string,
  seekId: string,
): Promise<void> {
  await notify({
    userId: partnerId,
    role: "user",
    kind: "match_seek_partner_invited",
    title: "Invitación de dupla",
    body: `${authorName ?? "Un jugador"} te eligió como partner para un aviso "Busco partido". Acepta para publicarlo.`,
    payload: {
      seek_id: seekId,
      author_id: authorId,
      author_name: authorName ?? "Un jugador",
    },
  });
}

function isSeekVisibleInFeed(seek: DbSeek): boolean {
  if (seek.mode === "singles") return true;
  return seek.partner_status === "accepted";
}

// ── createMatchSeek ─────────────────────────────────────────────────────────
export async function createMatchSeek(input: unknown): Promise<ActionResult<MatchSeek>> {
  return runAction(CreateMatchSeekSchema, input, async (data) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    // Tope de avisos abiertos por jugador.
    const maxOpen = await readConfigInt("match_seek_max_open_per_user", FALLBACK_MAX_OPEN);
    const { count: openCount } = await supabase
      .from("match_seeks")
      .select("id", { count: "exact", head: true })
      .eq("created_by", userId)
      .eq("status", "open");
    if ((openCount ?? 0) >= maxOpen) {
      throw new MpError(
        "MATCH_SEEK.MAX_OPEN_REACHED",
        `Ya tienes ${maxOpen} avisos abiertos. Cierra alguno antes de publicar otro.`,
        409,
      );
    }

    const profile = await getProfileSummary(userId);
    const expiryDays = await readConfigInt("match_seek_expiry_days", DEFAULT_EXPIRY_DAYS);
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: row, error } = await supabase
      .from("match_seeks")
      .insert({
        created_by: userId,
        sport: data.sport,
        mode: data.mode,
        partner_id: data.partnerId ?? null,
        partner_status: data.mode === "doubles" ? "pending" : null,
        city: profile.city,
        club_id: data.clubId ?? null,
        skill_min: data.skillMin ?? null,
        skill_max: data.skillMax ?? null,
        ranked: data.ranked,
        window_start: data.windowStart,
        window_end: data.windowEnd ?? null,
        notes: data.notes ?? null,
        status: "open",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (error || !row) {
      throw new MpError("MATCH_SEEK.CREATE_FAILED", error?.message ?? "No se pudo publicar el aviso", 500);
    }

    if (data.mode === "doubles" && data.partnerId) {
      await notifyPartnerInvite(userId, profile.displayName, data.partnerId, (row as DbSeek).id);
    }

    return toSeek(row as DbSeek, profile.displayName, 0);
  });
}

// ── cancelMatchSeek ─────────────────────────────────────────────────────────
export async function cancelMatchSeek(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(CancelMatchSeekSchema, input, async ({ seekId }) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data: seek, error: selErr } = await supabase
      .from("match_seeks")
      .select("id,created_by,status")
      .eq("id", seekId)
      .maybeSingle();
    if (selErr) throw new MpError("MATCH_SEEK.DB_ERROR", selErr.message, 500);
    if (!seek) throw new MpError("MATCH_SEEK.NOT_FOUND", "Aviso no encontrado", 404);
    if (seek.created_by !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Este aviso no es tuyo");
    }
    if (seek.status !== "open") {
      throw new MpError("MATCH_SEEK.NOT_CANCELLABLE", `No se puede cancelar en estado '${seek.status}'`, 409);
    }

    const { error: updErr } = await supabase
      .from("match_seeks")
      .update({ status: "cancelled" })
      .eq("id", seekId);
    if (updErr) throw new MpError("MATCH_SEEK.CANCEL_FAILED", updErr.message, 500);
    return { ok: true as const };
  });
}

// ── updateMatchSeek ─────────────────────────────────────────────────────────
export async function updateMatchSeek(input: unknown): Promise<ActionResult<MatchSeek>> {
  return runAction(UpdateMatchSeekSchema, input, async (data) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data: seek, error: selErr } = await supabase
      .from("match_seeks")
      .select("id,created_by,status")
      .eq("id", data.seekId)
      .maybeSingle();
    if (selErr) throw new MpError("MATCH_SEEK.DB_ERROR", selErr.message, 500);
    if (!seek) throw new MpError("MATCH_SEEK.NOT_FOUND", "Aviso no encontrado", 404);
    if (seek.created_by !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Este aviso no es tuyo");
    }
    if (seek.status !== "open") {
      throw new MpError("MATCH_SEEK.NOT_EDITABLE", `No se puede editar en estado '${seek.status}'`, 409);
    }

    const modeChanging = data.mode != null;
    const partnerChanging = data.partnerId !== undefined;
    if (modeChanging || partnerChanging) {
      const { count: appCount, error: appErr } = await supabase
        .from("match_seek_applications")
        .select("id", { count: "exact", head: true })
        .eq("seek_id", data.seekId)
        .in("status", ["pending", "accepted"]);
      if (appErr) throw new MpError("MATCH_SEEK.DB_ERROR", appErr.message, 500);
      if ((appCount ?? 0) > 0) {
        throw new MpError(
          "MATCH_SEEK.MODE_LOCKED",
          "No puedes cambiar la modalidad ni el partner mientras haya postulaciones activas.",
          409,
        );
      }
    }

    const { data: current, error: curErr } = await supabase
      .from("match_seeks")
      .select("mode,partner_id")
      .eq("id", data.seekId)
      .maybeSingle();
    if (curErr) throw new MpError("MATCH_SEEK.DB_ERROR", curErr.message, 500);
    if (!current) throw new MpError("MATCH_SEEK.NOT_FOUND", "Aviso no encontrado", 404);

    const nextMode = data.mode ?? (current.mode as "singles" | "doubles");
    let nextPartnerId: string | null =
      data.partnerId !== undefined ? data.partnerId : (current.partner_id as string | null);
    if (nextMode === "singles") nextPartnerId = null;
    if (nextMode === "doubles" && !nextPartnerId) {
      throw new MpError("MATCH_SEEK.PARTNER_REQUIRED", "En dobles debes elegir tu partner", 400);
    }

    const partnerChanged =
      data.partnerId !== undefined && data.partnerId !== (current.partner_id as string | null);
    const modeToDoubles = nextMode === "doubles" && (current.mode as string) === "singles";

    const updatePayload: Record<string, unknown> = {
      mode: nextMode,
      partner_id: nextPartnerId,
      skill_min: data.skillMin ?? null,
      skill_max: data.skillMax ?? null,
      ranked: data.ranked,
      window_start: data.windowStart,
      window_end: data.windowEnd ?? null,
      notes: data.notes ?? null,
    };
    if (nextMode === "singles") {
      updatePayload.partner_status = null;
    } else if (partnerChanged || modeToDoubles) {
      updatePayload.partner_status = "pending";
    }

    const { data: row, error: updErr } = await supabase
      .from("match_seeks")
      .update(updatePayload)
      .eq("id", data.seekId)
      .select("*")
      .single();
    if (updErr || !row) {
      throw new MpError("MATCH_SEEK.UPDATE_FAILED", updErr?.message ?? "No se pudo editar el aviso", 500);
    }

    const profile = await getProfileSummary(userId);
    const seekRow = row as DbSeek;
    if (nextMode === "doubles" && nextPartnerId && (partnerChanged || modeToDoubles)) {
      await notifyPartnerInvite(userId, profile.displayName, nextPartnerId, seekRow.id);
    }
    return toSeek(seekRow, profile.displayName, 0);
  });
}

// ── listMatchSeeks (feed — todas las ciudades por defecto) ──────────────────
export async function listMatchSeeks(input: unknown): Promise<ActionResult<MatchSeek[]>> {
  return runAction(ListMatchSeeksParamsSchema, input, async ({ sport, mode, allCities, limit }) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const profile = await getProfileSummary(userId);
    const supabase = (await getServerClient()) as unknown as LooseClient;

    let query = supabase
      .from("match_seeks")
      .select("*")
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .order("window_start", { ascending: true })
      .limit(Math.min(limit * 2, 100));
    if (sport) query = query.eq("sport", sport);
    if (mode) query = query.eq("mode", mode);
    if (!allCities && profile.city) query = query.eq("city", profile.city);

    const { data, error } = await query;
    if (error) throw new MpError("MATCH_SEEK.LIST_FAILED", error.message, 500);
    const rows = ((data ?? []) as DbSeek[]).filter(isSeekVisibleInFeed).slice(0, limit);
    if (rows.length === 0) return [];

    // Nombres de autor + conteo de postulantes en 2 queries agregadas.
    const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", authorIds);
    const nameById = new Map<string, string | null>(
      ((authors ?? []) as { id: string; display_name: string | null }[]).map((a) => [a.id, a.display_name]),
    );

    const seekIds = rows.map((r) => r.id);
    const { data: apps } = await supabase
      .from("match_seek_applications")
      .select("seek_id")
      .in("seek_id", seekIds)
      .eq("status", "pending");
    const countBySeek = new Map<string, number>();
    for (const a of (apps ?? []) as { seek_id: string }[]) {
      countBySeek.set(a.seek_id, (countBySeek.get(a.seek_id) ?? 0) + 1);
    }

    // Estado de MIS postulaciones a estos avisos → el feed marca "ya te postulaste".
    const { data: myApps } = await supabase
      .from("match_seek_applications")
      .select("seek_id,status")
      .in("seek_id", seekIds)
      .eq("applicant_id", userId);
    const myStatusBySeek = new Map<string, MatchSeek["myApplicationStatus"]>();
    for (const a of (myApps ?? []) as { seek_id: string; status: MatchSeek["myApplicationStatus"] }[]) {
      myStatusBySeek.set(a.seek_id, a.status);
    }

    return rows.map((r) =>
      toSeek(
        r,
        nameById.get(r.created_by) ?? null,
        countBySeek.get(r.id) ?? 0,
        myStatusBySeek.get(r.id) ?? null,
      ),
    );
  });
}

// ── listMyMatchSeeks (mis avisos + postulantes) ─────────────────────────────
export async function listMyMatchSeeks(): Promise<
  ActionResult<{ seek: MatchSeek; applications: MatchSeekApplication[] }[]>
> {
  return runAction(
    z.undefined(),
    undefined,
    async () => {
      await assertFeatureEnabled();
      const userId = await requireUserId();
      const profile = await getProfileSummary(userId);
      const supabase = (await getServerClient()) as unknown as LooseClient;

      const { data, error } = await supabase
        .from("match_seeks")
        .select("*")
        .eq("created_by", userId)
        .order("created_at", { ascending: false });
      if (error) throw new MpError("MATCH_SEEK.LIST_FAILED", error.message, 500);
      const seeks = (data ?? []) as DbSeek[];
      if (seeks.length === 0) return [];

      const seekIds = seeks.map((s) => s.id);
      const { data: appsRaw } = await supabase
        .from("match_seek_applications")
        .select("*")
        .in("seek_id", seekIds)
        .order("created_at", { ascending: true });
      const apps = (appsRaw ?? []) as Record<string, unknown>[];

      const applicantIds = Array.from(new Set(apps.map((a) => a.applicant_id as string)));
      const { data: profs } = applicantIds.length
        ? await supabase.from("profiles").select("id,display_name").in("id", applicantIds)
        : { data: [] as { id: string; display_name: string | null }[] };
      const nameById = new Map<string, string | null>(
        ((profs ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]),
      );

      const appsBySeek = new Map<string, MatchSeekApplication[]>();
      for (const a of apps) {
        const seekId = a.seek_id as string;
        const list = appsBySeek.get(seekId) ?? [];
        list.push({
          id: a.id as string,
          seekId,
          applicantId: a.applicant_id as string,
          partnerId: (a.partner_id as string | null) ?? null,
          status: a.status as MatchSeekApplication["status"],
          message: (a.message as string | null) ?? null,
          createdAt: a.created_at as string,
          respondedAt: (a.responded_at as string | null) ?? null,
          applicantName: nameById.get(a.applicant_id as string) ?? null,
        });
        appsBySeek.set(seekId, list);
      }

      return seeks.map((s) => ({
        seek: toSeek(s, profile.displayName, (appsBySeek.get(s.id) ?? []).filter((a) => a.status === "pending").length),
        applications: appsBySeek.get(s.id) ?? [],
      }));
    },
  );
}

// ── listMyApplications (las postulaciones que YO envié) ─────────────────────
export type MyApplicationItem = {
  applicationId: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  createdAt: string;
  seekId: string;
  sport: MatchSeek["sport"];
  mode: MatchSeek["mode"];
  windowStart: string;
  windowEnd: string | null;
  ranked: boolean;
  authorName: string | null;
  // Chat del partido cuando me aceptaron.
  conversationId: string | null;
};

export async function listMyApplications(): Promise<ActionResult<MyApplicationItem[]>> {
  return runAction(z.undefined(), undefined, async () => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    // Mis postulaciones (RLS msa_select permite ver las propias).
    const { data: appsRaw, error } = await supabase
      .from("match_seek_applications")
      .select("id,seek_id,status,created_at")
      .eq("applicant_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new MpError("MATCH_SEEK.LIST_FAILED", error.message, 500);
    const apps = (appsRaw ?? []) as { id: string; seek_id: string; status: MyApplicationItem["status"]; created_at: string }[];
    if (apps.length === 0) return [];

    // Los avisos ya 'matched' no los devuelve la RLS normal a un no-dueño, así
    // que leemos los detalles de MIS avisos-postulados con service role
    // (la identidad ya está validada: son postulaciones mías).
    const admin = getAdminClient() as unknown as LooseClient;
    const seekIds = Array.from(new Set(apps.map((a) => a.seek_id)));
    const { data: seeksRaw } = await admin
      .from("match_seeks")
      .select("id,sport,mode,window_start,window_end,ranked,created_by,match_id")
      .in("id", seekIds);
    const seekById = new Map(
      ((seeksRaw ?? []) as Array<{
        id: string; sport: MatchSeek["sport"]; mode: MatchSeek["mode"];
        window_start: string; window_end: string | null; ranked: boolean;
        created_by: string; match_id: string | null;
      }>).map((s) => [s.id, s]),
    );

    const authorIds = Array.from(new Set([...seekById.values()].map((s) => s.created_by)));
    const { data: authors } = authorIds.length
      ? await admin.from("profiles").select("id,display_name").in("id", authorIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const nameById = new Map(
      ((authors ?? []) as { id: string; display_name: string | null }[]).map((a) => [a.id, a.display_name]),
    );

    // Conversaciones de los matches aceptados.
    const matchIds = [...seekById.values()].map((s) => s.match_id).filter((m): m is string => !!m);
    const convByMatch = new Map<string, string>();
    if (matchIds.length) {
      const { data: convs } = await admin
        .from("conversations")
        .select("id,match_id")
        .in("match_id", matchIds);
      for (const c of (convs ?? []) as { id: string; match_id: string }[]) {
        convByMatch.set(c.match_id, c.id);
      }
    }

    return apps.flatMap((a) => {
      const s = seekById.get(a.seek_id);
      if (!s) return [];
      const convId = s.match_id ? convByMatch.get(s.match_id) ?? null : null;
      return [{
        applicationId: a.id,
        status: a.status,
        createdAt: a.created_at,
        seekId: a.seek_id,
        sport: s.sport,
        mode: s.mode,
        windowStart: s.window_start,
        windowEnd: s.window_end,
        ranked: s.ranked,
        authorName: nameById.get(s.created_by) ?? null,
        conversationId: a.status === "accepted" ? convId : null,
      }];
    });
  });
}

// ── applyToMatchSeek ────────────────────────────────────────────────────────
export async function applyToMatchSeek(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(ApplyToMatchSeekSchema, input, async ({ seekId, partnerId, message }) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data: seek, error: selErr } = await supabase
      .from("match_seeks")
      .select("id,created_by,mode,status,partner_status")
      .eq("id", seekId)
      .maybeSingle();
    if (selErr) throw new MpError("MATCH_SEEK.DB_ERROR", selErr.message, 500);
    if (!seek) throw new MpError("MATCH_SEEK.NOT_FOUND", "Aviso no encontrado", 404);
    if (seek.status !== "open") {
      throw new MpError("MATCH_SEEK.NOT_OPEN", "Este aviso ya no recibe postulaciones", 409);
    }
    if (seek.mode === "doubles" && seek.partner_status !== "accepted") {
      throw new MpError(
        "MATCH_SEEK.PARTNER_PENDING",
        "Este aviso espera que el partner del autor confirme la dupla.",
        409,
      );
    }
    if (seek.created_by === userId) {
      throw new MpError("MATCH_SEEK.OWN_SEEK", "No puedes postularte a tu propio aviso", 422);
    }
    if (seek.mode === "doubles" && !partnerId) {
      throw new MpError("MATCH_SEEK.PARTNER_REQUIRED", "En dobles debes traer tu partner", 422);
    }
    if (seek.mode === "singles" && partnerId) {
      throw new MpError("MATCH_SEEK.NO_PARTNER_IN_SINGLES", "Singles no lleva partner", 422);
    }

    const { error: insErr } = await supabase.from("match_seek_applications").insert({
      seek_id: seekId,
      applicant_id: userId,
      partner_id: partnerId ?? null,
      message: message ?? null,
      status: "pending",
    });
    if (insErr) {
      // unique (seek_id, applicant_id) → ya postulado.
      if (insErr.code === "23505") {
        throw new MpError("MATCH_SEEK.ALREADY_APPLIED", "Ya te postulaste a este aviso", 409);
      }
      throw new MpError("MATCH_SEEK.APPLY_FAILED", insErr.message, 500);
    }

    // Notif al autor del aviso (best-effort vía service role).
    const applicant = await getProfileSummary(userId);
    await notify({
      userId: seek.created_by,
      role: "user",
      kind: "match_seek_applied",
      title: "Nueva postulación",
      body: `${applicant.displayName ?? "Un jugador"} se postuló a tu aviso.`,
      payload: { seek_id: seekId, applicant_name: applicant.displayName ?? "Un jugador" },
    });

    return { ok: true as const };
  });
}

// ── withdrawApplication ─────────────────────────────────────────────────────
export async function withdrawApplication(input: unknown): Promise<ActionResult<{ ok: true }>> {
  return runAction(WithdrawApplicationSchema, input, async ({ applicationId }) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data: app, error: selErr } = await supabase
      .from("match_seek_applications")
      .select("id,applicant_id,status")
      .eq("id", applicationId)
      .maybeSingle();
    if (selErr) throw new MpError("MATCH_SEEK.DB_ERROR", selErr.message, 500);
    if (!app) throw new MpError("MATCH_SEEK.APP_NOT_FOUND", "Postulación no encontrada", 404);
    if (app.applicant_id !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Esta postulación no es tuya");
    if (app.status !== "pending") {
      throw new MpError("MATCH_SEEK.APP_NOT_PENDING", `No se puede retirar en estado '${app.status}'`, 409);
    }

    const { error: updErr } = await supabase
      .from("match_seek_applications")
      .update({ status: "withdrawn", responded_at: new Date().toISOString() })
      .eq("id", applicationId);
    if (updErr) throw new MpError("MATCH_SEEK.WITHDRAW_FAILED", updErr.message, 500);
    return { ok: true as const };
  });
}

// ── acceptApplicant (núcleo: crea el match) ─────────────────────────────────
export async function acceptApplicant(
  input: unknown,
): Promise<ActionResult<{ matchId: string; conversationId: string | null }>> {
  return runAction(AcceptApplicantSchema, input, async ({ seekId, applicationId, playedAt }) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data: seek, error: seekErr } = await supabase
      .from("match_seeks")
      .select("*")
      .eq("id", seekId)
      .maybeSingle();
    if (seekErr) throw new MpError("MATCH_SEEK.DB_ERROR", seekErr.message, 500);
    if (!seek) throw new MpError("MATCH_SEEK.NOT_FOUND", "Aviso no encontrado", 404);
    const s = seek as DbSeek;
    if (s.created_by !== userId) throw new AuthError("AUTH.ROLE_REQUIRED", "Este aviso no es tuyo");
    if (s.status !== "open") throw new MpError("MATCH_SEEK.NOT_OPEN", "El aviso ya no está abierto", 409);
    if (s.mode === "doubles" && s.partner_status !== "accepted") {
      throw new MpError(
        "MATCH_SEEK.PARTNER_PENDING",
        "Tu partner aún no ha confirmado la dupla. Espera su aceptación antes de elegir rival.",
        409,
      );
    }

    const { data: app, error: appErr } = await supabase
      .from("match_seek_applications")
      .select("id,seek_id,applicant_id,partner_id,status")
      .eq("id", applicationId)
      .maybeSingle();
    if (appErr) throw new MpError("MATCH_SEEK.DB_ERROR", appErr.message, 500);
    if (!app || app.seek_id !== seekId) throw new MpError("MATCH_SEEK.APP_NOT_FOUND", "Postulación no encontrada", 404);
    if (app.status !== "pending") throw new MpError("MATCH_SEEK.APP_NOT_PENDING", "La postulación ya fue respondida", 409);

    // Armado de equipos según modalidad.
    let teamA: string[];
    let teamB: string[];
    if (s.mode === "singles") {
      teamA = [s.created_by];
      teamB = [app.applicant_id];
    } else {
      if (!s.partner_id) throw new MpError("MATCH_SEEK.SEEK_PARTNER_MISSING", "El aviso de dobles no tiene partner", 422);
      if (!app.partner_id) throw new MpError("MATCH_SEEK.APP_PARTNER_MISSING", "La postulación de dobles no trae partner", 422);
      teamA = [s.created_by, s.partner_id];
      teamB = [app.applicant_id, app.partner_id];
    }

    // Crea el match (createMatch valida disjoint/cardinalidad y marca is_ranked
    // según el plan del autor del seek = caller). El chat se crea por trigger.
    const matchRes = await createMatch({
      sport: s.sport,
      mode: s.mode,
      clubId: s.club_id,
      courtId: null,
      playedAt: playedAt ?? s.window_start,
      durationMin: 60,
      teamAPlayerIds: teamA,
      teamBPlayerIds: teamB,
      isRanked: s.ranked,
      skipChallengeAcceptance: true,
    });
    if (!matchRes.ok) {
      throw new MpError("MATCH_SEEK.MATCH_CREATE_FAILED", matchRes.error.message, 422);
    }
    const matchId = matchRes.data.id;

    // El trigger fn_create_match_channel (mig 118) ya creó la conversación del
    // partido en la misma transacción. La buscamos para deep-linkear al chat.
    const { data: convRow } = await supabase
      .from("conversations")
      .select("id")
      .eq("match_id", matchId)
      .maybeSingle();
    const conversationId = (convRow as { id: string } | null)?.id ?? null;

    // Cierra el seek y marca la postulación aceptada. Los demás postulantes
    // quedan EN PAUSA ('pending', no rechazados): si el partido se cancela y el
    // aviso se reabre (ver cancelMatch), siguen disponibles para elegir.
    const nowIso = new Date().toISOString();
    await supabase.from("match_seeks").update({ status: "matched", match_id: matchId }).eq("id", seekId);
    await supabase
      .from("match_seek_applications")
      .update({ status: "accepted", responded_at: nowIso })
      .eq("id", applicationId);

    // Notif al postulante aceptado (best-effort).
    const author = await getProfileSummary(userId);
    await notify({
      userId: app.applicant_id,
      role: "user",
      kind: "match_seek_accepted",
      title: "Te aceptaron el partido",
      body: `${author.displayName ?? "El autor"} aceptó tu postulación.`,
      payload: {
        seek_id: seekId,
        match_id: matchId,
        conversation_id: conversationId,
        author_name: author.displayName ?? "El autor",
      },
    });

    return { matchId, conversationId };
  });
}

// ── listPartnerInvitations (avisos doubles donde me invitaron como partner) ─
export async function listPartnerInvitations(): Promise<ActionResult<MatchSeek[]>> {
  return runAction(z.undefined(), undefined, async () => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data, error } = await supabase
      .from("match_seeks")
      .select("*")
      .eq("partner_id", userId)
      .eq("partner_status", "pending")
      .eq("status", "open")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw new MpError("MATCH_SEEK.LIST_FAILED", error.message, 500);
    const rows = (data ?? []) as DbSeek[];
    if (rows.length === 0) return [];

    const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", authorIds);
    const nameById = new Map<string, string | null>(
      ((authors ?? []) as { id: string; display_name: string | null }[]).map((a) => [a.id, a.display_name]),
    );

    return rows.map((r) => toSeek(r, nameById.get(r.created_by) ?? null, 0));
  });
}

// ── respondMatchSeekPartner (aceptar / rechazar invitación de dupla) ────────
export async function respondMatchSeekPartner(
  input: unknown,
): Promise<ActionResult<{ ok: true; status: "accepted" | "rejected" }>> {
  return runAction(RespondMatchSeekPartnerSchema, input, async ({ seekId, accept }) => {
    await assertFeatureEnabled();
    const userId = await requireUserId();
    const supabase = (await getServerClient()) as unknown as LooseClient;

    const { data: seek, error: selErr } = await supabase
      .from("match_seeks")
      .select("id,partner_id,partner_status,status,mode")
      .eq("id", seekId)
      .maybeSingle();
    if (selErr) throw new MpError("MATCH_SEEK.DB_ERROR", selErr.message, 500);
    if (!seek) throw new MpError("MATCH_SEEK.NOT_FOUND", "Aviso no encontrado", 404);
    if (seek.partner_id !== userId) {
      throw new AuthError("AUTH.ROLE_REQUIRED", "Esta invitación no es para ti");
    }
    if (seek.mode !== "doubles") {
      throw new MpError("MATCH_SEEK.INVALID_MODE", "Este aviso no requiere confirmación de partner", 422);
    }
    if (seek.partner_status !== "pending") {
      throw new MpError("MATCH_SEEK.PARTNER_ALREADY_RESPONDED", "Ya respondiste esta invitación", 409);
    }
    if (seek.status !== "open") {
      throw new MpError("MATCH_SEEK.NOT_OPEN", "Este aviso ya no está activo", 409);
    }

    const admin = getAdminClient() as unknown as LooseClient;
    const nextStatus = accept ? "accepted" : "rejected";
    const updatePayload: Record<string, unknown> = { partner_status: nextStatus };
    if (!accept) updatePayload.status = "cancelled";

    const { error: updErr } = await admin.from("match_seeks").update(updatePayload).eq("id", seekId);
    if (updErr) throw new MpError("MATCH_SEEK.PARTNER_RESPONSE_FAILED", updErr.message, 500);

    return { ok: true as const, status: nextStatus };
  });
}
