// /ranking — migrado 1:1 desde MatchPoint Public.html (líneas 1234-1301)
"use client";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import type { RankingEntry } from "@/lib/schemas/ranking";

const SPORTS = [
  { k: "pickleball", l: "Pickleball" },
  { k: "padel", l: "Pádel" },
  { k: "tennis", l: "Tenis" },
] as const;

const PODIUM_AV_BG = [
  "linear-gradient(135deg,#ca8a04,#facc15)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#0891b2,#0ea5e9)",
];
const PODIUM_COLORS = ["#fbbf24", "#9ca3af", "#d97706"];

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

// ELO int → MP Rating display (4 dígitos / 1000).
function ratingLabel(r: number): string {
  return (r / 1000).toFixed(2);
}

type PodiumEntry = (RankingEntry & { placeholder?: false }) | { placeholder: true; rank: 1 | 2 | 3 };
type RowEntry = (RankingEntry & { placeholder?: false }) | { placeholder: true; rank: number };

const MIN_PODIUM = 3;
const MIN_ROWS = 10;

function padPodium(entries: RankingEntry[]): PodiumEntry[] {
  const out: PodiumEntry[] = entries.slice(0, 3).map((e) => ({ ...e, placeholder: false }));
  while (out.length < MIN_PODIUM) {
    out.push({ placeholder: true, rank: (out.length + 1) as 1 | 2 | 3 });
  }
  return out;
}

function padRows(entries: RankingEntry[]): RowEntry[] {
  const real: RowEntry[] = entries.slice(3, 30).map((e) => ({ ...e, placeholder: false }));
  const needed = Math.max(0, MIN_ROWS - real.length);
  const startRank = real.length > 0 ? real[real.length - 1].rank + 1 : 4;
  for (let i = 0; i < needed; i++) {
    real.push({ placeholder: true, rank: startRank + i });
  }
  return real;
}

