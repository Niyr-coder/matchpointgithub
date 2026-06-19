"use client";

import React from "react";
import { HandoffIcon } from "./HandoffIcon";
import { v2tk } from "./PerfilV2Shared";
import { AvatarBlob } from "./PerfilShared";
import { V2Hero, V2Showcase } from "./PerfilV2";
import { PROFILE_V3_SHOWCASE_ENABLED } from "./profileV3Flags";
import { V3AnalyticsBand, V3SocialBand, V3ActivityBand, V3CommunityBand } from "./PerfilV3";
import { usePerfilV3Data } from "./PerfilV3Context";
import type { PerfilMe } from "./mapProfileData";
import { useProfileV3Actions } from "./ProfileV3ActionsContext";
import { ProfileEmptyState } from "./ProfileEmptyState";
import { useToast } from "../../ToastProvider";

function attrsAreStub(attrs: PerfilMe["attrs"]): boolean {
  return Object.values(attrs).every((v) => v === 70);
}

function recentFormStrip(matches: PerfilMe["recentMatches"], max = 10): ("W" | "L")[] {
  return matches.slice(0, max).map((m) => m.result);
}

function scoutArchetype(me: PerfilMe): string {
  const top = me.coachShotInsights[0];
  if (top?.label) return top.label.toUpperCase();
  if (me.tagline) return me.tagline.slice(0, 48);
  return `NIVEL ${me.level}`;
}

function scoutWeakness(me: PerfilMe): string | null {
  if (me.coachShotInsights.length === 0) return null;
  const sorted = [...me.coachShotInsights].sort((a, b) => a.winPct - b.winPct);
  const weak = sorted[0];
  if (!weak) return null;
  return `${weak.label} (${weak.winPct}% victoria)`;
}

