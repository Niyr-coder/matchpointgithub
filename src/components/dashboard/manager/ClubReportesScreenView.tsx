// Client view de ClubReportesScreen — layout 1:1 (RoleScreensPolish.jsx 28-177).
// Datos reales: ocupación, heatmap, distribución por deporte, top socios, no-shows.
// Datos sin tracking aún: NPS, tiempo prom. de atención → "—" con nota.
"use client";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

const DAYS_HM = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const SPORT_COLORS: Record<string, string> = {
  Pickleball: "var(--primary)",
  Pádel: "#0a0a0a",
  Tenis: "#0ea5e9",
  Squash: "#fbbf24",
  Otro: "#737373",
};

const TOP_AVATAR_BG = [
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

export type ReportesData = {
  clubId: string | null;
  weekNumber: number;
  courtsCount: number;
  ocupacionPct: number;
  ocupacionDeltaPp: number;
  heatmap: number[][];
  peakDay: number;
  peakHour: number;
  peakVal: number;
  sports: { key: string; label: string; count: number; pct: number }[];
  matchesPerDay: number;
  totalMatches: number;
  topMembers: { name: string; visits: number }[];
  noShowPct: number;
  noShowsCount: number;
  cancelledCount: number;
  monthReservationsCount: number;
};

function heatColor(v: number): string {
  if (v > 85) return "var(--primary)";
  if (v > 70) return "#34d399";
  if (v > 50) return "#fbbf24";
  if (v > 25) return "#e5e5e5";
  return "#fafafa";
}

function initials(name: string): string {
  return (
    name
      .split(" ")
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function ClubReportesScreenView({ data }: { data: ReportesData }) {
  useRealtimeRefresh(
    data.clubId
      ? [{ table: "reservations", filter: `club_id=eq.${data.clubId}` }]
      : [],
    { enabled: !!data.clubId },
  );

  const hasOcupacion = data.courtsCount > 0;
  const ocupacionGoal = 85;
  const ocupacionPctBar = hasOcupacion
    ? Math.min(100, (data.ocupacionPct / ocupacionGoal) * 100)
    : 0;
  const deltaSign = data.ocupacionDeltaPp >= 0 ? "↑" : "↓";
  const deltaLabel = hasOcupacion
    ? `${deltaSign} ${Math.abs(data.ocupacionDeltaPp)}pp vs sem ant`
    : "—";

  const peakLabel = data.peakVal > 0
    ? `${DAYS_HM[data.peakDay]} ${String(data.peakHour).padStart(2, "0")}:00`
    : "—";

  return (
    <>
      <PolHero
        tone="dark"
        wm="DATA"
        label={`Club · Reportes operativos${data.weekNumber > 0 ? ` · semana ${data.weekNumber}` : ""}`}
        title="¿Cómo va el club?"
        sub="Tres indicadores clave para entender la operación: ocupación, satisfacción y eficiencia."
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              Esta semana
            </button>
            <button className="btn btn-primary">
              <Icon name="download" size={13} color="#fff" />
              PDF
            </button>
          </div>
        }
      />

      {/* 3 Big KPI cards — Ocupación (real) + NPS (sin tracking) + Tiempo atención (sin tracking) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {/* Ocupación */}
        <div
          className="card"
          style={{ padding: 22, position: "relative", overflow: "hidden" }}
        >
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            <Icon name="percent" size={17} color="#fff" />
          </div>
          <div className="label-mp">Ocupación</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
            <span
              className="font-heading tabular"
              style={{
                fontSize: 56,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 0.9,
                color: hasOcupacion ? "#0a0a0a" : "var(--muted-fg)",
              }}
            >
              {hasOcupacion ? data.ocupacionPct : "—"}
            </span>
            <span style={{ fontSize: 16, color: "var(--muted-fg)", fontWeight: 800 }}>
              {hasOcupacion ? "%" : ""}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            <span>Meta · {ocupacionGoal}%</span>
            <span
              style={{ color: data.ocupacionDeltaPp >= 0 ? "var(--primary)" : "#dc2626" }}
            >
              {deltaLabel}
            </span>
          </div>
          <div
            style={{
              height: 6,
              background: "var(--muted)",
              borderRadius: 9999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: Math.min(100, ocupacionPctBar) + "%",
                background: "var(--primary)",
                transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
              }}
            />
          </div>
        </div>

        {/* NPS Socios — sin tracking */}
        <KpiPlaceholder
          label="NPS Socios"
          icon="heart"
          iconBg="#fbbf24"
          goal="75"
          note="club_reviews sin tracking aún"
        />

        {/* Tiempo prom. atención — sin tracking */}
        <KpiPlaceholder
          label="Tiempo prom. atención"
          icon="timer"
          iconBg="#dc2626"
          goal="1.5 min"
          note="support_tickets sin tracking aún"
        />
      </div>

      {/* Heatmap ocupación */}
      <div className="card" style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: 18,
          }}
        >
          <div>
            <div className="label-mp">Mapa de calor · ocupación</div>
            <h2
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                margin: "4px 0 0",
              }}
            >
              Picos de la semana<span className="dot">.</span>
            </h2>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 10,
              color: "var(--muted-fg)",
            }}
          >
            <span>0%</span>
            {[10, 30, 50, 70, 90].map((t) => (
              <div
                key={t}
                style={{
                  width: 26,
                  height: 12,
                  background:
                    t > 70 ? "var(--primary)" : t > 40 ? "#fbbf24" : t > 20 ? "#e5e5e5" : "#fafafa",
                  border: "1px solid var(--border)",
                }}
              />
            ))}
            <span>100%</span>
          </div>
        </div>
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px repeat(24, 1fr)",
              gap: 2,
              marginBottom: 4,
            }}
          >
            <div />
            {Array.from({ length: 24 }, (_, i) => (
              <div
                key={i}
                style={{
                  fontSize: 8,
                  textAlign: "center",
                  color: "var(--muted-fg)",
                  fontWeight: 700,
                }}
              >
                {i % 3 === 0 ? i : ""}
              </div>
            ))}
          </div>
          {data.heatmap.map((row, di) => (
            <div
              key={di}
              style={{
                display: "grid",
                gridTemplateColumns: "40px repeat(24, 1fr)",
                gap: 2,
                marginBottom: 2,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  color: "var(--muted-fg)",
                  textAlign: "right",
                  paddingRight: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  letterSpacing: "0.1em",
                }}
              >
                {DAYS_HM[di]}
              </div>
              {row.map((v, hi) => (
                <div
                  key={hi}
                  title={DAYS_HM[di] + " " + hi + ":00 · " + v + "%"}
                  style={{
                    height: 24,
                    borderRadius: 2,
                    background: hasOcupacion ? heatColor(v) : "#fafafa",
                    border: hasOcupacion ? 0 : "1px dashed var(--border)",
                    opacity: hasOcupacion ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            padding: 14,
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 10,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <Icon name="zap" size={16} color="var(--primary)" />
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <b style={{ color: "#fff" }}>Insight:</b>{" "}
            {data.peakVal > 0 ? (
              <>
                <b style={{ color: "var(--primary)" }}>{peakLabel}</b> es tu hora pico (
                {data.peakVal}%). Considera abrir más canchas a esa hora.
              </>
            ) : (
              <span style={{ color: "rgba(255,255,255,0.7)" }}>
                Aún no hay reservas suficientes para detectar picos esta semana.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* No-shows + sport mix + top socios */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* No-shows */}
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">No-shows · 30 días</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginTop: 10,
              marginBottom: 16,
            }}
          >
            <span
              className="font-heading tabular"
              style={{
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                color: data.monthReservationsCount > 0 ? "#0a0a0a" : "var(--muted-fg)",
              }}
            >
              {data.monthReservationsCount > 0 ? data.noShowPct : "—"}
            </span>
            <span style={{ fontSize: 14, color: "var(--muted-fg)" }}>
              {data.monthReservationsCount > 0 ? "%" : ""}
            </span>
          </div>
          {data.monthReservationsCount > 0 ? (
            <>
              <NoShowRow
                label="No-shows registrados"
                value={`${data.noShowsCount} casos`}
                sub="reservas marcadas no_show"
              />
              <NoShowRow
                label="Cancelaciones"
                value={`${data.cancelledCount} casos`}
                sub="estado cancelled últimos 30 días"
              />
              <NoShowRow
                label="Multas aplicadas"
                value="—"
                sub="sin tracking de multas aún"
              />
            </>
          ) : (
            <SectionEmpty
              title="Sin reservas este mes"
              sub="Cuando haya actividad podremos medir no-shows."
            />
          )}
        </div>

        {/* Distribución por deporte */}
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Distribución por deporte</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginTop: 10,
              marginBottom: 16,
            }}
          >
            <span
              className="font-heading tabular"
              style={{
                fontSize: 40,
                fontWeight: 900,
                letterSpacing: "-0.04em",
                color: data.totalMatches > 0 ? "#0a0a0a" : "var(--muted-fg)",
              }}
            >
              {data.totalMatches > 0 ? data.matchesPerDay : "—"}
            </span>
            <span style={{ fontSize: 14, color: "var(--muted-fg)" }}>matches / día</span>
          </div>
          {data.sports.length > 0 ? (
            data.sports.map((s) => (
              <div key={s.key} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 11.5,
                    marginBottom: 5,
                  }}
                >
                  <b>{s.label}</b>
                  <span>
                    <b>{s.pct}%</b>{" "}
                    <span style={{ color: "var(--muted-fg)", fontSize: 10 }}>
                      · {Math.round((data.matchesPerDay * s.pct) / 100)}/d
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--muted)",
                    borderRadius: 9999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: s.pct + "%",
                      background: SPORT_COLORS[s.label] ?? "#737373",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <SectionEmpty
              title="Sin matches esta semana"
              sub="La distribución aparece cuando hay reservas registradas."
            />
          )}
        </div>

        {/* Top socios */}
        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Top socios · mes</div>
          {data.topMembers.length > 0 ? (
            data.topMembers.map((p, i) => (
              <div
                key={p.name + i}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "9px 0",
                  borderTop: i === 0 ? "0" : "1px dashed var(--border)",
                }}
              >
                <div
                  className="font-heading"
                  style={{
                    width: 22,
                    fontSize: 13,
                    fontWeight: 900,
                    color: i === 0 ? "#fbbf24" : "var(--muted-fg)",
                  }}
                >
                  {i + 1}
                </div>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: TOP_AVATAR_BG[i % TOP_AVATAR_BG.length],
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 10,
                  }}
                >
                  {initials(p.name)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800 }}>{p.name}</div>
                </div>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    color: "var(--primary)",
                  }}
                >
                  {p.visits}
                  <span style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700 }}>
                    v
                  </span>
                </div>
              </div>
            ))
          ) : (
            <SectionEmpty
              title="Sin socios activos"
              sub="Aparecerán cuando empiecen a reservar."
            />
          )}
        </div>
      </div>
    </>
  );
}

