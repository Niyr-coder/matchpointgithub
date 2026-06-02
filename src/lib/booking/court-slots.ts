// Horarios de reserva compartidos (RetarModal, ReservarCanchaDrawer, etc.).

export type BookingDuration = 60 | 120;

export const SLOT_OPEN_MIN = 9 * 60;
export const SLOT_CLOSE_MIN = 22 * 60;
export const SLOT_STEP_MIN = 60;

export type ExistingReservation = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

export function buildStartSlots(duration: BookingDuration): string[] {
  const last = SLOT_CLOSE_MIN - duration;
  const out: string[] = [];
  for (let m = SLOT_OPEN_MIN; m <= last; m += SLOT_STEP_MIN) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export function combineLocalIso(dayIso: string, slot: string): string {
  const [y, mo, d] = dayIso.split("-").map(Number);
  const [h, mi] = slot.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

export function addMinutesIso(iso: string, mins: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

export function dayRangeIso(dayIso: string): { from: string; to: string } {
  const from = combineLocalIso(dayIso, "00:00");
  return { from, to: addMinutesIso(from, 24 * 60) };
}

/** Slot HH:MM ocupado si [S, S+duration) se cruza con una reserva activa. */
export function computeTakenSlots(
  dayIso: string,
  slots: string[],
  duration: BookingDuration,
  existing: ExistingReservation[],
): Set<string> {
  const ranges = existing
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({ start: new Date(r.startsAt).getTime(), end: new Date(r.endsAt).getTime() }));
  const taken = new Set<string>();
  for (const slot of slots) {
    const start = new Date(combineLocalIso(dayIso, slot)).getTime();
    const end = start + duration * 60_000;
    for (const r of ranges) {
      if (start < r.end && end > r.start) {
        taken.add(slot);
        break;
      }
    }
  }
  return taken;
}
