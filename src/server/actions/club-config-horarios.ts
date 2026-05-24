"use server";

import "server-only";

import { z } from "zod";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import type {
  DayHours,
  HorariosData,
  ScheduleException,
} from "@/components/dashboard/owner/config-sections/HorariosSection";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<(typeof DAY_KEYS)[number], string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

const MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

function exceptionToNotes(closed: boolean, openHour: number | null, closeHour: number | null): string {
  if (closed && openHour == null && closeHour == null) return "Cerrado todo el día";
  if (closed && closeHour != null) return `Cerrado desde ${String(closeHour).padStart(2, "0")}:00`;
  if (!closed && openHour != null && closeHour != null) {
    return `Horario especial · ${String(openHour).padStart(2, "0")}:00–${String(closeHour).padStart(2, "0")}:00`;
  }
  return "Horario especial";
}

function parseOpenHours(raw: unknown): DayHours[] {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return DAY_KEYS.map((key) => {
    const day = obj[key] as Record<string, unknown> | undefined;
    if (!day || typeof day !== "object") {
      return { d: DAY_LABELS[key], o: 6, c: 22, on: false, peak: null };
    }
    const closed = day.closed === true;
    const open = typeof day.open === "number" ? day.open : 6;
    const close = typeof day.close === "number" ? day.close : 22;
    const peakRaw = day.peak;
    const peak: [number, number] | null =
      Array.isArray(peakRaw) && peakRaw.length === 2 && typeof peakRaw[0] === "number" && typeof peakRaw[1] === "number"
        ? [peakRaw[0] as number, peakRaw[1] as number]
        : null;
    return {
      d: DAY_LABELS[key],
      o: open,
      c: close,
      on: !closed && open !== close,
      peak,
    };
  });
}

function serializeOpenHours(week: DayHours[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  week.forEach((day, idx) => {
    const key = DAY_KEYS[idx];
    if (!day.on) {
      out[key] = { open: day.o, close: day.c, peak: day.peak, closed: true };
    } else {
      out[key] = { open: day.o, close: day.c, peak: day.peak };
    }
  });
  return out;
}

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
  if (!ok) throw new AuthError("AUTH.ROLE_REQUIRED", "Club staff required");
  return user.id;
}

export async function loadHorariosData(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  clubId: string,
): Promise<HorariosData> {
  const [settingsRes, exRes] = await Promise.all([
    supabase.from("club_settings").select("open_hours").eq("club_id", clubId).maybeSingle(),
    // club_schedule_exceptions todavía no está en types generados.
    (supabase as unknown as {
      from: (t: string) => {
        select: (sel: string) => {
          eq: (col: string, val: string) => {
            order: (col: string, opts: { ascending: boolean }) => Promise<{
              data: Array<Record<string, unknown>> | null;
            }>;
          };
        };
      };
    })
      .from("club_schedule_exceptions")
      .select("id,date,name,closed,open_hour,close_hour,notes,icon,color")
      .eq("club_id", clubId)
      .order("date", { ascending: true }),
  ]);

  const week = parseOpenHours(settingsRes.data?.open_hours);
  const exceptions: ScheduleException[] = (exRes.data ?? []).map((r) => {
    const date = r.date as string;
    const closed = r.closed === true;
    const openHour = (r.open_hour as number | null) ?? null;
    const closeHour = (r.close_hour as number | null) ?? null;
    const notes = (r.notes as string | null) ?? exceptionToNotes(closed, openHour, closeHour);
    return {
      id: r.id as string,
      date,
      dateLabel: formatDateLabel(date),
      name: r.name as string,
      closed,
      openHour,
      closeHour,
      notes,
      icon: (r.icon as string | null) ?? (closed ? "calendar-x" : "flag"),
      color: (r.color as string | null) ?? (closed ? "#dc2626" : "#fbbf24"),
    };
  });

  return { week, exceptions };
}

