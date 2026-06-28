"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { ClubFeatured } from "@/lib/schemas/clubs";
import { ClubesMultiMap } from "@/components/dashboard/clubes/ClubesMultiMap";

const SPORT_LABEL: Record<string, string> = {
  pickleball: "Pickleball",
  padel: "Pádel",
  tennis: "Tenis",
};

function sportLabel(s: string): string {
  return SPORT_LABEL[s] ?? s;
}

function priceLabel(cents: number | null): string {
  return cents != null ? `$${Math.round(cents / 100)}` : "$—";
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 9999,
    fontSize: 10,
    fontWeight: 800,
    fontFamily: "inherit",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    cursor: "pointer",
    background: active ? "#0a0a0a" : "#fff",
    color: active ? "#fff" : "#0a0a0a",
    border: "1px solid " + (active ? "#0a0a0a" : "var(--border)"),
  };
}

type Props = {
  clubs: ClubFeatured[];
  loading: boolean;
  onClose: () => void;
};

export function VerMapaOverlay({ clubs, loading, onClose }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [mobileList, setMobileList] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const fn = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const allSports = useMemo(() => {
    const set = new Set<string>();
    for (const c of clubs) {
      for (const s of c.sports) set.add(s);
    }
    return Array.from(set).sort();
  }, [clubs]);

  const visibleClubs = useMemo(() => {
    if (!sportFilter) return clubs;
    return clubs.filter((c) => c.sports.some((s) => s === sportFilter));
  }, [clubs, sportFilter]);

  const visibleIds = useMemo(
    () => new Set(visibleClubs.map((c) => c.id)),
    [visibleClubs],
  );

  const selectedClub = selectedId
    ? visibleClubs.find((c) => c.id === selectedId) ?? null
    : null;

  // Clear selection when the selected club is filtered out
  useEffect(() => {
    if (selectedId && !visibleIds.has(selectedId)) {
      setSelectedId(null);
    }
  }, [visibleIds, selectedId]);

  // Scroll the selected item into view in the sidebar list
  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-club-id="${selectedId}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  const handleMarkerSelect = (id: string) => {
    setSelectedId(id);
    if (isMobile) setMobileList(true);
  };

  const openReservar = (club: ClubFeatured) => {
    onClose();
    setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent("mp-open-reservar", {
            detail: {
              clubId: club.id,
              clubSlug: club.slug,
              name: club.name,
              city: `${club.city} · ${club.courtsCount} canchas`,
              price:
                club.minPriceCents != null
                  ? Math.round(club.minPriceCents / 100)
                  : 0,
              sport: club.sports?.[0],
            },
          }),
        ),
      50,
    );
  };

  const showLeftRail = !isMobile || mobileList;
  const showMap = !isMobile || !mobileList;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#fff",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 24px",
          borderBottom: "1px solid var(--border)",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          {isMobile && mobileList ? (
            <button
              onClick={() => setMobileList(false)}
              style={{
                background: "transparent",
                border: 0,
                cursor: "pointer",
                padding: "2px 4px",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 800,
                fontFamily: "inherit",
              }}
            >
              <Icon name="arrow-left" size={14} />
              Mapa
            </button>
          ) : (
            <>
              <span style={{ color: "var(--primary)", fontSize: 18, fontWeight: 900 }}>●</span>
              <span
                className="font-heading"
                style={{
                  fontSize: 13,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                MATCHPOINT
              </span>
              <span style={{ width: 1, height: 18, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                Clubes ·{" "}
                <b style={{ color: "#0a0a0a" }}>Vista mapa</b>
              </span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)" }}
        >
          <Icon name="x" size={12} />
          Cerrar
        </button>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>

        {/* Left rail */}
        {showLeftRail && (
          <div
            style={{
              background: "#fff",
              borderRight: isMobile ? 0 : "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              width: isMobile ? "100%" : 340,
              flexShrink: 0,
            }}
          >
            <div style={{ padding: "18px 18px 12px", flexShrink: 0 }}>
              <div className="label-mp">Mapa de clubes</div>
              <div
                className="font-heading"
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  lineHeight: 1.05,
                  marginTop: 4,
                }}
              >
                {loading ? (
                  "Cargando…"
                ) : (
                  <>
                    {visibleClubs.length}{" "}
                    {visibleClubs.length === 1 ? "club" : "clubes"}
                    <span style={{ color: "var(--primary)" }}>.</span>
                  </>
                )}
              </div>
              {allSports.length > 0 && (
                <div
                  style={{ display: "flex", gap: 5, marginTop: 10, flexWrap: "wrap" }}
                >
                  <button
                    onClick={() => setSportFilter(null)}
                    style={chipStyle(sportFilter === null)}
                  >
                    Todos
                  </button>
                  {allSports.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSportFilter(sportFilter === s ? null : s)}
                      style={chipStyle(sportFilter === s)}
                    >
                      {sportLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div
              ref={listRef}
              style={{
                flex: 1,
                overflow: "auto",
                padding: "8px 14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      height: 62,
                      borderRadius: 10,
                      background: "var(--muted)",
                      opacity: 0.55,
                    }}
                  />
                ))
              ) : visibleClubs.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "40px 20px",
                    color: "var(--muted-fg)",
                    fontSize: 12.5,
                  }}
                >
                  <Icon name="map-pin" size={32} color="var(--muted-fg)" />
                  <p style={{ marginTop: 10 }}>
                    Sin clubes para este filtro.
                  </p>
                </div>
              ) : (
                visibleClubs.map((club) => {
                  const isSel = club.id === selectedId;
                  const hasGeo =
                    club.latitude != null && club.longitude != null;
                  return (
                    <button
                      key={club.id}
                      data-club-id={club.id}
                      onClick={() => setSelectedId(isSel ? null : club.id)}
                      style={{
                        padding: 11,
                        borderRadius: 10,
                        border: isSel
                          ? "2px solid var(--primary)"
                          : "1px solid var(--border)",
                        background: isSel ? "#ecfdf5" : "#fff",
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        cursor: "pointer",
                        textAlign: "left",
                        fontFamily: "inherit",
                        width: "100%",
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: isSel ? "var(--primary)" : "#0a0a0a",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "Plus Jakarta Sans",
                          fontWeight: 900,
                          fontSize: 11,
                          flexShrink: 0,
                        }}
                      >
                        {priceLabel(club.minPriceCents)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11.5,
                            fontWeight: 900,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {club.name}
                        </div>
                        <div
                          style={{
                            fontSize: 9.5,
                            color: "var(--muted-fg)",
                            marginTop: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          {club.courtsCount} canchas ·{" "}
                          {club.isOpenNow ? (
                            <span
                              style={{
                                color: "var(--primary)",
                                fontWeight: 800,
                              }}
                            >
                              Abierto
                            </span>
                          ) : (
                            "Cerrado"
                          )}
                          {!hasGeo && (
                            <span
                              style={{
                                padding: "1px 5px",
                                borderRadius: 4,
                                background: "var(--muted)",
                                fontSize: 8.5,
                                fontWeight: 700,
                                color: "var(--muted-fg)",
                              }}
                            >
                              Sin ubicación
                            </span>
                          )}
                        </div>
                      </div>
                      <Icon
                        name="chevron-right"
                        size={13}
                        color="var(--muted-fg)"
                      />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Map area */}
        {showMap && (
          <div
            style={{
              flex: 1,
              position: "relative",
              overflow: "hidden",
              minWidth: 0,
            }}
          >
            {loading ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    "linear-gradient(180deg,#f0f4ff 0%,#e0e7ff 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted-fg)",
                  fontSize: 13,
                  gap: 10,
                }}
              >
                <Icon name="map" size={20} color="var(--muted-fg)" />
                Cargando mapa…
              </div>
            ) : (
              <ClubesMultiMap
                clubs={clubs}
                visibleIds={visibleIds}
                selectedId={selectedId}
                onSelect={handleMarkerSelect}
              />
            )}

            {/* FAB Lista (mobile) */}
            {isMobile && !loading && (
              <button
                onClick={() => setMobileList(true)}
                style={{
                  position: "absolute",
                  bottom: 24,
                  right: 24,
                  zIndex: 10,
                  padding: "12px 18px",
                  borderRadius: 9999,
                  background: "#fff",
                  border: "1px solid var(--border)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="list" size={14} />
                Lista
              </button>
            )}

            {/* Selected club card (desktop only) */}
            {!isMobile && selectedClub && (
              <div
                style={{
                  position: "absolute",
                  bottom: 18,
                  left: 18,
                  width: 320,
                  background: "#fff",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                  border: "1px solid var(--border)",
                  zIndex: 5,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {selectedClub.isOpenNow && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "2px 7px",
                          background: "#ecfdf5",
                          color: "var(--primary)",
                          borderRadius: 9999,
                          fontSize: 8.5,
                          fontWeight: 900,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          marginBottom: 6,
                        }}
                      >
                        ● Abierto
                      </span>
                    )}
                    <Link
                      href={`/dashboard/clubes/${selectedClub.slug}`}
                      onClick={onClose}
                      className="font-heading"
                      style={{
                        display: "block",
                        fontSize: 15,
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.15,
                        color: "#0a0a0a",
                        textDecoration: "none",
                      }}
                    >
                      {selectedClub.name}
                    </Link>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                        marginTop: 4,
                      }}
                    >
                      {selectedClub.city} · {selectedClub.courtsCount}{" "}
                      {selectedClub.courtsCount === 1 ? "cancha" : "canchas"}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    style={{
                      background: "transparent",
                      border: 0,
                      cursor: "pointer",
                      padding: 2,
                      color: "var(--muted-fg)",
                    }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>

                {selectedClub.sports.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                      marginBottom: 12,
                    }}
                  >
                    {selectedClub.sports.map((s) => (
                      <span
                        key={s}
                        style={{
                          padding: "3px 8px",
                          borderRadius: 9999,
                          background: "var(--muted)",
                          fontSize: 9.5,
                          fontWeight: 800,
                        }}
                      >
                        {sportLabel(s)}
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1, fontSize: 10.5, padding: "7px 10px" }}
                    onClick={() => openReservar(selectedClub)}
                  >
                    Reservar {priceLabel(selectedClub.minPriceCents)}/h
                    <Icon name="arrow-right" size={11} color="#fff" />
                  </button>
                  {selectedClub.latitude != null &&
                    selectedClub.longitude != null && (
                      <a
                        href={`https://maps.google.com/?q=${selectedClub.latitude},${selectedClub.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn"
                        style={{
                          background: "#fff",
                          border: "1px solid var(--border)",
                          padding: "7px 9px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          textDecoration: "none",
                        }}
                        title="Ver en Google Maps"
                      >
                        <Icon name="navigation" size={12} />
                      </a>
                    )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
