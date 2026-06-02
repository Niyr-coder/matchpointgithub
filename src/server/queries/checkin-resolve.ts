import "server-only";

import { normalizeCheckInCode, parseCheckInQrPayload } from "@/lib/checkin/code";

export type ResolvedCheckInReservation = {
  id: string;
  organizerId: string;
  status: string;
  source: string;
  checkInCode: string;
};

const RESERVATION_LOOKUP_COLS = "id,organizer_id,status,source";

function rowToResolved(r: Record<string, unknown>, code: string): ResolvedCheckInReservation {
  return {
    id: r.id as string,
    organizerId: r.organizer_id as string,
    status: r.status as string,
    source: r.source as string,
    checkInCode: code,
  };
}

function isMissingCheckInCodeColumn(message: string): boolean {
  return message.includes("check_in_code");
}

/** Resuelve reserva por payload QR o código RV-/WK- (con o sin columna check_in_code). */
export async function resolveReservationForCheckIn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  clubId: string,
  raw: string,
): Promise<ResolvedCheckInReservation | null> {
  const parsed = parseCheckInQrPayload(raw);
  if (!parsed) return null;

  if (parsed.clubId && parsed.clubId !== clubId) {
    return null;
  }

  const code = parsed.checkInCode;

  const { data: byCode, error: byCodeErr } = await supabase
    .from("reservations")
    .select(RESERVATION_LOOKUP_COLS)
    .eq("club_id", clubId)
    .eq("check_in_code", code)
    .in("status", ["booked", "confirmed", "checked_in"])
    .maybeSingle();

  if (byCodeErr && !isMissingCheckInCodeColumn(byCodeErr.message)) {
    throw new Error(`CHECKIN.RESOLVE_FAILED: ${byCodeErr.message}`);
  }
  if (byCode?.id) {
    return rowToResolved(byCode as Record<string, unknown>, code);
  }

  const legacy = normalizeCheckInCode(raw);
  if (!legacy) return null;
  const idPrefix = legacy.toLowerCase().slice(0, 4);

  const { data: candidates, error: legacyErr } = await supabase
    .from("reservations")
    .select(RESERVATION_LOOKUP_COLS)
    .eq("club_id", clubId)
    .in("status", ["booked", "confirmed", "checked_in"])
    .ilike("id", `${idPrefix}%`)
    .limit(2);

  if (legacyErr) throw new Error(`CHECKIN.RESOLVE_FAILED: ${legacyErr.message}`);

  const rows = candidates ?? [];
  if (rows.length !== 1) return null;
  return rowToResolved(rows[0] as Record<string, unknown>, legacy);
}
