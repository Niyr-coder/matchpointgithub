// Client view del EmployeeHome — layout 1:1 del mock.
"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RHPanel, RHWelcome } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { recordCheckIn } from "@/server/actions/walkins";
import type { ReceptionQueueItem } from "@/server/queries/reception-queue";
import type { CourtOccupancySnapshot } from "@/server/queries/court-occupancy";
export type CashTileData = {
  l: string;
  v: string;
  i: string;
  accent?: boolean;
  warn?: boolean;
};
export type EmployeeHomeData = {
  clubId: string | null;
  clubName: string;
  userName: string | null;
  nextCheckins: ReceptionQueueItem[];
  cash: CashTileData[];
  checkinsAttended: number;
  walkinsHandled: number;
  cashTotalLabel: string;
  openTickets: number;
  shiftStartedLabel: string | null;
  pendingCheckins: number;
  courts: CourtOccupancySnapshot | null;
};

const COURT_DOT: Record<string, string> = {
  free: "var(--primary)",
  busy: "#f59e0b",
  class: "#7c3aed",
};

const ST_LABEL: Record<ReceptionQueueItem["st"], string> = {
  "on-time": "A TIEMPO",
  arriving: "LLEGANDO",
  walkin: "WALK-IN",
};

const QUICK = [
  { i: "user-plus", l: "Walk-in nuevo", sub: "Cola de recepción", href: "/dashboard/employee/e-walkins" },
  { i: "calendar", l: "Calendario hoy", sub: "Hora a hora · 8 canchas", href: "/dashboard/employee/e-calendario" },
  { i: "square", l: "Canchas en vivo", sub: "Disponibilidad ahora", href: "/dashboard/employee/e-walkins" },
  { i: "user-check", l: "Check-in completo", sub: "Cola y QR", href: "/dashboard/employee/e-checkin" },
  { i: "alert-triangle", l: "Soporte", sub: "Tickets del club", href: "/dashboard/employee/e-soporte" },
  { i: "shopping-bag", l: "Vender pro shop", sub: "POS del club", href: "/dashboard/employee/e-shop" },
] as const;

const PLACEHOLDER_CHECKINS = 4;

function CheckinPlaceholderRow({ first }: { first: boolean }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 38px 1fr auto auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 0",
        borderTop: first ? "0" : "1px dashed var(--border)",
        opacity: 0.55,
      }}
    >
      <div
        className="font-heading"
        style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", color: "var(--muted-fg)" }}
      >
        —
      </div>
      <span
        style={{
          padding: "3px 8px",
          borderRadius: 5,
          background: "#fafafa",
          border: "1px dashed var(--border)",
          fontSize: 10,
          fontWeight: 900,
          textAlign: "center",
          color: "var(--muted-fg)",
        }}
      >
        —
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)" }}>Sin check-ins próximos</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>—</div>
      </div>
      <span
        style={{
          padding: "3px 8px",
          borderRadius: 9999,
          fontSize: 8.5,
          fontWeight: 900,
          letterSpacing: "0.12em",
          background: "var(--muted)",
          color: "var(--muted-fg)",
        }}
      >
        —
      </span>
      <button className="btn" style={{ fontSize: 10, padding: "5px 11px", opacity: 0.6 }} disabled>
        Check-in
      </button>
    </div>
  );
}

