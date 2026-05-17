// Home (landing) — migrado 1:1 desde MatchPoint Public.html (líneas 187-369)
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { PaywallTrigger } from "./Paywall";

type ClubCard = { n: string; city: string; rating: number; courts: number; price: number; color: string; href?: string; promo?: { ctaLabel: string } };
type EventCard = { n: string; d: string; m: string; club: string; prize: string; insc: string; tag: string; color: string; href?: string; promo?: { ctaLabel: string } };

type LandingStats = { players: string; clubs: string; gmv: string; rating: string };

type Props = {
  onPaywall: (t: PaywallTrigger) => void;
  clubs?: ClubCard[];
  events?: EventCard[];
  stats?: LandingStats;
  marqueeClubs?: string[];
};

// Placeholders del marquee cuando aún no hay clubes registrados.
const MARQUEE_PLACEHOLDERS = [
  "Tu club aquí",
  "Pronto en MatchPoint",
  "Tu club aquí",
  "Pronto en MatchPoint",
];

const EMPTY_STATS: LandingStats = {
  players: "—",
  clubs: "—",
  gmv: "—",
  rating: "—",
};

const STAT_LABELS: { key: keyof LandingStats; l: string }[] = [
  { key: "players", l: "jugadores registrados" },
  { key: "clubs", l: "clubes en red" },
  { key: "gmv", l: "GMV año en curso" },
  { key: "rating", l: "rating promedio" },
];

const STEPS = [
  { n: "01", t: "Encuentra", d: "Busca clubes cerca con disponibilidad real. Filtra por precio, deporte o nivel.", i: "search" },
  { n: "02", t: "Reserva", d: "Una cancha en 60 segundos. Divide el pago entre los jugadores.", i: "calendar-check" },
  { n: "03", t: "Domina", d: "Sube tu nivel oficial con cada partido. Tu ranking, visible para todos.", i: "trending-up" },
];

// Sin fallback con clubes/eventos inventados. Si no hay reales, page.tsx
// rellena con house promos (Tu club aquí / Crea tu torneo / etc).
const EVENTS_FALLBACK: EventCard[] = [];
const CLUBS_FEATURED_FALLBACK: ClubCard[] = [];

type DualCTA = {
  tag: string;
  t: string;
  d: string;
  cta: string;
  icon: string;
  accent: string;
  action?: PaywallTrigger;
  href?: string;
};

