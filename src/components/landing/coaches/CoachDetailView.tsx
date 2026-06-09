// /coaches/[id] — migrado 1:1 desde MATCHPOINT Public.html (líneas 583-657)
"use client";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import type { CoachDetail } from "@/lib/schemas/coaches";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function sportLabel(sport: string): string {
  if (sport === "tennis") return "Tenis";
  if (sport === "padel") return "Pádel";
  return "Pickleball";
}

const MOCK_CLASSES = [
  { n: "Fundamentos 3.0–3.5", day: "L · M · V", time: "19:00 · 60m", enrolled: "4", cap: 6, price: 18 },
  { n: "Avanzado 4.0+", day: "M · J", time: "21:30 · 90m", enrolled: "5", cap: 6, price: 22 },
  { n: "1 a 1 personalizada", day: "Cualquier día", time: "a coordinar", enrolled: "—", cap: 1, price: 40 },
];

export function CoachDetailView({ detail }: { detail: CoachDetail }) {
  const onPaywall = usePaywall();
  const { coach, specialties, certifications } = detail;
  const hourly = coach.hourlyRateCents != null ? Math.round(coach.hourlyRateCents / 100) : 40;
  const groupRate = Math.round(hourly * 0.45);
  const primarySport = specialties[0]?.sport ?? "pickleball";
  const certNames = certifications.length > 0
    ? certifications.map((c) => c.name)
    : ["IPTPA L1", "PPR Certified"];

  return (
    <>
      <section
        style={{
          position: "relative",
          minHeight: 360,
          background: "linear-gradient(135deg, #f59e0b 0%, #b45309 50%, #0a0a0a 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 75% 30%, rgba(251,191,36,0.4), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 320,
            color: "rgba(255,255,255,0.07)",
            letterSpacing: "-0.06em",
            transform: "rotate(-6deg) translate(15%, -20%)",
          }}
        >
          COACH
        </div>
        <div
          className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-22 pb-10 md:pt-25 md:pb-15 flex items-center gap-6 md:gap-9 flex-wrap"
          style={{
            minHeight: 360,
          }}
        >
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "6px solid rgba(255,255,255,0.2)",
              flexShrink: 0,
            }}
          >
            <span className="font-heading" style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.025em" }}>
              {initials(coach.displayName)}
            </span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
              {coach.verifiedAt && (
                <span
                  style={{
                    padding: "4px 12px",
                    background: "rgba(0,0,0,0.4)",
                    borderRadius: 9999,
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.16em",
                  }}
                >
                  ★ COACH VERIFICADO
                </span>
              )}
              <span
                style={{
                  padding: "4px 12px",
                  background: "var(--primary)",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                }}
              >
                ● ACEPTANDO ALUMNOS
              </span>
            </div>
            <h1
              className="font-heading"
              style={{
                fontSize: "clamp(3rem, 6vw, 5rem)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                textTransform: "uppercase",
                margin: "0 0 8px",
                lineHeight: 0.95,
              }}
            >
              {coach.displayName}
              <span style={{ color: "#fbbf24" }}>.</span>
            </h1>
            <div
              style={{
                display: "flex",
                gap: 20,
                fontSize: 14,
                color: "rgba(255,255,255,0.85)",
                flexWrap: "wrap",
              }}
            >
              {coach.yearsExperience != null && (
                <span>
                  <Icon name="zap" size={13} color="#fbbf24" style={{ display: "inline", marginRight: 4 }} />
                  {coach.yearsExperience} {coach.yearsExperience === 1 ? "año" : "años"}
                </span>
              )}
              <span>
                <Icon name="trophy" size={13} style={{ display: "inline", marginRight: 4 }} />
                {sportLabel(primarySport)}
              </span>
              {coach.city && (
                <span>
                  <Icon name="map-pin" size={13} style={{ display: "inline", marginRight: 4 }} />
                  {coach.city}
                </span>
              )}
              <span>
                <Icon name="star" size={13} color="#fbbf24" style={{ display: "inline", marginRight: 4 }} />
                <b>{coach.ratingAvg != null ? coach.ratingAvg.toFixed(1) : "—"}</b> · {coach.ratingCount} reseñas
              </span>
            </div>
          </div>
        </div>
      </section>
      <main
        className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-15 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6 md:gap-8"
      >
        <div>
          <div className="label-mp">Sobre el coach</div>
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
            {coach.headline ?? "Sube tu nivel"}
            <span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: "var(--muted-fg)", marginBottom: 28 }}>
            {coach.bio ??
              `Coach certificado con programa probado. Especialista en técnica y juego competitivo. Más de ${coach.ratingCount > 0 ? coach.ratingCount : 50} clases dictadas en la red MATCHPOINT.`}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 36 }}>
            {certNames.map((cert) => (
              <span
                key={cert}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "6px 12px",
                  background: "var(--muted)",
                  borderRadius: 9999,
                  fontSize: 11.5,
                  fontWeight: 800,
                }}
              >
                <Icon name="badge-check" size={12} color="var(--primary)" />
                {cert}
              </span>
            ))}
          </div>
          <div className="label-mp">Clases abiertas</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "8px 0 18px",
            }}
          >
            Reserva tu lugar<span className="dot">.</span>
          </h3>
          {MOCK_CLASSES.map((cl) => (
            <div
              key={cl.n}
              className="card"
              style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  background: "linear-gradient(135deg, #f59e0b, #b45309)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                <Icon name="graduation-cap" size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="font-heading" style={{ fontSize: 14.5, fontWeight: 900 }}>
                  {cl.n}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                  {cl.day} · {cl.time}
                </div>
              </div>
              <div style={{ textAlign: "right", marginRight: 14 }}>
                <div className="font-heading" style={{ fontSize: 20, fontWeight: 900, color: "var(--primary)" }}>
                  ${cl.price}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                  {cl.enrolled} / {cl.cap}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => onPaywall("clase")}>
                Reservar
              </button>
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ padding: 22, position: "sticky", top: 100 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>Tarifa</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span
                className="font-heading tabular"
                style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.04em" }}
              >
                ${hourly}
              </span>
              <span style={{ fontSize: 13, color: "var(--muted-fg)" }}>/ 1 a 1</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4 }}>
              Grupal desde ${groupRate}/clase
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 18, padding: "13px 18px" }}
              onClick={() => onPaywall("clase")}
            >
              <Icon name="calendar-plus" size={14} />
              Reservar clase
            </button>
            <button
              className="btn btn-outline"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              onClick={() => onPaywall("mensaje")}
            >
              <Icon name="message-square" size={13} />
              Enviar mensaje
            </button>
            <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px dashed var(--border)" }}>
              <div className="mp-tournament-form-grid-2" style={{ gap: 14 }}>
                <div>
                  <div className="label-mp">Reseñas</div>
                  <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                    {coach.ratingCount}
                  </div>
                </div>
                <div>
                  <div className="label-mp">Experiencia</div>
                  <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                    {coach.yearsExperience ?? "—"}
                    {coach.yearsExperience != null && (
                      <span style={{ fontSize: 12, color: "var(--muted-fg)", marginLeft: 4 }}>años</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