function V3ScoutBrief({ ownerSub = "plus" }: { ownerSub?: "free" | "plus" }) {
  const me = usePerfilV3Data();
  const actions = useProfileV3Actions();
  const toast = useToast();
  const scout = me.scout;
  const h2h = me.h2hViewer;
  const ownerIsPlus = ownerSub === "plus";

  if (!scout) return null;

  const recentForm = recentFormStrip(me.recentMatches);
  const h2hRows = scout.h2hMatches;
  const { matchup } = scout;
  const weakness = scoutWeakness(me);
  const archetype = scoutArchetype(me);

  return (
    <div
      style={{
        position: "relative",
        background: "linear-gradient(110deg, #0a0a0a 0%, #1a1408 100%)",
        border: `1px solid ${v2tk.goldRing}`,
        borderRadius: 16,
        color: "#fff",
        padding: "20px 24px",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -60,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,161,58,0.22), transparent 65%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 11px",
              borderRadius: 9999,
              background: "linear-gradient(135deg,#fbbf24,#d4a13a)",
              color: "#1a1300",
              fontFamily: "var(--font-sans)",
              fontWeight: 900,
              fontSize: 9.5,
              letterSpacing: "0.18em",
            }}
          >
            <HandoffIcon name="binoculars" size={11} />
            BRIEFING TÁCTICO
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 900,
              fontSize: 10,
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            DESBLOQUEADO POR TU MP+
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={sbBtnGhost(false)}
            onClick={() =>
              toast({
                icon: "bookmark",
                title: "Próximamente",
                sub: "La watchlist privada llegará en una próxima actualización.",
              })
            }
          >
            <HandoffIcon name="bookmark" size={12} />
            Watchlist
          </button>
          <button type="button" style={sbBtnPrimary} onClick={actions.onChallenge}>
            <HandoffIcon name="swords" size={13} />
            Retar a match
          </button>
        </div>
      </div>

      <div
        className="pv3-stack-sm mp-grid-form-3 gap-3.5"
        style={{
          position: "relative",
          alignItems: "stretch",
        }}
      >
        <div style={sbCardDark}>
          <span className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
            SI LO RETAS HOY
          </span>
          <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              className="tabular"
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 44,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: "#fff",
              }}
            >
              {matchup.myWinPct}
              <span style={{ fontSize: 22, color: "rgba(255,255,255,0.45)" }}>
                /{matchup.theirWinPct}
              </span>
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 800,
                fontSize: 10,
                color: "rgba(255,255,255,0.55)",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              tú · {me.first}
            </span>
          </div>
          <div
            style={{
              marginTop: 12,
              height: 6,
              background: "rgba(255,255,255,0.08)",
              borderRadius: 999,
              overflow: "hidden",
              display: "flex",
            }}
          >
            <div style={{ width: `${matchup.myWinPct}%`, height: "100%", background: "#3b82f6" }} />
            <div style={{ width: `${matchup.theirWinPct}%`, height: "100%", background: v2tk.accent }} />
          </div>
          <div className="profile-v3-scout-meta" style={{ marginTop: 12, color: "rgba(255,255,255,0.55)" }}>
            Rating Δ estimado:{" "}
            <span className="profile-v3-scout-meta-num tabular" style={{ color: "#86efac" }}>
              {matchup.expectedDelta.ifWin}
            </span>{" "}
            /{" "}
            <span className="profile-v3-scout-meta-num tabular" style={{ color: "#fca5a5" }}>
              {matchup.expectedDelta.ifLose}
            </span>
            <span style={{ color: "rgba(255,255,255,0.35)" }}> · confianza {matchup.confidence}</span>
          </div>
        </div>

        {ownerIsPlus ? (
          <div style={sbCardDark}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
                FORMA · ÚLTIMOS {recentForm.length || 0}
              </span>
              {me.streak.type === "W" && me.streak.count >= 2 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 7px",
                    borderRadius: 9999,
                    background: "rgba(220,38,38,0.18)",
                    color: "#fca5a5",
                    fontSize: 9.5,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                  }}
                >
                  <HandoffIcon name="flame" size={9} />
                  HOT
                </span>
              )}
            </div>
            {recentForm.length === 0 ? (
              <div style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                Sin partidos recientes en el historial público.
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "flex", gap: 4 }}>
                {recentForm.map((r, i) => (
                  <span
                    key={i}
                    style={{
                      flex: 1,
                      height: 28,
                      borderRadius: 4,
                      background: r === "W" ? v2tk.accent : "rgba(220,38,38,0.55)",
                      color: r === "W" ? "#001a10" : "#fff1f0",
                      fontFamily: "var(--font-heading)",
                      fontWeight: 900,
                      fontSize: 11,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      letterSpacing: "-0.02em",
                      opacity: 1 - i * 0.05,
                    }}
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}
            <div
              className="profile-v3-scout-meta"
              style={{
                marginTop: 12,
                display: "flex",
                justifyContent: "space-between",
                color: "rgba(255,255,255,0.5)",
              }}
            >
              <span>HOY</span>
              <span>·</span>
              <span>
                <span className="profile-v3-scout-meta-num tabular">{me.streak.count}</span>
                {me.streak.type} en racha
              </span>
            </div>
          </div>
        ) : (
          <ScoutLockedDarkCard
            kicker="FORMA · ÚLTIMOS 10"
            title="Sólo en perfiles MP+"
            body={`${me.first} aún no comparte su forma reciente.`}
          />
        )}

        <div style={sbCardDark}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
              H2H · USTEDES
            </span>
            <span className="profile-v3-scout-meta" style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
              <span className="profile-v3-scout-meta-num tabular">{h2h.played}</span> partidos
            </span>
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
            <span
              className="tabular"
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 38,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: "#3b82f6",
              }}
            >
              {h2h.mineWins}
            </span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, color: "rgba(255,255,255,0.4)" }}>vs</span>
            <span
              className="tabular"
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 38,
                lineHeight: 1,
                letterSpacing: "-0.04em",
                color: v2tk.accent,
              }}
            >
              {h2h.theirWins}
            </span>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {h2hRows.length === 0 ? (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
                Aún no tienen partidos confirmados entre ustedes.
              </div>
            ) : (
              h2hRows.map((m, i) => (
                <div
                  key={i}
                  className="profile-v3-scout-meta"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 10,
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: m.result === "W" ? v2tk.accentSoft : "rgba(220,38,38,0.18)",
                      color: m.result === "W" ? v2tk.accent : "#fca5a5",
                      fontFamily: "var(--font-heading)",
                      fontWeight: 900,
                      fontSize: 9,
                    }}
                  >
                    {m.result}
                  </span>
                  <span style={{ width: 44, color: "rgba(255,255,255,0.55)" }}>{m.date}</span>
                  <span style={{ flex: 1, color: "rgba(255,255,255,0.85)" }}>{m.score}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {ownerIsPlus ? (
        <div
          style={{
            position: "relative",
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
            alignItems: "center",
            fontSize: 11,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 900,
                fontSize: 9,
                letterSpacing: "0.22em",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              ESTILO
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontWeight: 900,
                color: "#fff",
                letterSpacing: "0.12em",
              }}
            >
              {archetype}
            </span>
          </span>
          <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <HandoffIcon name="arrow-up-right" size={12} color={v2tk.accent} />
            <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>PICO DE ACTIVIDAD </span>
            <span className="profile-v3-scout-meta-num" style={{ fontWeight: 700, color: "#86efac" }}>
              {me.heatmapPeak}
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>
              · <span className="profile-v3-scout-meta-num tabular">{me.winRate}%</span> victorias
            </span>
          </span>
          {weakness ? (
            <>
              <span style={{ width: 1, height: 14, background: "rgba(255,255,255,0.12)" }} />
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <HandoffIcon name="arrow-down-right" size={12} color="#fca5a5" />
                <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.75)" }}>GOLPE MÁS DÉBIL </span>
                <span className="profile-v3-scout-meta" style={{ fontWeight: 700, color: "#fca5a5" }}>
                  {weakness}
                </span>
              </span>
            </>
          ) : null}
        </div>
      ) : (
        <InviteOwnerStrip ownerName={me.first} />
      )}
    </div>
  );
}

