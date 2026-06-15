// ReservarCanchaDrawer — drawer slide-in para reservar cancha.
// Escucha 'mp-open-reservar' con detail = {
//   name, city, price, sport?, clubId?, clubSlug?
// }
// Modo real (clubId + clubSlug presentes): fetcha canchas reales, calcula
// disponibilidad por cancha/dia y crea la reserva via POST /api/v1/reservations.
// Modo demo (sin esos campos): muestra canchas y horarios mock; el boton
// confirmar solo navega a la pantalla "reserva confirmada" sin tocar DB.
"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  buildGoogleCalendarUrl,
  buildReservationIcs,
  downloadIcsFile,
} from "@/lib/calendar/reservation-ics";

type Sport = "pickleball" | "padel" | "tennis" | "futbol";
type ReservationVisibility = "private" | "public";

type EventDetail = {
  name?: string;
  city?: string;
  price?: number;
  sport?: Sport;
  clubId?: string;
  clubSlug?: string;
};

type Club = {
  name: string;
  city?: string;
  price?: number;
  sport?: Sport;
  clubId?: string;
  clubSlug?: string;
};

type Court = { id: string; name: string; ordinal: number; active: boolean };
type Duration = 60 | 120;

const DAY_NAMES_ES = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTH_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Ventana de reserva: 09:00 → 22:00. Slots cada hora en punto. El último
// start permitido es 22:00 - duración (60 min → 21:00; 120 min → 20:00).
const SLOT_OPEN_MIN = 9 * 60;
const SLOT_CLOSE_MIN = 22 * 60;
const SLOT_STEP_MIN = 60;

/** Ocupado por otra reserva — rojo suave, alineado al resto del dashboard. */
const SLOT_TAKEN_BG = "#fee2e2";
const SLOT_TAKEN_FG = "#b91c1c";
const SLOT_TAKEN_BORDER = "#fca5a5";

type DayOption = {
  label: string;     // "HOY" / "LUN" / "MAR" …
  dateNum: string;   // "12"
  monthShort: string; // "may"
  iso: string;       // "2026-05-17"
};

// 7 días consecutivos desde hoy; nunca retrocede.
function buildUpcomingDays(count = 7): DayOption[] {
  const out: DayOption[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      label: i === 0 ? "HOY" : DAY_NAMES_ES[d.getDay()],
      dateNum: String(d.getDate()),
      monthShort: MONTH_SHORT_ES[d.getMonth()],
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    });
  }
  return out;
}