export function EmployeeHomeView({ data }: { data: EmployeeHomeData }) {
  const toast = useToast();
  const router = useRouter();
  const [checkinPending, startCheckin] = useTransition();

  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
          { table: "check_ins", filter: `club_id=eq.${data.clubId}` },
          { table: "walkins", filter: `club_id=eq.${data.clubId}` },
          { table: "transactions", filter: `club_id=eq.${data.clubId}` },
          { table: "tickets", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId, debounceMs: 400 },
  );

  const handleCheckIn = (reservationId: string) => {
    if (!data.clubId) return;
    startCheckin(async () => {
      const res = await recordCheckIn({
        clubId: data.clubId!,
        reservationId,
        method: "manual",
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: "Check-in registrado",
          sub: "La reserva pasó a «En cancha» y salió de la cola",
        });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo registrar", sub: res.error.message });
      }
    });
  };

  const hasCheckins = data.nextCheckins.length > 0;

  return (
    <>
      <RHWelcome role="employee" userName={data.userName} />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          className="mp-grid-form-3 gap-5"
          style={{
            padding: 22,
            alignItems: "center",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● En turno
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 26,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              {data.clubName}<span className="dot">.</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
              {data.shiftStartedLabel ?? "Aún sin check-ins tuyos hoy"}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "var(--primary)",
              }}
            >
              {data.pendingCheckins}
            </div>
            <div
              style={{
                fontSize: 10,
                color: "var(--muted-fg)",
                fontWeight: 800,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              Check-ins pendientes
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              alignItems: "flex-end",
            }}
          >
            <Link href="/dashboard/employee/e-checkin" className="btn btn-primary">
              <Icon name="qr-code" size={12} color="#fff" />
              Ir a check-in
            </Link>
            <Link
              href="/dashboard/employee/e-calendario"
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
            >
              Calendario hoy
            </Link>
          </div>
        </div>
        <div
          style={{
            padding: "0 22px 14px",
            display: "flex",
            gap: 14,
            fontSize: 11,
            color: "var(--muted-fg)",
          }}
        >
          <span>
            <b style={{ color: "var(--primary)" }}>● {data.checkinsAttended}</b> check-ins atendidos
          </span>
          <span>
            · <b style={{ color: "#0a0a0a" }}>{data.walkinsHandled}</b> walk-ins resueltos
          </span>
          <span>
            · <b style={{ color: "#0a0a0a" }}>{data.cashTotalLabel}</b> caja
          </span>
          <span>
            · <b style={{ color: data.openTickets > 0 ? "#dc2626" : "#0a0a0a" }}>{data.openTickets}</b>{" "}
            tickets abiertos
          </span>
        </div>
      </div>

      <div className="mp-grid-split gap-4">
        <RHPanel
          title="Próximos check-ins"
          action={
            <Link
              href="/dashboard/employee/e-checkin"
              className="btn btn-primary"
              style={{ fontSize: 10.5, opacity: hasCheckins ? 1 : 0.5, pointerEvents: hasCheckins ? "auto" : "none" }}
            >
              <Icon name="qr-code" size={12} color="#fff" />
              Ver cola
            </Link>
          }
        >
          <div className="mp-table-scroll">
          <div style={{ minWidth: 400 }}>
          {hasCheckins
            ? data.nextCheckins.map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 38px 1fr auto auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 0",
                    borderTop: i === 0 ? "0" : "1px solid var(--border)",
                  }}
                >
                  <div
                    className="font-heading"
                    style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em" }}
                  >
                    {r.t}
                  </div>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 5,
                      background: "var(--muted)",
                      fontSize: 10,
                      fontWeight: 900,
                      textAlign: "center",
                    }}
                  >
                    {r.c}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{r.n}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                      {r.sport} · {r.d} · {r.code}
                    </div>
                  </div>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 9999,
                      fontSize: 8.5,
                      fontWeight: 900,
                      letterSpacing: "0.12em",
                      background:
                        r.st === "arriving"
                          ? "#fbbf24"
                          : r.st === "walkin"
                            ? "#dc2626"
                            : "var(--muted)",
                      color:
                        r.st === "arriving" || r.st === "walkin" ? "#fff" : "var(--muted-fg)",
                    }}
                  >
                    {ST_LABEL[r.st]}
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 10, padding: "5px 11px" }}
                    disabled={checkinPending}
                    onClick={() => handleCheckIn(r.id)}
                  >
                    Check-in
                  </button>
                </div>
              ))
            : Array.from({ length: PLACEHOLDER_CHECKINS }).map((_, i) => (
                <CheckinPlaceholderRow key={i} first={i === 0} />
              ))}
          </div>
          </div>
        </RHPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.courts && data.courts.total > 0 ? (
            <RHPanel
              title={`Canchas · ${data.courts.free} de ${data.courts.total} libres`}
              action={
                <Link
                  href="/dashboard/employee/e-walkins"
                  className="btn"
                  style={{ fontSize: 10, padding: "5px 10px", background: "#fff", border: "1px solid var(--border)" }}
                >
                  Detalle
                </Link>
              }
            >
              <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4, margin: "0 0 10px" }}>
                {data.courts.answerLine}
              </p>
              <div
                className="mp-grid-form-2 gap-1.5"
                style={{
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {data.courts.courts.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: c.status === "free" ? "#ecfdf5" : "var(--muted)",
                      border: "1px solid var(--border)",
                      fontSize: 10.5,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: COURT_DOT[c.status],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.n}
                      </span>
                    </div>
                    <div style={{ color: "var(--muted-fg)", marginTop: 3, fontSize: 9.5 }}>
                      {c.sport}
                      {c.status !== "free" ? ` · hasta ${c.until}` : " · libre"}
                    </div>
                  </div>
                ))}
              </div>
            </RHPanel>
          ) : null}
          <RHPanel title="Caja · ahora">
            <div className="mp-grid-form-2 gap-1.5" style={{ marginBottom: 10 }}>
              {data.cash.map((b, i) => (
                <div
                  key={i}
                  style={{
                    padding: 9,
                    borderRadius: 8,
                    background: b.accent ? "#ecfdf5" : b.warn ? "#fef3c7" : "var(--muted)",
                  }}
                >
                  <Icon name={b.i} size={12} color={b.warn ? "#92400e" : "var(--muted-fg)"} />
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "var(--muted-fg)",
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginTop: 4,
                    }}
                  >
                    {b.l}
                  </div>
                  <div
                    className="font-heading"
                    style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em" }}
                  >
                    {b.v}
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/dashboard/employee/e-caja"
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <Icon name="banknote" size={12} color="#fff" />
              Nuevo cobro
            </Link>
          </RHPanel>
          <RHPanel title="Quick actions">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK.map((a) => (
                <Link
                  key={a.l}
                  href={a.href}
                  style={{
                    display: "flex",
                    gap: 9,
                    alignItems: "center",
                    padding: "9px 11px",
                    borderRadius: 8,
                    background: "#fff",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <Icon name={a.i} size={13} color="var(--primary)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 900 }}>{a.l}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{a.sub}</div>
                  </div>
                  <Icon name="chevron-right" size={12} color="var(--muted-fg)" />
                </Link>
              ))}
            </div>
          </RHPanel>
        </div>
      </div>
    </>
  );
}
