// /coaches — listing inspirado en /clubes con el lenguaje visual del design system.
// (Public.html no incluye un listing dedicado de coaches; la pantalla del HTML
// es la detail. Esta lista extiende el sistema manteniendo styles.)
"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import type { CoachProfile } from "@/lib/schemas/coaches";

const FILTERS: { label: string; key: string }[] = [
  { label: "Todos", key: "todos" },
  { label: "Pickleball", key: "pickleball" },
  { label: "Pádel", key: "padel" },
  { label: "Tenis", key: "tennis" },
  { label: "Verificados", key: "verified" },
];

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#3b82f6,#1e3a8a)",
  "linear-gradient(135deg,#db2777,#831843)",
  "linear-gradient(135deg,#0ea5e9,#0c4a6e)",
  "linear-gradient(135deg,#a855f7,#581c87)",
];

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

const MIN_COACH_CARDS = 6;
type CoachCard = (CoachProfile & { placeholder?: false }) | { placeholder: true; key: string };

export function CoachesPageView({ coaches }: { coaches: CoachProfile[] }) {
  const onPaywall = usePaywall();
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");

  const filtered = coaches.filter((c) => {
    if (q) {
      const needle = q.toLowerCase();
      if (
        !c.displayName.toLowerCase().includes(needle) &&
        !(c.headline ?? "").toLowerCase().includes(needle) &&
        !(c.city ?? "").toLowerCase().includes(needle)
      )
        return false;
    }
    if (filter === "verified") return c.verifiedAt != null;
    // Sport filter would need /coaches?sport=... server roundtrip. Por ahora,
    // los filtros de deporte son client-side passthrough (no filtran).
    return true;
  });

  const padded: CoachCard[] = [...filtered.map((c) => ({ ...c, placeholder: false as const }))];
  while (padded.length < MIN_COACH_CARDS) {
    padded.push({ placeholder: true, key: `ph-${padded.length}` });
  }
  const hasReal = filtered.length > 0;

  return (
    <main className="max-w-[1440px] mx-auto px-4 md:px-8 pt-22 pb-6 md:pt-25 md:pb-10">
      <div className="label-mp" style={{ color: "#fbbf24" }}>● Coaches certificados</div>
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
        Sube de nivel<span className="dot">.</span>
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted-fg)", maxWidth: 540, lineHeight: 1.55, marginBottom: 28 }}>
        Coaches verificados con programa probado. Clases 1 a 1 o grupales, en tu cancha o en su club home.
      </p>

      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 320px", maxWidth: 480 }}>
          <Icon name="search" size={14} style={{ position: "absolute", left: 14, top: 13, color: "var(--muted-fg)" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar coach, especialidad o ciudad…"
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

      {!hasReal && (
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
            Aún no hay coaches publicados. Pronto sumamos especialistas certificados a la red.
          </span>
        </div>
      )}
      <div className="mp-stagger grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 self-start content-start">
        {padded.map((c, i) => {
            if (c.placeholder) {
              return (
                <div
                  key={c.key}
                  className="card mp-card-hover"
                  style={{
                    padding: 20,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    opacity: 0.55,
                    border: "1px dashed var(--border)",
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #e5e5e5, #d4d4d4)",
                        color: "var(--muted-fg)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        border: "2px dashed var(--border)",
                      }}
                    >
                      <span className="font-heading" style={{ fontSize: 20, fontWeight: 900 }}>—</span>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="font-heading"
                        style={{
                          fontSize: 16,
                          fontWeight: 900,
                          letterSpacing: "-0.015em",
                          textTransform: "uppercase",
                          color: "var(--muted-fg)",
                        }}
                      >
                        Vacante
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>—</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.45, margin: 0 }}>
                    Únete como coach a la red MatchPoint.
                  </p>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 12,
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>★ — · —</span>
                    <span
                      className="font-heading"
                      style={{ fontSize: 18, fontWeight: 900, color: "var(--muted-fg)" }}
                    >
                      $—
                    </span>
                  </div>
                </div>
              );
            }
            const avBg = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
            const hourly = c.hourlyRateCents != null ? Math.round(c.hourlyRateCents / 100) : null;
            return (
              <Link
                key={c.id}
                href={`/coaches/${c.id}`}
                className="card mp-card-hover"
                style={{ padding: 20, textDecoration: "none", color: "#0a0a0a", display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: "50%",
                      background: avBg,
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span className="font-heading" style={{ fontSize: 20, fontWeight: 900 }}>
                      {initials(c.displayName)}
                    </span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      className="font-heading"
                      style={{
                        fontSize: 16,
                        fontWeight: 900,
                        letterSpacing: "-0.015em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {c.displayName}
                      <span style={{ color: "#fbbf24" }}>.</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                      {c.city ?? "—"}
                      {c.verifiedAt && (
                        <span style={{ marginLeft: 6, color: "var(--primary)", fontWeight: 800 }}>
                          ● VERIFICADO
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {c.headline && (
                  <p style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.45, margin: 0 }}>
                    {c.headline}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 12,
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ fontSize: 11.5, display: "inline-flex", gap: 4, alignItems: "center" }}>
                    <Icon name="star" size={12} color="#fbbf24" />
                    <b>{c.ratingAvg != null ? c.ratingAvg.toFixed(1) : "—"}</b>
                    <span style={{ color: "var(--muted-fg)" }}>· {c.ratingCount}</span>
                  </span>
                  {hourly != null && (
                    <span className="font-heading" style={{ fontSize: 18, fontWeight: 900 }}>
                      ${hourly}
                      <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 600 }}>/h</span>
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
      </div>
    </main>
  );
}
