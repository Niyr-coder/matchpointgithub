import "server-only";

import { formatReservationCheckInLabel } from "@/lib/checkin/code";
import {
  durationLabelMinutes,
  fmtHHMM,
  overlapsRangeIso,
  parseRangeEnd,
  parseRangeStart,
  sportLabel,
} from "@/lib/reservations/during-range";

export type ReceptionQueueStatus = "arriving" | "on-time" | "walkin";

export type ReceptionQueueItem = {
  id: string;
  t: string;
  n: string;
  c: string;
  d: string;
  code: string;
  sport: string;
  st: ReceptionQueueStatus;
  players: number;
};

const ACTIVE_STATUSES = ["booked", "confirmed"] as const;

/** Cola de recepción: reservas que empiezan pronto o están en curso (sin check-in aún). */
export async function loadReceptionQueue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clubId: string,
  opts?: { windowHours?: number; limit?: number; lateGraceMinutes?: number },
): Promise<ReceptionQueueItem[]> {
  const now = new Date();
  const windowHours = opts?.windowHours ?? 24;
  const limit = opts?.limit ?? 40;
  const graceMs = (opts?.lateGraceMinutes ?? 30) * 60 * 1000;
  const windowEnd = new Date(now.getTime() + windowHours * 3600 * 1000);

  // Mismo patrón tolerante que MisReservasScreen: en prod puede faltar la
  // columna check_in_code (drift de migración) — si el select falla por eso,
  // se reintenta sin ella y el código cae al label legacy (prefijo del UUID).
  const SELECT_WITH_CODE =
    "id,during,sport,source,organizer_id,for_user_id,notes,check_in_code,max_players,courts(code,name)";
  const SELECT_WITHOUT_CODE =
    "id,during,sport,source,organizer_id,for_user_id,notes,max_players,courts(code,name)";

  const query = (cols: string) =>
    supabase
      .from("reservations")
      .select(cols)
      .eq("club_id", clubId)
      .overlaps("during", overlapsRangeIso(now, windowEnd))
      .in("status", [...ACTIVE_STATUSES])
      .limit(80);

  let res = await query(SELECT_WITH_CODE);
  if (res.error?.message.includes("check_in_code")) {
    res = await query(SELECT_WITHOUT_CODE);
  }
  const { data: reservations, error } = res;

  if (error) throw new Error(`RECEPTION.RESERVATIONS_FAILED: ${error.message}`);

  type RawRow = Record<string, unknown>;
  type ParsedRow = { r: RawRow; start: Date; end: Date | null };

  const sorted = ((reservations ?? []) as RawRow[])
    .map((r) => {
      const during = r.during as string;
      const start = parseRangeStart(during);
      const end = parseRangeEnd(during);
      return { r, start, end };
    })
    .filter((x): x is ParsedRow => !!x.start && x.start.getTime() >= now.getTime() - graceMs)
    .sort((a: ParsedRow, b: ParsedRow) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);

  // El nombre visible en recepción es el del CLIENTE, no el de quien insertó
  // la fila: en reservas manuales y walk-ins el organizer_id es el staff.
  // Orden de resolución: for_user_id → notes ("Walk-in · Nombre") → organizer.
  const profileIds = Array.from(
    new Set(
      sorted
        .flatMap((x) => [x.r.for_user_id as string | null, x.r.organizer_id as string | null])
        .filter((id): id is string => !!id),
    ),
  );
  const profNames = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,display_name")
      .in("id", profileIds);
    for (const p of profs ?? []) {
      profNames.set(p.id as string, p.display_name as string);
    }
  }

  return sorted.map((x) => {
    const court = x.r.courts as { code?: string; name?: string } | null;
    const c = (court?.code ?? court?.name ?? "—").slice(0, 4);
    const diffMin = Math.round((x.start.getTime() - now.getTime()) / 60000);
    const source = x.r.source as string;
    const st: ReceptionQueueStatus =
      source === "walkin" ? "walkin" : diffMin <= 15 ? "arriving" : "on-time";
    const forUserId = x.r.for_user_id as string | null;
    // Walk-ins guardan el cliente en notes ("Walk-in · Nombre"); en reservas
    // normales notes es texto libre y NO debe tapar el nombre del perfil.
    const notesParts = (((x.r.notes as string | null) ?? "").split(" · ") as string[])
      .map((s) => s.trim())
      .filter(Boolean);
    const walkinName =
      source === "walkin"
        ? notesParts[0]?.toLowerCase() === "walk-in"
          ? notesParts[1]
          : notesParts[0]
        : undefined;
    const n =
      (forUserId ? profNames.get(forUserId) : null) ??
      walkinName ??
      profNames.get(x.r.organizer_id as string) ??
      "Cliente";
    return {
      id: x.r.id as string,
      t: fmtHHMM(x.start),
      n,
      c,
      d: durationLabelMinutes(x.start, x.end),
      code: formatReservationCheckInLabel(
        source,
        x.r.id as string,
        x.r.check_in_code as string | null,
      ),
      sport: sportLabel(x.r.sport as string),
      st,
      players: (x.r.max_players as number) ?? 0,
    };
  });
}
