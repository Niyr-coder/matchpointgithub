// Pantalla Mis reservas — tabs Próximas / Pasadas / Canceladas.
"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ReservationCheckInQr } from "../shared/ReservationCheckInQr";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { cancelReservation } from "@/server/actions/reservations";

type Status = "booked" | "confirmed" | "checked_in" | "no_show" | "cancelled" | "completed";

export type MisReserva = {
  id: string;
  clubId: string;
  during: string;
  status: Status;
  sport: string;
  source: string;
  checkInCode: string | null;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  clubName: string;
  clubCity: string | null;
  clubSlug: string | null;
  courtLabel: string;
};

export type MisReservasData = {
  meUserId: string | null;
  items: MisReserva[];
};

type Tab = "proximas" | "pasadas" | "canceladas";

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
  football: "Fútbol",
  squash: "Squash",
};

const STATUS_LABEL: Record<Status, string> = {
  booked: "Reservada",
  confirmed: "Confirmada",
  checked_in: "En cancha",
  no_show: "No-show",
  cancelled: "Cancelada",
  completed: "Jugada",
};

const STATUS_COLOR: Record<Status, string> = {
  booked: "#0ea5e9",
  confirmed: "#10b981",
  checked_in: "#7c3aed",
  no_show: "#dc2626",
  cancelled: "#94a3b8",
  completed: "#10b981",
};

// Parse tstzrange "[lower,upper)" → { start, end }
function parseRange(range: string): { start: Date | null; end: Date | null } {
  const m = range.match(/^[[(]"?([^",)]+)"?,"?([^",)]+)"?[\])]$/);
  if (!m) return { start: null, end: null };
  return { start: new Date(m[1]), end: new Date(m[2]) };
}

function fmtDateTime(d: Date): { day: string; mon: string; time: string } {
  return {
    day: String(d.getDate()),
    mon: MONTHS_ES[d.getMonth()],
    time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
  };
}

function fmtRel(start: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  if (diff > 1 && diff < 7) return `En ${diff} días`;
  if (diff < -1 && diff > -7) return `Hace ${Math.abs(diff)} días`;
  return `${start.getDate()} ${MONTHS_ES[start.getMonth()]}`;
}

export function MisReservasScreenView({ data }: { data: MisReservasData }) {
  const [tab, setTab] = useState<Tab>("proximas");

  useRealtimeRefresh(
    data.meUserId
      ? [
          { table: "reservations", filter: `organizer_id=eq.${data.meUserId}` },
          { table: "reservations", filter: `for_user_id=eq.${data.meUserId}` },
        ]
      : [],
    { enabled: !!data.meUserId, debounceMs: 1000 },
  );

  const buckets = useMemo(() => {
    const now = new Date();
    const proximas: MisReserva[] = [];
    const pasadas: MisReserva[] = [];
    const canceladas: MisReserva[] = [];
    for (const r of data.items) {
      if (r.status === "cancelled") {
        canceladas.push(r);
        continue;
      }
      const { end } = parseRange(r.during);
      if (end && end.getTime() < now.getTime()) pasadas.push(r);
      else proximas.push(r);
    }
    // Próximas ASC (más cercana primero), pasadas DESC (más reciente primero).
    proximas.sort((a, b) => {
      const ea = parseRange(a.during).start?.getTime() ?? 0;
      const eb = parseRange(b.during).start?.getTime() ?? 0;
      return ea - eb;
    });
    pasadas.sort((a, b) => {
      const ea = parseRange(a.during).start?.getTime() ?? 0;
      const eb = parseRange(b.during).start?.getTime() ?? 0;
      return eb - ea;
    });
    return { proximas, pasadas, canceladas };
  }, [data.items]);

  const list = buckets[tab];
  const tabs: { k: Tab; label: string; count: number }[] = [
    { k: "proximas", label: "Próximas", count: buckets.proximas.length },
    { k: "pasadas", label: "Pasadas", count: buckets.pasadas.length },
    { k: "canceladas", label: "Canceladas", count: buckets.canceladas.length },
  ];

  return (
    <>
      <div>
        <div className="label-mp">Mis reservas</div>
        <h1
          className="font-heading"
          style={{
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "6px 0 18px",
            lineHeight: 1,
          }}
        >
          Historial y próximas<span style={{ color: "var(--primary)" }}>.</span>
        </h1>
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
        {tabs.map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                padding: "10px 16px",
                background: "transparent",
                border: 0,
                borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
                marginBottom: -1,
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 7px",
                  borderRadius: 9999,
                  background: on ? "#0a0a0a" : "var(--muted)",
                  color: on ? "#fff" : "var(--muted-fg)",
                  fontWeight: 800,
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {list.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {list.map((r) => (
            <ReservationRow key={r.id} r={r} canCancel={tab === "proximas"} />
          ))}
        </div>
      )}
    </>
  );
}

