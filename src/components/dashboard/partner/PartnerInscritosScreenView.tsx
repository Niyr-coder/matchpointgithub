// Client view de PartnerInscritosScreen — layout 1:1 (RoleScreens.jsx 564-592).
"use client";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type InscritoRow = {
  id: string;
  team: string;
  avg: number | null;
  club: string;
  paid: boolean;
  amt: string;
  when: string;
};

export type InscritosData = {
  partnerId: string | null;
  tournamentName: string | null;
  capacity: number;
  rows: InscritoRow[];
};

const PLACEHOLDER_ROWS: InscritoRow[] = Array.from({ length: 5 }).map((_, i) => ({
  id: `ph-${i}`,
  team: "—",
  avg: null,
  club: "—",
  paid: false,
  amt: "$—",
  when: "—",
}));

export function PartnerInscritosScreenView({ data }: { data: InscritosData }) {
  useRealtimeRefresh(
    data.partnerId ? [{ table: "registrations" }, { table: "tournaments", filter: `partner_id=eq.${data.partnerId}` }] : [],
    { enabled: !!data.partnerId },
  );

  const hasReal = data.rows.length > 0;
  const displayRows = hasReal ? data.rows : PLACEHOLDER_ROWS;
  const capLabel = data.capacity > 0 ? data.capacity : "—";

  const cols: RSColumn<InscritoRow>[] = [
    {
      k: "team",
      l: "Pareja",
      render: (t) => (
        <b style={{ fontSize: 12, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>{t.team}</b>
      ),
    },
    {
      k: "avg",
      l: "Nivel prom.",
      align: "center",
      render: (t) =>
        t.avg != null ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 9999,
              fontSize: 10,
              fontWeight: 800,
            }}
          >
            <Icon name="zap" size={9} color="#fbbf24" />
            {t.avg}
          </span>
        ) : (
          <span style={{ color: "var(--muted-fg)", fontSize: 10 }}>—</span>
        ),
    },
    {
      k: "club",
      l: "Club",
      render: (t) => <span style={{ color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>{t.club}</span>,
    },
    {
      k: "amt",
      l: "Inscripción",
      align: "right",
      render: (t) => (
        <span
          className="font-heading"
          style={{ fontSize: 12, fontWeight: 900, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}
        >
          {t.amt}
        </span>
      ),
    },
    {
      k: "paid",
      l: "Pago",
      render: (t) =>
        hasReal ? (
          t.paid ? (
            <RSPill bg="var(--primary)">PAGADO</RSPill>
          ) : (
            <RSPill bg="#fbbf24">PENDIENTE</RSPill>
          )
        ) : (
          <RSPill bg="var(--muted-fg)">—</RSPill>
        ),
    },
    {
      k: "when",
      l: "Inscrito",
      render: (t) => <span style={{ color: "var(--muted-fg)" }}>{t.when}</span>,
    },
  ];

  const headerLabel = data.tournamentName
    ? `Partner · ${data.tournamentName}`
    : "Partner · Sin torneo activo";

  return (
    <>
      <RSHeader
        label={headerLabel}
        title={
          <>
            Inscritos <span className="dot">●</span> {hasReal ? data.rows.length : 0} / {capLabel}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, opacity: hasReal ? 1 : 0.5 }}
              disabled={!hasReal}
            >
              <Icon name="download" size={12} />
              CSV
            </button>
            <button
              className="btn btn-primary"
              disabled={!hasReal}
              style={{ opacity: hasReal ? 1 : 0.5 }}
            >
              <Icon name="users" size={13} color="#fff" />
              Cerrar inscripciones
            </button>
          </div>
        }
      />
      <RSTable cols={cols} rows={displayRows} rowKey={(t) => t.id} />
    </>
  );
}
