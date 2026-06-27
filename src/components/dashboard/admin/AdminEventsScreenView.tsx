// Client view de AdminEventsScreen — layout 1:1 (RoleScreens2.jsx 6-31).
"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { setTournamentFeatured } from "@/server/actions/tournaments";
import {
  adminSeedTournaments,
  adminClearSeedTournaments,
} from "@/server/actions/admin/seed-tournaments";

export type EvStatus = "EN VIVO" | "EN CURSO" | "ABIERTO" | "LLENO";
export type EvKind = "event" | "tournament";
export type EvRow = {
  id: string;
  n: string;
  org: string;
  sport: string;
  date: string;
  insc: string;
  prize: string;
  st: EvStatus;
  kind: EvKind;
  // Solo tournaments: true si están marcados como evento estelar de portada.
  isFeatured?: boolean;
};
export type EventsData = {
  rows: EvRow[];
  kpis: {
    totalCount: number;
    activeCount: number;
    thisWeekCount: number;
    revenueMonthCents: number;
  };
};

const ST_COLOR: Record<EvStatus, string> = {
  "EN VIVO": "#dc2626",
  "EN CURSO": "#fbbf24",
  ABIERTO: "var(--primary)",
  LLENO: "var(--muted-fg)",
};

function fmtCompactUSD(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars)}`;
}

const PLACEHOLDER_COUNT = 4;
const EV_PLACEHOLDER_COLS = "1fr 120px 110px 110px 110px";

function EvPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: EV_PLACEHOLDER_COLS,
        alignItems: "center",
        padding: "14px 16px",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--muted-fg)" }}>Sin eventos</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>— · —</div>
      </div>
      <span style={{ color: "var(--muted-fg)" }}>—</span>
      <span style={{ textAlign: "center", fontWeight: 900, color: "var(--muted-fg)" }}>—</span>
      <span style={{ textAlign: "right", color: "var(--muted-fg)", fontWeight: 900 }}>—</span>
      <RSPill bg="var(--muted-fg)">—</RSPill>
    </div>
  );
}

export function AdminEventsScreenView({ data }: { data: EventsData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [seedPending, startSeed] = useTransition();
  const [seedOpen, setSeedOpen] = useState(false);
  const [seedCount, setSeedCount] = useState(12);
  const seedRef = useRef<HTMLDivElement>(null);
  const [featuredOverride, setFeaturedOverride] = useState<Map<string, boolean>>(new Map());
  useRealtimeRefresh(
    [
      { table: "events" },
      { table: "tournaments" },
      { table: "event_registrations" },
      { table: "registrations" },
    ],
    { debounceMs: 5000 },
  );

  const toggleFeatured = (row: EvRow) => {
    if (row.kind !== "tournament") return;
    const realId = row.id.replace(/^tr-/, "");
    const current = featuredOverride.get(row.id) ?? row.isFeatured ?? false;
    const next = !current;
    setFeaturedOverride((prev) => new Map(prev).set(row.id, next));
    startTransition(async () => {
      const res = await setTournamentFeatured({ tournamentId: realId, featured: next });
      if (!res.ok) {
        // Revertir si falla.
        setFeaturedOverride((prev) => new Map(prev).set(row.id, !next));
        toast({ icon: "alert-triangle", title: "No se pudo actualizar", sub: res.error.message });
      } else {
        toast({
          icon: next ? "star" : "star-off",
          title: next ? "Marcado como estelar" : "Removido de estelares",
        });
      }
    });
  };

  const handleSeed = () => {
    startSeed(async () => {
      const res = await adminSeedTournaments({ count: seedCount });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "Error al seedear", sub: res.error.message, tone: "error" });
        return;
      }
      toast({ icon: "check", title: `${res.data.created} torneos seed creados` });
      setSeedOpen(false);
      router.refresh();
    });
  };

  const handleClear = () => {
    startSeed(async () => {
      const res = await adminClearSeedTournaments();
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "Error al limpiar", sub: res.error.message, tone: "error" });
        return;
      }
      toast({ icon: "trash-2", title: `${res.data.deleted} torneos seed eliminados` });
      setSeedOpen(false);
      router.refresh();
    });
  };

  const hasRows = data.rows.length > 0;
  const goToDetail = (row: EvRow) => {
    // El id ya viene prefijado "ev-{uuid}" o "tr-{uuid}" desde el loader.
    router.push(`/dashboard/admin/admin-events/${row.id}`);
  };

  const KPIS: [string, string, string][] = [
    ["Total", String(data.kpis.totalCount), "#0a0a0a"],
    ["Activos", String(data.kpis.activeCount), "var(--primary)"],
    ["Esta semana", String(data.kpis.thisWeekCount), "#0ea5e9"],
    ["Revenue · mes", fmtCompactUSD(data.kpis.revenueMonthCents), "#fbbf24"],
  ];

  const cols: RSColumn<EvRow>[] = [
    {
      k: "n",
      l: "Evento",
      render: (e) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>{e.n}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {e.org} · {e.date}
          </div>
        </div>
      ),
    },
    { k: "sport", l: "Deporte" },
    {
      k: "insc",
      l: "Inscritos",
      align: "center",
      render: (e) => <b className="font-heading">{e.insc}</b>,
    },
    {
      k: "prize",
      l: "Premio",
      align: "right",
      render: (e) => (
        <b style={{ color: e.prize === "—" ? "var(--muted-fg)" : "var(--primary)" }}>{e.prize}</b>
      ),
    },
    { k: "st", l: "Estado", render: (e) => <RSPill bg={ST_COLOR[e.st]}>{e.st}</RSPill> },
    {
      k: "isFeatured" as keyof EvRow,
      l: "Estelar",
      align: "center",
      render: (e) => {
        if (e.kind !== "tournament") {
          return <span style={{ color: "var(--muted-fg)", fontSize: 11 }}>—</span>;
        }
        const isOn = featuredOverride.get(e.id) ?? e.isFeatured ?? false;
        return (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              toggleFeatured(e);
            }}
            title={isOn ? "Quitar de portada" : "Marcar para portada"}
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              padding: 4,
              borderRadius: 8,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: isOn ? "#fbbf24" : "var(--muted-fg)",
            }}
          >
            <Icon
              name="star"
              size={16}
              color={isOn ? "#fbbf24" : "var(--muted-fg)"}
              style={isOn ? { fill: "#fbbf24" } : undefined}
            />
          </button>
        );
      },
    },
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Eventos"
        title={
          <>
            Eventos <span className="dot">●</span> {data.kpis.activeCount} activos
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* Seed de torneos para testing */}
            <div ref={seedRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="btn"
                onClick={() => setSeedOpen((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}
                title="Herramientas de testing"
              >
                <Icon name="flask-conical" size={13} />
                Seed
              </button>

              {seedOpen && (
                <>
                  {/* overlay para cerrar al hacer click afuera */}
                  <div
                    style={{ position: "fixed", inset: 0, zIndex: 99 }}
                    onClick={() => setSeedOpen(false)}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      zIndex: 100,
                      background: "#fff",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 16,
                      width: 220,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div className="label-mp" style={{ fontSize: 9 }}>
                      Herramientas de testing
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "var(--muted-fg)", display: "block", marginBottom: 5 }}>
                        Cantidad de torneos
                      </label>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[5, 10, 20, 30].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setSeedCount(n)}
                            style={{
                              flex: 1,
                              padding: "5px 0",
                              fontSize: 11,
                              fontWeight: 800,
                              borderRadius: 6,
                              border: "1px solid var(--border)",
                              background: seedCount === n ? "var(--primary)" : "#fff",
                              color: seedCount === n ? "#fff" : "var(--fg)",
                              cursor: "pointer",
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={seedPending}
                      onClick={handleSeed}
                      style={{ fontSize: 12, justifyContent: "center" }}
                    >
                      <Icon name="plus" size={12} color="#fff" />
                      {seedPending ? "Creando…" : `Crear ${seedCount} torneos`}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={seedPending}
                      onClick={handleClear}
                      style={{ fontSize: 12, justifyContent: "center", color: "#dc2626", borderColor: "#fca5a5" }}
                    >
                      <Icon name="trash-2" size={12} color="#dc2626" />
                      {seedPending ? "Limpiando…" : "Limpiar seeds"}
                    </button>
                  </div>
                </>
              )}
            </div>

            <button className="btn btn-primary">
              <Icon name="filter" size={13} />
              Filtrar
            </button>
          </div>
        }
      />
      <div className="mp-partner-torneo-kpis">
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="card" style={{ padding: 14 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                marginTop: 5,
                letterSpacing: "-0.03em",
                color: c,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>
      {hasRows ? (
        <RSTable cols={cols} rows={data.rows} rowKey={(e) => e.id} rowOnClick={goToDetail} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => (
            <EvPlaceholderRow key={k} />
          ))}
        </div>
      )}
    </>
  );
}