function ReservationRow({ r, canCancel }: { r: MisReserva; canCancel: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const { start, end } = parseRange(r.during);
  const startFmt = start ? fmtDateTime(start) : null;
  const endFmt = end ? fmtDateTime(end) : null;
  const accent = STATUS_COLOR[r.status];

  // Solo se puede cancelar una reserva futura que aún no pasó por check-in.
  const cancellable =
    canCancel && (r.status === "booked" || r.status === "confirmed");

  const handleCancel = async () => {
    const ok = await confirm({
      title: "Cancelar reserva",
      body: `¿Cancelar tu reserva en ${r.clubName}? El club libera el horario para otros jugadores.`,
      confirmLabel: "Cancelar reserva",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelReservation({ id: r.id, body: {} });
      if (res.ok) {
        toast({ icon: "check", title: "Reserva cancelada" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
      }
    });
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "16px 20px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          width: 56,
          flexShrink: 0,
          textAlign: "center",
          padding: "8px 0",
          background: "var(--muted)",
          borderRadius: 10,
        }}
      >
        <div
          className="font-heading tabular"
          style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          {startFmt?.day ?? "—"}
        </div>
        <div
          style={{
            fontSize: 9,
            color: "var(--muted-fg)",
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginTop: 3,
          }}
        >
          {startFmt?.mon ?? ""}
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {r.clubSlug ? (
            <Link
              href={`/dashboard/clubes/${r.clubSlug}`}
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: "#0a0a0a",
                textDecoration: "none",
              }}
            >
              {r.clubName}
            </Link>
          ) : (
            <span style={{ fontSize: 14, fontWeight: 800 }}>{r.clubName}</span>
          )}
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: accent,
              background: `${accent}1f`,
              padding: "2px 7px",
              borderRadius: 9999,
            }}
          >
            ● {STATUS_LABEL[r.status]}
          </span>
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: "var(--muted-fg)",
            marginTop: 4,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>{r.courtLabel}</span>
          <span>·</span>
          <span>{SPORT_LABEL[r.sport] ?? r.sport}</span>
          {r.clubCity && (
            <>
              <span>·</span>
              <span>{r.clubCity}</span>
            </>
          )}
        </div>
        {(r.status === "booked" || r.status === "confirmed") && r.checkInCode ? (
          <ReservationCheckInQr
            clubId={r.clubId}
            reservationId={r.id}
            source={r.source}
            checkInCode={r.checkInCode}
          />
        ) : null}
      </div>

      <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <div
          className="font-heading tabular"
          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", color: "#0a0a0a" }}
        >
          {startFmt?.time ?? "—"}
          {endFmt && <span style={{ color: "var(--muted-fg)" }}> · {endFmt.time}</span>}
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            marginTop: 3,
          }}
        >
          {start ? fmtRel(start) : ""}
        </div>
        {cancellable && (
          <button
            onClick={handleCancel}
            disabled={pending}
            style={{
              marginTop: 8,
              padding: "5px 10px",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#dc2626",
              background: "transparent",
              border: "1px solid #dc262644",
              borderRadius: 8,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
              fontFamily: "inherit",
            }}
          >
            {pending ? "Cancelando…" : "Cancelar"}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const LABELS: Record<Tab, { icon: string; title: string; sub: string }> = {
    proximas: {
      icon: "calendar-plus",
      title: "Sin próximas reservas",
      sub: "Reserva una cancha y aparecerá aquí con su fecha y hora.",
    },
    pasadas: {
      icon: "history",
      title: "Sin partidos pasados",
      sub: "Tu historial aparecerá aquí cuando termine tu primera reserva.",
    },
    canceladas: {
      icon: "calendar-x",
      title: "Sin canceladas",
      sub: "Las reservas que canceles aparecerán aquí por referencia.",
    },
  };
  const x = LABELS[tab];
  return (
    <div
      className="card"
      style={{ padding: 48, textAlign: "center", color: "var(--muted-fg)" }}
    >
      <Icon name={x.icon} size={32} color="var(--muted-fg)" />
      <div
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 900,
          marginTop: 12,
          color: "#0a0a0a",
          textTransform: "uppercase",
        }}
      >
        {x.title}
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{x.sub}</p>
    </div>
  );
}
