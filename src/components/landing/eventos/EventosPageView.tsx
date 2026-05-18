// /eventos — migrado 1:1 desde MatchPoint Public.html (líneas 1090-1231)
"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import type { TournamentFeatured } from "@/lib/schemas/tournaments";

const CARD_GRADIENTS = [
  { color: "linear-gradient(135deg,#1e3a8a,#3b82f6)", tagC: "#3b82f6" },
  { color: "linear-gradient(135deg,#7c2d12,#dc2626)", tagC: "#dc2626" },
  { color: "linear-gradient(135deg,#0c4a6e,#0ea5e9)", tagC: "#0ea5e9" },
  { color: "linear-gradient(135deg,#831843,#db2777)", tagC: "#db2777" },
  { color: "linear-gradient(135deg,#0a0a0a,#374151)", tagC: "#0a0a0a" },
  { color: "linear-gradient(135deg,#064e3b,#10b981)", tagC: "#10b981" },
];

const MONTHS_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function tagFromFormat(format: string): string {
  if (format === "round_robin" || format === "swiss") return "LIGA";
  if (format === "groups_to_knockout") return "ESTELAR";
  return "TORNEO";
}

function sportLabel(sport: string): string {
  if (sport === "tennis") return "Tenis";
  if (sport === "padel") return "Pádel";
  return "Pickleball";
}

function dateLabel(startsAt: string, endsAt: string): { d: string; m: string } {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  return {
    d: sameMonth && sd !== ed ? `${sd}-${ed}` : `${sd}`,
    m: MONTHS_ES[s.getUTCMonth()],
  };
}

function formatPrize(cents: number | null): string {
  if (cents == null || cents === 0) return "Premios";
  const n = Math.round(cents / 100);
  return n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;
}

function formatFee(cents: number): number {
  return Math.round(cents / 100);
}

const MIN_GRID = 6;
type GridCard = (TournamentFeatured & { placeholder?: false }) | { placeholder: true; key: string };

function padTournaments(arr: TournamentFeatured[]): GridCard[] {
  const out: GridCard[] = arr.map((t) => ({ ...t, placeholder: false as const }));
  while (out.length < MIN_GRID) {
    out.push({ placeholder: true, key: `ph-${out.length}` });
  }
  return out;
}

export function EventosPageView({
  tournaments,
  pastTournaments,
}: {
  tournaments: TournamentFeatured[];
  pastTournaments: TournamentFeatured[];
}) {
  const onPaywall = usePaywall();
  const [tab, setTab] = useState<"proximos" | "curso" | "pasados">("proximos");

  const upcoming = tournaments.filter((t) => t.status !== "live" && t.status !== "finished");
  const live = tournaments.filter((t) => t.status === "live");
  const featured = upcoming[0];
  const rest = upcoming.slice(1);

  const tabs = [
    { k: "proximos", l: "Próximos", n: upcoming.length },
    { k: "curso", l: "En curso", n: live.length },
    { k: "pasados", l: "Pasados", n: pastTournaments.length },
  ] as const;

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 32px" }}>
      <div className="label-mp" style={{ color: "#fbbf24" }}>● Eventos · torneos & ligas</div>
      <h1
        className="font-heading"
        style={{
          fontSize: "clamp(2.5rem, 6vw, 5rem)",
          fontWeight: 900,
          letterSpacing: "-0.035em",
          textTransform: "uppercase",
          margin: "8px 0 14px",
          lineHeight: 0.95,
        }}
      >
        Calendario <span style={{ color: "var(--primary)" }}>●</span> {new Date().getFullYear()}
        <span className="dot">.</span>
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted-fg)", maxWidth: 540, lineHeight: 1.55, marginBottom: 28 }}>
        Todos los torneos, ligas y eventos sociales activos en Ecuador. Inscríbete y súbete al ranking.
      </p>

      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--muted)",
          borderRadius: 9999,
          alignSelf: "flex-start",
          width: "fit-content",
          marginBottom: 28,
        }}
      >
        {tabs.map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                padding: "8px 16px",
                borderRadius: 9999,
                border: 0,
                background: on ? "#fff" : "transparent",
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                fontWeight: on ? 900 : 700,
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: on ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {t.l}
              <span
                style={{
                  fontSize: 9.5,
                  padding: "1px 6px",
                  borderRadius: 9999,
                  background: on ? "#0a0a0a" : "transparent",
                  color: on ? "#fff" : "var(--muted-fg)",
                  border: on ? 0 : "1px solid var(--border)",
                }}
              >
                {t.n}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "proximos" && (
        <>
          {featured ? <FeaturedCard t={featured} /> : <FeaturedPlaceholder />}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, alignSelf: "start", alignContent: "start" }}>
            {padTournaments(rest).map((t, i) =>
              t.placeholder ? (
                <EventPlaceholderCard key={t.key} />
              ) : (
                <EventGridCard key={t.id} t={t} index={i} />
              ),
            )}
          </div>
        </>
      )}

      {tab === "curso" && (
        <>
          {live.length === 0 && (
            <div
              style={{
                padding: "14px 18px",
                background: "var(--muted)",
                borderRadius: 12,
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 12.5,
                color: "var(--muted-fg)",
              }}
            >
              <Icon name="info" size={16} color="var(--primary)" />
              <span>
                Sin eventos en juego ahora mismo. Aparecerán aquí en cuanto arranque el siguiente torneo.
              </span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, alignSelf: "start", alignContent: "start" }}>
            {padTournaments(live).map((t, i) =>
              t.placeholder ? (
                <EventPlaceholderCard key={t.key} />
              ) : (
                <EventGridCard key={t.id} t={t} index={i} />
              ),
            )}
          </div>
        </>
      )}

      {tab === "pasados" && <PastTournamentsTab past={pastTournaments} onPaywall={onPaywall} />}
    </main>
  );
}