export function RankingPageView({
  sport,
  entries,
}: {
  sport: "pickleball" | "padel" | "tennis";
  entries: RankingEntry[];
}) {
  const onPaywall = usePaywall();
  const sportLabel = SPORTS.find((s) => s.k === sport)?.l ?? "Pickleball";
  const podium = padPodium(entries);
  const rows = padRows(entries);
  const hasRealData = entries.length > 0;
  // Podium order: 2-1-3.
  const podiumOrder: PodiumEntry[] = [podium[1], podium[0], podium[2]];

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 32px 80px" }}>
      <div className="label-mp" style={{ color: "var(--primary)" }}>● Ranking oficial · Ecuador</div>
      <h1
        className="font-heading"
        style={{
          fontSize: "clamp(2.5rem, 6vw, 5rem)",
          fontWeight: 900,
          letterSpacing: "-0.04em",
          textTransform: "uppercase",
          margin: "8px 0 14px",
          lineHeight: 0.95,
        }}
      >
        Top 100 {sportLabel}
        <span className="dot">.</span>
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--muted-fg)",
          maxWidth: 540,
          lineHeight: 1.55,
          marginBottom: 28,
        }}
      >
        Ranking nacional basado en partidos oficiales registrados en MatchPoint. Actualizado cada lunes.
      </p>

      {/* Sport tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--muted)",
          borderRadius: 9999,
          width: "fit-content",
          marginBottom: 32,
        }}
      >
        {SPORTS.map((s) => {
          const on = s.k === sport;
          return (
            <Link
              key={s.k}
              href={`/ranking?sport=${s.k}`}
              style={{
                padding: "8px 16px",
                borderRadius: 9999,
                background: on ? "#fff" : "transparent",
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                fontWeight: on ? 900 : 700,
                fontSize: 11.5,
                fontFamily: "inherit",
                textDecoration: "none",
                boxShadow: on ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {s.l}
            </Link>
          );
        })}
      </div>

      {!hasRealData && (
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
            Aún no hay partidos oficiales de <b style={{ color: "#0a0a0a" }}>{sportLabel.toLowerCase()}</b> registrados. Sé el primero en aparecer.
          </span>
        </div>
      )}

      {/* Top 3 podium */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.1fr 1fr",
          gap: 14,
          marginBottom: 40,
          alignItems: "flex-end",
        }}
      >
        {podiumOrder.map((p) => {
          const isFirst = p.rank === 1;
          const c = PODIUM_COLORS[p.rank - 1] ?? "#0a0a0a";
          const avBg = p.placeholder
            ? "linear-gradient(135deg, #e5e5e5, #d4d4d4)"
            : PODIUM_AV_BG[p.rank - 1] ?? "linear-gradient(135deg,#10b981,#047857)";
          return (
            <button
              key={p.placeholder ? `ph-${p.rank}` : p.userId}
              onClick={() => !p.placeholder && onPaywall("perfil")}
              disabled={p.placeholder}
              style={{
                padding: isFirst ? "28px 22px" : "22px 18px",
                borderRadius: 14.4,
                background: p.placeholder
                  ? "#fafafa"
                  : isFirst
                    ? "linear-gradient(135deg, #fef3c7, #fde68a)"
                    : "#fff",
                border: p.placeholder
                  ? "1px dashed var(--border)"
                  : isFirst
                    ? "2px solid #fbbf24"
                    : "1px solid var(--border)",
                textAlign: "center",
                position: "relative",
                cursor: p.placeholder ? "default" : "pointer",
                fontFamily: "inherit",
                opacity: p.placeholder ? 0.55 : 1,
              }}
            >
              {isFirst && !p.placeholder && (
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                >
                  <Icon name="crown" size={24} color="#92400e" />
                </div>
              )}
              <div
                style={{
                  width: isFirst ? 84 : 64,
                  height: isFirst ? 84 : 64,
                  borderRadius: "50%",
                  margin: "0 auto",
                  background: avBg,
                  color: p.placeholder ? "var(--muted-fg)" : "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: p.placeholder
                    ? "2px dashed var(--border)"
                    : isFirst
                      ? "4px solid #fbbf24"
                      : "3px solid var(--border)",
                }}
              >
                <span className="font-heading" style={{ fontSize: isFirst ? 26 : 20, fontWeight: 900 }}>
                  {p.placeholder ? "—" : initials(p.displayName)}
                </span>
              </div>
              <div className="font-heading" style={{ fontSize: 28, fontWeight: 900, marginTop: 8, color: c }}>
                #{p.rank}
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: isFirst ? 18 : 15,
                  fontWeight: 900,
                  letterSpacing: "-0.015em",
                  marginTop: 6,
                  color: p.placeholder ? "var(--muted-fg)" : "inherit",
                }}
              >
                {p.placeholder ? "Sé tú" : p.displayName}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                {p.placeholder ? "Vacante" : p.city ?? "—"}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  background: p.placeholder ? "var(--muted)" : "#0a0a0a",
                  color: p.placeholder ? "var(--muted-fg)" : "#fff",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 800,
                  marginTop: 10,
                }}
              >
                <Icon name="zap" size={10} color={p.placeholder ? "var(--muted-fg)" : "#fbbf24"} />
                Nivel {p.placeholder ? "—" : ratingLabel(p.currentRating)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            padding: "10px 18px",
            background: "var(--muted)",
            display: "grid",
            gridTemplateColumns: "50px 1fr 100px 70px 80px",
            gap: 14,
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.14em",
            color: "var(--muted-fg)",
            textTransform: "uppercase",
          }}
        >
          <div>#</div>
          <div>Jugador</div>
          <div>Ciudad</div>
          <div style={{ textAlign: "center" }}>Matches</div>
          <div style={{ textAlign: "right" }}>Nivel</div>
        </div>
        {rows.map((p) => (
          <button
            key={p.placeholder ? `ph-row-${p.rank}` : p.userId}
            onClick={() => !p.placeholder && onPaywall("perfil")}
            disabled={p.placeholder}
            style={{
              width: "100%",
              padding: "14px 18px",
              display: "grid",
              gridTemplateColumns: "50px 1fr 100px 70px 80px",
              gap: 14,
              alignItems: "center",
              background: "#fff",
              border: 0,
              borderTop: "1px solid var(--border)",
              cursor: p.placeholder ? "default" : "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              opacity: p.placeholder ? 0.45 : 1,
            }}
          >
            <span
              className="font-heading"
              style={{ fontSize: 16, fontWeight: 900, color: "var(--muted-fg)" }}
            >
              {p.rank}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: p.placeholder
                    ? "linear-gradient(135deg, #e5e5e5, #d4d4d4)"
                    : "linear-gradient(135deg,#10b981,#047857)",
                  color: p.placeholder ? "var(--muted-fg)" : "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 900,
                  fontSize: 11,
                  border: p.placeholder ? "1px dashed var(--border)" : "0",
                }}
              >
                {p.placeholder ? "—" : initials(p.displayName)}
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: p.placeholder ? "var(--muted-fg)" : "inherit" }}>
                {p.placeholder ? "—" : p.displayName}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              {p.placeholder ? "—" : p.city ?? "—"}
            </span>
            <span style={{ textAlign: "center", fontSize: 12 }}>
              {p.placeholder ? (
                <span style={{ color: "var(--muted-fg)" }}>—</span>
              ) : (
                <>
                  <b>{p.wins}</b>
                  <span style={{ color: "var(--muted-fg)" }}>/{p.matchesTotal}</span>
                </>
              )}
            </span>
            <span
              className="font-heading"
              style={{
                textAlign: "right",
                fontSize: 16,
                fontWeight: 900,
                color: p.placeholder ? "var(--muted-fg)" : "var(--primary)",
              }}
            >
              {p.placeholder ? "—" : ratingLabel(p.currentRating)}
            </span>
          </button>
        ))}
      </div>

      <div
        style={{
          textAlign: "center",
          marginTop: 32,
          padding: 28,
          background: "#0a0a0a",
          color: "#fff",
          borderRadius: 14.4,
        }}
      >
        <div
          className="font-heading"
          style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
          }}
        >
          ¿Quieres aparecer aquí?<span style={{ color: "#fbbf24" }}>.</span>
        </div>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: "8px 0 18px" }}>
          Cada match que juegues sube o baja tu nivel. El ranking se actualiza cada lunes.
        </p>
        <button className="btn btn-primary" onClick={() => onPaywall("reservar")}>
          Empieza a jugar
          <Icon name="arrow-right" size={13} />
        </button>
      </div>
    </main>
  );
}
