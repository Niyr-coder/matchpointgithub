// ReservarCanchaDrawer — drawer slide-in para reservar cancha.
// Escucha 'mp-open-reservar' con detail = {
//   name, city, price, sport?, clubId?, clubSlug?
// }
// Modo real (clubId + clubSlug presentes): fetcha canchas reales, calcula
// disponibilidad por cancha/dia y crea la reserva via POST /api/v1/reservations.
// Modo demo (sin esos campos): muestra canchas y horarios mock; el boton
// confirmar solo navega a la pantalla "reserva confirmada" sin tocar DB.
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { SkeletonRows } from "@/components/ui/Skeleton";

type Sport = "pickleball" | "padel" | "tennis" | "futbol";

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

const INVITE_AVATARS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
];

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

function slotToMin(slot: string): number {
  const [h, m] = slot.split(":").map(Number);
  return h * 60 + m;
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

type ExistingReservation = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
};

// Slot S (HH:MM) está ocupado si [S, S+duration) se cruza con cualquier
// reserva activa de la lista. Ignoramos status='cancelled'.
function computeTakenSet(
  dayIso: string,
  slots: string[],
  duration: Duration,
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

type ClubPickerItem = {
  id: string;
  slug: string;
  name: string;
  city: string;
  sports: string[];
};

export function ReservarCanchaDrawer() {
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
  const [existing, setExisting] = useState<ExistingReservation[]>([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string } | null>(null);
  const [enter, setEnter] = useState(false);
  // Construido una sola vez al montar para no derivar fechas en cada render.
  const [days] = useState<DayOption[]>(() => buildUpcomingDays(7));
  const selectedDay = days[day] ?? days[0];

  const realMode = !!(club?.clubId && club?.clubSlug);
  const slots = useMemo(() => buildStartSlots(duration), [duration]);
  const taken = useMemo(
    () => computeTakenSet(selectedDay.iso, slots, duration, existing),
    [selectedDay.iso, slots, duration, existing],
  );

  const done = !!created;
  const courtLabel = (() => {
    if (realMode && courts && courtId) {
      const c = courts.find((x) => x.id === courtId);
      return c?.name ?? `Cancha ${c?.ordinal ?? "?"}`;
    }
    return `C${mockCourtIdx + 1}`;
  })();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<EventDetail>).detail ?? {};
      const hasFullCtx = !!(detail.clubId && detail.clubSlug);
      setOpen(true);
      setDay(0);
      setDuration(60);
      setCourts(null);
      setCourtId(null);
      setMockCourtIdx(0);
      setTime(null);
      setExisting([]);
      setErrorMsg(null);
      setCreated(null);
      setPickerQuery("");
      if (hasFullCtx && detail.name) {
        setClub({
          name: detail.name,
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
        if (!res.ok) {
          setErrorMsg(`Canchas: ${json?.error?.message ?? "no se pudieron cargar"}`);
          setCourts([]);
          return;
        }
        const list: Court[] = (json.data ?? [])
          .map((c: Record<string, unknown>) => ({
            id: c.id as string,
            name: (c.name as string) ?? `Cancha ${c.ordinal ?? "?"}`,
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
  const loadAvailability = useCallback(async () => {
    if (!realMode || !club?.clubId || !courtId) return;
    setLoadingAvail(true);
    try {
      const fromIso = combineLocalIso(selectedDay.iso, "00:00");
      const toIso = addMinutesIso(fromIso, 24 * 60);
      const params = new URLSearchParams({
        clubId: club.clubId,
        courtId,
        from: fromIso,
        to: toIso,
        pageSize: "100",
      });
      const res = await fetch(`/api/v1/reservations?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(`Disponibilidad: ${json?.error?.message ?? "no se pudo cargar"}`);
        setExisting([]);
      } else {
        setExisting(
          (json.data ?? []).map((r: Record<string, unknown>) => ({
            id: r.id as string,
            startsAt: r.startsAt as string,
            endsAt: r.endsAt as string,
            status: r.status as string,
          })),
        );
      }
    } catch (err) {
      setErrorMsg(`Disponibilidad: ${err instanceof Error ? err.message : "error de red"}`);
      setExisting([]);
    } finally {
      setLoadingAvail(false);
    }
  }, [realMode, club?.clubId, courtId, selectedDay.iso]);

  useEffect(() => {
    if (!realMode) {
      // Modo demo: simular 2 slots ocupados.
      setExisting([]);
      return;
    }
    loadAvailability();
  }, [realMode, loadAvailability]);

  // Si el slot seleccionado quedó ocupado tras cambiar día/cancha/duración,
  // lo limpiamos para forzar al usuario a re-elegir.
  useEffect(() => {
    if (time && taken.has(time)) setTime(null);
    if (time && !slots.includes(time)) setTime(null);
  }, [time, taken, slots]);

  const handleConfirm = async () => {
    if (!time) {
      setErrorMsg("Elige un horario disponible.");
      return;
    }
    setErrorMsg(null);
    if (!realMode) {
      // Modo demo: marca un id ficticio para mostrar la pantalla de éxito.
      setCreated({ id: "demo-2614" });
      return;
    }
    if (!club?.clubId || !courtId) {
      setErrorMsg("Falta clubId o cancha.");
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
          visibility: "private",
          maxPlayers: 4,
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
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const close = () => setOpen(false);
  const price = club ? (club.price || 14) * (duration / 60) : 0;

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
          <button
            onClick={close}
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "var(--muted)",
              border: 0,
              cursor: "pointer",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        {pickingClub ? (
          <div style={{ padding: "16px 22px", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
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
            <div style={{ padding: "16px 22px", overflow: "auto", flex: 1 }}>
              {!realMode && (
                <div
                  style={{
                    padding: 10,
                    background: "#fef3c7",
                    border: "1px solid #fbbf24",
                    borderRadius: 8,
                    fontSize: 11,
                    color: "#78350f",
                    marginBottom: 12,
                    lineHeight: 1.4,
                  }}
                >
                  Modo demo: este drawer no fue abierto desde un club específico, así que las canchas y horarios son simulados. Abre el drawer desde el listado de clubes para reservar de verdad.
                </div>
              )}

              <div className="label-mp" style={{ marginBottom: 8 }}>1 · Día</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {days.map((opt, i) => (
                  <button
                    key={opt.iso}
                    onClick={() => setDay(i)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 8,
                      border: day === i ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: day === i ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.1em" }}>
                      {opt.label}
                    </div>
                    <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em" }}>
                      {opt.dateNum}
                    </div>
                  </button>
                ))}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>
                2 · Cancha{realMode && !courts ? " · cargando…" : ""}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                {realMode
                  ? (courts ?? []).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCourtId(c.id)}
                        style={{
                          flex: "1 1 auto",
                          minWidth: 60,
                          padding: "7px 8px",
                          borderRadius: 8,
                          border: courtId === c.id ? "2px solid var(--primary)" : "1px solid var(--border)",
                          background: courtId === c.id ? "#ecfdf5" : "#fff",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {c.name}
                      </button>
                    ))
                  : [1, 2, 3, 4].map((n, idx) => (
                      <button
                        key={n}
                        onClick={() => setMockCourtIdx(idx)}
                        style={{
                          flex: 1,
                          padding: "7px 4px",
                          borderRadius: 8,
                          border: mockCourtIdx === idx ? "2px solid var(--primary)" : "1px solid var(--border)",
                          background: mockCourtIdx === idx ? "#ecfdf5" : "#fff",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        C{n}
                      </button>
                    ))}
                {realMode && courts && courts.length === 0 && (
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                    Este club no tiene canchas activas.
                  </div>
                )}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>3 · Duración</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {([60, 120] as Duration[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDuration(m)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 8,
                      border: duration === m ? "2px solid var(--primary)" : "1px solid var(--border)",
                      background: duration === m ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 11.5,
                      fontWeight: 900,
                    }}
                  >
                    {m === 60 ? "1 h" : `${m / 60} h`}
                  </button>
                ))}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>
                4 · Hora{loadingAvail ? " · cargando disponibilidad…" : ""}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {slots.map((h) => {
                  const isSel = h === time;
                  const isTaken = taken.has(h);
                  return (
                    <button
                      key={h}
                      disabled={isTaken}
                      onClick={() => setTime(h)}
                      style={{
                        padding: "9px 4px",
                        borderRadius: 8,
                        fontFamily: "inherit",
                        border: isSel
                          ? "2px solid var(--primary)"
                          : "1px solid " + (isTaken ? "var(--border)" : "rgba(16,185,129,0.3)"),
                        background: isSel ? "var(--primary)" : isTaken ? "#fafafa" : "#ecfdf5",
                        color: isSel ? "#fff" : isTaken ? "var(--muted-fg)" : "#065f46",
                        cursor: isTaken ? "not-allowed" : "pointer",
                        fontSize: 11.5,
                        fontWeight: 900,
                        textDecoration: isTaken ? "line-through" : "none",
                      }}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <div className="label-mp" style={{ marginBottom: 8 }}>
                5 · Invitar jugadores · <span style={{ color: "var(--muted-fg)" }}>opcional</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {["CA", "JM", "AR"].map((i, idx) => (
                  <div
                    key={i}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: INVITE_AVATARS[idx],
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9.5,
                      fontWeight: 900,
                      fontFamily: "Plus Jakarta Sans",
                    }}
                  >
                    {i}
                  </div>
                ))}
                <button
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: "50%",
                    background: "#fff",
                    border: "1.5px dashed var(--border)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="plus" size={12} />
                </button>
                <span
                  style={{
                    fontSize: 10.5,
                    color: "var(--muted-fg)",
                    alignSelf: "center",
                    marginLeft: 4,
                  }}
                >
                  3 / 4 jugadores
                </span>
              </div>

              <div style={{ padding: 14, background: "#0a0a0a", color: "#fff", borderRadius: 10 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 800 }}>
                      {selectedDay.label} {selectedDay.dateNum} {selectedDay.monthShort} · {time ?? "—"}
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.6)" }}>
                      {courtLabel} · {duration} min
                    </div>
                  </div>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      color: "var(--primary)",
                    }}
                  >
                    ${price.toFixed(2)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, fontSize: 9.5, color: "rgba(255,255,255,0.6)" }}>
                  <span>
                    ${(price * 0.67).toFixed(0)} cancha + ${(price * 0.33).toFixed(0)} com.
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    Dividir entre 4 · ${(price / 4).toFixed(2)} c/u
                  </span>
                </div>
              </div>

              {errorMsg && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    background: "#fee2e2",
                    border: "1px solid #fca5a5",
                    borderRadius: 8,
                    fontSize: 11.5,
                    color: "#b91c1c",
                  }}
                >
                  {errorMsg}
                </div>
              )}
            </div>

            <div
              style={{
                padding: "14px 22px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 8,
              }}
            >
              <button
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                <Icon name="layers" size={13} />
                Más opciones
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 1, opacity: submitting || !time ? 0.6 : 1 }}
                onClick={handleConfirm}
                disabled={submitting || !time}
              >
                <Icon name="lock" size={13} color="#fff" />
                {submitting ? "Reservando…" : "Confirmar y pagar"}
              </button>
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
                  ["Hora", `${time ?? "—"} · ${duration} min`],
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { i: "users", l: "Invitar jugadores", primary: true },
                { i: "calendar-plus", l: "Agregar a calendario" },
                { i: "share-2", l: "Compartir" },
                { i: "file-text", l: "Recibo · PDF" },
              ].map((a) => (
                <button
                  key={a.l}
                  className="card"
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
                    <Icon name={a.i} size={12} color={a.primary ? "#fff" : "#0a0a0a"} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 900 }}>{a.l}</div>
                </button>
              ))}
            </div>

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