function buildStartSlots(duration: Duration): string[] {
  const last = SLOT_CLOSE_MIN - duration;
  const out: string[] = [];
  for (let m = SLOT_OPEN_MIN; m <= last; m += SLOT_STEP_MIN) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

function combineLocalIso(dayIso: string, slot: string): string {
  // Construye un Date local desde "YYYY-MM-DD" + "HH:MM" y devuelve ISO UTC.
  const [y, mo, d] = dayIso.split("-").map(Number);
  const [h, mi] = slot.split(":").map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

function addMinutesIso(iso: string, mins: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

type BusyRange = {
  startsAt: string;
  endsAt: string;
  status: string;
};

function isLocalDayToday(dayIso: string): boolean {
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dayIso === todayIso;
}

// En HOY, bloquea horas cuyo inicio ya pasó (no se puede reservar 09:00 a las 11:00).
function computePastSlots(dayIso: string, slots: string[]): Set<string> {
  const past = new Set<string>();
  if (!isLocalDayToday(dayIso)) return past;
  const nowMs = Date.now();
  for (const slot of slots) {
    const startMs = new Date(combineLocalIso(dayIso, slot)).getTime();
    if (startMs < nowMs) past.add(slot);
  }
  return past;
}

// Cada celda = 1 h. Ocupación no depende de la duración elegida por el usuario.
function computeTakenSet(dayIso: string, slots: string[], existing: BusyRange[]): Set<string> {
  const ranges = existing
    .filter((r) => r.status !== "cancelled")
    .map((r) => ({ start: new Date(r.startsAt).getTime(), end: new Date(r.endsAt).getTime() }));
  const taken = new Set<string>();
  for (const slot of slots) {
    const start = new Date(combineLocalIso(dayIso, slot)).getTime();
    const end = start + SLOT_STEP_MIN * 60_000;
    for (const r of ranges) {
      if (start < r.end && end > r.start) {
        taken.add(slot);
        break;
      }
    }
  }
  return taken;
}

function slotsInRange(start: string, duration: Duration, allSlots: string[]): string[] {
  const idx = allSlots.indexOf(start);
  const count = duration / SLOT_STEP_MIN;
  if (idx < 0) return [];
  return allSlots.slice(idx, idx + count);
}

function isStartValid(
  start: string,
  duration: Duration,
  allSlots: string[],
  taken: Set<string>,
  past: Set<string>,
): boolean {
  const block = slotsInRange(start, duration, allSlots);
  if (block.length !== duration / SLOT_STEP_MIN) return false;
  return block.every((s) => !taken.has(s) && !past.has(s));
}

function formatReservationTimeLabel(start: string, duration: Duration): string {
  if (duration === 60) return start;
  const [h, mi] = start.split(":").map(Number);
  const endMin = h * 60 + mi + duration;
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  return `${start}–${end}`;
}

type ClubPickerItem = {
  id: string;
  slug: string;
  name: string;
  city: string;
  sports: string[];
};

function formatCourtLabel(c: Court, index: number): string {
  const raw = c.name?.trim() ?? "";
  if (raw && !/^cancha\s*0$/i.test(raw)) return raw;
  const n = c.ordinal > 0 ? c.ordinal : index + 1;
  return `Cancha ${n}`;
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span
          className="font-heading tabular"
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.12em",
            color: "#fff",
            background: "#0a0a0a",
            borderRadius: 6,
            padding: "3px 7px",
            lineHeight: 1.2,
          }}
        >
          {n}
        </span>
        <span className="label-mp" style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {title}
        </span>
        {hint ? (
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)", marginLeft: "auto" }}>{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ChoiceChip({
  selected,
  disabled,
  onClick,
  children,
  style,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mp-press"
      style={{
        fontFamily: "inherit",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 10,
        border: selected ? "2px solid var(--primary)" : "1px solid var(--border)",
        background: selected ? "#ecfdf5" : "#fff",
        color: "#0a0a0a",
        boxShadow: selected ? "inset 0 0 0 1px rgba(16,185,129,0.12)" : "none",
        opacity: disabled ? 0.55 : 1,
        transition: "border-color 140ms ease-out, background 140ms ease-out",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function DayPickerRow({
  days,
  day,
  onDay,
}: {
  days: DayOption[];
  day: number;
  onDay: (index: number) => void;
}) {
  const canPrev = day > 0;
  const canNext = day < days.length - 1;

  const navBtn: CSSProperties = {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "#fff",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        className="mp-press"
        aria-label="Día anterior"
        disabled={!canPrev}
        onClick={() => onDay(day - 1)}
        style={{
          ...navBtn,
          opacity: canPrev ? 1 : 0.35,
          cursor: canPrev ? "pointer" : "not-allowed",
        }}
      >
        <Icon name="chevron-left" size={18} />
      </button>

      <div className="mp-table-scroll flex-1 min-w-0">
        <div className="grid grid-cols-7 gap-1.5 mp-table-row">
        {days.map((opt, i) => (
          <ChoiceChip
            key={opt.iso}
            selected={day === i}
            onClick={() => onDay(i)}
            style={{
              padding: "8px 4px",
              textAlign: "center",
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 8,
                fontWeight: 800,
                color: "var(--muted-fg)",
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {opt.label}
            </div>
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.1 }}>
              {opt.dateNum}
            </div>
            <div style={{ fontSize: 8, color: "var(--muted-fg)", marginTop: 1 }}>{opt.monthShort}</div>
          </ChoiceChip>
        ))}
        </div>
      </div>

      <button
        type="button"
        className="mp-press"
        aria-label="Día siguiente"
        disabled={!canNext}
        onClick={() => onDay(day + 1)}
        style={{
          ...navBtn,
          opacity: canNext ? 1 : 0.35,
          cursor: canNext ? "pointer" : "not-allowed",
        }}
      >
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  );
}

function ReservationTicketSummary({
  clubName,
  dayLabel,
  dateNum,
  monthShort,
  timeLabel,
  courtLabel,
  durationLabel,
  price,
}: {
  clubName: string;
  dayLabel: string;
  dateNum: string;
  monthShort: string;
  timeLabel: string;
  courtLabel: string;
  durationLabel: string;
  price: number;
}) {
  const barcode = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid var(--border)",
        boxShadow: "0 6px 24px rgba(10,10,10,0.1)",
      }}
    >
      <div style={{ display: "flex", minHeight: 96 }}>
        <div
          style={{
            width: 76,
            flexShrink: 0,
            background: "#0a0a0a",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 6px",
          }}
        >
          <Icon name="ticket" size={22} color="var(--primary)" />
          <span
            className="font-heading"
            style={{
              fontSize: 8,
              fontWeight: 900,
              letterSpacing: "0.14em",
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.75)",
            }}
          >
            Reserva
          </span>
        </div>
        <div
          aria-hidden
          style={{
            width: 10,
            flexShrink: 0,
            background: "#fafafa",
            backgroundImage:
              "radial-gradient(circle at 0 6px, transparent 5px, #d4d4d4 5px, #d4d4d4 6px, transparent 6px)",
            backgroundSize: "10px 12px",
            backgroundRepeat: "repeat-y",
            borderLeft: "1px dashed #d4d4d4",
            borderRight: "1px dashed #d4d4d4",
          }}
        />
        <div style={{ flex: 1, padding: "12px 14px 10px", background: "#fff", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                className="font-heading"
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  color: "var(--primary)",
                  textTransform: "uppercase",
                }}
              >
                MATCHPOINT
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#0a0a0a",
                  marginTop: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {clubName}
              </div>
            </div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "var(--primary)",
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ${price.toFixed(2)}
            </div>
          </div>
          <div
            className="mp-grid-form-2 gap-x-3 gap-y-1.5"
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: "1px dashed #e5e5e5",
              fontSize: 10.5,
            }}
          >
            <div>
              <div style={{ color: "var(--muted-fg)", fontWeight: 700, fontSize: 9, letterSpacing: "0.06em" }}>
                FECHA
              </div>
              <div style={{ fontWeight: 800, marginTop: 2 }}>
                {dayLabel} {dateNum} {monthShort}
              </div>
            </div>
            <div>
              <div style={{ color: "var(--muted-fg)", fontWeight: 700, fontSize: 9, letterSpacing: "0.06em" }}>
                HORA
              </div>
              <div style={{ fontWeight: 800, marginTop: 2 }}>{timeLabel}</div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ color: "var(--muted-fg)", fontWeight: 700, fontSize: 9, letterSpacing: "0.06em" }}>
                CANCHA · DURACIÓN
              </div>
              <div style={{ fontWeight: 800, marginTop: 2 }}>
                {courtLabel} · {durationLabel}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        aria-hidden
        style={{
          height: 26,
          background: "#fafafa",
          borderTop: "1px dashed #d4d4d4",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          padding: "0 12px",
        }}
      >
        {barcode.map((i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: i % 4 === 0 ? 3 : i % 2 === 0 ? 2 : 1,
              height: 14,
              borderRadius: 1,
              background: "#0a0a0a",
              opacity: 0.12 + (i % 5) * 0.04,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SlotLegend() {
  const items: { c: string; l: string; border?: string; strike?: boolean }[] = [
    { c: "#fff", l: "Libre" },
    { c: "var(--primary)", l: "Tu hora" },
    { c: SLOT_TAKEN_BG, l: "Ocupado", border: SLOT_TAKEN_BORDER, strike: true },
    { c: "#e7e5e4", l: "Pasada" },
  ];
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
      {items.map((it) => (
        <span key={it.l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--muted-fg)" }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 4,
              border:
                it.l === "Tu hora"
                  ? "none"
                  : `1px solid ${it.border ?? "var(--border)"}`,
              background: it.c,
              textDecoration: it.strike ? "line-through" : "none",
            }}
          />
          {it.l}
        </span>
      ))}
    </div>
  );
}