const DUAL: DualCTA[] = [
  { tag: "Para jugadores", t: "Únete gratis", d: "Acceso anticipado · 130 cupos restantes · sin tarjeta requerida.", cta: "Crear cuenta", icon: "user-plus", accent: "var(--primary)", action: "reservar" },
  { tag: "Para clubes", t: "Registra tu club", d: "Tu club. Más reservas. Menos trabajo. Onboarding en 48 horas.", cta: "Solicitar demo", icon: "building-2", accent: "#fbbf24", href: "/soy-club" },
];

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function Home({ onPaywall, clubs, events, stats, marqueeClubs }: Props) {
  const router = useRouter();
  const EVENTS = events && events.length > 0 ? events : EVENTS_FALLBACK;
  const CLUBS_FEATURED = clubs && clubs.length > 0 ? clubs : CLUBS_FEATURED_FALLBACK;
  const STATS = stats ?? EMPTY_STATS;
  const CLUBS_MARQUEE =
    marqueeClubs && marqueeClubs.length > 0 ? marqueeClubs : MARQUEE_PLACEHOLDERS;
  return (
    <>
      {/* HERO */}
      <section
        style={{
          position: "relative",
          minHeight: "calc(100vh - 90px)",
          background: "linear-gradient(180deg, #0a0a0a 0%, #1f1f23 60%, #064e3b 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 80% 50%, rgba(16,185,129,0.18), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 360,
            color: "rgba(255,255,255,0.04)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(10%, -15%)",
            textTransform: "uppercase",
            pointerEvents: "none",
          }}
        >
          PLAY
        </div>
        <div
          style={{
            position: "relative",
            maxWidth: 1280,
            margin: "0 auto",
            padding: "100px 32px 60px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 14px",
              background: "rgba(16,185,129,0.15)",
              border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: 9999,
              fontSize: 10.5,
              fontWeight: 900,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--primary)",
              marginBottom: 24,
            }}
          >
            ● LA COMUNIDAD #1 DE PICKLEBALL EN ECUADOR
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: "clamp(3.5rem, 9vw, 8.5rem)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: 0,
              lineHeight: 0.92,
              maxWidth: 1100,
            }}
          >
            Juega más.
            <br />
            Juega mejor<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "rgba(255,255,255,0.85)",
              maxWidth: 540,
              marginTop: 28,
              lineHeight: 1.6,
            }}
          >
            De cero a cancha en 60 segundos. Reserva, encuentra rivales de tu nivel y súbete al
            ranking. Sin llamadas, sin esperas, sin excusas para no jugar.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 36, flexWrap: "wrap" }}>
            <button
              className="lp-btn lp-btn-primary"
              style={{ padding: "16px 28px", fontSize: 13 }}
              onClick={() => onPaywall("reservar")}
            >
              Empieza a jugar
              <Icon name="arrow-right" size={14} />
            </button>
            <Link
              href="/soy-club"
              className="lp-btn lp-btn-outline"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                borderColor: "rgba(255,255,255,0.25)",
                padding: "15px 26px",
                fontSize: 13,
                textDecoration: "none",
              }}
            >
              Registra tu club
              <Icon name="building-2" size={14} />
            </Link>
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 64, flexWrap: "wrap" }}>
            {STAT_LABELS.map(({ key, l }) => {
              const v = STATS[key];
              const empty = v === "—" || v === "0";
              return (
                <div key={l}>
                  <div
                    className="font-heading tabular"
                    style={{
                      fontSize: 42,
                      fontWeight: 900,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                      color: empty ? "rgba(255,255,255,0.35)" : "#fff",
                    }}
                  >
                    {v}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.55)",
                      fontWeight: 800,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginTop: 6,
                    }}
                  >
                    {l}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            color: "rgba(255,255,255,0.5)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          Scroll · descubre
        </div>
      </section>

      {/* MARQUEE */}
      <section
        style={{
          padding: "40px 0",
          borderBottom: "1px solid var(--border)",
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 60,
            animation: "lpMarquee 35s linear infinite",
            whiteSpace: "nowrap",
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 30,
            letterSpacing: "-0.02em",
            color: "rgba(0,0,0,0.4)",
            textTransform: "uppercase",
          }}
        >
          {[...CLUBS_MARQUEE, ...CLUBS_MARQUEE].map((c, i) => (
            <span key={i}>
              {c} <span style={{ color: "var(--primary)" }}>●</span>
            </span>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 32px" }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>
          ● Cómo funciona
        </div>
        <h2
          className="font-heading"
          style={{
            fontSize: "clamp(2.5rem, 6vw, 5rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: "12px 0 60px",
            lineHeight: 1,
            maxWidth: 900,
          }}
        >
          Tres pasos.
          <br />
          Cero excusas<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {STEPS.map((s) => (
            <div
              key={s.n}
              style={{
                padding: 28,
                borderRadius: 14.4,
                border: "1px solid var(--border)",
                background: "#fff",
                position: "relative",
              }}
            >
              <div
                className="font-heading"
                style={{
                  fontSize: 80,
                  fontWeight: 900,
                  letterSpacing: "-0.04em",
                  lineHeight: 0.9,
                  color: "var(--muted)",
                }}
              >
                {s.n}
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  background: "var(--primary)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 18,
                  marginBottom: 14,
                }}
              >
                <Icon name={s.i} size={20} color="#fff" />
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                }}
              >
                {s.t}
                <span className="dot">.</span>
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--muted-fg)",
                  margin: "10px 0 0",
                  lineHeight: 1.55,
                }}
              >
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* EVENTOS DESTACADOS */}
      <section
        style={{
          background: "#0a0a0a",
          color: "#fff",
          padding: "100px 0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 30% 50%, rgba(251,191,36,0.08), transparent 60%)",
          }}
        />
        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginBottom: 48,
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="label-mp" style={{ color: "#fbbf24" }}>
                ● Eventos próximos
              </div>
              <h2
                className="font-heading"
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 4rem)",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                  textTransform: "uppercase",
                  margin: "12px 0 0",
                  lineHeight: 1,
                }}
              >
                Compite ahora<span style={{ color: "#fbbf24" }}>.</span>
              </h2>
            </div>
            <Link
              href="/eventos"
              className="lp-btn"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                textDecoration: "none",
              }}
            >
              Ver todos
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {EVENTS.map((e) => (
              <Link
                key={e.n}
                href={e.href ?? `/eventos/${slug(e.n)}`}
                style={{
                  padding: 0,
                  overflow: "hidden",
                  borderRadius: 14.4,
                  position: "relative",
                  background: e.color,
                  color: "#fff",
                  textDecoration: "none",
                  display: "block",
                  minHeight: 280,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.15), transparent 60%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    fontFamily: "Plus Jakarta Sans",
                    fontWeight: 900,
                    fontSize: 200,
                    color: "rgba(255,255,255,0.07)",
                    letterSpacing: "-0.06em",
                    lineHeight: 0.8,
                    transform: "rotate(-6deg) translate(15%, -20%)",
                  }}
                >
                  {e.tag.slice(0, 4)}
                </div>
                <div
                  style={{
                    position: "relative",
                    padding: 22,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span
                      style={{
                        padding: "4px 11px",
                        background: "rgba(0,0,0,0.4)",
                        borderRadius: 9999,
                        fontSize: 9,
                        fontWeight: 900,
                        letterSpacing: "0.18em",
                      }}
                    >
                      ★ {e.tag}
                    </span>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 22 }}>
                      <span
                        className="font-heading"
                        style={{
                          fontSize: 48,
                          fontWeight: 900,
                          lineHeight: 0.9,
                          letterSpacing: "-0.04em",
                        }}
                      >
                        {e.d}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.2em" }}>
                        {e.m}
                      </span>
                    </div>
                    <div
                      className="font-heading"
                      style={{
                        fontSize: 22,
                        fontWeight: 900,
                        letterSpacing: "-0.025em",
                        textTransform: "uppercase",
                        lineHeight: 1,
                        marginTop: 12,
                      }}
                    >
                      {e.n}
                      <span style={{ color: "#fbbf24" }}>.</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 8 }}>
                      {e.club}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      marginTop: 18,
                      paddingTop: 14,
                      borderTop: "1px dashed rgba(255,255,255,0.15)",
                    }}
                  >
                    {e.promo ? (
                      <span
                        className="font-heading"
                        style={{
                          fontSize: 14,
                          fontWeight: 900,
                          letterSpacing: "-0.01em",
                          color: "#fbbf24",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {e.promo.ctaLabel}
                        <Icon name="arrow-right" size={14} color="currentColor" />
                      </span>
                    ) : (
                      <>
                        <div>
                          <div
                            style={{
                              fontSize: 9,
                              color: "rgba(255,255,255,0.55)",
                              fontWeight: 900,
                              letterSpacing: "0.18em",
                              textTransform: "uppercase",
                            }}
                          >
                            Premio
                          </div>
                          <div
                            className="font-heading"
                            style={{ fontSize: 20, fontWeight: 900, color: "var(--primary)" }}
                          >
                            {e.prize}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 9,
                              color: "rgba(255,255,255,0.55)",
                              fontWeight: 900,
                              letterSpacing: "0.18em",
                              textTransform: "uppercase",
                            }}
                          >
                            Inscritos
                          </div>
                          <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                            {e.insc}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CLUBES DESTACADOS */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "100px 32px" }}>
        <div className="label-mp">● Clubes destacados</div>
        <h2
          className="font-heading"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: "12px 0 48px",
            lineHeight: 1,
          }}
        >
          Las mejores canchas<span className="dot">.</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {CLUBS_FEATURED.map((c) => (
            <Link
              key={c.n}
              href={c.href ?? `/clubes/${slug(c.n)}`}
              className="card"
              style={{
                overflow: "hidden",
                textDecoration: "none",
                color: "#0a0a0a",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ height: 160, background: c.color, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.2), transparent 60%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    left: 12,
                    padding: "3px 9px",
                    background: c.promo ? "var(--primary)" : "rgba(0,0,0,0.4)",
                    borderRadius: 9999,
                    fontSize: 9,
                    fontWeight: 900,
                    color: "#fff",
                    letterSpacing: "0.14em",
                  }}
                >
                  {c.promo ? "● MATCHPOINT" : `★ ${c.rating}`}
                </div>
                <div style={{ position: "absolute", bottom: 12, left: 12, color: "#fff" }}>
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {c.n}
                    <span style={{ color: "#bbf7d0" }}>.</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
                    {c.city}
                  </div>
                </div>
              </div>
              <div
                style={{
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {c.promo ? (
                  <span
                    className="font-heading"
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      letterSpacing: "-0.01em",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      color: "var(--primary)",
                    }}
                  >
                    {c.promo.ctaLabel}
                    <Icon name="arrow-right" size={13} color="currentColor" />
                  </span>
                ) : (
                  <>
                    <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{c.courts} canchas</span>
                    <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
                      ${c.price}
                      <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 600 }}>/h</span>
                    </span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* TESTIMONIOS */}
      <section style={{ background: "var(--muted)", padding: "100px 0" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● La voz de la comunidad
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 900,
              letterSpacing: "-0.035em",
              textTransform: "uppercase",
              margin: "12px 0 48px",
              lineHeight: 1,
            }}
          >
            Ellos ya juegan<span className="dot">.</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  padding: 28,
                  background: "#fafafa",
                  borderRadius: 14.4,
                  borderLeft: "2px dashed var(--border)",
                  opacity: 0.7,
                }}
              >
                <div style={{ display: "flex", gap: 2, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Icon key={s} name="star" size={13} color="var(--muted-fg)" />
                  ))}
                </div>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.5,
                    margin: 0,
                    fontWeight: 500,
                    color: "var(--muted-fg)",
                    fontStyle: "italic",
                  }}
                >
                  Pronto: aquí leerás lo que la comunidad dice de MatchPoint.
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 18,
                    paddingTop: 14,
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "var(--muted)",
                      color: "var(--muted-fg)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    —
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 900, color: "var(--muted-fg)" }}>—</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>—</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DUAL CTA */}
      <section
        style={{
          background: "#0a0a0a",
          color: "#fff",
          padding: "100px 0",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 50% 120%, rgba(16,185,129,0.25), transparent 70%)",
          }}
        />
        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "0 32px" }}>
          <h2
            className="font-heading"
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 900,
              letterSpacing: "-0.035em",
              textTransform: "uppercase",
              textAlign: "center",
              margin: "0 0 48px",
              lineHeight: 1,
            }}
          >
            No te quedes fuera<span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {DUAL.map((c) => (
              <div
                key={c.t}
                style={{
                  padding: 36,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 14.4,
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: c.accent,
                    color: c.accent === "#fbbf24" ? "#0a0a0a" : "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  <Icon name={c.icon} size={22} />
                </div>
                <div className="label-mp" style={{ color: c.accent }}>
                  ● {c.tag}
                </div>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    textTransform: "uppercase",
                    margin: "10px 0 8px",
                    lineHeight: 1,
                  }}
                >
                  {c.t}
                  <span style={{ color: c.accent }}>.</span>
                </div>
                <p
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.7)",
                    margin: 0,
                    lineHeight: 1.55,
                  }}
                >
                  {c.d}
                </p>
                <button
                  className="lp-btn"
                  style={{
                    marginTop: 22,
                    background: c.accent,
                    color: c.accent === "#fbbf24" ? "#0a0a0a" : "#fff",
                  }}
                  onClick={() => {
                    if (c.href) router.push(c.href);
                    else if (c.action) onPaywall(c.action);
                  }}
                >
                  {c.cta}
                  <Icon name="arrow-right" size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
