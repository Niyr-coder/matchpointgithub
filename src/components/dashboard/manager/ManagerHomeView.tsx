// Client view de ManagerHome — layout 1:1 del mock (RoleHomes.jsx 229-312).
// Empty states usan placeholders dasheados, jamás datos inventados.
"use client";
import { Icon } from "@/components/Icon";
import { RHKpi, RHPanel, RHWelcome } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type ManagerReservaRow = {
  t: string;
  n: string;
  c: string;
  d: string;
  st: string;
  stColor: string;
  p: string;
};

export type ManagerWalkin = {
  n: string;
  t: string;
  sport: string;
  players: number;
};

export type ManagerEvent = { d: string; m: string; name: string; sub: string };

export type ManagerHomeData = {
  clubId: string | null;
  clubName: string;
  hasClub: boolean;
  userName: string | null;
  reservasHoyCount: number;
  confirmadas: number;
  pendientes: number;
  walkinsCount: number;
  noShows: number;
  cajaCents: number;
  reservas: ManagerReservaRow[];
  walkinQ: ManagerWalkin[];
  events: ManagerEvent[];
};

const QUICK_ACTIONS = [
  { i: "ban", l: "Bloquear cancha", sub: "Mantenimiento" },
  { i: "undo-2", l: "Reembolsar", sub: "Hacer refund" },
  { i: "user-plus", l: "Nuevo cliente", sub: "Walk-in" },
  { i: "banknote", l: "Cobrar", sub: "Caja" },
];

function money(cents: number): string {
  if (cents === 0) return "$0";
  const n = Math.round(cents / 100);
  return `$${n.toLocaleString("es-EC")}`;
}