const DayHoursSchema = z.object({
  d: z.string(),
  o: z.number().int().min(0).max(24),
  c: z.number().int().min(0).max(24),
  on: z.boolean(),
  peak: z.tuple([z.number().int().min(0).max(24), z.number().int().min(0).max(24)]).nullable(),
});

const UpdateHoursSchema = z.object({
  clubId: UuidSchema,
  week: z.array(DayHoursSchema).length(7),
});

export async function updateClubHours(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(UpdateHoursSchema, input, async ({ clubId, week }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    const open_hours = serializeOpenHours(week);
    const { error } = await admin
      .from("club_settings")
      .update({ open_hours } as never)
      .eq("club_id", clubId);
    if (error) throw new MpError("CLUB_HOURS.UPDATE_FAILED", error.message, 500);
    return { ok: true as const };
  });
}

const UpsertExceptionSchema = z.object({
  clubId: UuidSchema,
  id: UuidSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (yyyy-mm-dd)"),
  name: z.string().min(1).max(120),
  closed: z.boolean(),
  openHour: z.number().int().min(0).max(24).nullable(),
  closeHour: z.number().int().min(0).max(24).nullable(),
  notes: z.string().max(280).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
});

export async function upsertScheduleException(
  input: unknown,
): Promise<ActionResult<ScheduleException>> {
  return runAction(UpsertExceptionSchema, input, async (data) => {
    const userId = await requireClubManagerUserId(data.clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");

    const icon = data.icon ?? (data.closed ? "calendar-x" : "flag");
    const color = data.color ?? (data.closed ? "#dc2626" : "#fbbf24");
    const notes = data.notes ?? exceptionToNotes(data.closed, data.openHour, data.closeHour);

    const payload = {
      club_id: data.clubId,
      date: data.date,
      name: data.name,
      closed: data.closed,
      open_hour: data.openHour,
      close_hour: data.closeHour,
      notes,
      icon,
      color,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adminAny = admin as any;
    let row: Record<string, unknown> | null = null;
    if (data.id) {
      const res = await adminAny
        .from("club_schedule_exceptions")
        .update(payload)
        .eq("id", data.id)
        .eq("club_id", data.clubId)
        .select()
        .single();
      if (res.error) throw new MpError("SCHEDULE_EXC.UPDATE_FAILED", res.error.message, 500);
      row = res.data as Record<string, unknown>;
    } else {
      const res = await adminAny
        .from("club_schedule_exceptions")
        .upsert(payload, { onConflict: "club_id,date" })
        .select()
        .single();
      if (res.error) throw new MpError("SCHEDULE_EXC.UPSERT_FAILED", res.error.message, 500);
      row = res.data as Record<string, unknown>;
    }

    const date = row.date as string;
    const closed = row.closed === true;
    const openHour = (row.open_hour as number | null) ?? null;
    const closeHour = (row.close_hour as number | null) ?? null;
    return {
      id: row.id as string,
      date,
      dateLabel: formatDateLabel(date),
      name: row.name as string,
      closed,
      openHour,
      closeHour,
      notes: (row.notes as string | null) ?? exceptionToNotes(closed, openHour, closeHour),
      icon: (row.icon as string | null) ?? "flag",
      color: (row.color as string | null) ?? "#fbbf24",
    };
  });
}

const DeleteExceptionSchema = z.object({
  clubId: UuidSchema,
  id: UuidSchema,
});

export async function deleteScheduleException(
  input: unknown,
): Promise<ActionResult<{ ok: true }>> {
  return runAction(DeleteExceptionSchema, input, async ({ clubId, id }) => {
    const userId = await requireClubManagerUserId(clubId);
    const admin = getAdminClient();
    await setAuditActor(admin, userId, "owner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (admin as any)
      .from("club_schedule_exceptions")
      .delete()
      .eq("id", id)
      .eq("club_id", clubId);
    if (res.error) throw new MpError("SCHEDULE_EXC.DELETE_FAILED", res.error.message, 500);
    return { ok: true as const };
  });
}
