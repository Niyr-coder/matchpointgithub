// Client view de ClubFinanzasScreen — layout 1:1 (RoleScreens.jsx 403-457).
"use client";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { MpBarChart } from "../widgets/MpBarChart";
import { MpProgressBar } from "../widgets/MpProgressBar";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type FinanzasData = {
  clubId: string | null;
  revenueMonthCents: number;
  revenueDeltaCents: number;
  employeesCount: number;
  breakdownCents: {
    reservations: number;
    events: number;
    classes: number;
    proshop: number;
  };
  bars30: number[];
};

function fmtMoney(cents: number, sign: "" | "-" = ""): string {
  const dollars = Math.round(Math.abs(cents) / 100);
  return `${sign}$${dollars.toLocaleString("en-US")}`;
}
function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function ClubFinanzasScreenView({ data }: { data: FinanzasData }) {
  useRealtimeRefresh(
    data.clubId ? [{ table: "transactions", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  const revenue = data.revenueMonthCents;
  const commission = Math.round(revenue * 0.1);
  // No hay tabla de payroll todavía; mantenemos slot con $0 hasta que exista.
  const staffPayCents = 0;
  const netCents = revenue - commission - staffPayCents;

  const deltaPctSign = data.revenueDeltaCents >= 0 ? "↑" : "↓";
  const deltaLabel = `${deltaPctSign} ${fmtMoney(data.revenueDeltaCents)} vs mes pasado`;

  const KPIS: [string, string, string, string][] = [
    ["Revenue bruto · mes", fmtMoney(revenue), "", "var(--primary)"],
    ["Comisión MP · 10%", fmtMoney(commission, "-"), "", "#dc2626"],
    ["Pagos staff", fmtMoney(staffPayCents, "-"), `${data.employeesCount} empleados`, "#dc2626"],
    ["Neto al payout", fmtMoney(netCents), "estimado", "#0a0a0a"],
  ];

  // Bars: usar valores reales. Si todos en 0, mostrar grid plano (no inventar).
  const bars30Data = data.bars30.map((v, i) => {
    const ago = data.bars30.length - 1 - i;
    return {
      label: ago === 0 ? "Hoy" : `Hace ${ago}d`,
      value: v,
    };
  });

  const totalBreak =
    data.breakdownCents.reservations +
    data.breakdownCents.events +
    data.breakdownCents.classes +
    data.breakdownCents.proshop;

  const BREAKDOWN: [string, string, string][] = [
    [
      "Reservas de canchas",
      fmtMoney(data.breakdownCents.reservations),
      pct(data.breakdownCents.reservations, totalBreak),
    ],
    [
      "Eventos & torneos",
      fmtMoney(data.breakdownCents.events),
      pct(data.breakdownCents.events, totalBreak),
    ],
    [
      "Clases con coach",
      fmtMoney(data.breakdownCents.classes),
      pct(data.breakdownCents.classes, totalBreak),
    ],
    ["Pro shop", fmtMoney(data.breakdownCents.proshop), pct(data.breakdownCents.proshop, totalBreak)],
  ];

  return (
    <>
      <RSHeader
        label="Club · Finanzas"
        title="Revenue & payouts"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ background: "#fff", border: RS_BORDER }}>
              Este mes
            </button>
            <button className="btn btn-primary">
              <Icon name="download" size={13} color="#fff" />
              Exportar
            </button>
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {KPIS.map(([l, v, sub, c]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                marginTop: 6,
                color: c,
              }}
            >
              {v}
            </div>
            {sub && (
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <h2
              className="font-heading"
              style={{
                fontSize: 16,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                margin: 0,
              }}
            >
              Revenue · 30 días<span className="dot">.</span>
            </h2>
            <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800 }}>
              {deltaLabel}
            </span>
          </div>
          <MpBarChart
            data={bars30Data}
            height={180}
            weekendPattern
            fmtValue={(v) => `$${Math.round(v / 100).toLocaleString("en-US")}`}
            ariaLabel="Revenue del club últimos 30 días"
          />
        </div>
        <div className="card" style={{ padding: 18 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              margin: "0 0 12px",
            }}
          >
            Desglose · mes<span className="dot">.</span>
          </h2>
          {BREAKDOWN.map(([l, v, p], i) => (
            <div key={l} style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  marginBottom: 4,
                }}
              >
                <span style={{ fontWeight: 700 }}>{l}</span>
                <span>
                  <b>{v}</b>{" "}
                  <span style={{ color: "var(--muted-fg)" }}>· {p}</span>
                </span>
              </div>
              <MpProgressBar pct={parseFloat(String(p).replace("%", ""))} delayMs={i * 60} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