function V3ScoutInsights({ ownerSub = "plus" }: { ownerSub?: "free" | "plus" }) {
  const ownerIsPlus = ownerSub === "plus";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="label-mp" style={{ color: v2tk.muted }}>
          HERRAMIENTAS DE SCOUT
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 9999,
            background: v2tk.goldSoft,
            color: v2tk.gold,
            fontFamily: "var(--font-sans)",
            fontWeight: 900,
            fontSize: 9,
            letterSpacing: "0.18em",
          }}
        >
          <HandoffIcon name="sparkles" size={9} />
          TU MP+
        </span>
      </div>
      <div className="pv3-stack-sm mp-grid-form-3 gap-3">
        {ownerIsPlus ? <ScoutStylePanel /> : <ScoutStyleRadarLocked />}
        <ScoutCommonRivals />
        <ScoutNotesWatchlist />
      </div>
    </div>
  );
}

function ScoutStylePanel() {
  const me = usePerfilV3Data();
  const attrs = me.attrs;
  const insights = me.coachShotInsights;
  const stub = attrsAreStub(attrs);

  if (stub && insights.length === 0) {
    return (
      <div
        style={{
          background: v2tk.card,
          border: `1px solid ${v2tk.border}`,
          borderRadius: 14,
          padding: "18px 20px",
        }}
      >
        <span className="label-mp" style={{ color: v2tk.muted }}>
          ESTILO DE JUEGO
        </span>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 17,
            marginTop: 4,
            letterSpacing: "-0.02em",
          }}
        >
          Fingerprint
        </div>
        <ProfileEmptyState
          compact
          icon="sparkles"
          title="Sin fingerprint aún"
          text="Cuando Coach AI analice sus partidos confirmados, verás el radar y puntos débiles aquí."
        />
      </div>
    );
  }

  if (!stub) {
    return <ScoutStyleRadar />;
  }

  return (
    <div
      style={{
        background: v2tk.card,
        border: `1px solid ${v2tk.border}`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <span className="label-mp" style={{ color: v2tk.muted }}>
        ESTILO · COACH AI
      </span>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 17,
          marginTop: 4,
          letterSpacing: "-0.02em",
        }}
      >
        Golpes clave
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {insights.slice(0, 6).map((ins) => (
          <div key={ins.label}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontWeight: 800,
                color: v2tk.inkSoft,
              }}
            >
              <span>{ins.label}</span>
              <span className="tabular">{ins.winPct}%</span>
            </div>
            <div
              style={{
                marginTop: 4,
                height: 5,
                background: v2tk.borderSoft,
                borderRadius: 999,
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${ins.winPct}%`, height: "100%", background: v2tk.accent }} />
            </div>
          </div>
        ))}
      </div>
      {scoutWeakness(me) ? (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: v2tk.cardSoft,
            border: `1px solid ${v2tk.borderSoft}`,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 900,
              fontSize: 9.5,
              letterSpacing: "0.18em",
              color: v2tk.hot,
            }}
          >
            PUNTO DÉBIL
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: v2tk.inkSoft, fontWeight: 700 }}>
            {scoutWeakness(me)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScoutStyleRadar() {
  const attrs = usePerfilV3Data().attrs;
  const me = usePerfilV3Data();
  const labels = [
    { k: "PWR" as const, full: "Potencia" },
    { k: "SPD" as const, full: "Velocidad" },
    { k: "REC" as const, full: "Recuperación" },
    { k: "CON" as const, full: "Consistencia" },
    { k: "TOU" as const, full: "Toque" },
    { k: "CLU" as const, full: "Clutch" },
  ];
  const cx = 110;
  const cy = 105;
  const R = 78;
  const angleFor = (i: number) => ((i * 60 - 90) * Math.PI) / 180;
  const pt = (i: number, r: number) => [cx + Math.cos(angleFor(i)) * r, cy + Math.sin(angleFor(i)) * r];
  const polyPoints = (frac: number) => labels.map((_, i) => pt(i, R * frac).join(",")).join(" ");
  const dataPoints = labels.map((l, i) => pt(i, R * (attrs[l.k] / 99)).join(",")).join(" ");
  const weakness = scoutWeakness(me);

  return (
    <div
      style={{
        background: v2tk.card,
        border: `1px solid ${v2tk.border}`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <div>
        <span className="label-mp" style={{ color: v2tk.muted }}>
          ESTILO DE JUEGO
        </span>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 17,
            marginTop: 4,
            letterSpacing: "-0.02em",
          }}
        >
          Fingerprint
        </div>
      </div>
      <div
        className="pv3-scout-radar-row mp-grid-split gap-3.5"
        style={{
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <svg width="220" height="210" viewBox="0 0 220 210">
          {[0.33, 0.66, 1].map((f, i) => (
            <polygon key={i} points={polyPoints(f)} fill="none" stroke={v2tk.border} strokeWidth="1" />
          ))}
          {labels.map((_, i) => {
            const [x, y] = pt(i, R);
            return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={v2tk.border} strokeWidth="1" />;
          })}
          <polygon points={dataPoints} fill={v2tk.accentSoft} stroke={v2tk.accent} strokeWidth="2" />
          {labels.map((l, i) => {
            const [x, y] = pt(i, R + 16);
            return (
              <text
                key={l.k}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontFamily: "var(--font-sans)",
                  fontWeight: 900,
                  fontSize: 9.5,
                  letterSpacing: "0.1em",
                  fill: v2tk.muted,
                }}
              >
                {l.k}
              </text>
            );
          })}
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {labels.map((l) => (
            <div
              key={l.k}
              className="profile-v3-body-sm"
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              <span className="label-mp" style={{ width: 28, fontSize: 9, color: v2tk.ink }}>
                {l.k}
              </span>
              <span style={{ flex: 1, color: v2tk.mutedSoft }}>{l.full}</span>
              <span
                className="tabular"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 900,
                  fontSize: 13,
                  color: attrs[l.k] >= 80 ? v2tk.accent : v2tk.ink,
                  letterSpacing: "-0.02em",
                }}
              >
                {attrs[l.k]}
              </span>
            </div>
          ))}
        </div>
      </div>
      {weakness ? (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            background: v2tk.cardSoft,
            border: `1px solid ${v2tk.borderSoft}`,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 900,
              fontSize: 9.5,
              letterSpacing: "0.18em",
              color: v2tk.hot,
            }}
          >
            PUNTO DÉBIL
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: v2tk.inkSoft, fontWeight: 700 }}>{weakness}</div>
        </div>
      ) : null}
    </div>
  );
}

function ScoutCommonRivals() {
  const scout = usePerfilV3Data().scout;
  const rivals = scout?.commonRivals ?? [];

  return (
    <div
      style={{
        background: v2tk.card,
        border: `1px solid ${v2tk.border}`,
        borderRadius: 14,
        padding: "18px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <span className="label-mp" style={{ color: v2tk.muted }}>
            RIVALES EN COMÚN
          </span>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 17,
              marginTop: 4,
              letterSpacing: "-0.02em",
            }}
          >
            Misma cancha, otra historia
          </div>
        </div>
        <span className="profile-v3-body-sm" style={{ color: v2tk.muted }}>
          <span className="tabular font-heading">{rivals.length}</span> cruzados
        </span>
      </div>
      {rivals.length === 0 ? (
        <div style={{ marginTop: 12 }}>
          <ProfileEmptyState
            compact
            icon="users"
            title="Sin rivales en común"
            text="Cuando ambos enfrenten a los mismos jugadores confirmados, aparecerán aquí con el marcador de cada uno."
          />
        </div>
      ) : (
        <>
          <div
            className="mp-grid-form-2 gap-1.5"
            style={{
              marginTop: 14,
              fontFamily: "var(--font-sans)",
              fontWeight: 900,
              fontSize: 9,
              letterSpacing: "0.18em",
              color: v2tk.mutedSoft,
            }}
          >
            <span style={{ textAlign: "right" }}>TÚ</span>
            <span>RIVAL</span>
          </div>
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 12 }}>
            {rivals.map((r) => {
              const [mw, ml] = r.mineRecord.split("-").map(Number);
              const [tw, tl] = r.theirRecord.split("-").map(Number);
              const mPct = mw + ml > 0 ? Math.round((mw / (mw + ml)) * 100) : 0;
              const tPct = tw + tl > 0 ? Math.round((tw / (tw + tl)) * 100) : 0;
              return (
                <div
                  key={r.name}
                  className="pv3-scout-rival-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 110px 1fr",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    <span
                      className="tabular"
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontWeight: 900,
                        fontSize: 14,
                        color: r.edge === "you" ? v2tk.accent : v2tk.ink,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {r.mineRecord}
                    </span>
                    <div
                      style={{
                        width: 60,
                        height: 5,
                        background: v2tk.borderSoft,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${mPct}%`,
                          height: "100%",
                          background: r.edge === "you" ? v2tk.accent : v2tk.muted,
                          marginLeft: "auto",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", flexDirection: "column", gap: 4 }}>
                    <AvatarBlob size={32} tone={r.tone} label={r.initials} ring="#fff" ringWidth={2} />
                    <span
                      style={{
                        fontFamily: "var(--font-sans)",
                        fontWeight: 800,
                        fontSize: 10,
                        color: v2tk.inkSoft,
                        letterSpacing: "0.04em",
                        textAlign: "center",
                        lineHeight: 1.1,
                      }}
                    >
                      {r.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 60,
                        height: 5,
                        background: v2tk.borderSoft,
                        borderRadius: 999,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${tPct}%`,
                          height: "100%",
                          background: r.edge === "they" ? v2tk.accent : v2tk.muted,
                        }}
                      />
                    </div>
                    <span
                      className="tabular"
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontWeight: 900,
                        fontSize: 14,
                        color: r.edge === "they" ? v2tk.accent : v2tk.ink,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {r.theirRecord}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ScoutNotesWatchlist() {
  const toast = useToast();
  return (
    <div
      style={{
        background: v2tk.card,
        border: `1px solid ${v2tk.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>
        <span className="label-mp" style={{ color: v2tk.muted }}>
          TU SCOUTING
        </span>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 17,
            marginTop: 4,
            letterSpacing: "-0.02em",
          }}
        >
          Privado · sólo tú
        </div>
      </div>
      <ProfileEmptyState
        compact
        icon="bookmark"
        title="Watchlist y notas"
        text="Guarda rivales y apuntes tácticos privados. Esta sección se activará cuando el backend de scouting esté listo."
        action={{
          label: "Avísame",
          onClick: () =>
            toast({
              icon: "bell",
              title: "Próximamente",
              sub: "Te avisaremos cuando puedas guardar notas en perfiles ajenos.",
            }),
        }}
      />
    </div>
  );
}

export function PerfilV3BoardScout({ ownerSub = "free" }: { ownerSub?: "free" | "plus" }) {
  const ownerIsPlus = ownerSub === "plus";

  return (
    <div
      className="pv3-board"
      style={{
        width: "100%",
        minHeight: "100%",
        background: v2tk.bg,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <V2Hero sub={ownerSub} view="public" />
      <V3ScoutBrief ownerSub={ownerSub} />
      {PROFILE_V3_SHOWCASE_ENABLED && ownerIsPlus ? <V2Showcase sub="plus" view="public" /> : null}
      <V3AnalyticsBand sub={ownerSub} view="public" />
      <V3SocialBand sub={ownerSub} view="public" />
      <V3ScoutInsights ownerSub={ownerSub} />
      <V3ActivityBand />
      <V3CommunityBand />
    </div>
  );
}

function ScoutLockedDarkCard({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        ...sbCardDark,
        border: "1px dashed rgba(212,161,58,0.35)",
        background: "linear-gradient(135deg, rgba(212,161,58,0.08), rgba(255,255,255,0.02))",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 158,
      }}
    >
      <span className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
        {kicker}
      </span>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 8,
          padding: "6px 4px",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#fbbf24,#d4a13a)",
            color: "#1a1300",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <HandoffIcon name="lock" size={15} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 14.5,
            color: "#fff",
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.4, maxWidth: 220 }}>{body}</div>
      </div>
    </div>
  );
}

