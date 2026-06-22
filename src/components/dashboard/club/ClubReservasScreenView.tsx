// Client view de ClubReservasScreen — layout del mock 1:1. Solo cambian valores.
// El mock con celdas "+ $14" YA es el estado vacío natural del grid.
"use client";
import { Fragment, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { createReservation, searchUsersForBooking } from "@/server/actions/reservations";

type UserMatch = {
  id: string;
  displayName: string;
  username: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export type ReservasData = {
  clubId: string | null;
  clubName: string;
  // Todas las canchas activas del club (no hay cap). Cada una con su grid 7×14
  // y su precio mínimo individual.
  courts: {
    id: string;
    label: string;
    sport: "pickleball" | "padel" | "tennis";
    grid: number[][];
    // Meta por celda ocupada: nombre del cliente + kind. Key: "${dayIdx}-${hourIdx}".
    cellMeta: Record<string, { name: string; kind: string }>;
    minPriceCents: number | null;
  }[];
  weekRangeLabel: string;
  daysLabels: string[]; // 7 labels tipo "LUN 12"
  weekStartIso: string; // Mon 00:00 local, ISO string — para derivar fechas de slots
  occupancyPct: number;
  minPriceCents: number | null; // global, fallback
};

// Grid alineado a la convención de booking (09:00–22:00, cada hora).
const HOURS = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];

/** Índice 0–6 de hoy dentro de la semana del grid, o null si hoy no está en esa semana. */
function todayIndexInWeek(weekStartIso: string, nowMs: number): number | null {
  const weekStart = new Date(weekStartIso);
  weekStart.setHours(0, 0, 0, 0);
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const dayIdx = Math.round((today.getTime() - weekStart.getTime()) / 86_400_000);
  return dayIdx >= 0 && dayIdx <= 6 ? dayIdx : null;
}

const LEGEND: { c: string; l: string }[] = [
  { c: "#d1fae5", l: "Libre · clickea para reservar" },
  { c: "var(--primary)", l: "Reservada" },
  { c: "#fbbf24", l: "Evento" },
  { c: "#7c3aed", l: "Clase" },
];

// State map: 0 libre, 1 reservada (kind=booking), 2 evento (kind=event),
// 3 clase (kind=class). Cualquier otro valor cae al estado libre (defensa
// contra grids mal armados — pasó antes con grids 7×8 vs HOURS de 14).
function cell(s: number, opts: { disabled?: boolean; past?: boolean } = {}) {
  const { disabled = false, past = false } = opts;
  // Past slot vacío → gris neutro bloqueado. Past slot reservado mantiene
  // el color de su kind (queda obvio que ya pasó por estar en columna de
  // días anteriores, sin perder la info de qué tipo era).
  if (past && s === 0) {
  return {
    height: 36,
    borderRadius: 5,
    fontSize: 9.5,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    width: "100%",
    background: "var(--muted)",
      color: "var(--muted-fg)",
      cursor: "not-allowed",
      opacity: 0.55,
    } as const;
  }
  // Mint claro = libre/clickeable, verde sólido (--primary) = reservada (BOOK),
  // ámbar = evento, violeta = clase.
  const palette: Record<number, { bg: string; fg: string }> = {
    0: { bg: "#d1fae5", fg: "#047857" },
    1: { bg: "var(--primary)", fg: "#fff" },
    2: { bg: "#fbbf24", fg: "#fff" },
    3: { bg: "#7c3aed", fg: "#fff" },
  };
  const p = palette[s] ?? palette[0];
  return {
    height: 36,
    borderRadius: 5,
    fontSize: 9.5,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    width: "100%",
    background: p.bg,
    color: p.fg,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : past ? 0.7 : 1,
  } as const;
}

function emptyGrid(): number[][] {
  return Array(7).fill(null).map(() => Array(HOURS.length).fill(0));
}

// Cuando el club no tiene canchas, 1 tab placeholder + grid vacío sin precio.
const EMPTY_COURT = {
  id: "empty",
  label: "Sin canchas",
  sport: "pickleball" as const,
  grid: emptyGrid(),
  cellMeta: {} as Record<string, { name: string; kind: string }>,
  minPriceCents: null as number | null,
};

// Target del modal de reserva manual: prefill (clicked from grid cell) o null
// (clicked from "Reserva manual" button → owner elige todo).
type ManualTarget = {
  courtId: string;
  startsAt: string; // ISO
  endsAt: string; // ISO (default +90 min)
};

export function ClubReservasScreenView({
  data,
  showReceptionHourHint = false,
}: {
  data: ReservasData;
  showReceptionHourHint?: boolean;
}) {
  useRealtimeRefresh(
    data.clubId ? [{ table: "reservations", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  // Si hay courts reales → todos; si no → 1 tab "Sin canchas".
  const courts = data.courts.length > 0 ? data.courts : [EMPTY_COURT];
  const hasReal = data.courts.length > 0;

  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [activeIdx, setActiveIdx] = useState(0);
  const safeIdx = activeIdx < courts.length ? activeIdx : 0;
  const activeCourt = courts[safeIdx];
  const [manualOpen, setManualOpen] = useState<ManualTarget | "open" | null>(null);

  // "Ahora" leído una sola vez al montar (react-hooks/purity). Se actualiza
  // en re-render por realtime cuando llegan cambios.
  const [nowMs] = useState(() => Date.now());
  const weekStart = new Date(data.weekStartIso);
  const slotStartMs = (dayIdx: number, hourIdx: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dayIdx);
    d.setHours(Number(HOURS[hourIdx]), 0, 0, 0);
    return d.getTime();
  };
  // Past = el slot ya arrancó (grace de 60s alineada al handler de click).
  // Antes comparábamos contra slotEnd, lo que dejaba slots en curso pintados
  // verdes/clickeables y al clickear saltaba el toast "Ese horario ya pasó".
  const isPastSlot = (dayIdx: number, hourIdx: number) =>
    slotStartMs(dayIdx, hourIdx) < nowMs - 60_000;
  const todayDayIdx = todayIndexInWeek(data.weekStartIso, nowMs);

  // Click en celda libre (state=0) → abre modal con prefill de court+slot.
  // dayIdx 0=Lunes ... 6=Domingo. hourIdx → HOURS[hi] (string "09".."22").
  const handleCellClick = (dayIdx: number, hourIdx: number) => {
    if (!hasReal) return;
    const hour = Number(HOURS[hourIdx]);
    const start = new Date(data.weekStartIso);
    start.setDate(start.getDate() + dayIdx);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    // Guard secundario: el render ya bloquea celdas pasadas, pero por si
    // alguien hace doble-click justo cuando cruza el minuto.
    if (start.getTime() < nowMs - 60_000) {
      toast({ icon: "x", title: "Ese horario ya pasó" });
      return;
    }
    setManualOpen({
      courtId: activeCourt.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
  };

  const handleCreate = (
    courtIds: string[],
    startsAt: string,
    endsAt: string,
    clientName: string,
    notes: string,
    forUserId: string | null,
  ) => {
    if (!data.clubId || courtIds.length === 0) return;
    const combinedNotes = forUserId
      ? notes.trim() || undefined
      : [clientName.trim(), notes.trim()].filter(Boolean).join(" · ") || undefined;
    startTransition(async () => {
      // Loop secuencial — paralelo podría disparar rate limit múltiple por
      // user. Para 3-4 canchas el costo total es similar y el feedback más
      // claro (errores por cancha aislados).
      const ok: string[] = [];
      const failed: Array<{ court: string; msg: string }> = [];
      for (const courtId of courtIds) {
        const court = data.courts.find((c) => c.id === courtId);
        if (!court) continue;
        const r = await createReservation({
          clubId: data.clubId,
          courtId,
          startsAt,
          endsAt,
          sport: court.sport,
          visibility: "private",
          maxPlayers: 4,
          notes: combinedNotes,
          forUserId: forUserId ?? undefined,
        });
        if (r.ok) {
          ok.push(court.label);
        } else {
          const msg =
            r.error.code === "RESERVATION.SLOT_TAKEN"
              ? "slot ocupado"
              : r.error.code === "RESERVATION.IN_PAST"
                ? "horario pasado"
                : r.error.code === "RESERVATION.OUTSIDE_WINDOW"
                  ? "fuera del horizonte"
                  : r.error.message;
          failed.push({ court: court.label, msg });
        }
      }
      if (ok.length > 0 && failed.length === 0) {
        toast({
          icon: "check-circle-2",
          title: ok.length === 1 ? "Reserva creada" : `${ok.length} reservas creadas`,
          sub: ok.join(" · "),
        });
        setManualOpen(null);
      } else if (ok.length > 0 && failed.length > 0) {
        toast({
          icon: "alert-triangle",
          title: `${ok.length} ok · ${failed.length} fallaron`,
          sub: failed.map((f) => `${f.court}: ${f.msg}`).join(" · "),
        });
        setManualOpen(null);
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo reservar",
          sub: failed.map((f) => `${f.court}: ${f.msg}`).join(" · "),
        });
      }
      router.refresh();
    });
  };

  const activeMinPrice =
    activeCourt.minPriceCents != null
      ? Math.round(activeCourt.minPriceCents / 100)
      : null;

  const freeCellLabel = activeMinPrice != null ? `+ $${activeMinPrice}` : "+ $—";
  const LABEL: Record<number, string> = {
    0: freeCellLabel,
    1: "BOOK",
    2: "EVT",
    3: "CLASE",
  };
  const GRID = activeCourt.grid;
  const hourColWidth = showReceptionHourHint ? 56 : 50;
  const gridCols = `${hourColWidth}px repeat(7, minmax(0, 1fr))`;

  return (
    <>
      {showReceptionHourHint ? (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            marginBottom: 12,
            background: "#fffbeb",
            border: "1px solid #fde68a",
            fontSize: 12,
            lineHeight: 1.45,
          }}
        >
          En esta vista las <b>columnas son los días</b> (lun–dom) y las <b>horas van a la izquierda</b>{' '}
          (09:00, 10:00, …). Para ver <b>todas las canchas por hora</b> en un solo día, usa{' '}
          <a href="/dashboard/employee/e-calendario" style={{ fontWeight: 900, color: "var(--primary)" }}>
            Calendario hoy
          </a>
          .
        </div>
      ) : null}
      <RSHeader
        label="Club · Operación"
        title="Reservas semanales"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              disabled={!hasReal}
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="chevron-left" size={12} />
            </button>
            <button
              className="btn"
              disabled={!hasReal}
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              {data.weekRangeLabel}
            </button>
            <button
              className="btn"
              disabled={!hasReal}
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="chevron-right" size={12} />
            </button>
            <button
              onClick={() => setManualOpen("open")}
              className="btn btn-primary"
              disabled={!hasReal}
              style={{
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
            >
              <Icon name="plus" size={13} color="#fff" />
              Reserva manual
            </button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 10.5 }}>
        {LEGEND.map((k) => (
          <span key={k.l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: k.c }} />
            {k.l}
          </span>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--muted-fg)" }}>
          Ocupación esta semana · <b style={{ color: "#0a0a0a" }}>{data.occupancyPct}%</b>
        </span>
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div
          className="mp-touch-hscroll"
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 10,
          }}
        >
          {courts.map((c, n) => {
            const on = n === safeIdx;
            return (
              <button
                key={c.id}
                onClick={() => setActiveIdx(n)}
                disabled={!hasReal}
                style={{
                  flex: courts.length <= 6 ? 1 : "0 0 auto",
                  minWidth: courts.length > 6 ? 100 : undefined,
                  padding: "8px",
                  borderRadius: 8,
                  borderWidth: on && hasReal ? 2 : 1,
                  borderStyle: hasReal ? "solid" : "dashed",
                  borderColor: on && hasReal ? "var(--primary)" : "var(--border)",
                  background: on && hasReal ? "#ecfdf5" : "#fff",
                  cursor: hasReal ? "pointer" : "default",
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  color: hasReal ? "#0a0a0a" : "var(--muted-fg)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="mp-reservas-grid-scroll">
          <div
            className="mp-reservas-week-grid"
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 9,
                fontWeight: 900,
                color: "var(--muted-fg)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "flex-end",
                paddingRight: 6,
                paddingBottom: 4,
                minWidth: 0,
              }}
            >
              HORA ↓
              <br />
              DÍA →
            </div>
            {data.daysLabels.map((d, i) => (
              <div
                key={d}
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  textAlign: "center",
                  letterSpacing: "0.06em",
                  padding: 6,
                  color: i === todayDayIdx ? "var(--primary)" : "var(--muted-fg)",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {d}
              </div>
            ))}
            {HOURS.map((h, hi) => (
              <Fragment key={h}>
                <div
                  style={{
                    fontSize: showReceptionHourHint ? 11 : 9.5,
                    fontWeight: 900,
                    color: showReceptionHourHint ? "#0a0a0a" : "var(--muted-fg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    paddingRight: 6,
                    minWidth: 0,
                  }}
                >
                  {h}:00
                </div>
                {GRID.map((day, di) => {
                  const state = day[hi];
                  const past = isPastSlot(di, hi);
                  const clickable = hasReal && state === 0 && !past;
                  const meta = activeCourt.cellMeta[`${di}-${hi}`];
                  const reserved = state !== 0;
                  return (
                    <ReservedCell
                      key={`${h}-${di}`}
                      state={state}
                      past={past}
                      clickable={clickable}
                      meta={meta}
                      hourLabel={HOURS[hi]}
                      freeLabel={
                        past && state === 0 ? "—" : reserved ? undefined : LABEL[state]
                      }
                      onClick={clickable ? () => handleCellClick(di, hi) : undefined}
                      cellStyle={cell(state, { disabled: !hasReal, past })}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
      {manualOpen && data.clubId && (
        <ManualReservationModal
          clubId={data.clubId}
          courts={data.courts}
          weekStartIso={data.weekStartIso}
          prefill={manualOpen === "open" ? null : manualOpen}
          defaultCourtId={activeCourt.id}
          onClose={() => setManualOpen(null)}
          onCreate={handleCreate}
          pending={pending}
        />
      )}
    </>
  );
}

// ── Modal de reserva manual (staff) ──────────────────────────────────────
// ── ReservedCell ─────────────────────────────────────────────────────────
// Celda del grid con hover: zoom sutil + sombra, y tooltip flotante con el
// nombre del cliente cuando la celda está reservada. Para celdas libres
// muestra el label "+ $X" igual que antes.
function ReservedCell({
  state,
  past,
  clickable,
  meta,
  hourLabel,
  freeLabel,
  onClick,
  cellStyle,
}: {
  state: number;
  past: boolean;
  clickable: boolean;
  meta: { name: string; kind: string } | undefined;
  hourLabel: string;
  freeLabel: string | undefined;
  onClick: (() => void) | undefined;
  cellStyle: React.CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const reserved = state !== 0;
  const kindLabel = !meta
    ? null
    : meta.kind === "class"
      ? "Clase"
      : meta.kind === "event"
        ? "Evento"
        : "Reserva";

  // Nombre compacto fijo: no debe empujar el ancho de columna del grid.
  const shortName = (() => {
    if (!meta) return reserved ? "•" : null;
    const parts = meta.name.split(" ").filter(Boolean);
    if (parts.length === 0) return "•";
    if (parts.length === 1) return parts[0].slice(0, 5);
    return `${parts[0].slice(0, 4)}${parts[parts.length - 1][0]}.`.slice(0, 6);
  })();

  // Hover sólo en libres clickeables — el salto en reservadas distraía al
  // staff y se confundía con un estado "clickeable". El tooltip con el nombre
  // del cliente igual aparece en reservadas (más abajo) sin necesidad de
  // mover la celda.
  const hoverActive = hover && clickable;
  const transformStyle: React.CSSProperties = {
    transform: hoverActive ? "scale(1.04)" : "scale(1)",
    transition: "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 160ms",
    boxShadow: hoverActive ? "0 3px 8px rgba(0,0,0,0.12)" : "none",
    zIndex: hover && reserved ? 5 : hoverActive ? 5 : 1,
    position: "relative" as const,
  };

  return (
    <div
      className="mp-reservas-cell"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...cellStyle, ...transformStyle, padding: "0 3px", minWidth: 0 }}
      title={
        meta?.name
          ? `${meta.name}${kindLabel ? ` · ${kindLabel}` : ""} · ${hourLabel}:00`
          : clickable
            ? "Crear reserva manual"
            : past && state === 0
              ? "Horario ya pasó"
              : undefined
      }
    >
      <span
        style={{
          fontSize: reserved ? 8.5 : 9.5,
          fontWeight: 800,
          letterSpacing: reserved ? 0 : "0.04em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          minWidth: 0,
          width: "100%",
          textAlign: "center",
        }}
      >
        {reserved ? shortName : freeLabel}
      </span>
      {/* Tooltip flotante con detalles al hacer hover (solo en reservadas con meta) */}
      {hover && reserved && meta && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 50,
            padding: "8px 11px",
            borderRadius: 8,
            background: "#0a0a0a",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 900 }}>{meta.name}</div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.65)",
              marginTop: 2,
            }}
          >
            {kindLabel} · {hourLabel}:00
          </div>
          {/* arrow */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #0a0a0a",
            }}
          />
        </div>
      )}
    </div>
  );
}

function ManualReservationModal({
  clubId,
  courts,
  weekStartIso,
  prefill,
  defaultCourtId,
  onClose,
  onCreate,
  pending,
}: {
  clubId: string;
  courts: ReservasData["courts"];
  weekStartIso: string;
  prefill: ManualTarget | null;
  defaultCourtId: string;
  onClose: () => void;
  onCreate: (
    courtIds: string[],
    startsAt: string,
    endsAt: string,
    clientName: string,
    notes: string,
    forUserId: string | null,
  ) => void;
  pending: boolean;
}) {
  // datetime-local quiere "YYYY-MM-DDTHH:mm" local sin zona.
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  // Multi-court: set de IDs seleccionados (1+).
  const [courtIds, setCourtIds] = useState<Set<string>>(
    () => new Set([prefill?.courtId ?? defaultCourtId]),
  );
  const toggleCourt = (id: string) =>
    setCourtIds((s) => {
      const n = new Set(s);
      if (n.has(id)) {
        if (n.size > 1) n.delete(id); // siempre al menos 1
      } else n.add(id);
      return n;
    });
  const [start, setStart] = useState(prefill ? toLocal(prefill.startsAt) : "");
  const [end, setEnd] = useState(prefill ? toLocal(prefill.endsAt) : "");
  // Duración como preset (60/90/120/...) o null = "Personalizar" (custom end).
  // Default 60 min — matchea con el prefill que viene de click en celda.
  const [durationMin, setDurationMin] = useState<number | null>(60);
  // Cliente: tab usuario real (mig 170 for_user_id) vs walkin (texto en notes).
  const [mode, setMode] = useState<"user" | "walkin">("user");
  const [picked, setPicked] = useState<UserMatch | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [walkinName, setWalkinName] = useState("");
  const [notes, setNotes] = useState("");

  // Debounced search: dispara después de 250ms de quieto.
  useEffect(() => {
    if (mode !== "user") return;
    if (picked) return; // ya tiene un user seleccionado
    const q = query.trim();
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpiar resultados al borrar query
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      void searchUsersForBooking({ clubId, q, limit: 8 }).then((r) => {
        if (cancelled) return;
        setSearching(false);
        if (r.ok) setResults(r.data);
        else setResults([]);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, mode, picked, clubId]);

  const clientReady =
    mode === "user" ? picked != null : walkinName.trim().length > 0;

  // ── Pre-flight conflict check (mismo week solo) ─────────────────────
  // Para cada cancha seleccionada, recorre las horas del rango y revisa
  // grid[dayIdx][hourIdx]. Si !=0 hay overlap → muestra el detalle con el
  // nombre del cliente actual de esa celda. Bloquea submit si hay 1+ conflict.
  const conflicts: Array<{
    courtLabel: string;
    hour: number;
    clientName: string;
    kind: string;
  }> = [];
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const weekStart = new Date(weekStartIso);
    // dayIdx desde inicio de semana (0=Lun ... 6=Dom). Si el slot cae fuera
    // de la semana visible no validamos client-side (el server tiene exclude).
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayIdx = Math.floor((startDate.getTime() - weekStart.getTime()) / msPerDay);
    if (dayIdx >= 0 && dayIdx <= 6) {
      const startH = startDate.getHours();
      const endH = endDate.getHours() + (endDate.getMinutes() > 0 ? 1 : 0);
      for (const cid of courtIds) {
        const court = courts.find((c) => c.id === cid);
        if (!court) continue;
        for (let h = startH; h < endH; h++) {
          const hourIdx = HOURS.indexOf(String(h).padStart(2, "0"));
          if (hourIdx < 0) continue;
          const state = court.grid[dayIdx]?.[hourIdx] ?? 0;
          if (state !== 0) {
            const meta = court.cellMeta[`${dayIdx}-${hourIdx}`];
            conflicts.push({
              courtLabel: court.label,
              hour: h,
              clientName: meta?.name ?? "Reserva",
              kind: meta?.kind ?? "booking",
            });
          }
        }
      }
    }
  }
  const hasConflicts = conflicts.length > 0;

  const valid =
    courtIds.size > 0 && start && end && clientReady && !hasConflicts;
  const inputStyle = {
    padding: "10px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontFamily: "inherit",
    fontSize: 13,
    background: "#fff",
    outline: "none",
    width: "100%",
  } as const;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 32px 64px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ padding: "20px 22px 14px", borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Reserva manual
          </div>
          <h3
            className="font-heading"
            style={{
              margin: "4px 0 0",
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            Crear reserva<span className="dot">.</span>
          </h3>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div
              className="label-mp"
              style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }}
            >
              <span>Canchas <span style={{ color: "#dc2626" }}>∗</span></span>
              <span
                style={{
                  color:
                    courtIds.size > 0 ? "var(--primary)" : "var(--muted-fg)",
                  fontWeight: 800,
                }}
              >
                {courtIds.size} seleccionada{courtIds.size === 1 ? "" : "s"}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {courts.map((c) => {
                const on = courtIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCourt(c.id)}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 9999,
                      border: on
                        ? "2px solid var(--primary)"
                        : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 800,
                      color: on ? "var(--primary)" : "#0a0a0a",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {on && <Icon name="check" size={11} color="var(--primary)" />}
                    {c.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 6 }}>
              Selecciona varias para reservar el mismo horario en todas
            </div>
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Inicio
            </div>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                // Si el end estaba sincronizado con un preset, recalcular.
                if (e.target.value && durationMin != null) {
                  const startMs = new Date(e.target.value).getTime();
                  const newEnd = new Date(startMs + durationMin * 60 * 1000);
                  setEnd(toLocal(newEnd.toISOString()));
                }
              }}
              style={inputStyle}
            />
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Duración
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[60, 120, 180, 240].map((mins) => {
                const on = durationMin === mins;
                const label = `${mins / 60}h`;
                return (
                  <button
                    key={mins}
                    onClick={() => {
                      setDurationMin(mins);
                      if (start) {
                        const startMs = new Date(start).getTime();
                        const newEnd = new Date(startMs + mins * 60 * 1000);
                        setEnd(toLocal(newEnd.toISOString()));
                      }
                    }}
                    style={{
                      padding: "7px 14px",
                      borderRadius: 9999,
                      border: on
                        ? "2px solid var(--primary)"
                        : "1px solid var(--border)",
                      background: on ? "#ecfdf5" : "#fff",
                      fontFamily: "inherit",
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: "pointer",
                      color: on ? "var(--primary)" : "#0a0a0a",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <button
                onClick={() => setDurationMin(null)}
                style={{
                  padding: "7px 14px",
                  borderRadius: 9999,
                  border:
                    durationMin === null
                      ? "2px solid #0a0a0a"
                      : "1px solid var(--border)",
                  background: durationMin === null ? "#0a0a0a" : "#fff",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: durationMin === null ? "#fff" : "#0a0a0a",
                }}
              >
                Personalizar
              </button>
            </div>
            {durationMin === null && (
              <div style={{ marginTop: 8 }}>
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
            {durationMin != null && end && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  marginTop: 6,
                  fontFamily: "ui-monospace, monospace",
                }}
              >
                Termina:{" "}
                {new Date(end).toLocaleString("es-EC", {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Cliente <span style={{ color: "#dc2626" }}>∗</span>
            </div>
            {/* Tabs Usuario MATCHPOINT vs Walk-in */}
            <div
              style={{
                display: "inline-flex",
                padding: 3,
                background: "var(--muted)",
                borderRadius: 9999,
                border: "1px solid var(--border)",
                marginBottom: 8,
              }}
            >
              {(
                [
                  { k: "user", l: "Usuario MATCHPOINT" },
                  { k: "walkin", l: "Walk-in" },
                ] as Array<{ k: "user" | "walkin"; l: string }>
              ).map((t) => {
                const on = mode === t.k;
                return (
                  <button
                    key={t.k}
                    onClick={() => {
                      setMode(t.k);
                      setPicked(null);
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 9999,
                      border: 0,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      background: on ? "#0a0a0a" : "transparent",
                      color: on ? "#fff" : "var(--muted-fg)",
                    }}
                  >
                    {t.l}
                  </button>
                );
              })}
            </div>

            {mode === "user" ? (
              picked ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    borderRadius: 8,
                    border: "2px solid var(--primary)",
                    background: "#ecfdf5",
                  }}
                >
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "var(--primary)",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-heading)",
                      fontWeight: 900,
                      fontSize: 11,
                    }}
                  >
                    {picked.displayName
                      .split(" ")
                      .map((p) => p[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>
                      {picked.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                      {picked.username ? `@${picked.username}` : ""}
                      {picked.username && picked.email ? " · " : ""}
                      {picked.email ?? ""}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setPicked(null);
                      setQuery("");
                    }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: "1px solid var(--border)",
                      background: "#fff",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    aria-label="Cambiar cliente"
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por nombre o @username (mín 2 letras)…"
                    style={inputStyle}
                  />
                  {query.trim().length >= 2 && (
                    <div
                      style={{
                        marginTop: 4,
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        background: "#fff",
                        maxHeight: 220,
                        overflowY: "auto",
                      }}
                    >
                      {searching ? (
                        <div
                          style={{
                            padding: 12,
                            fontSize: 11.5,
                            color: "var(--muted-fg)",
                          }}
                        >
                          Buscando…
                        </div>
                      ) : results.length === 0 ? (
                        <div
                          style={{
                            padding: 12,
                            fontSize: 11.5,
                            color: "var(--muted-fg)",
                          }}
                        >
                          Sin resultados. Pasa a Walk-in si no tiene cuenta.
                        </div>
                      ) : (
                        results.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              setPicked(u);
                              setQuery("");
                              setResults([]);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              width: "100%",
                              padding: "8px 10px",
                              background: "transparent",
                              border: 0,
                              cursor: "pointer",
                              textAlign: "left",
                              fontFamily: "inherit",
                              borderBottom: "1px solid var(--border)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#fafafa";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <span
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "#0a0a0a",
                                color: "#fff",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontFamily: "var(--font-heading)",
                                fontWeight: 900,
                                fontSize: 10,
                              }}
                            >
                              {u.displayName
                                .split(" ")
                                .map((p) => p[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                                {u.displayName}
                              </div>
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: "var(--muted-fg)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {u.username ? `@${u.username}` : ""}
                                {u.username && u.email ? " · " : ""}
                                {u.email ?? ""}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )
            ) : (
              <input
                value={walkinName}
                onChange={(e) => setWalkinName(e.target.value)}
                maxLength={120}
                placeholder="Ej. Andrés Vega (sin cuenta MATCHPOINT)"
                style={inputStyle}
              />
            )}
          </div>
          <div>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              Notas (opcional)
            </div>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={280}
              placeholder="Contacto, observaciones, etc"
              style={inputStyle}
            />
          </div>

          {/* ── Pre-flight conflict warning ── */}
          {hasConflicts && (
            <div
              style={{
                padding: 12,
                borderRadius: 9,
                background: "#fef2f2",
                border: "1px solid #fca5a5",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "#7f1d1d",
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                <Icon name="alert-triangle" size={14} color="#7f1d1d" />
                Conflicto de horario ({conflicts.length})
              </div>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                }}
              >
                {conflicts.slice(0, 6).map((c, i) => (
                  <li
                    key={i}
                    style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.4 }}
                  >
                    <b>{c.courtLabel}</b> · {String(c.hour).padStart(2, "0")}:00 ·{" "}
                    {c.kind === "class" ? "Clase" : c.kind === "event" ? "Evento" : "Reservada"} por{" "}
                    <b>{c.clientName}</b>
                  </li>
                ))}
                {conflicts.length > 6 && (
                  <li style={{ fontSize: 11, color: "#991b1b", fontStyle: "italic" }}>
                    +{conflicts.length - 6} más…
                  </li>
                )}
              </ul>
              <div
                style={{
                  fontSize: 11,
                  color: "#991b1b",
                  fontStyle: "italic",
                  marginTop: 4,
                }}
              >
                Cambia el horario, la duración o quita las canchas con conflicto para continuar.
              </div>
            </div>
          )}
        </div>
        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            onClick={onClose}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onCreate(
                [...courtIds],
                new Date(start).toISOString(),
                new Date(end).toISOString(),
                mode === "walkin" ? walkinName : picked?.displayName ?? "",
                notes,
                mode === "user" ? picked?.id ?? null : null,
              )
            }
            disabled={!valid || pending}
            className="btn btn-primary"
            style={{ opacity: !valid || pending ? 0.6 : 1 }}
          >
            <Icon name="check" size={13} color="#fff" />
            {courtIds.size > 1
              ? `Crear ${courtIds.size} reservas`
              : "Crear reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}
