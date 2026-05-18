// /clubes — migrado 1:1 desde MatchPoint Public.html (líneas 373-443)
"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import type { ClubFeatured } from "@/lib/schemas/clubs";

const FILTERS: { label: string; key: string }[] = [
  { label: "Todos", key: "todos" },
  { label: "Pickleball", key: "pickleball" },
  { label: "Pádel", key: "padel" },
  { label: "Tenis", key: "tennis" },
  { label: "Indoor", key: "indoor" },
  { label: "Outdoor", key: "outdoor" },
];

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#064e3b,#10b981)",
  "linear-gradient(135deg,#7c2d12,#fb923c)",
  "linear-gradient(135deg,#1e3a8a,#0ea5e9)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#831843,#db2777)",
];

const MAP_POSITIONS = [
  { x: "28%", y: "38%" },
  { x: "46%", y: "58%" },
  { x: "54%", y: "24%" },
  { x: "68%", y: "46%" },
  { x: "34%", y: "70%" },
  { x: "74%", y: "70%" },
];

function sportLabel(sport: string): string {
  if (sport === "tennis") return "Tenis";
  if (sport === "padel") return "Pádel";
  return "Pickleball";
}

function primarySport(sports: string[]): string {
  if (sports.length === 0) return "Multi";
  if (sports.length > 1) return "Multi";
  return sportLabel(sports[0]);
}

// Tipo del payload de stats que viene del server (calculado con
// get_club_review_stats RPC). null = club sin reseñas todavía.
export type RatingInfo = { rating: number; reviews: number };

function ratingFor(
  clubId: string,
  map: Record<string, RatingInfo>,
): RatingInfo | null {
  const r = map[clubId];
  if (!r || r.reviews === 0) return null;
  return r;
}

const MIN_CLUB_CARDS = 6;
type ClubCard = (ClubFeatured & { placeholder?: false }) | { placeholder: true; key: string };

