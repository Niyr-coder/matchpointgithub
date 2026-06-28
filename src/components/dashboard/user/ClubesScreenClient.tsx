// Client child de ClubesScreen — recibe data real desde el server.
"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import type { ClubFeatured } from "@/lib/schemas/clubs";
import { listClubsForMap } from "@/server/actions/clubs";
import { VerMapaOverlay } from "@/components/dashboard/modals/VerMapaOverlay";

export type RatingInfo = { rating: number; reviews: number };

type Props = {
  clubs: ClubFeatured[];
  meCity: string | null;
  ratingByClubId: Record<string, RatingInfo>;
};

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

const CITY_ALL = "__all__";
const FEATURED_TAGS = ["Indoor", "Outdoor", "Pro shop", "Café"];
const SAVED_KEY = "mp-saved-clubs";

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#0c4a6e,#0369a1)",
  "linear-gradient(135deg,#7c2d12,#c2410c)",
  "linear-gradient(135deg,#064e3b,#10b981)",
  "linear-gradient(135deg,#3730a3,#6366f1)",
  "linear-gradient(135deg,#831843,#db2777)",
  "linear-gradient(135deg,#1f2937,#374151)",
];

function primarySportLabel(sports: string[]): string {
  if (sports.length === 0) return "Multi";
  return SPORT_LABEL[sports[0]] ?? sports[0];
}

function priceDisplay(cents: number | null): { compact: string; n: number } {
  const n = cents != null ? Math.round(cents / 100) : 14;
  return { compact: `$${n}`, n };
}

// Resuelve rating real del map; si el club no tiene reviews aún devuelve null.
function ratingFor(
  clubId: string,
  map: Record<string, RatingInfo>,
): RatingInfo | null {
  const r = map[clubId];
  if (!r || r.reviews === 0) return null;
  return r;
}

const MIN_CARDS = 6;
type ListItem = (ClubFeatured & { placeholder?: false }) | { placeholder: true; key: string };