function PlaceholderPanel({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        padding: "20px 16px",
        textAlign: "center",
        color: "var(--muted-fg)",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 10,
        opacity: 0.7,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#0a0a0a" }}>{title}</div>
      <div style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

export function ManagerHomeView({ data }: { data: ManagerHomeData }) {
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
          { table: "transactions", filter: `club_id=eq.${data.clubId}` },
          { table: "events", filter: `club_id=eq.${data.clubId}` },
          // Contador de walk-ins en vivo — gap cross-domain detectado en audit.
          { table: "walkins", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const hasReservas = data.reservas.length > 0;
  const hasWalkins = data.walkinQ.length > 0;
  const hasEvents = data.events.length > 0;

  return (
    <>
      <RHWelcome role="manager" userName={data.userName} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <RHKpi
          label="Reservas hoy"
          value={String(data.reservasHoyCount)}
          sub={
            data.reservasHoyCount > 0
              ? `${data.confirmadas} confirmadas · ${data.pendientes} pendientes`
              : "Sin reservas hoy"
          }
        />
        <RHKpi
          label="Walk-ins"
          value={String(data.walkinsCount)}
          sub={data.walkinsCount > 0 ? "En cola ahora" : "Sin cola"}
          accent={data.walkinsCount > 0 ? "#dc2626" : undefined}
        />
        <RHKpi
          label="No-shows"
          value={String(data.noShows)}
          sub={data.noShows > 0 ? "Reservas marcadas no-show" : "Sin no-shows hoy"}
        />
        <RHKpi
          label="Caja del día"
          value={money(data.cajaCents)}
          sub={data.cajaCents > 0 ? "Transacciones capturadas" : "Sin movimientos aún"}
          accent="var(--primary)"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <RHPanel
          title="Reservas · hoy"
          action={
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
              disabled={!hasReservas}
            >
              <Icon name="filter" size={11} />
              Filtrar
            </button>
          }
        >
          {hasReservas ? (
            <div style={{ overflow: "auto", margin: "0 -20px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: "var(--muted)" }}>
                    {["Hora", "Cliente", "Cancha", "Duración", "Estado", "Pago", "Acción"].map(
                      (h) => (
                        <th
                          key={h}
                          style={{
                            padding: "8px 12px",
                            textAlign: "left",
                            fontSize: 9,
                            fontWeight: 900,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "var(--muted-fg)",
                          }}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.reservas.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px 12px" }}>
                        <b
                          className="font-heading"
                          style={{ fontSize: 13, letterSpacing: "-0.01em" }}
                        >
                          {r.t}
                        </b>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{r.n}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "2px 7px",
                            borderRadius: 5,
                            background: "var(--muted)",
                            fontSize: 10,
                            fontWeight: 900,
                          }}
                        >
                          {r.c}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--muted-fg)" }}>{r.d}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 9999,
                            background: r.stColor,
                            color: "#fff",
                            fontSize: 8.5,
                            fontWeight: 900,
                            letterSpacing: "0.12em",
                          }}
                        >
                          {r.st}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          color: "var(--muted-fg)",
                          fontWeight: 800,
                        }}
                      >
                        {r.p}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button
                          style={{
                            width: 24,
                            height: 24,
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
                          <Icon name="more-horizontal" size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <PlaceholderPanel
              title={data.hasClub ? "Sin reservas hoy" : "Sin club asignado"}
              sub={
                data.hasClub
                  ? "Cuando entren reservas para hoy aparecerán aquí ordenadas por hora."
                  : "Pide a un owner que te invite como manager para ver la operación."
              }
            />
          )}
        </RHPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <RHPanel
            title="Walk-in queue"
            action={
              <span
                style={{
                  fontSize: 9,
                  padding: "3px 8px",
                  borderRadius: 9999,
                  background: hasWalkins ? "#fee2e2" : "var(--muted)",
                  color: hasWalkins ? "#dc2626" : "var(--muted-fg)",
                  fontWeight: 900,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                {hasWalkins ? `${data.walkinsCount} esperando` : "Sin cola"}
              </span>
            }
          >
            {hasWalkins ? (
              data.walkinQ.map((w, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: i === 0 ? "0" : "1px dashed var(--border)",
                  }}
                >
                  <div
                    className="font-heading"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      background: "#0a0a0a",
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800 }}>{w.n}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
                      {w.sport} · {w.players}p · esperan {w.t}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 9.5, padding: "5px 9px" }}
                  >
                    Asignar
                  </button>
                </div>
              ))
            ) : (
              <PlaceholderPanel
                title="Sin walk-ins en cola"
                sub="Los walk-ins que crees en recepción aparecerán aquí."
              />
            )}
          </RHPanel>
          <RHPanel title="Acción rápida">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.l}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                  }}
                >
                  <Icon name={a.i} size={13} color="var(--primary)" />
                  <div style={{ fontSize: 10.5, fontWeight: 900, marginTop: 5 }}>{a.l}</div>
                  <div style={{ fontSize: 9, color: "var(--muted-fg)" }}>{a.sub}</div>
                </button>
              ))}
            </div>
          </RHPanel>
          <RHPanel title="Próximos eventos">
            {hasEvents ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.events.map((e, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 11,
                      padding: 10,
                      border: i === 0 ? "2px solid var(--primary)" : "1px solid var(--border)",
                      borderRadius: 10,
                      background: i === 0 ? "#ecfdf5" : "#fff",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ width: 38, textAlign: "center", flexShrink: 0 }}>
                      <div
                        className="font-heading"
                        style={{ fontSize: 18, fontWeight: 900, lineHeight: 0.9 }}
                      >
                        {e.d}
                      </div>
                      <div
                        style={{
                          fontSize: 8,
                          fontWeight: 900,
                          color: "var(--muted-fg)",
                          letterSpacing: "0.16em",
                        }}
                      >
                        {e.m}
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 11.5,
                          fontWeight: 900,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>
                        {e.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <PlaceholderPanel
                title="Sin eventos próximos"
                sub="Cuando se publique un evento aparecerá aquí."
              />
            )}
          </RHPanel>
        </div>
      </div>
    </>
  );
}