export function ClubesPageView({
  clubs,
  ratingByClubId = {},
}: {
  clubs: ClubFeatured[];
  ratingByClubId?: Record<string, RatingInfo>;
}) {
  const onPaywall = usePaywall();
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");

  const filtered = clubs.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q.toLowerCase()) && !c.city.toLowerCase().includes(q.toLowerCase())) {
      return false;
    }
    if (filter === "todos" || filter === "indoor" || filter === "outdoor") return true;
    return c.sports.includes(filter as "tennis" | "padel" | "pickleball");
  });

  // Destacado: primer club del array filtrado con featured_until activo.
  const nowMs = Date.now();
  const featured =
    filtered.find((c) => {
      if (!c.featuredUntil) return false;
      const t = Date.parse(c.featuredUntil);
      return Number.isFinite(t) && t > nowMs;
    }) ?? null;
  const gridSource = featured ? filtered.filter((c) => c.id !== featured.id) : filtered;

  const padded: ClubCard[] = [...gridSource.map((c) => ({ ...c, placeholder: false as const }))];
  while (padded.length < MIN_CLUB_CARDS) {
    padded.push({ placeholder: true, key: `ph-${padded.length}` });
  }

  return (
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "40px 32px" }}>
      <div className="label-mp" style={{ color: "var(--primary)" }}>● Encuentra tu cancha</div>
      <h1
        className="font-heading"
        style={{
          fontSize: "clamp(2.5rem, 6vw, 5rem)",
          fontWeight: 900,
          letterSpacing: "-0.035em",
          textTransform: "uppercase",
          margin: "8px 0 24px",
          lineHeight: 1,
        }}
      >
        Clubes en <span style={{ color: "var(--primary)" }}>●</span> Ecuador
        <span className="dot">.</span>
      </h1>
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 480 }}>
          <Icon name="search" size={14} style={{ position: "absolute", left: 14, top: 13, color: "var(--muted-fg)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar club, ciudad o cancha…"
            style={{
              width: "100%",
              padding: "11px 16px 11px 40px",
              border: "1px solid var(--border)",
              borderRadius: 9999,
              fontSize: 13,
              fontFamily: "inherit",
              background: "#fff",
              outline: "none",
            }}
          />
        </div>
        {FILTERS.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "8px 14px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 800,
                fontFamily: "inherit",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
                background: on ? "#0a0a0a" : "#fff",
                color: on ? "#fff" : "#0a0a0a",
                border: `1px solid ${on ? "#0a0a0a" : "var(--border)"}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {featured && (() => {
        const featuredStats = ratingFor(featured.id, ratingByClubId);
        const price = featured.minPriceCents != null ? Math.round(featured.minPriceCents / 100) : 12;
        return (
          <Link
            href={`/clubes/${featured.slug}`}
            className="card"
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              minHeight: 260,
              overflow: "hidden",
              padding: 0,
              marginBottom: 24,
              textDecoration: "none",
              color: "#0a0a0a",
              border: "1px solid #facc15",
              boxShadow: "0 10px 30px rgba(250,204,21,0.18)",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #064e3b 0%, #047857 60%, #10b981 100%)",
                position: "relative",
                overflow: "hidden",
                display: "flex",
                alignItems: "flex-end",
                padding: 28,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 50%)",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  padding: "5px 12px",
                  background: "#facc15",
                  color: "#0a0a0a",
                  borderRadius: 9999,
                  fontSize: 9.5,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.18em",
                }}
              >
                ★ Destacado
              </div>
              <div style={{ position: "relative", zIndex: 2, color: "#fff" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.75)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    marginBottom: 6,
                  }}
                >
                  <Icon name="map-pin" size={12} color="#fff" />
                  {featured.city}
                </div>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  {featured.name}
                  <span style={{ color: "#bbf7d0" }}>.</span>
                </div>
              </div>
            </div>
            <div style={{ padding: 28, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  {featuredStats ? (
                    <>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "4px 10px",
                          background: "#fef3c7",
                          borderRadius: 9999,
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        <Icon name="star" size={11} color="#d97706" />
                        {featuredStats.rating.toFixed(1)}
                      </div>
                      <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                        · {featuredStats.reviews}{" "}
                        {featuredStats.reviews === 1 ? "reseña" : "reseñas"}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                      Sin reseñas todavía
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
                  <div style={{ padding: 12, background: "var(--muted)", borderRadius: 10 }}>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                      Canchas
                    </div>
                    <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                      {featured.courtsCount}
                    </div>
                  </div>
                  <div style={{ padding: 12, background: "var(--muted)", borderRadius: 10 }}>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>
                      Deporte
                    </div>
                    <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
                      {primarySport(featured.sports)}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Desde</span>
                <span className="font-heading" style={{ fontSize: 28, fontWeight: 900 }}>
                  ${price}
                  <span style={{ fontSize: 12, color: "var(--muted-fg)", fontWeight: 600 }}>/h</span>
                </span>
              </div>
            </div>
          </Link>
        );
      })()}
      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, alignSelf: "start", alignContent: "start" }}>
          {padded.map((c, i) => {
            if (c.placeholder) {
              return (
                <div
                  key={c.key}
                  className="card"
                  style={{
                    overflow: "hidden",
                    opacity: 0.55,
                    border: "1px dashed var(--border)",
                    background: "#fafafa",
                  }}
                >
                  <div
                    style={{
                      height: 140,
                      background: "linear-gradient(135deg, #e5e5e5, #d4d4d4)",
                      position: "relative",
                      display: "flex",
                      alignItems: "flex-end",
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 12,
                        left: 12,
                        padding: "3px 9px",
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: 9999,
                        fontSize: 9.5,
                        fontWeight: 900,
                        color: "#fff",
                        letterSpacing: "0.12em",
                      }}
                    >
                      —
                    </div>
                    <div style={{ position: "relative", color: "#fff" }}>
                      <div
                        className="font-heading"
                        style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                      >
                        Disponible
                      </div>
                      <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>
                        Tu club aquí
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>— canchas · — reseñas</span>
                    <span className="font-heading" style={{ fontSize: 18, fontWeight: 900, color: "var(--muted-fg)" }}>
                      $—
                    </span>
                  </div>
                </div>
              );
            }
            const stats = ratingFor(c.id, ratingByClubId);
            const price = c.minPriceCents != null ? Math.round(c.minPriceCents / 100) : 12;
            return (
              <Link
                key={c.id}
                href={`/clubes/${c.slug}`}
                className="card"
                style={{ overflow: "hidden", textDecoration: "none", color: "#0a0a0a" }}
              >
                <div
                  style={{
                    height: 140,
                    background: CARD_GRADIENTS[i % CARD_GRADIENTS.length],
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 14,
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
                      top: 12,
                      left: 12,
                      padding: "3px 9px",
                      background: "rgba(0,0,0,0.45)",
                      backdropFilter: "blur(6px)",
                      borderRadius: 9999,
                      fontSize: 9.5,
                      fontWeight: 900,
                      color: "#fff",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {primarySport(c.sports)}
                  </div>
                  {stats && (
                    <div
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 12,
                        padding: "3px 9px",
                        background: "#fef3c7",
                        borderRadius: 9999,
                        fontSize: 10,
                        fontWeight: 800,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Icon name="star" size={10} color="#d97706" />
                      {stats.rating.toFixed(1)}
                    </div>
                  )}
                  <div style={{ position: "relative", color: "#fff" }}>
                    <div
                      className="font-heading"
                      style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                    >
                      {c.name}
                      <span style={{ color: "#bbf7d0" }}>.</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>{c.city}</div>
                  </div>
                </div>
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {c.description && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 11.5,
                        color: "var(--muted-fg)",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {c.description}
                    </p>
                  )}
                  {c.address && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                      }}
                    >
                      <Icon name="map-pin" size={10} />
                      <span
                        style={{
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.address}
                      </span>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 2,
                    }}
                  >
                    <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                      {c.courtsCount} canchas
                      {stats
                        ? ` · ${stats.reviews} ${stats.reviews === 1 ? "reseña" : "reseñas"}`
                        : " · sin reseñas"}
                    </span>
                    <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
                      ${price}
                      <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 600 }}>/h</span>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div style={{ position: "sticky", top: 100, height: "fit-content" }}>
          <div
            style={{
              position: "relative",
              height: 520,
              borderRadius: 14.4,
              overflow: "hidden",
              background: "linear-gradient(180deg, #f0f4ff 0%, #c7d2fe 100%)",
              border: "1px solid var(--border)",
            }}
          >
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }} preserveAspectRatio="none" viewBox="0 0 720 540">
              <defs>
                <pattern id="grd" width="22" height="22" patternUnits="userSpaceOnUse">
                  <path d="M 22 0 L 0 0 0 22" fill="none" stroke="rgba(99,102,241,0.18)" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="720" height="540" fill="url(#grd)" />
              <path
                d="M -20 320 Q 200 240 380 280 T 760 240"
                stroke="rgba(99,102,241,0.4)"
                strokeWidth="22"
                fill="none"
                opacity="0.4"
              />
              <path d="M 0 200 L 720 240" stroke="rgba(255,255,255,0.9)" strokeWidth="14" />
              <path d="M 220 0 L 260 540" stroke="rgba(255,255,255,0.9)" strokeWidth="14" />
              <circle cx="420" cy="160" r="48" fill="rgba(16,185,129,0.25)" />
            </svg>
            {gridSource.map((c, i) => {
              const pos = MAP_POSITIONS[i % MAP_POSITIONS.length];
              const price = c.minPriceCents != null ? Math.round(c.minPriceCents / 100) : 12;
              return (
                <Link
                  key={c.id}
                  href={`/clubes/${c.slug}`}
                  style={{
                    position: "absolute",
                    left: pos.x,
                    top: pos.y,
                    transform: "translate(-50%, -100%)",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      padding: "5px 12px",
                      borderRadius: 9999,
                      background: "var(--primary)",
                      color: "#fff",
                      fontSize: 11.5,
                      fontWeight: 900,
                      fontFamily: "Plus Jakarta Sans",
                      letterSpacing: "-0.01em",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.22)",
                    }}
                  >
                    ${price}
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop: "8px solid var(--primary)",
                      margin: "-1px auto 0",
                    }}
                  />
                </Link>
              );
            })}
            <div
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                padding: "6px 12px",
                background: "#fff",
                borderRadius: 9999,
                fontSize: 10.5,
                fontWeight: 800,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              }}
            >
              {filtered.length} clubes
            </div>
          </div>
        </div>
      </div>
      {/* CTA flotante: si no hay clubes en la ciudad seleccionada, empuja onboarding */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <p style={{ fontSize: 14, color: "var(--muted-fg)", marginBottom: 18 }}>
            No encontramos clubes que matchen ese filtro.
          </p>
          <button className="lp-btn lp-btn-primary" onClick={() => onPaywall("reservar")}>
            Avísame cuando haya nuevos
            <Icon name="arrow-right" size={13} />
          </button>
        </div>
      )}
    </main>
  );
}