export function ClubesScreenClient({ clubs, meCity, ratingByClubId }: Props) {
  const searchParams = useSearchParams();
  const [selectedCity, setSelectedCity] = useState(CITY_ALL);
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const toast = useToast();
  const [mapOpen, setMapOpen] = useState(false);
  const [mapClubs, setMapClubs] = useState<ClubFeatured[] | null>(null);
  const [mapLoading, setMapLoading] = useState(false);

  useEffect(() => {
    const fromUrl = searchParams.get("q")?.trim();
    if (fromUrl) setQ(fromUrl);
  }, [searchParams]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_KEY);
      if (raw) setSaved(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  const persist = (s: Set<string>) => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify([...s])); } catch {}
  };

  const toggleSave = (slug: string, name: string) => {
    const had = saved.has(slug);
    const next = new Set(saved);
    if (had) next.delete(slug);
    else next.add(slug);
    persist(next);
    setSaved(next);
    if (had) toast({ icon: "bookmark", title: "Quitado de Mis clubes", sub: name });
    else toast({ icon: "bookmark-check", title: "Guardado en Mis clubes", sub: name });
  };

  const openReservar = (c: {
    id: string;
    slug: string;
    name: string;
    city: string;
    courtsCount: number;
    minPriceCents: number | null;
    sports?: string[];
  }) =>
    window.dispatchEvent(
      new CustomEvent("mp-open-reservar", {
        detail: {
          clubId: c.id,
          clubSlug: c.slug,
          name: c.name,
          city: `${c.city} · ${c.courtsCount} canchas`,
          price: priceDisplay(c.minPriceCents).n,
          sport: c.sports?.[0],
        },
      }),
    );

  const openMapa = () => setMapOpen(true);

  useEffect(() => {
    if (!mapOpen || mapClubs !== null) return;
    let active = true;
    setMapLoading(true);
    void listClubsForMap().then((res) => {
      if (!active) return;
      setMapClubs(res.ok ? res.data : []);
      setMapLoading(false);
    });
    return () => {
      active = false;
    };
  }, [mapOpen, mapClubs]);

  const cityOptions = useMemo(
    () => Array.from(new Set(clubs.map((c) => c.city).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    [clubs],
  );

  const filtered = useMemo(() => {
    return clubs.filter((c) => {
      if (q) {
        const needle = q.toLowerCase();
        if (!c.name.toLowerCase().includes(needle) && !c.city.toLowerCase().includes(needle)) return false;
      }
      if (selectedCity !== CITY_ALL && c.city !== selectedCity) return false;
      return true;
    });
  }, [clubs, q, selectedCity]);

  // Destacado solo para clubes que pagaron el slot (featured_until > now).
  // Si hay varios pagos vigentes, gana el más reciente en la lista filtrada.
  // Si no hay ninguno pagado, no se muestra el hero — todos van a la grilla.
  const featured = filtered.find((c) => c.featuredUntil != null) ?? null;
  const rest = featured ? filtered.filter((c) => c.id !== featured.id) : filtered;

  const padded: ListItem[] = [...rest.map((c) => ({ ...c, placeholder: false as const }))];
  while (padded.length < MIN_CARDS) {
    padded.push({ placeholder: true, key: `ph-${padded.length}` });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="label-mp">Clubes · Encuentra tu cancha</div>
      <h1 className="font-heading display-md" style={{ margin: 0 }}>
        Clubes en <span className="dot">●</span> {meCity ?? "Ecuador"}
      </h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 480 }}>
          <span style={{ position: "absolute", left: 14, top: 12, color: "var(--muted-fg)" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar club, ciudad o cancha…"
            style={{
              width: "100%",
              padding: "10px 14px 10px 38px",
              border: "1px solid var(--border)",
              borderRadius: 9999,
              fontFamily: "inherit",
              fontSize: 13,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>
        {cityOptions.length > 0 && (
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              height: 38,
              borderRadius: 9999,
              border: "1px solid var(--border)",
              background: "#fff",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted-fg)",
              }}
            >
              Ciudad
            </span>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              style={{
                border: 0,
                outline: "none",
                background: "transparent",
                fontFamily: "inherit",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                color: "#0a0a0a",
              }}
            >
              <option value={CITY_ALL}>Todas las ciudades</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          onClick={openMapa}
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            borderRadius: 9999,
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: "pointer",
            fontFamily: "inherit",
            background: "#fff",
            border: "1px solid var(--border)",
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <Icon name="map" size={13} /> Ver mapa
        </button>
      </div>

      {/* Featured: solo cuando hay suficientes clubes. Con pocos resultados
          o filtros que dejan 0 matches no mostramos el hero (queda raro). */}
      {featured && <FeaturedCard
        c={featured}
        ratingInfo={ratingFor(featured.id, ratingByClubId)}
        saved={saved.has(featured.slug)}
        onToggleSave={() => toggleSave(featured.slug, featured.name)}
        onReservar={() => openReservar(featured)}
      />}

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 4 }}>
        <h2
          className="font-heading"
          style={{
            fontWeight: 900,
            fontSize: 22,
            textTransform: "uppercase",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Cerca de ti<span className="dot">.</span>
        </h2>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {rest.length > 0 ? `${rest.length} ${rest.length === 1 ? "club" : "clubes"}` : "Suma más a la red"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {padded.map((c, i) =>
          c.placeholder ? (
            <ClubPlaceholderCard key={c.key} />
          ) : (
            <ClubCard
              key={c.id}
              c={c}
              ratingInfo={ratingFor(c.id, ratingByClubId)}
              gradient={CARD_GRADIENTS[i % CARD_GRADIENTS.length]}
              saved={saved.has(c.slug)}
              onToggleSave={() => toggleSave(c.slug, c.name)}
              onReservar={() => openReservar(c)}
            />
          ),
        )}
      </div>

      {mapOpen && (
        <VerMapaOverlay
          clubs={mapClubs ?? []}
          loading={mapLoading}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  );
}

function FeaturedCard({
  c,
  ratingInfo,
  saved,
  onToggleSave,
  onReservar,
}: {
  c: ClubFeatured;
  ratingInfo: RatingInfo | null;
  saved: boolean;
  onToggleSave: () => void;
  onReservar: () => void;
}) {
  const rating = ratingInfo?.rating ?? null;
  const reviews = ratingInfo?.reviews ?? 0;
  const { compact } = priceDisplay(c.minPriceCents);
  const accent = c.name.split(" ").slice(0, 2).join(" ").toUpperCase();

  return (
    <div
      className="card grid grid-cols-1 md:grid-cols-[1.2fr_1fr]"
      style={{
        padding: 0,
        overflow: "hidden",
        minHeight: 280,
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
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(8px)",
            borderRadius: 9999,
            fontSize: 9.5,
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.18em",
          }}
        >
          ★ Destacado
        </div>
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 84,
            color: "rgba(255,255,255,0.08)",
            letterSpacing: "-0.04em",
            lineHeight: 0.85,
            textTransform: "uppercase",
            transform: "rotate(-4deg)",
            pointerEvents: "none",
            maxWidth: 280,
          }}
        >
          {accent}
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
            {c.city}
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              lineHeight: 1,
            }}
          >
            {c.name}
            <span style={{ color: "#bbf7d0" }}>.</span>
          </div>
        </div>
      </div>
      <div style={{ padding: 28, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {rating != null ? (
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
                  <Icon name="star" size={11} color="#d97706" style={{ fill: "#d97706" }} />
                  {rating.toFixed(1)}
                </div>
                <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
                  · {reviews} {reviews === 1 ? "reseña" : "reseñas"}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>Sin reseñas todavía</span>
            )}
          </div>
          <div className="mp-grid-form-2 gap-2.5" style={{ marginBottom: 14 }}>
            {[
              { icon: "square", label: "Canchas", val: String(c.courtsCount) },
              {
                icon: "clock",
                label: "Hoy",
                val: c.isOpenNow ? c.openHoursToday ?? "Cerrado" : "Cerrado",
              },
              { icon: "wallet", label: "Desde", val: `${compact}/h` },
              { icon: "trophy", label: "Deporte", val: primarySportLabel(c.sports) },
            ].map((s) => (
              <div key={s.label} style={{ padding: 12, background: "var(--muted)", borderRadius: 10 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 9.5,
                    color: "var(--muted-fg)",
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    fontWeight: 800,
                    marginBottom: 4,
                  }}
                >
                  <Icon name={s.icon} size={11} />
                  {s.label}
                </div>
                <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" }}>
                  {s.val}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FEATURED_TAGS.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  background: "#ecfdf5",
                  color: "#065f46",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onReservar}>
            <Icon name="calendar-plus" size={13} />
            Reservar cancha
          </button>
          <button
            className="btn mp-save-btn"
            data-saved={saved ? "true" : "false"}
            onClick={onToggleSave}
            style={{
              background: saved ? "var(--primary)" : "#fff",
              color: saved ? "#fff" : "#0a0a0a",
              border: "1px solid " + (saved ? "var(--primary)" : "var(--border)"),
            }}
          >
            <span className="mp-save-icon">
              <Icon name="bookmark" size={13} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

function FeaturedPlaceholder() {
  return (
    <div
      className="card grid grid-cols-1 md:grid-cols-[1.2fr_1fr]"
      style={{
        padding: 0,
        overflow: "hidden",
        minHeight: 280,
        opacity: 0.6,
        border: "1px dashed var(--border)",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #e5e5e5, #d4d4d4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-fg)",
          textAlign: "center",
          padding: 28,
        }}
      >
        <div>
          <Icon name="map-pin" size={40} color="var(--muted-fg)" />
          <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, marginTop: 12 }}>
            Aún sin clubes destacados
          </div>
          <p style={{ fontSize: 12.5, marginTop: 8 }}>Cuando se sumen clubes, el destacado aparece aquí.</p>
        </div>
      </div>
      <div style={{ padding: 28 }}>
        <div style={{ height: 16, background: "var(--muted)", borderRadius: 4, marginBottom: 10, width: "60%" }} />
        <div style={{ height: 14, background: "var(--muted)", borderRadius: 4, marginBottom: 16, width: "40%" }} />
        <div className="mp-grid-form-2 gap-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ padding: 16, background: "var(--muted)", borderRadius: 10 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ClubCard({
  c,
  ratingInfo,
  gradient,
  saved,
  onToggleSave,
  onReservar,
}: {
  c: ClubFeatured;
  ratingInfo: RatingInfo | null;
  gradient: string;
  saved: boolean;
  onToggleSave: () => void;
  onReservar: () => void;
}) {
  const rating = ratingInfo?.rating ?? null;
  const { compact } = priceDisplay(c.minPriceCents);

  return (
    <div
      className="card"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
    >
      <div style={{ height: 120, background: gradient, position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15), transparent 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 12,
            padding: "3px 9px",
            background: "rgba(255,255,255,0.25)",
            backdropFilter: "blur(6px)",
            borderRadius: 9999,
            fontSize: 9,
            fontWeight: 900,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          {primarySportLabel(c.sports)}
        </div>
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            padding: "3px 9px",
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(6px)",
            borderRadius: 9999,
            fontSize: 9,
            fontWeight: 800,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: c.isOpenNow ? "#10b981" : "#ef4444",
            }}
          />
          {c.isOpenNow ? "Abierto" : "Cerrado"}
        </div>
        <button
          className="mp-save-btn"
          data-saved={saved ? "true" : "false"}
          onClick={onToggleSave}
          style={{
            position: "absolute",
            bottom: 10,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: saved ? "var(--primary)" : "rgba(255,255,255,0.95)",
            border: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.18)",
            zIndex: 2,
          }}
          title={saved ? "Guardado" : "Guardar club"}
        >
          <span className="mp-save-icon">
            <Icon name="bookmark" size={12} color={saved ? "#fff" : "#0a0a0a"} />
          </span>
        </button>
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "32px 14px 10px",
            background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.65))",
            color: "#fff",
          }}
        >
          <Link
            href={`/dashboard/clubes/${c.slug}`}
            className="mp-club-name-link font-heading"
            style={{
              fontWeight: 900,
              fontSize: 15,
              textTransform: "uppercase",
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
              color: "#fff",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            {c.name}
          </Link>
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--muted-fg)" }}>
            <Icon name="map-pin" size={11} />
            {c.city}
          </span>
          {rating != null ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 800 }}>
              <Icon name="star" size={11} color="#d97706" style={{ fill: "#d97706" }} />
              {rating.toFixed(1)}
            </span>
          ) : (
            <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>Sin reseñas</span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 8,
            borderTop: "1px dashed var(--border)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 9.5,
                color: "var(--muted-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontWeight: 800,
              }}
            >
              {c.courtsCount} canchas
            </div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900 }}>
              {compact}
              <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 600 }}> / hora</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <Link
              href={`/dashboard/clubes/${c.slug}#club-membresias`}
              className="btn"
              style={{
                padding: "7px 12px",
                fontSize: 10.5,
                background: "#fff",
                border: "1px solid var(--border)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Icon name="sparkle" size={11} color="var(--color-mp-amber)" />
              Unir
            </Link>
            <button className="btn btn-primary" style={{ padding: "7px 12px", fontSize: 10.5 }} onClick={onReservar}>
              Reservar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClubPlaceholderCard() {
  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        opacity: 0.5,
        border: "1px dashed var(--border)",
        background: "#fafafa",
      }}
    >
      <div
        style={{
          height: 120,
          background: "linear-gradient(135deg, #e5e5e5, #d4d4d4)",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "32px 14px 10px",
            background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.55))",
            color: "#fff",
          }}
        >
          <div
            className="font-heading"
            style={{ fontWeight: 900, fontSize: 15, textTransform: "uppercase" }}
          >
            Disponible
          </div>
        </div>
      </div>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>—</span>
          <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>★ —</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 8,
            borderTop: "1px dashed var(--border)",
          }}
        >
          <div>
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 800 }}>— canchas</div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }}>$—</div>
          </div>
          <span
            className="btn"
            style={{
              padding: "7px 12px",
              fontSize: 10.5,
              background: "var(--muted)",
              color: "var(--muted-fg)",
              border: "1px dashed var(--border)",
              cursor: "default",
            }}
          >
            —
          </span>
        </div>
      </div>
    </div>
  );
}
