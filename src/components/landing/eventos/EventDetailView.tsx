// /eventos/[slug] — migrado 1:1 desde MatchPoint Public.html (líneas 504-580)
"use client";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import type { TournamentDetail } from "@/lib/schemas/tournaments";

type Props = {
  detail: TournamentDetail;
  clubName: string | null;
  clubCity: string | null;
};

const MONTHS_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function sportLabel(sport: string): string {
  if (sport === "tennis") return "Tenis";
  if (sport === "padel") return "Pádel";
  return "Pickleball";
}

function formatLabel(format: string): string {
  switch (format) {
    case "single_elim": return "Eliminación directa";
    case "double_elim": return "Doble eliminación";
    case "round_robin": return "Round robin";
    case "swiss": return "Suizo";
    case "groups_to_knockout": return "Grupos + llave";
    default: return "Eliminación";
  }
}

function tagFromFormat(format: string): string {
  if (format === "round_robin" || format === "swiss") return "LIGA";
  if (format === "groups_to_knockout") return "ESTELAR";
  return "TORNEO";
}

function dateLabel(startsAt: string, endsAt: string): { d: string; m: string; full: string } {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const m = MONTHS_ES[s.getUTCMonth()];
  const year = s.getUTCFullYear();
  const d = sameMonth && sd !== ed ? `${sd}-${ed}` : `${sd}`;
  const fullM = m.charAt(0) + m.slice(1).toLowerCase();
  const full = sameMonth && sd !== ed ? `${sd}-${ed} ${fullM} ${year}` : `${sd} ${fullM} ${year}`;
  return { d, m, full };
}

function formatMoney(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "—";
  const n = Math.round(cents / 100);
  return n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;
}

function levelRange(cats: TournamentDetail["categories"]): string | null {
  const levels = cats.map((c) => c.level).filter((l): l is NonNullable<typeof l> => l != null);
  if (levels.length === 0) return null;
  if (levels.length === 1) return levels[0];
  return `${levels[0]}–${levels[levels.length - 1]}`;
}

