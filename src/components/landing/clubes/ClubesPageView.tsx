// /clubes — migrado 1:1 desde MATCHPOINT Public.html (líneas 373-443)
"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import { useEnabledSports } from "@/components/SportsProvider";
import type { Sport } from "@/lib/sports";
import type { ClubFeatured } from "@/lib/schemas/clubs";

type FilterDef = { label: string; key: string; sport?: Sport };

const FILTERS: FilterDef[] = [
  { label: "Todos", key: "todos" },
  { label: "Pickleball", key: "pickleball", sport: "pickleball" },
  { label: "Pádel", key: "padel", sport: "padel" },
  { label: "Tenis", key: "tennis", sport: "tennis" },
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

const ClubesMap = dynamic(
  () => import("./ClubesMap").then((m) => m.ClubesMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="card"
        style={{
          height: 520,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-fg)",
          fontSize: 13,
        }}
      >
        Cargando mapa…
      </div>
    ),
  },
);

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
  const { sports: enabledSports } = useEnabledSports();
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");

  // Oculta los chips de deporte que no estén habilitados por el switch
  // multideporte. Los filtros sin `sport` (todos/indoor/outdoor) se mantienen.
  const visibleFilters = FILTERS.filter((f) => !f.sport || enabledSports.includes(f.sport));

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

  const mapClubs = useMemo(
    () =>
      filtered
        .filter(
          (c): c is ClubFeatured & { latitude: number; longitude: number } =>
            c.latitude != null && c.longitude != null,
        )
        .map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          latitude: c.latitude,
          longitude: c.longitude,
          minPriceCents: c.minPriceCents,
        })),
    [filtered],
  );

  const padded: ClubCard[] = [...gridSource.map((c) => ({ ...c, placeholder: false as const }))];
  while (padded.length < MIN_CLUB_CARDS) {
    padded.push({ placeholder: true, key: `ph-${padded.length}` });
  }

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-8 pt-22 pb-6 md:pt-25 md:pb-10">
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
        {visibleFilters.map((f) => {
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
            className="card grid grid-cols-1 md:grid-cols-[1.2fr_1fr]"
            style={{
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
      <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
        <div className="mp-stagger grid grid-cols-1 sm:grid-cols-2 gap-3.5 self-start content-start">
          {padded.map((c, i) => {
            if (c.placeholder) {
              return (
                <div
                  key={c.key}
                  className="card mp-card-hover"
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
                className="card mp-card-hover"
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
        <div className="hidden md:block" style={{ position: "sticky", top: 100, height: "fit-content" }}>
          <ClubesMap clubs={mapClubs} totalCount={filtered.length} />
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
