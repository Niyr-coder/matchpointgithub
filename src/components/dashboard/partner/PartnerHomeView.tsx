// Client view de PartnerHome — layout 1:1 (RoleHomes.jsx 314-376).
"use client";
import { Icon } from "@/components/Icon";
import { RHKpi, RHPanel, RHWelcome } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type TorneoCard = {
  id: string;
  n: string;
  s: string;
  date: string;
  cupos: string;
  revenue: string;
  live: boolean;
  color: string;
};

export type MatchItem = {
  id: string;
  time: string;
  court: string;
  tournament: string;
};

export type PartnerHomeData = {
  partnerId: string | null;
  kpis: {
    active: number;
    inProgress: number;
    upcoming: number;
    totalInscritos: number;
    deltaInscritos: number;
    revenueCents: number;
    nextMatchLabel: string;
    nextMatchSub: string;
  };
  torneos: TorneoCard[];
  matches: MatchItem[];
};

function fmtUSD(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

const TORNEO_PLACEHOLDER_COUNT = 3;
const MATCH_PLACEHOLDER_COUNT = 3;

function TorneoPlaceholder() {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        border: "1px dashed var(--border)",
        background: "#fafafa",
        display: "grid",
        gridTemplateColumns: "4px 1fr auto auto",
        gap: 14,
        alignItems: "center",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          background: "var(--muted-fg)",
          borderRadius: 9999,
          minHeight: 36,
        }}
      />
      <div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
          <span
            className="font-heading"
            style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", color: "var(--muted-fg)" }}
          >
            Sin torneos
          </span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>—</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 9.5,
            color: "var(--muted-fg)",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Cupos
        </div>
        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)" }}>
          0 / —
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div
          style={{
            fontSize: 9.5,
            color: "var(--muted-fg)",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Revenue
        </div>
        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)" }}>
          $—
        </div>
      </div>
    </div>
  );
}

function MatchPlaceholder({ first }: { first: boolean }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderTop: first ? "0" : "1px dashed var(--border)",
        opacity: 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          className="font-heading"
          style={{
            fontSize: 14,
            fontWeight: 900,
            color: "var(--muted-fg)",
            letterSpacing: "-0.02em",
          }}
        >
          —:—
        </span>
        <span
          style={{
            fontSize: 9,
            color: "var(--muted-fg)",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          —
        </span>
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 4, color: "var(--muted-fg)" }}>
        Sin matches programados
      </div>
      <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 2 }}>—</div>
    </div>
  );
}

export function PartnerHomeView({ data }: { data: PartnerHomeData }) {
  useRealtimeRefresh(
    data.partnerId
      ? [
          { table: "tournaments", filter: `partner_id=eq.${data.partnerId}` },
          { table: "registrations" },
          { table: "bracket_matches" },
        ]
      : [],
    { enabled: !!data.partnerId },
  );

  const hasTorneos = data.torneos.length > 0;
  const hasMatches = data.matches.length > 0;

  return (
    <>
      <RHWelcome role="partner" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <RHKpi
          label="Torneos activos"
          value={String(data.kpis.active)}
          sub={`${data.kpis.inProgress} en curso · ${data.kpis.upcoming} próximos`}
        />
        <RHKpi
          label="Inscritos · total"
          value={data.kpis.totalInscritos.toLocaleString("en-US")}
          sub="Esta temporada"
          delta={data.kpis.deltaInscritos > 0 ? `↑ ${data.kpis.deltaInscritos}` : "—"}
          deltaPos
        />
        <RHKpi
          label="Ingresos · mes"
          value={fmtUSD(data.kpis.revenueCents)}
          sub="Después de comisión MP"
          accent="var(--primary)"
        />
        <RHKpi
          label="Próximo match"
          value={data.kpis.nextMatchLabel}
          sub={data.kpis.nextMatchSub}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
        <RHPanel
          title="Torneos en curso"
          action={
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }}
            >
              <Icon name="plus" size={11} />
              Nuevo
            </button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {hasTorneos
              ? data.torneos.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      display: "grid",
                      gridTemplateColumns: "4px 1fr auto auto",
                      gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 4,
                        alignSelf: "stretch",
                        background: t.color,
                        borderRadius: 9999,
                        minHeight: 36,
                      }}
                    />
                    <div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                        <span
                          className="font-heading"
                          style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em" }}
                        >
                          {t.n}
                        </span>
                        {t.live && (
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: 3,
                              background: "#dc2626",
                              color: "#fff",
                              fontSize: 8.5,
                              fontWeight: 900,
                              letterSpacing: "0.14em",
                            }}
                          >
                            ● LIVE
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                        {t.s} · {t.date}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 9.5,
                          color: "var(--muted-fg)",
                          fontWeight: 800,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        Cupos
                      </div>
                      <div className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>
                        {t.cupos}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontSize: 9.5,
                          color: "var(--muted-fg)",
                          fontWeight: 800,
                          letterSpacing: "0.1em",
                          textTransform: "uppercase",
                        }}
                      >
                        Revenue
                      </div>
                      <div
                        className="font-heading"
                        style={{ fontSize: 14, fontWeight: 900, color: "var(--primary)" }}
                      >
                        {t.revenue}
                      </div>
                    </div>
                  </div>
                ))
              : Array.from({ length: TORNEO_PLACEHOLDER_COUNT }).map((_, k) => (
                  <TorneoPlaceholder key={k} />
                ))}
          </div>
        </RHPanel>

        <RHPanel title="Próximos matches">
          {hasMatches
            ? data.matches.map((m, i) => (
                <div
                  key={m.id}
                  style={{
                    padding: "10px 0",
                    borderTop: i === 0 ? "0" : "1px dashed var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span
                      className="font-heading"
                      style={{
                        fontSize: 14,
                        fontWeight: 900,
                        color: "var(--primary)",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {m.time}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        color: "var(--muted-fg)",
                        fontWeight: 800,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                      }}
                    >
                      {m.tournament}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 4 }}>
                    Match programado
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    {m.court}
                  </div>
                </div>
              ))
            : Array.from({ length: MATCH_PLACEHOLDER_COUNT }).map((_, k) => (
                <MatchPlaceholder key={k} first={k === 0} />
              ))}
        </RHPanel>
      </div>
    </>
  );
}