export function EventDetailView({ detail, clubName, clubCity }: Props) {
  const onPaywall = usePaywall();
  const { tournament: t, categories, registrationCount } = detail;
  const date = dateLabel(t.startsAt, t.endsAt);
  const sport = sportLabel(t.sport);
  const fmt = formatLabel(t.format);
  const tag = tagFromFormat(t.format);
  const level = levelRange(categories);
  const slots = t.maxParticipants ?? 0;
  const insc = registrationCount;
  const pct = slots > 0 ? Math.min(100, (insc / slots) * 100) : 0;
  const remaining = slots > 0 ? slots - insc : null;
  const accent = (t.name.split(" ")[0] ?? "OPEN").toUpperCase().slice(0, 6);
  const club = [clubName, clubCity].filter(Boolean).join(" · ") || "Multi-club";
  const fee = Math.round(t.entryFeeCents / 100);

  // Split prize pool 50% / 30% / 20% para el podio.
  const pool = t.prizePoolCents ?? 0;
  const podium = pool > 0
    ? [
        { p: "1°", amount: formatMoney(Math.round(pool * 0.5)), bg: "#fbbf24", col: "#0a0a0a" },
        { p: "2°", amount: formatMoney(Math.round(pool * 0.3)), bg: "#9ca3af", col: "#fff" },
        { p: "3°", amount: formatMoney(Math.round(pool * 0.2)), bg: "#d97706", col: "#fff" },
      ]
    : [];

  // Cronograma: mock por ahora (no tenemos schedule en DB).
  const schedule = [
    { d: "Día 1 · acreditación", items: [["18:00", "Acreditación + bienvenida"], ["19:00", "Sorteo de cuadros"]] as [string, string][] },
    { d: "Día 2 · cuadros", items: [["09:00", "Octavos de final"], ["14:00", "Cuartos de final"], ["18:00", "Coctel de jugadores"]] as [string, string][] },
    { d: "Día 3 · final", items: [["10:00", "Semifinales"], ["15:00", "Final"], ["17:00", "Premiación"]] as [string, string][] },
  ];

  return (
    <>
      <section
        style={{
          position: "relative",
          minHeight: 480,
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 340,
            color: "rgba(16,185,129,0.07)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -15%)",
          }}
        >
          {accent}
        </div>
        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "60px 32px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "4px 12px",
                background: "var(--primary)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              ★ EVENTO {tag}
            </span>
            <span
              style={{
                padding: "4px 12px",
                background: "rgba(255,255,255,0.15)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {sport}
            </span>
            {level && (
              <span
                style={{
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Nivel {level}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
            <span
              className="font-heading"
              style={{ fontSize: 96, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9 }}
            >
              {date.d}
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {date.m}
            </span>
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: "clamp(3rem, 7vw, 5.5rem)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: "0 0 18px",
              lineHeight: 0.92,
              maxWidth: 900,
            }}
          >
            {t.name}
            <span style={{ color: "#10b981" }}>.</span>
          </h1>
          <div
            style={{
              display: "flex",
              gap: 26,
              fontSize: 14,
              color: "rgba(255,255,255,0.85)",
              flexWrap: "wrap",
              marginBottom: 36,
            }}
          >
            <span>
              <Icon name="map-pin" size={13} style={{ display: "inline", marginRight: 5 }} />
              {club}
            </span>
            {pool > 0 && (
              <span>
                <Icon name="trophy" size={13} style={{ display: "inline", marginRight: 5 }} />
                <b style={{ color: "var(--primary)" }}>{formatMoney(pool)}</b> en premios
              </span>
            )}
            {slots > 0 && (
              <span>
                <Icon name="users" size={13} style={{ display: "inline", marginRight: 5 }} />
                {insc} / {slots} parejas
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              style={{ padding: "15px 26px", fontSize: 13 }}
              onClick={() => onPaywall("inscripcion")}
            >
              <Icon name="check" size={14} />
              Inscribirme {fee > 0 ? `· $${fee}` : "gratis"}
            </button>
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              onClick={() => {
                if (typeof window !== "undefined" && navigator.share) {
                  navigator.share({ title: t.name, url: window.location.href }).catch(() => {});
                }
              }}
            >
              <Icon name="share-2" size={13} />
              Compartir
            </button>
          </div>
          {slots > 0 && (
            <div style={{ marginTop: 28, maxWidth: 480 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 6,
                }}
              >
                <span>Cupos restantes</span>
                {remaining != null && remaining > 0 && remaining <= 6 && (
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>¡Solo {remaining}!</span>
                )}
              </div>
              <div
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 9999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, #10b981, #fbbf24)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
      <main
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "60px 32px",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 32,
        }}
      >
        <div>
          <div className="label-mp">Sobre el evento</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "8px 0 14px",
            }}
          >
            {date.full}
            <span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#0a0a0a", marginBottom: 32 }}>
            {t.description ??
              `${fmt}. Inscripción ${fee > 0 ? `desde $${fee} por jugador` : "gratis"}. Premios para top 3 y kit oficial MatchPoint para todos los inscritos.`}
          </p>
          <div className="label-mp">Cronograma</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "8px 0 18px",
            }}
          >
            Tres días, una sola corona<span className="dot">.</span>
          </h2>
          {schedule.map((day) => (
            <div key={day.d} style={{ marginBottom: 24 }}>
              <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 10 }}>
                {day.d}
              </div>
              {day.items.map(([time, evt], i) => (
                <div
                  key={time}
                  style={{
                    display: "flex",
                    gap: 18,
                    padding: "10px 0",
                    borderTop: i === 0 ? "0" : "1px solid var(--border)",
                  }}
                >
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: "var(--primary)",
                      minWidth: 70,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {time}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{evt}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ padding: 22, position: "sticky", top: 100 }}>
            <div className="label-mp">Premios</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                margin: "6px 0 14px",
                textTransform: "uppercase",
              }}
            >
              {formatMoney(pool)} pozo<span className="dot">.</span>
            </h3>
            {podium.length > 0
              ? podium.map((row) => (
                  <div
                    key={row.p}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 8,
                      background: "var(--muted)",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: row.bg,
                        color: row.col,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "Plus Jakarta Sans",
                        fontWeight: 900,
                        fontSize: 14,
                      }}
                    >
                      {row.p}
                    </div>
                    <div style={{ flex: 1, fontSize: 11, color: "var(--muted-fg)" }}>+ trofeo + kit</div>
                    <div className="font-heading" style={{ fontSize: 17, fontWeight: 900 }}>
                      {row.amount}
                    </div>
                  </div>
                ))
              : (
                <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "8px 0" }}>
                  Premios por anunciar. Inscríbete para asegurar tu cupo.
                </p>
              )}
            <button
              className="btn btn-primary"
              style={{ width: "100%", marginTop: 14, justifyContent: "center" }}
              onClick={() => onPaywall("inscripcion")}
            >
              Inscribirme
              <Icon name="arrow-right" size={13} />
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