function InviteOwnerStrip({ ownerName }: { ownerName: string }) {
  const toast = useToast();
  return (
    <div
      style={{
        position: "relative",
        marginTop: 14,
        padding: "12px 14px",
        borderRadius: 10,
        background: "linear-gradient(110deg, rgba(212,161,58,0.16), rgba(212,161,58,0.04))",
        border: "1px solid rgba(212,161,58,0.32)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: "linear-gradient(135deg,#fbbf24,#d4a13a)",
          color: "#1a1300",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <HandoffIcon name="gift" size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 900,
            fontSize: 9.5,
            color: "#fcd34d",
            letterSpacing: "0.18em",
          }}
        >
          {ownerName.toUpperCase()} ES FREE
        </div>
        <div
          style={{
            marginTop: 3,
            fontSize: 12.5,
            color: "rgba(255,255,255,0.9)",
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          Su forma, heatmap, partners y golpes son privados hasta que active MATCHPOINT+.
          <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>
            {" "}
            Invítalo a probar 14 días gratis.
          </span>
        </div>
      </div>
      <button
        type="button"
        style={{
          padding: "9px 14px",
          borderRadius: 9999,
          border: "1px solid rgba(212,161,58,0.45)",
          background: "transparent",
          color: "#fcd34d",
          fontFamily: "var(--font-sans)",
          fontWeight: 900,
          fontSize: 10.5,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
        onClick={() =>
          toast({
            icon: "send",
            title: "Próximamente",
            sub: "Podrás invitar desde el chat o su perfil cuando activemos el envío.",
          })
        }
      >
        <HandoffIcon name="send" size={11} />
        Enviar invitación
      </button>
    </div>
  );
}

function ScoutStyleRadarLocked() {
  const me = usePerfilV3Data();
  return (
    <div
      style={{
        position: "relative",
        background: v2tk.card,
        border: `1px solid ${v2tk.border}`,
        borderRadius: 14,
        padding: "18px 20px",
        minHeight: 340,
        overflow: "hidden",
      }}
    >
      <div>
        <span className="label-mp" style={{ color: v2tk.muted }}>
          ESTILO DE JUEGO
        </span>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 17,
            marginTop: 4,
            letterSpacing: "-0.02em",
          }}
        >
          Fingerprint
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 200,
          position: "relative",
        }}
      >
        <svg width="200" height="200" viewBox="0 0 220 210" style={{ opacity: 0.35 }}>
          {[0.33, 0.66, 1].map((f, i) => {
            const cx = 110;
            const cy = 105;
            const R = 78;
            const pts = Array.from({ length: 6 }, (_, k) => {
              const a = ((k * 60 - 90) * Math.PI) / 180;
              return `${cx + Math.cos(a) * R * f},${cy + Math.sin(a) * R * f}`;
            }).join(" ");
            return <polygon key={i} points={pts} fill="none" stroke={v2tk.border} strokeWidth="1" />;
          })}
        </svg>
        <div
          style={{
            position: "absolute",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "linear-gradient(135deg,#fbbf24,#d4a13a)",
              color: "#1a1300",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <HandoffIcon name="lock" size={17} />
          </div>
          <div
            style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 900,
              fontSize: 9.5,
              color: v2tk.gold,
              letterSpacing: "0.2em",
            }}
          >
            REQUIERE MP+ DEL DUEÑO
          </div>
          <div style={{ fontSize: 11.5, color: v2tk.muted, maxWidth: 220, lineHeight: 1.4 }}>
            El fingerprint expone data fina del jugador — sólo se publica si {me.first} activa MATCHPOINT+.
          </div>
        </div>
      </div>
    </div>
  );
}

const sbCardDark = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "16px 18px",
};
const sbBtnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 16px",
  borderRadius: 9999,
  border: 0,
  background: v2tk.accent,
  color: "#fff",
  fontFamily: "var(--font-sans)",
  fontWeight: 900,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
};
const sbBtnGhost = (active: boolean) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 14px",
  borderRadius: 9999,
  border: `1px solid ${active ? "rgba(212,161,58,0.55)" : "rgba(255,255,255,0.18)"}`,
  background: active ? "rgba(212,161,58,0.18)" : "transparent",
  color: active ? "#fcd34d" : "rgba(255,255,255,0.85)",
  fontFamily: "var(--font-sans)",
  fontWeight: 900,
  fontSize: 11,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
});