function KpiPlaceholder({
  label,
  icon,
  iconBg,
  goal,
  note,
}: {
  label: string;
  icon: string;
  iconBg: string;
  goal: string;
  note: string;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 22,
        position: "relative",
        overflow: "hidden",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        opacity: 0.7,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: iconBg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          opacity: 0.6,
        }}
      >
        <Icon name={icon} size={17} color="#fff" />
      </div>
      <div className="label-mp">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 12 }}>
        <span
          className="font-heading tabular"
          style={{
            fontSize: 56,
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 0.9,
            color: "var(--muted-fg)",
          }}
        >
          —
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "var(--muted-fg)",
          fontWeight: 800,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginTop: 14,
          marginBottom: 6,
        }}
      >
        <span>Meta · {goal}</span>
        <span>{note}</span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--muted)",
          borderRadius: 9999,
          overflow: "hidden",
        }}
      >
        <div style={{ height: "100%", width: "0%", background: iconBg }} />
      </div>
    </div>
  );
}

function NoShowRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div style={{ padding: "8px 0", borderTop: "1px dashed var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{sub}</div>
    </div>
  );
}

function SectionEmpty({ title, sub }: { title: string; sub: string }) {
  return (
    <div
      style={{
        padding: "18px 12px",
        textAlign: "center",
        color: "var(--muted-fg)",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 8,
        opacity: 0.7,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#0a0a0a" }}>{title}</div>
      <div style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}
