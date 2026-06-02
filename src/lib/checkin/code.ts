// Códigos y payloads QR para check-in en recepción.

const CHECK_IN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const RAW_CODE_RE = new RegExp(`^[${CHECK_IN_ALPHABET}]{4,6}$`, "i");
const LABEL_CODE_RE = /^(?:RV|WK)-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4,6})$/i;
const QR_PAYLOAD_RE =
  /^mp:checkin:1:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6})$/i;

export type ParsedCheckInPayload = {
  clubId: string;
  checkInCode: string;
};

export function normalizeCheckInCode(input: string): string | null {
  const t = input.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  const label = LABEL_CODE_RE.exec(t);
  if (label) return label[1]!;
  if (RAW_CODE_RE.test(t)) return t;
  return null;
}

export function formatCheckInLabel(
  source: string | null | undefined,
  checkInCode: string | null | undefined,
): string {
  if (!checkInCode) return "—";
  const prefix = source === "walkin" ? "WK" : "RV";
  return `${prefix}-${checkInCode}`;
}

/** Etiqueta RV/WK con código DB o prefijo legacy del UUID (sin migración). */
export function formatReservationCheckInLabel(
  source: string | null | undefined,
  reservationId: string,
  checkInCode?: string | null,
): string {
  if (checkInCode) return formatCheckInLabel(source, checkInCode);
  const prefix = source === "walkin" ? "WK" : "RV";
  return `${prefix}-${reservationId.slice(0, 4).toUpperCase()}`;
}

export function buildCheckInQrPayload(clubId: string, checkInCode: string): string {
  return `mp:checkin:1:${clubId}:${checkInCode.toUpperCase()}`;
}

export function parseCheckInQrPayload(raw: string): ParsedCheckInPayload | null {
  const t = raw.trim();
  const m = QR_PAYLOAD_RE.exec(t);
  if (m) {
    return { clubId: m[1]!.toLowerCase(), checkInCode: m[2]!.toUpperCase() };
  }
  const code = normalizeCheckInCode(t);
  if (!code) return null;
  return { clubId: "", checkInCode: code };
}