type SuccessAction = {
  id: string;
  icon: string;
  label: string;
  primary?: boolean;
  onClick: () => void;
};

export function ReservarCanchaDrawer() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [club, setClub] = useState<Club | null>(null);
  const [pickingClub, setPickingClub] = useState(false);
  const [pickerClubs, setPickerClubs] = useState<ClubPickerItem[] | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [day, setDay] = useState(0);
  const [duration, setDuration] = useState<Duration>(60);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [courtId, setCourtId] = useState<string | null>(null);
  const [mockCourtIdx, setMockCourtIdx] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const [busyRanges, setBusyRanges] = useState<BusyRange[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [notes, setNotes] = useState("");
  const [visibility, setVisibility] = useState<ReservationVisibility>("private");
  const [enter, setEnter] = useState(false);
  // Construido una sola vez al montar para no derivar fechas en cada render.
  const [days] = useState<DayOption[]>(() => buildUpcomingDays(7));
  const selectedDay = days[day] ?? days[0];

  const realMode = !!(club?.clubId && club?.clubSlug);
  const courtsReady = !realMode || courts !== null;
  // Grilla fija por hora; la duración solo define el bloque seleccionado, no la grilla.
  const slots = useMemo(() => buildStartSlots(60), []);
  const taken = useMemo(
    () => computeTakenSet(selectedDay.iso, slots, busyRanges),
    [selectedDay.iso, slots, busyRanges],
  );
  const pastSlots = useMemo(
    () => computePastSlots(selectedDay.iso, slots),
    [selectedDay.iso, slots],
  );

  const freeStarts = useMemo(
    () => slots.filter((s) => isStartValid(s, duration, slots, taken, pastSlots)),
    [slots, duration, taken, pastSlots],
  );

  const selectedRange = useMemo(() => {
    if (!time) return new Set<string>();
    return new Set(slotsInRange(time, duration, slots));
  }, [time, duration, slots]);

  const canConfirm =
    !!time &&
    isStartValid(time, duration, slots, taken, pastSlots) &&
    !submitting &&
    (!realMode || (!!club?.clubId && !!courtId && courtsReady && (courts?.length ?? 0) > 0));

  const availEverLoaded = useRef(false);

  // Si cambias día/cancha/duración y el bloque quedó inválido, sugerimos el primer inicio libre.
  useEffect(() => {
    if (loadingAvail && !availEverLoaded.current) return;
    if (time && isStartValid(time, duration, slots, taken, pastSlots)) return;
    setTime(freeStarts[0] ?? null);
  }, [loadingAvail, freeStarts, taken, pastSlots, slots, courtId, day, duration, selectedDay.iso, time]);

  const done = !!created;
  const courtLabel = (() => {
    if (realMode && courts && courtId) {
      const c = courts.find((x) => x.id === courtId);
      return c?.name ?? `Cancha ${c?.ordinal ?? "?"}`;
    }
    return `C${mockCourtIdx + 1}`;
  })();
  const price = club ? (club.price || 14) * (duration / 60) : 0;

  const confirmedWindow = useMemo(() => {
    if (!created || !time) return null;
    const startsAtIso = combineLocalIso(selectedDay.iso, time);
    const endsAtIso = addMinutesIso(startsAtIso, duration);
    return {
      startsAt: new Date(startsAtIso),
      endsAt: new Date(endsAtIso),
      timeLabel: formatReservationTimeLabel(time, duration),
      dateLabel: `${selectedDay.label} ${selectedDay.dateNum} ${selectedDay.monthShort}`,
    };
  }, [created, time, selectedDay, duration]);

  const close = useCallback(() => setOpen(false), []);

  const goMisReservas = useCallback(() => {
    close();
    router.push("/dashboard/user/mis-reservas");
  }, [close, router]);

  const addToCalendar = useCallback(() => {
    if (!confirmedWindow || !club) {
      toast({ icon: "alert-triangle", title: "No hay datos de la reserva para el calendario." });
      return;
    }
    const title = `Reserva · ${club.name}`;
    const description = [
      `Cancha: ${courtLabel}`,
      `Horario: ${confirmedWindow.timeLabel}`,
      created?.id ? `ID: ${created.id}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const location = [club.name, club.city].filter(Boolean).join(" · ");
    const uid = created?.id ?? `demo-${Date.now()}`;
    const ics = buildReservationIcs({
      uid,
      title,
      description,
      location,
      startsAt: confirmedWindow.startsAt,
      endsAt: confirmedWindow.endsAt,
    });
    downloadIcsFile(`matchpoint-reserva-${uid.slice(0, 8)}.ics`, ics);
    toast({ icon: "calendar-check", title: "Listo para tu calendario", sub: "Descargamos un .ics y abrimos Google Calendar." });
    const gUrl = buildGoogleCalendarUrl({
      title,
      details: description,
      location,
      startsAt: confirmedWindow.startsAt,
      endsAt: confirmedWindow.endsAt,
    });
    window.open(gUrl, "_blank", "noopener,noreferrer");
  }, [confirmedWindow, club, courtLabel, created, toast]);

  const shareReservation = useCallback(async () => {
    if (!confirmedWindow || !club) return;
    const text = [
      "Reserva en MATCHPOINT",
      `${club.name} · ${courtLabel}`,
      `${confirmedWindow.dateLabel} · ${confirmedWindow.timeLabel}`,
      `Total: $${price.toFixed(2)}`,
    ].join("\n");
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "Mi reserva MATCHPOINT", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast({ icon: "check-check", title: "Copiado al portapapeles" });
    } catch {
      toast({ icon: "alert-triangle", title: "No pudimos compartir", sub: "Intenta de nuevo." });
    }
  }, [confirmedWindow, club, courtLabel, price, toast]);

  const successActions: SuccessAction[] = useMemo(
    () => [
      { id: "mis-reservas", icon: "calendar", label: "Mis reservas", primary: true, onClick: goMisReservas },
      { id: "calendar", icon: "calendar-plus", label: "Agregar a calendario", onClick: addToCalendar },
      { id: "share", icon: "share-2", label: "Compartir", onClick: () => void shareReservation() },
    ],
    [goMisReservas, addToCalendar, shareReservation],
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EventDetail>).detail ?? {};
      const hasFullCtx = !!(detail.clubId && detail.clubSlug);
      setOpen(true);
      setCourts(null);
      setCourtId(null);
      setDay(0);
      setDuration(60);
      setMockCourtIdx(0);
      setTime(null);
      setBusyRanges([]);
      setErrorMsg(null);
      setCreated(null);
      setShowMoreOptions(false);
      setNotes("");
      setVisibility("private");
      setPickerQuery("");
      if (hasFullCtx) {
        setClub({
          name: detail.name?.trim() || "Club",
          city: detail.city,
          price: detail.price,
          sport: detail.sport,
          clubId: detail.clubId,
          clubSlug: detail.clubSlug,
        });
        setPickingClub(false);
      } else {
        // Sin contexto suficiente → muestro picker primero.
        setClub(null);
        setPickingClub(true);
      }
    };
    window.addEventListener("mp-open-reservar", handler);
    return () => window.removeEventListener("mp-open-reservar", handler);
  }, []);

  // Carga lista de clubes cuando el picker se abre.
  useEffect(() => {
    if (!pickingClub) return;
    let cancelled = false;
    setPickerError(null);
    (async () => {
      try {
        const res = await fetch("/api/v1/clubs?pageSize=50", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPickerError(json?.error?.message ?? "No se pudieron cargar los clubes");
          setPickerClubs([]);
          return;
        }
        const list: ClubPickerItem[] = (json.data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          slug: c.slug as string,
          name: c.name as string,
          city: (c.city as string) ?? "",
          sports: (c.sports as string[]) ?? [],
        }));
        setPickerClubs(list);
      } catch (err) {
        if (!cancelled) {
          setPickerError(err instanceof Error ? err.message : "Error de red");
          setPickerClubs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickingClub]);

  const selectClubFromPicker = (c: ClubPickerItem) => {
    setClub({
      name: c.name,
      city: c.city,
      sport: c.sports[0] as Sport | undefined,
      clubId: c.id,
      clubSlug: c.slug,
    });
    setPickingClub(false);
  };

  const filteredPickerClubs = useMemo(() => {
    if (!pickerClubs) return null;
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return pickerClubs;
    return pickerClubs.filter(
      (c) => c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q),
    );
  }, [pickerClubs, pickerQuery]);

  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setEnter(true));
      return () => cancelAnimationFrame(id);
    }
    setEnter(false);
  }, [open]);

  // Carga inicial de canchas reales cuando hay clubSlug.
  useEffect(() => {
    if (!open || !club?.clubSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/clubs/${club.clubSlug}/courts`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setErrorMsg(`Canchas: ${json?.error?.message ?? "no se pudieron cargar"}`);
          setCourts([]);
          setCourtId(null);
          return;
        }
        const list: Court[] = (json.data ?? [])
          .map((c: Record<string, unknown>, idx: number) => ({
            id: c.id as string,
            name: formatCourtLabel(
              {
                id: c.id as string,
                name: (c.name as string) ?? "",
                ordinal: (c.ordinal as number) ?? 0,
                active: true,
              },
              idx,
            ),
            ordinal: (c.ordinal as number) ?? 0,
            active: (c.active as boolean) ?? true,
          }))
          .filter((c: Court) => c.active)
          .sort((a: Court, b: Court) => a.ordinal - b.ordinal);
        setCourts(list);
        setCourtId(list[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(`Canchas: ${err instanceof Error ? err.message : "error de red"}`);
          setCourts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, club?.clubSlug]);

  // Carga reservas existentes para el día/cancha en modo real.
  const loadAvailability = useCallback(async (silent = false) => {
    if (!realMode || !club?.clubSlug || !courtId) return;
    if (!silent) setLoadingAvail(true);
    try {
      const fromIso = combineLocalIso(selectedDay.iso, "00:00");
      const toIso = addMinutesIso(fromIso, 24 * 60);
      const params = new URLSearchParams({ from: fromIso, to: toIso });
      const res = await fetch(
        `/api/v1/clubs/${encodeURIComponent(club.clubSlug)}/courts/${encodeURIComponent(courtId)}/availability?${params}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErrorMsg(`Disponibilidad: ${json?.error?.message ?? "no se pudo cargar"}`);
        setBusyRanges([]);
      } else {
        setBusyRanges(
          (json.data ?? []).map((r: Record<string, unknown>) => ({
            startsAt: (r.startsAt ?? r.starts_at) as string,
            endsAt: (r.endsAt ?? r.ends_at) as string,
            status: r.status as string,
          })),
        );
        setErrorMsg((prev) =>
          prev?.startsWith("Disponibilidad:") || prev === "Falta clubId o cancha." ? null : prev,
        );
        availEverLoaded.current = true;
      }
    } catch (err) {
      if (!silent) {
        setErrorMsg(`Disponibilidad: ${err instanceof Error ? err.message : "error de red"}`);
        setBusyRanges([]);
      }
    } finally {
      if (!silent) setLoadingAvail(false);
    }
  }, [realMode, club?.clubSlug, courtId, selectedDay.iso]);

  useEffect(() => {
    availEverLoaded.current = false;
  }, [courtId, selectedDay.iso]);

  useEffect(() => {
    if (!realMode) {
      setBusyRanges([]);
      availEverLoaded.current = false;
      return;
    }
    void loadAvailability(false);
  }, [realMode, loadAvailability]);

  // Refresca ocupación en segundo plano (sin skeleton ni parpadeo).
  useEffect(() => {
    if (!open || !realMode) return;
    const id = window.setInterval(() => {
      void loadAvailability(true);
    }, 30_000);
    return () => window.clearInterval(id);
  }, [open, realMode, loadAvailability]);

  // Si el bloque seleccionado quedó inválido, limpiamos la selección.
  useEffect(() => {
    if (time && !isStartValid(time, duration, slots, taken, pastSlots)) setTime(null);
  }, [time, taken, pastSlots, slots, duration]);

  const handleConfirm = async () => {
    if (!time || !isStartValid(time, duration, slots, taken, pastSlots)) {
      setErrorMsg(
        duration === 60
          ? "Elige una hora libre."
          : "Elige un bloque de 2 horas seguidas libre.",
      );
      return;
    }
    setErrorMsg(null);
    if (!realMode) {
      // Modo demo: marca un id ficticio para mostrar la pantalla de éxito.
      setCreated({ id: "demo-2614" });
      return;
    }
    if (!club?.clubId || !courtId) {
      setErrorMsg(
        courts === null
          ? "Espera a que carguen las canchas del club."
          : "Este club no tiene canchas activas para reservar.",
      );
      return;
    }
    const startsAt = combineLocalIso(selectedDay.iso, time);
    const endsAt = addMinutesIso(startsAt, duration);
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clubId: club.clubId,
          courtId,
          startsAt,
          endsAt,
          sport: club.sport ?? "pickleball",
          visibility,
          maxPlayers: 4,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json?.error?.message ?? `HTTP ${res.status}`);
        // Si fue SLOT_TAKEN refrescamos disponibilidad.
        if (json?.error?.code === "RESERVATION.SLOT_TAKEN") {
          await loadAvailability();
        }
      } else {
        setCreated({ id: (json.data?.id as string) ?? "—" });
        window.dispatchEvent(new Event("mp-reservation-created"));
        router.refresh();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.45)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "flex-end",
        fontFamily: "inherit",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: "100%",
          height: "100%",
          background: "#fff",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          transform: enter ? "none" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● {done ? "Reserva confirmada" : pickingClub ? "Elige un club" : "Reserva rápida"}
              {club && !realMode && !done ? " · DEMO" : ""}
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              {club?.name ?? "¿Dónde quieres jugar?"}
              <span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--muted-fg)",
                marginTop: 2,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="map-pin" size={10} />
              {club?.city ?? "Elige un club para reservar"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {club && !pickingClub && !done ? (
              <button
                type="button"
                onClick={() => {
                  setPickingClub(true);
                  setCourts(null);
                  setCourtId(null);
                  setTime(null);
                  setBusyRanges([]);
                  setErrorMsg(null);
                }}
                className="mp-press"
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  color: "var(--muted-fg)",
                }}
              >
                Cambiar club
              </button>
            ) : null}
            <button
              type="button"
              onClick={close}
              aria-label="Cerrar"
              className="mp-press"
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "var(--muted)",
                border: 0,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                lineHeight: 1,
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        {pickingClub ? (
          <div
            className="mp-noscroll"
            style={{ padding: "16px 22px", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}
          >
            <div className="label-mp">Selecciona un club</div>
            <div style={{ position: "relative" }}>
              <input
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                placeholder="Buscar por nombre o ciudad…"
                autoFocus
                style={{
                  width: "100%",
                  padding: "10px 14px 10px 36px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  fontSize: 13,
                  fontFamily: "inherit",
                }}
              />
              <Icon
                name="search"
                size={14}
                color="var(--muted-fg)"
                style={{ position: "absolute", top: 12, left: 12 }}
              />
            </div>

            {pickerError && (
              <div
                style={{
                  padding: 10,
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  fontSize: 11.5,
                  color: "#b91c1c",
                }}
              >
                {pickerError}
              </div>
            )}

            {filteredPickerClubs == null ? (
              <div style={{ padding: "8px 0" }}>
                <SkeletonRows rows={4} />
              </div>
            ) : filteredPickerClubs.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  border: "1px dashed var(--border)",
                  borderRadius: 10,
                  color: "var(--muted-fg)",
                  fontSize: 12.5,
                }}
              >
                {pickerQuery ? "Sin resultados para esa búsqueda." : "No hay clubes activos todavía."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {filteredPickerClubs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectClubFromPicker(c)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: "linear-gradient(135deg,#10b981,#047857)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="map-pin" size={16} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                        {c.city || "—"}
                        {c.sports.length > 0 ? ` · ${c.sports.join(", ")}` : ""}
                      </div>
                    </div>
                    <Icon name="chevron-right" size={14} color="var(--muted-fg)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : !done && club ? (
          <>
            <div className="mp-noscroll" style={{ padding: "18px 22px 0", overflow: "auto", flex: 1 }}>
              {!realMode && (
                <div
                  style={{
                    padding: 12,
                    background: "#fef3c7",
                    border: "1px solid #fbbf24",
                    borderRadius: 10,
                    fontSize: 11,
                    color: "#78350f",
                    marginBottom: 16,
                    lineHeight: 1.45,
                  }}
                >
                  Modo demo: abre el drawer desde <b>Clubes</b> para reservar con disponibilidad real.
                </div>
              )}

              <Section n={1} title="Día">
                <DayPickerRow days={days} day={day} onDay={setDay} />
              </Section>

              <Section
                n={2}
                title="Cancha"
                hint={realMode && !courts ? "cargando…" : undefined}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
                  {realMode
                    ? (courts ?? []).map((c) => (
                        <ChoiceChip
                          key={c.id}
                          selected={courtId === c.id}
                          onClick={() => setCourtId(c.id)}
                          style={{ padding: "10px 8px", fontSize: 11.5, fontWeight: 800 }}
                        >
                          {c.name}
                        </ChoiceChip>
                      ))
                    : [1, 2, 3, 4].map((n, idx) => (
                        <ChoiceChip
                          key={n}
                          selected={mockCourtIdx === idx}
                          onClick={() => setMockCourtIdx(idx)}
                          style={{ padding: "10px 8px", fontSize: 11.5, fontWeight: 800 }}
                        >
                          C{n}
                        </ChoiceChip>
                      ))}
                </div>
                {realMode && courts && courts.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: "var(--muted-fg)", margin: "8px 0 0" }}>
                    Este club no tiene canchas activas.
                  </p>
                ) : null}
              </Section>

              <Section n={3} title="Duración">
                <div className="mp-grid-form-2 gap-2">
                  {([60, 120] as Duration[]).map((m) => (
                    <ChoiceChip
                      key={m}
                      selected={duration === m}
                      onClick={() => setDuration(m)}
                      style={{ padding: "12px 8px", fontSize: 13, fontWeight: 900 }}
                    >
                      {m === 60 ? "1 hora" : "2 horas"}
                    </ChoiceChip>
                  ))}
                </div>
              </Section>

              <Section
                n={4}
                title="Hora"
                hint={
                  realMode
                    ? duration === 60
                      ? `${freeStarts.length} inicios libres`
                      : `${freeStarts.length} bloques de 2 h libres`
                    : undefined
                }
              >
                <SlotLegend />
                {loadingAvail && busyRanges.length === 0 && realMode ? (
                  <div style={{ padding: "8px 0" }}>
                    <SkeletonRows rows={3} />
                  </div>
                ) : (
                  <div className="mp-grid-form-3 gap-2">
                    {slots.map((h) => {
                      const isPast = pastSlots.has(h);
                      const isTaken = !isPast && taken.has(h);
                      const isInBlock = selectedRange.has(h);
                      const isStart = h === time;
                      const canPick = isStartValid(h, duration, slots, taken, pastSlots);
                      const disabled = isPast || isTaken;
                      return (
                        <button
                          key={h}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (canPick) setTime(h);
                          }}
                          className="mp-press"
                          aria-pressed={isInBlock}
                          aria-label={
                            isPast
                              ? `${h}, horario pasado`
                              : isTaken
                                ? `${h}, ocupado`
                                : isInBlock
                                  ? `${h}, en tu reserva`
                                  : canPick
                                    ? `${h}, inicio de bloque libre`
                                    : `${h}, no alcanza para ${duration / 60} h`
                          }
                          style={{
                            padding: "11px 6px",
                            borderRadius: 10,
                            fontFamily: "inherit",
                            fontSize: 12,
                            fontWeight: 900,
                            border: isInBlock
                              ? "2px solid var(--primary)"
                              : isTaken
                                ? `1px solid ${SLOT_TAKEN_BORDER}`
                                : "1px solid var(--border)",
                            background: isInBlock
                              ? "var(--primary)"
                              : isTaken
                                ? SLOT_TAKEN_BG
                                : isPast
                                  ? "#e7e5e4"
                                  : "#fff",
                            color: isInBlock
                              ? "#fff"
                              : isTaken
                                ? SLOT_TAKEN_FG
                                : isPast
                                  ? "#a3a3a3"
                                  : "#0a0a0a",
                            cursor: disabled ? "not-allowed" : canPick ? "pointer" : "default",
                            textDecoration: isTaken ? "line-through" : "none",
                            opacity: isPast ? 0.7 : !canPick && !disabled ? 0.45 : 1,
                          }}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                )}
                {duration === 120 ? (
                  <p style={{ fontSize: 10.5, color: "var(--muted-fg)", margin: "8px 0 0", lineHeight: 1.4 }}>
                    Toca la hora de inicio: se marcan 2 horas seguidas en verde.
                  </p>
                ) : null}
                {!loadingAvail && realMode && freeStarts.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: "#b45309", margin: "10px 0 0", fontWeight: 700 }}>
                    No hay horarios libres este día en esta cancha. Prueba otro día o cancha.
                  </p>
                ) : null}
              </Section>

              {errorMsg ? (
                <div
                  role="alert"
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    background: "#fee2e2",
                    border: "1px solid #fca5a5",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "#b91c1c",
                    lineHeight: 1.4,
                  }}
                >
                  {errorMsg}
                </div>
              ) : null}
            </div>

            <div
              style={{
                padding: "12px 22px 14px",
                borderTop: "1px solid var(--border)",
                background: "#fafafa",
              }}
            >
              <ReservationTicketSummary
                clubName={club?.name ?? "Club"}
                dayLabel={selectedDay.label}
                dateNum={selectedDay.dateNum}
                monthShort={selectedDay.monthShort}
                timeLabel={time ? formatReservationTimeLabel(time, duration) : "Elige hora"}
                courtLabel={courtLabel}
                durationLabel={duration === 60 ? "1 h" : "2 h"}
                price={price}
              />

              {showMoreOptions ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "#fff",
                  }}
                >
                  <div className="label-mp" style={{ marginBottom: 8 }}>
                    Opciones de la reserva
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 800, marginBottom: 6, color: "var(--muted-fg)" }}>
                      Visibilidad
                    </div>
                    <div className="mp-grid-form-2 gap-2">
                      <ChoiceChip
                        selected={visibility === "private"}
                        onClick={() => setVisibility("private")}
                        style={{ padding: "10px 8px", fontSize: 11, fontWeight: 800 }}
                      >
                        Solo yo
                      </ChoiceChip>
                      <ChoiceChip
                        selected={visibility === "public"}
                        onClick={() => setVisibility("public")}
                        style={{ padding: "10px 8px", fontSize: 11, fontWeight: 800 }}
                      >
                        Otros pueden unirse
                      </ChoiceChip>
                    </div>
                    <p style={{ fontSize: 10, color: "var(--muted-fg)", margin: "6px 0 0", lineHeight: 1.4 }}>
                      {visibility === "private"
                        ? "Solo tú y el club ven la reserva."
                        : "Otros jugadores podrán verla y pedir unirse (cuando esté disponible)."}
                    </p>
                  </div>
                  <label style={{ display: "block" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)" }}>
                      Notas para el club (opcional)
                    </span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="Ej. traigo pelotas, clase con coach…"
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 6,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        fontFamily: "inherit",
                        resize: "vertical",
                        minHeight: 72,
                      }}
                    />
                  </label>
                </div>
              ) : null}

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn mp-press"
                  aria-expanded={showMoreOptions}
                  onClick={() => setShowMoreOptions((v) => !v)}
                  style={{
                    background: showMoreOptions ? "#ecfdf5" : "#fff",
                    border: showMoreOptions ? "2px solid var(--primary)" : "1px solid var(--border)",
                  }}
                >
                  <Icon
                    name={showMoreOptions ? "chevron-down" : "layers"}
                    size={13}
                    style={showMoreOptions ? { transform: "rotate(180deg)" } : undefined}
                  />
                  {showMoreOptions ? "Menos opciones" : "Más opciones"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary mp-press"
                  style={{ flex: 1, opacity: canConfirm ? 1 : 0.55 }}
                  onClick={handleConfirm}
                  disabled={!canConfirm}
                >
                  <Icon name="lock" size={13} color="#fff" />
                  {submitting
                    ? "Reservando…"
                    : !time
                      ? "Elige un horario"
                      : realMode && !courtId
                        ? courts === null
                          ? "Cargando canchas…"
                          : "Sin canchas activas"
                        : "Confirmar y pagar"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              padding: 26,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              flex: 1,
              overflow: "auto",
            }}
            className="mp-noscroll"
          >
            <div
              style={{
                padding: "20px 18px",
                borderRadius: 12,
                background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 100%)",
                color: "#fff",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 900,
                  fontSize: 130,
                  color: "rgba(255,255,255,0.07)",
                  letterSpacing: "-0.06em",
                  lineHeight: 0.8,
                  transform: "rotate(-6deg) translate(15%, -15%)",
                  textTransform: "uppercase",
                }}
              >
                BOOK
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", position: "relative" }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="check-check" size={22} color="#fff" />
                </div>
                <div>
                  <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
                    Reserva #{created?.id.slice(0, 8) ?? "—"}
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    ¡Cancha reservada!
                    <span style={{ color: "#fbbf24" }}>.</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              {(
                [
                  ["Club", club?.name ?? "—"],
                  ["Cancha", courtLabel],
                  ["Fecha", `${selectedDay.label} ${selectedDay.dateNum} ${selectedDay.monthShort}`],
                  [
                    "Hora",
                    time ? formatReservationTimeLabel(time, duration) : "—",
                  ],
                  ["Total", `$${price.toFixed(2)}`],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    fontSize: 11.5,
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ color: "var(--muted-fg)" }}>{k}</span>
                  <span style={{ fontWeight: 800 }}>{v}</span>
                </div>
              ))}
            </div>

            <div className="label-mp">Próximos pasos</div>
            <div className="mp-grid-form-2 gap-2">
              {successActions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="card mp-press"
                  onClick={a.onClick}
                  style={{
                    padding: 11,
                    textAlign: "left",
                    cursor: "pointer",
                    border: a.primary ? "2px solid var(--primary)" : undefined,
                    background: a.primary ? "#ecfdf5" : "#fff",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: a.primary ? "var(--primary)" : "var(--muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Icon name={a.icon} size={12} color={a.primary ? "#fff" : "#0a0a0a"} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 900 }}>{a.label}</div>
                </button>
              ))}
            </div>
            <p style={{ fontSize: 10, color: "var(--muted-fg)", margin: "4px 0 0", lineHeight: 1.4 }}>
              El recibo en PDF llegará cuando activemos pagos en la app.
            </p>

            <button
              className="btn btn-primary"
              style={{ marginTop: "auto", justifyContent: "center" }}
              onClick={close}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