function FeaturedCard({ t }: { t: TournamentFeatured }) {
  const { d, m } = dateLabel(t.startsAt, t.endsAt);
  const tag = tagFromFormat(t.format);
  const sport = sportLabel(t.sport);
  const club = [t.clubName, t.clubCity].filter(Boolean).join(" · ") || "Multi-club";
  const slots = t.maxParticipants ?? 0;
  const insc = t.registrationsCount;
  const pct = slots > 0 ? Math.min(100, (insc / slots) * 100) : 0;
  const accent = (t.name.split(" ")[0] ?? "OPEN").toUpperCase().slice(0, 6);
  const remaining = slots > 0 ? slots - insc : null;

  return (
    <Link
      href={`/eventos/${t.slug}`}
      style={{
        display: "block",
        marginBottom: 16,
        padding: 0,
        overflow: "hidden",
        borderRadius: 14.4,
        position: "relative",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
        color: "#fff",
        textDecoration: "none",
        minHeight: 280,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 260,
          color: "rgba(16,185,129,0.07)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(15%, -15%)",
          pointerEvents: "none",
        }}
      >
        {accent}
      </div>
      <div
        style={{
          position: "absolute",
          top: 18,
          left: 18,
          padding: "5px 13px",
          background: "var(--primary)",
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        ★ EVENTO {tag}
      </div>
      <div
        style={{
          position: "relative",
          padding: 36,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 32,
          alignItems: "end",
          minHeight: 280,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 28 }}>
            <span
              className="font-heading"
              style={{ fontSize: 72, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.045em" }}
            >
              {d}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {m}
            </span>
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 3.8rem)",
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: "-0.035em",
              textTransform: "uppercase",
              margin: "12px 0 0",
              maxWidth: 620,
            }}
          >
            {t.name}
            <span style={{ color: "#10b981" }}>.</span>
          </h2>
          <div
            style={{
              display: "flex",
              gap: 22,
              marginTop: 18,
              fontSize: 13,
              color: "rgba(255,255,255,0.85)",
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="trophy" size={13} />
              {sport}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name="map-pin" size={13} />
              {club}
            </span>
          </div>
          <div
            style={{
              marginTop: 18,
              padding: "8px 16px",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              borderRadius: 9999,
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--primary)",
            }}
          >
            Ver detalles del evento
            <Icon name="arrow-right" size={12} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 22 }}>
            <div>
              <div
                style={{
                  fontSize: 9.5,
                  color: "rgba(255,255,255,0.55)",
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  fontWeight: 800,
                }}
              >
                Premio
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#10b981",
                  letterSpacing: "-0.02em",
                  marginTop: 3,
                }}
              >
                {formatPrize(t.prizePoolCents)}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 9.5,
                  color: "rgba(255,255,255,0.55)",
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                  fontWeight: 800,
                }}
              >
                Inscripción
              </div>
              <div
                className="font-heading"
                style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 3 }}
              >
                ${formatFee(t.entryFeeCents)}
              </div>
            </div>
          </div>
          {slots > 0 && (
            <div style={{ width: 260 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10.5,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 5,
                }}
              >
                <span>Cupos {insc}/{slots}</span>
                {remaining != null && remaining > 0 && remaining <= 6 && (
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>¡Últimos lugares!</span>
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
      </div>
    </Link>
  );
}

function FeaturedPlaceholder() {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: 36,
        overflow: "hidden",
        borderRadius: 14.4,
        position: "relative",
        background: "linear-gradient(135deg, #1f1f23 0%, #2a2a2e 60%, #3a3a3e 100%)",
        color: "rgba(255,255,255,0.6)",
        minHeight: 280,
        border: "1px dashed rgba(255,255,255,0.15)",
        opacity: 0.7,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div
        style={{
          padding: "5px 13px",
          background: "rgba(255,255,255,0.1)",
          borderRadius: 9999,
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        ● PRÓXIMO TORNEO ESTELAR
      </div>
      <h2
        className="font-heading"
        style={{
          fontSize: "clamp(2rem, 4vw, 3.2rem)",
          fontWeight: 900,
          lineHeight: 0.95,
          letterSpacing: "-0.035em",
          textTransform: "uppercase",
          margin: 0,
          maxWidth: 620,
        }}
      >
        Esperando el siguiente<span style={{ color: "#fbbf24" }}>.</span>
      </h2>
      <p style={{ fontSize: 13, marginTop: 12, maxWidth: 460 }}>
        Aquí va el torneo más grande de la temporada. ¿Tu club organiza uno?
      </p>
      <Link
        href="/soy-club"
        style={{
          marginTop: 18,
          padding: "8px 16px",
          background: "rgba(0,0,0,0.4)",
          borderRadius: 9999,
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--primary)",
          textDecoration: "none",
        }}
      >
        Publicá tu torneo →
      </Link>
    </div>
  );
}

function EventPlaceholderCard() {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        opacity: 0.55,
        border: "1px dashed var(--border)",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          height: 160,
          background: "linear-gradient(135deg, #e5e5e5, #d4d4d4)",
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: 16,
        }}
      >
        <div style={{ position: "absolute", top: 12, left: 12 }}>
          <span
            style={{
              padding: "3px 9px",
              background: "rgba(0,0,0,0.2)",
              borderRadius: 9999,
              fontSize: 9,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "0.14em",
            }}
          >
            —
          </span>
        </div>
        <div style={{ position: "relative", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span className="font-heading" style={{ fontSize: 36, fontWeight: 900, lineHeight: 0.9 }}>—</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>—</span>
          </div>
          <div
            className="font-heading"
            style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
          >
            Disponible
          </div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginBottom: 8 }}>Tu torneo aquí</div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 10,
            borderTop: "1px dashed var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 9, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Premio</div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }}>$—</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 9, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>Cupos</div>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)" }}>—</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventGridCard({ t, index }: { t: TournamentFeatured; index: number }) {
  const { d, m } = dateLabel(t.startsAt, t.endsAt);
  const tag = tagFromFormat(t.format);
  const { color } = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const club = [t.clubName, t.clubCity].filter(Boolean).join(" · ") || "Multi-club";
  const full = t.maxParticipants != null && t.registrationsCount >= t.maxParticipants;
  const insc = t.maxParticipants != null ? `${t.registrationsCount}/${t.maxParticipants}` : `${t.registrationsCount}`;

  return (
    <Link
      href={`/eventos/${t.slug}`}
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        textDecoration: "none",
        color: "#0a0a0a",
        opacity: full ? 0.6 : 1,
      }}
    >
      <div
        style={{
          height: 160,
          background: color,
          position: "relative",
          display: "flex",
          alignItems: "flex-end",
          padding: 16,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 140,
            color: "rgba(255,255,255,0.08)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(20%, -20%)",
          }}
        >
          {tag.slice(0, 4)}
        </div>
        <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 5 }}>
          <span
            style={{
              padding: "3px 9px",
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(6px)",
              borderRadius: 9999,
              fontSize: 9,
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "0.14em",
            }}
          >
            {tag}
          </span>
          {full && (
            <span
              style={{
                padding: "3px 9px",
                background: "#fbbf24",
                borderRadius: 9999,
                fontSize: 9,
                fontWeight: 900,
                color: "#0a0a0a",
                letterSpacing: "0.14em",
              }}
            >
              LLENO
            </span>
          )}
        </div>
        <div style={{ position: "relative", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span
              className="font-heading"
              style={{ fontSize: 36, fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.04em" }}
            >
              {d}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.2em" }}>{m}</span>
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              lineHeight: 1.05,
            }}
          >
            {t.name}
            <span style={{ color: "#fbbf24" }}>.</span>
          </div>
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div
          style={{
            fontSize: 10.5,
            color: "var(--muted-fg)",
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Icon name="map-pin" size={11} />
          {club}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 10,
            borderTop: "1px dashed var(--border)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9,
                color: "var(--muted-fg)",
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Premio
            </div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: "var(--primary)" }}>
              {formatPrize(t.prizePoolCents)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 9,
                color: "var(--muted-fg)",
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Cupos
            </div>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>
              {insc}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PastTournamentsTab({
  past,
  onPaywall,
}: {
  past: TournamentFeatured[];
  onPaywall: ReturnType<typeof usePaywall>;
}) {
  if (past.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: "center",
          background: "var(--muted)",
          borderRadius: 16,
          border: "1px dashed var(--border)",
        }}
      >
        <Icon name="trophy" size={32} color="var(--muted-fg)" />
        <div
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: "12px 0 6px",
          }}
        >
          Sin torneos pasados todavía<span className="dot">.</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", maxWidth: 420, margin: "0 auto" }}>
          Cuando termine el primer torneo aparecerá aquí con sus ganadores y premios.
        </p>
      </div>
    );
  }

  const totalPrize = past.reduce((s, t) => s + (t.prizePoolCents ?? 0), 0);
  const totalPlayers = past.reduce((s, t) => s + t.registrationsCount, 0);
  const uniqueClubs = new Set(past.map((t) => t.clubName).filter(Boolean)).size;
  const year = new Date().getFullYear();

  return (
    <div>
      <div className="label-mp" style={{ marginBottom: 14 }}>Últimos torneos finalizados</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {past.slice(0, 9).map((t) => {
          const { d, m } = dateLabel(t.startsAt, t.endsAt);
          return (
            <Link
              key={t.id}
              href={`/eventos/${t.slug}`}
              className="card"
              style={{
                padding: 20,
                position: "relative",
                overflow: "hidden",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <Icon name="trophy" size={22} color="#fbbf24" style={{ position: "absolute", top: 16, right: 16 }} />
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                }}
              >
                {d} {m}
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: 18,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  margin: "8px 0",
                }}
              >
                {t.name}
                <span className="dot">.</span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                {t.clubName ?? "Multi-club"}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4 }}>
                Premio:{" "}
                <b style={{ color: "var(--primary)" }}>{formatPrize(t.prizePoolCents)}</b>
              </div>
            </Link>
          );
        })}
      </div>
      <div style={{ padding: 28, textAlign: "center", background: "#0a0a0a", color: "#fff", borderRadius: 14.4 }}>
        <div
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
          }}
        >
          {past.length} torneo{past.length === 1 ? "" : "s"} finalizado{past.length === 1 ? "" : "s"} en {year}
          <span style={{ color: "#fbbf24" }}>.</span>
        </div>
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.7)",
            margin: "8px auto 14px",
            maxWidth: 460,
          }}
        >
          {formatPrize(totalPrize)} en premios repartidos · {totalPlayers.toLocaleString("es-EC")} jugadores compitieron · {uniqueClubs} club{uniqueClubs === 1 ? "" : "es"} anfitri{uniqueClubs === 1 ? "ón" : "ones"}.
        </p>
        <button className="btn btn-primary" onClick={() => onPaywall("inscripcion")}>
          Quiero competir
          <Icon name="arrow-right" size={13} />
        </button>
      </div>
    </div>
  );
}
