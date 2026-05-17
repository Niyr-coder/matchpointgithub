// Client view de ClubClientesScreen — layout del mock 1:1, valores reales.
// Sin socios → 6 filas placeholder neutras (dashed, "—") para preservar el mock.
"use client";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

type Tier = "VIP" | "PRO" | "STD";

export type ClienteRow = {
  id: string;
  name: string;
  av: string;
  avBg: string;
  tier: Tier;
  joined: string;
  visits: number;
  spendCents: number;
  lastVisit: string;
  favSport: string;
};

export type ClientesData = {
  clubId: string | null;
  totalSocios: number;
  clients: ClienteRow[];
};

const TIER_BG: Record<Tier, string> = {
  VIP: "#fbbf24",
  PRO: "#0a0a0a",
  STD: "var(--muted-fg)",
};

const PLACEHOLDER_GRADIENT = "linear-gradient(135deg, #e5e5e5, #d4d4d4)";

// Row tipo para la tabla — incluye el flag de placeholder.
type RowItem = ClienteRow | { placeholder: true; k: string };

function isPh(r: RowItem): r is { placeholder: true; k: string } {
  return "placeholder" in r;
}

function spendLabel(cents: number): string {
  if (cents === 0) return "$—";
  return `$${Math.round(cents / 100)}`;
}

export function ClubClientesScreenView({ data }: { data: ClientesData }) {
  useRealtimeRefresh(
    data.clubId ? [{ table: "reservations", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId },
  );

  const hasReal = data.clients.length > 0;
  const rows: RowItem[] = hasReal
    ? data.clients
    : [1, 2, 3, 4, 5, 6].map((n) => ({ placeholder: true as const, k: `ph-${n}` }));

  const cols: RSColumn<RowItem>[] = [
    {
      k: "n",
      l: "Socio",
      render: (c) => {
        if (isPh(c)) {
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.6 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: PLACEHOLDER_GRADIENT,
                  border: "1px dashed var(--border)",
                }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)" }}>—</div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>Desde —</div>
              </div>
            </div>
          );
        }
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: c.avBg,
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "Plus Jakarta Sans",
                fontWeight: 900,
                fontSize: 11,
              }}
            >
              {c.av}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{c.name}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>Desde {c.joined}</div>
            </div>
          </div>
        );
      },
    },
    {
      k: "tier",
      l: "Tier",
      render: (c) =>
        isPh(c) ? (
          <span style={{ color: "var(--muted-fg)" }}>—</span>
        ) : (
          <RSPill bg={TIER_BG[c.tier]}>{c.tier}</RSPill>
        ),
    },
    {
      k: "favSport",
      l: "Deporte fav.",
      render: (c) => (isPh(c) ? <span style={{ color: "var(--muted-fg)" }}>—</span> : c.favSport),
    },
    {
      k: "visits",
      l: "Visitas · mes",
      align: "center",
      render: (c) =>
        isPh(c) ? (
          <span style={{ color: "var(--muted-fg)" }}>—</span>
        ) : (
          <b className="font-heading">{c.visits}</b>
        ),
    },
    {
      k: "spend",
      l: "Gasto · mes",
      align: "right",
      render: (c) =>
        isPh(c) ? (
          <span style={{ color: "var(--muted-fg)" }}>—</span>
        ) : (
          <b style={{ color: "var(--primary)" }}>{spendLabel(c.spendCents)}</b>
        ),
    },
    {
      k: "last",
      l: "Última visita",
      render: (c) => (
        <span style={{ color: "var(--muted-fg)" }}>{isPh(c) ? "—" : c.lastVisit}</span>
      ),
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (c) => (
        <button
          disabled={isPh(c)}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--muted)",
            border: 0,
            cursor: isPh(c) ? "not-allowed" : "pointer",
            opacity: isPh(c) ? 0.5 : 1,
          }}
        >
          <Icon name="more-horizontal" size={13} />
        </button>
      ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Club · Clientes"
        title={
          <>
            Socios <span className="dot">●</span> {data.totalSocios}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                background: "#fff",
                border: RS_BORDER,
                opacity: hasReal ? 1 : 0.5,
                cursor: hasReal ? "pointer" : "not-allowed",
              }}
              disabled={!hasReal}
            >
              <Icon name="download" size={12} />
              Exportar
            </button>
            <button
              className="btn btn-primary"
              style={{
                opacity: data.clubId ? 1 : 0.5,
                cursor: data.clubId ? "pointer" : "not-allowed",
              }}
              disabled={!data.clubId}
            >
              <Icon name="user-plus" size={13} color="#fff" />
              Agregar socio
            </button>
          </div>
        }
      />
      <RSTable cols={cols} rows={rows} rowKey={(r) => (isPh(r) ? r.k : r.id)} />
    </>
  );
}
