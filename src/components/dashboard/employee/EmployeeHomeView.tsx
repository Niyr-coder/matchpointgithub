// Client view del EmployeeHome — layout 1:1 del mock.
"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { RHPanel, RHWelcome } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type CheckinStatus = "on-time" | "arriving" | "class";
export type CheckinRow = {
  id: string;
  t: string;
  n: string;
  c: string;
  d: string;
  sport: string;
  code: string;
  st: CheckinStatus;
};
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
  nextCheckins: CheckinRow[];
  cash: CashTileData[];
  checkinsAttended: number;
  walkinsHandled: number;
  cashTotalLabel: string;
};

const ST_LABEL: Record<CheckinStatus, string> = {
  "on-time": "A TIEMPO",
  arriving: "LLEGANDO",
  class: "CLASE",
};

const QUICK = [
  { i: "user-plus", l: "Walk-in nuevo", sub: "Cliente sin reserva" },
  { i: "phone", l: "Llamar coach", sub: "—" },
  { i: "alert-triangle", l: "Reportar incidente", sub: "Cancha o cliente" },
  { i: "shopping-bag", l: "Vender pro shop", sub: "Paletas · pelotas" },
];

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
  useRealtimeRefresh(
    data.clubId
      ? [
          { table: "reservations", filter: `club_id=eq.${data.clubId}` },
          { table: "check_ins", filter: `club_id=eq.${data.clubId}` },
          { table: "walkins", filter: `club_id=eq.${data.clubId}` },
          { table: "transactions", filter: `club_id=eq.${data.clubId}` },
        ]
      : [],
    { enabled: !!data.clubId },
  );

  const [clockedIn, setClockedIn] = useState(true);
  const hasCheckins = data.nextCheckins.length > 0;

  return (
    <>
      <RHWelcome role="employee" userName={data.userName} />

      {/* Shift card — sin tracking real de jornada laboral; horas en — */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: 22,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
            alignItems: "center",
          }}
        >
          <div>
            <div
              className="label-mp"
              style={{ color: clockedIn ? "var(--primary)" : "var(--muted-fg)" }}
            >
              ● {clockedIn ? "En turno" : "Fuera"}
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
              Turno<span className="dot">.</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
              — — sin tracking aún
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 38,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: "var(--muted-fg)",
              }}
            >
              —
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
              Tiempo trabajado
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
            <button
              onClick={() => setClockedIn((c) => !c)}
              className={"btn " + (clockedIn ? "" : "btn-primary")}
              style={clockedIn ? { background: "#0a0a0a", color: "#fff" } : undefined}
            >
              <Icon name={clockedIn ? "log-out" : "log-in"} size={12} color="#fff" />
              {clockedIn ? "Marcar salida" : "Marcar entrada"}
            </button>
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
            >
              Tomar break · 15min
            </button>
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
            · <b style={{ color: "#0a0a0a" }}>0</b> incidentes
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <RHPanel
          title="Próximos check-ins"
          action={
            <button
              className="btn btn-primary"
              style={{ fontSize: 10.5, opacity: hasCheckins ? 1 : 0.5 }}
              disabled={!hasCheckins}
            >
              <Icon name="qr-code" size={12} color="#fff" />
              Escanear QR
            </button>
          }
        >
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
                          : r.st === "class"
                          ? "#7c3aed"
                          : "var(--muted)",
                      color:
                        r.st === "arriving" || r.st === "class" ? "#fff" : "var(--muted-fg)",
                    }}
                  >
                    {ST_LABEL[r.st]}
                  </span>
                  <button className="btn btn-primary" style={{ fontSize: 10, padding: "5px 11px" }}>
                    Check-in
                  </button>
                </div>
              ))
            : Array.from({ length: PLACEHOLDER_CHECKINS }).map((_, i) => (
                <CheckinPlaceholderRow key={i} first={i === 0} />
              ))}
        </RHPanel>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <RHPanel title="Caja · ahora">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginBottom: 10,
              }}
            >
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
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              <Icon name="banknote" size={12} color="#fff" />
              Nuevo cobro
            </button>
          </RHPanel>
          <RHPanel title="Quick actions">
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {QUICK.map((a) => (
                <button
                  key={a.l}
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
                  }}
                >
                  <Icon name={a.i} size={13} color="var(--primary)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 900 }}>{a.l}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{a.sub}</div>
                  </div>
                  <Icon name="chevron-right" size={12} color="var(--muted-fg)" />
                </button>
              ))}
            </div>
          </RHPanel>
        </div>
      </div>
    </>
  );
}
