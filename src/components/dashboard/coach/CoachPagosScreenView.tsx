// Client view de CoachPagosScreen — layout del mock 1:1 (RoleScreens2.jsx 402-424).
"use client";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type TxRow = {
  id: string;
  d: string;
  who: string;
  concept: string;
  amtCents: number;
  st: "pagado" | "pendiente";
};

export type PagosData = {
  coachId: string | null;
  txs: TxRow[];
  kpis: {
    grossCents: number;
    commissionCents: number;
    netCents: number;
  };
};

const PLACEHOLDER_COUNT = 4;

function fmtUSD(cents: number): string {
  if (cents === 0) return "$—";
  const v = cents / 100;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

const PLACEHOLDER_ROWS: TxRow[] = Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => ({
  id: `placeholder-${i}`,
  d: "—",
  who: "Sin cobros",
  concept: "—",
  amtCents: 0,
  st: "pagado",
}));

export function CoachPagosScreenView({ data }: { data: PagosData }) {
  useRealtimeRefresh(
    data.coachId ? [{ table: "transactions", filter: "kind=eq.class" }] : [],
    { enabled: !!data.coachId, debounceMs: 2000 },
  );

  const hasReal = data.txs.length > 0;
  const rows = hasReal ? data.txs : PLACEHOLDER_ROWS;
  const { kpis } = data;

  const KPIS: [string, string, string][] = [
    ["Cobrado · mes", fmtUSD(kpis.grossCents), "var(--primary)"],
    ["Comisión club (20%)", kpis.commissionCents > 0 ? `–${fmtUSD(kpis.commissionCents)}` : "$—", "#dc2626"],
    ["Neto a recibir", fmtUSD(kpis.netCents), "#0a0a0a"],
  ];

  const cols: RSColumn<TxRow>[] = [
    { k: "d", l: "Fecha" },
    {
      k: "who",
      l: "Cliente / clase",
      render: (t) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>
            {t.who}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{t.concept}</div>
        </div>
      ),
    },
    {
      k: "amt",
      l: "Monto",
      align: "right",
      render: (t) => (
        <b className="font-heading" style={{ fontSize: 13, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>
          {fmtUSD(t.amtCents)}
        </b>
      ),
    },
    {
      k: "st",
      l: "Estado",
      render: (t) =>
        hasReal ? (
          <RSPill bg={t.st === "pagado" ? "var(--primary)" : "#fbbf24"}>{t.st.toUpperCase()}</RSPill>
        ) : (
          <RSPill bg="var(--muted-fg)">—</RSPill>
        ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Coach · Pagos"
        title="Cobros & ingresos"
        action={
          <button
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              opacity: hasReal ? 1 : 0.5,
              cursor: hasReal ? "pointer" : "not-allowed",
            }}
            disabled={!hasReal}
          >
            <Icon name="download" size={12} />
            Estado
          </button>
        }
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading"
              style={{ fontSize: 24, fontWeight: 900, marginTop: 6, color: v === "$—" ? "var(--muted-fg)" : c }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      <RSTable cols={cols} rows={rows} rowKey={(t) => t.id} />
    </>
  );
}
