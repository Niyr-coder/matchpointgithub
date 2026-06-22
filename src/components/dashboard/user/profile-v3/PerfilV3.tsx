"use client";

import React from "react";
import { HandoffIcon } from "./HandoffIcon";

import { v2tk, v2Sub } from "./PerfilV2Shared";
import { AvatarBlob } from "./PerfilShared";
import { V3RatingChart } from "./V3RatingChart";
import { V2Hero, V2H2HBanner, V2Showcase } from "./PerfilV2";
import { PROFILE_V3_SHOWCASE_ENABLED } from "./profileV3Flags";
import { V2Locked } from "./PerfilV2Sections";
import { usePerfilV3Data } from "./PerfilV3Context";
import { useProfileV3Actions } from "./ProfileV3ActionsContext";
import { AnalyticsUpdatedLabel } from "./AnalyticsUpdatedLabel";
import { ProfileEmptyState, openCrearMatchModal } from "./ProfileEmptyState";
import { QuedadaPlayerStatsPanel } from "../QuedadaPlayerStatsPanel";
import Link from "next/link";
import { Icon } from "@/components/Icon";
// PerfilV3 — fusión profile-first (V2) + dashboard analítico (V1).
// Un solo scroll, sin tabs: identidad arriba, análisis embebido como bandas.
// Reutiliza componentes V2 (hero, showcase, kpis, h2h) y agrega bandas analíticas.

// ─────────────────────────────────────────────────────────────────────
// BANDA ANALÍTICA 1 — Rating evolution + Heatmap + Win/Loss donut
// Free: blurreada con candado MP+. Plus: completa.
// ─────────────────────────────────────────────────────────────────────
export function V3AnalyticsBand({ sub, view }: { sub: "free" | "plus"; view: "mine" | "public" }) {
  const { isPlus } = v2Sub(sub);
  const isMine = view === 'mine';
  const me = usePerfilV3Data();
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="label-mp" style={{ color: v2tk.muted }}>ANÁLISIS DE JUEGO</span>
        {isPlus && <AnalyticsUpdatedLabel updatedAt={me.analyticsUpdatedAt} />}
      </div>

      <div className="pv3-stack-sm" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.7fr 1fr 0.85fr', gap: 12 }}>
        <V3RatingChart />
        <V3Heatmap />
        <V3WinLossDonut />
        {!isPlus && <V2Locked title={isMine ? 'Desbloquea tu juego en detalle' : `${usePerfilV3Data().first} no es MP+`} isMine={isMine} />}
      </div>
    </div>
  );
}

function V3Heatmap() {
  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const me = usePerfilV3Data();
  const hm = me.heatmap;
  const hasActivity = hm.some((row) => row.some((v) => v > 0));
  const palette = ['#f5f5f4', '#bbf7d0', '#86efac', '#10b981'];
  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <span className="label-mp" style={{ color: v2tk.muted }}>CUÁNDO JUEGA</span>
          <div className="card-title" style={{ fontSize: 18 }}>{hasActivity ? me.heatmapPeak : 'Sin actividad registrada'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {palette.map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: 2, background: c, border: `1px solid ${v2tk.border}` }} />)}
        </div>
      </div>
      {!hasActivity ? (
        <ProfileEmptyState
          compact
          icon="calendar-days"
          title="Heatmap vacío"
          text="Cuando confirmes partidos, verás en qué días y horarios juegas más."
          action={{ label: 'Registrar partido', onClick: openCrearMatchModal }}
        />
      ) : (
      <div className="pv3-scroll-x" style={{ display: 'grid', gridTemplateColumns: '20px repeat(6, 1fr)', gap: 3, alignItems: 'center', minWidth: 280 }}>
        <div />
        {['6-9', '9-12', '12-15', '15-18', '18-21', '21-24'].map(f => (
          <div key={f} className="profile-v3-mono" style={{ fontSize: 8.5, color: v2tk.muted, textAlign: 'center', letterSpacing: '0.04em' }}>{f}</div>
        ))}
        {hm.map((row, di) => (
          <React.Fragment key={di}>
            <div className="font-heading" style={{ fontWeight: 900, fontSize: 11, color: v2tk.ink, textAlign: 'center' }}>{dias[di]}</div>
            {row.map((v, fi) => (
              <div key={fi} style={{ aspectRatio: '1.4/1', borderRadius: 3, background: palette[v], border: v === 0 ? `1px solid ${v2tk.border}` : '1px solid transparent' }} />
            ))}
          </React.Fragment>
        ))}
      </div>
      )}
    </div>
  );
}

function V3WinLossDonut() {
  const me = usePerfilV3Data();
  const pct = me.winRate;
  const r = 48, c = 2 * Math.PI * r;
  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
      <span className="label-mp" style={{ color: v2tk.muted }}>WIN RATE · TEMPORADA</span>
      {me.matches === 0 ? (
        <ProfileEmptyState
          compact
          icon="pie-chart"
          title="Sin récord aún"
          text="Tu porcentaje de victorias aparece cuando tengas al menos un partido confirmado."
        />
      ) : (
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <svg width="130" height="130" viewBox="0 0 130 130">
          <circle cx="65" cy="65" r={r} fill="none" stroke="#f5f5f4" strokeWidth="13" />
          <circle cx="65" cy="65" r={r} fill="none" stroke={v2tk.accent} strokeWidth="13"
            strokeDasharray={`${(pct / 100) * c} ${c}`} strokeDashoffset={c / 4} transform="rotate(-90 65 65)" strokeLinecap="round" />
          <text x="65" y="65" textAnchor="middle" dominantBaseline="central"
            style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 28, letterSpacing: '-0.04em' }} fill={v2tk.ink}>{pct}%</text>
        </svg>
        <div className="profile-v3-mono" style={{ display: 'flex', gap: 18, fontSize: 10.5, color: v2tk.muted, letterSpacing: '0.06em' }}>
          <span><span style={{ color: v2tk.accent, fontWeight: 900 }}>{me.wins}W</span> · <span style={{ color: v2tk.hot, fontWeight: 900 }}>{me.losses}L</span></span>
        </div>
        <div className="profile-v3-body-sm" style={{ letterSpacing: '0.08em' }}>
          {me.wins}W · {me.losses}L en {me.matches} partidos
        </div>
      </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BANDA ANALÍTICA 2 — Compañeros + Rivales H2H + Shot breakdown
// ─────────────────────────────────────────────────────────────────────
export function V3SocialBand({ sub, view }: { sub: "free" | "plus"; view: "mine" | "public" }) {
  const { isPlus } = v2Sub(sub);
  const isMine = view === 'mine';
  return (
    <div className="pv3-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 1.2fr', gap: 12 }}>
      <V3Partners isPlus={isPlus} isMine={isMine} />
      <V3Rivals isPlus={isPlus} isMine={isMine} />
      <V3ShotBreakdown isPlus={isPlus} isMine={isMine} />
    </div>
  );
}

type V3PlusBandProps = { isPlus: boolean; isMine: boolean };

function V3Partners({ isPlus, isMine }: V3PlusBandProps) {
  const partners = usePerfilV3Data().partners;
  const hasData = partners.length > 0;
  return (
    <div style={{ position: 'relative', background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px', minHeight: 280 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <span className="label-mp" style={{ color: v2tk.muted }}>COMPAÑEROS</span>
          <div className="card-title">Con quién juega mejor</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, filter: isPlus && hasData ? 'none' : hasData ? 'blur(5px)' : 'none' }}>
        {!hasData ? (
          <ProfileEmptyState
            compact
            icon="users"
            title="Sin compañeros aún"
            text="Juega partidos de dobles confirmados y aquí verás con quién rindes mejor."
            action={isMine ? { label: 'Registrar partido', onClick: openCrearMatchModal } : undefined}
          />
        ) : partners.map(p => {
          const rate = Math.round((p.wins / p.matches) * 100);
          return (
            <div key={p.name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 50px', alignItems: 'center', gap: 10 }}>
              <AvatarBlob size={30} tone={p.tone} label={p.initials} ring="#fff" ringWidth={2} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: v2tk.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ marginTop: 4, height: 5, background: v2tk.borderSoft, borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${rate}%`, height: '100%', background: v2tk.accent }} />
                </div>
              </div>
              <span className="tabular font-heading" style={{ textAlign: 'right', fontWeight: 900, fontSize: 14, color: v2tk.ink }}>{rate}%</span>
            </div>
          );
        })}
      </div>
      {!isPlus && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(250,250,249,0.55)' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="label-mp" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, background: v2tk.goldSoft, color: v2tk.gold, fontSize: 9.5 }}>
              <HandoffIcon name="lock" size={11} />MP+ REQUERIDO
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function V3Rivals({ isPlus, isMine }: V3PlusBandProps) {
  const rivals = usePerfilV3Data().rivals;
  const hasData = rivals.length > 0;
  return (
    <div style={{ position: 'relative', background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px', minHeight: 280 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <span className="label-mp" style={{ color: v2tk.muted }}>RIVALES · H2H</span>
          <div className="card-title">A quién enfrenta más</div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, filter: isPlus && hasData ? 'none' : hasData ? 'blur(5px)' : 'none' }}>
        {!hasData ? (
          <ProfileEmptyState
            compact
            icon="swords"
            title="Sin rivales frecuentes"
            text="Cuando confirmes partidos, verás contra quién juegas más y tu balance W/L."
            action={isMine ? { label: 'Buscar rival', onClick: openCrearMatchModal } : undefined}
          />
        ) : rivals.map(r => (
          <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', alignItems: 'center', gap: 10 }}>
            <AvatarBlob size={30} tone={r.tone} label={r.initials} ring="#fff" ringWidth={2} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: v2tk.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 9999, background: v2tk.borderSoft, color: v2tk.muted, letterSpacing: '0.08em' }}>N{r.level}</span>
              </div>
              <div style={{ display: 'flex', gap: 2, marginTop: 6 }}>
                {Array.from({ length: r.played }).map((_, i) => (
                  <span key={i} style={{ flex: 1, height: 5, borderRadius: 2, background: i < r.wins ? v2tk.accent : v2tk.hot }} />
                ))}
              </div>
            </div>
            <div className="tabular font-heading" style={{ textAlign: 'right', fontWeight: 900, fontSize: 13 }}>
              <span style={{ color: v2tk.accent }}>{r.wins}</span>
              <span style={{ color: v2tk.muted, fontSize: 10 }}> · </span>
              <span style={{ color: v2tk.hot }}>{r.losses}</span>
            </div>
          </div>
        ))}
      </div>
      {!isPlus && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(250,250,249,0.55)' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="label-mp" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9999, background: v2tk.goldSoft, color: v2tk.gold, fontSize: 9.5 }}>
              <HandoffIcon name="lock" size={11} />MP+ REQUERIDO
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function V3ShotBreakdown({ isPlus, isMine }: V3PlusBandProps) {
  const insights = usePerfilV3Data().coachShotInsights;
  const hasData = insights.length > 0;
  return (
    <div className="card profile-v3-panel">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <span className="label-mp">% VICTORIA POR GOLPE</span>
          <div className="card-title">Coach AI insights</div>
        </div>
      </div>
      <div style={{ filter: !isPlus && hasData ? 'blur(5px)' : 'none' }}>
        {hasData ? (
          <div className="profile-v3-shot-grid">
            {insights.map((s) => {
              const row = { shot: s.label, pct: s.winPct };
              const strong = row.pct >= 65;
              const pct = Math.min(100, Math.max(0, row.pct));
              return (
                <div
                  key={row.shot}
                  className={`profile-v3-shot-cell${strong ? ' profile-v3-shot-cell--strong' : ''}`}
                >
                  <div className="profile-v3-shot-label profile-v3-body-sm">{row.shot}</div>
                  <span className="tabular font-heading profile-v3-shot-pct">{pct}%</span>
                  <div className="profile-v3-shot-track">
                    <div className="profile-v3-shot-bar" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ProfileEmptyState
            compact
            icon="sparkles"
            title="Sin análisis de golpes"
            text={
              isMine
                ? 'Sube un partido en Coach AI para ver tu % de victoria por tipo de golpe.'
                : 'Este jugador aún no tiene insights de golpes desde Coach AI.'
            }
            action={isMine ? { label: 'Ir a Coach AI', href: '/dashboard/user/coach-ai' } : undefined}
          />
        )}
      </div>
      {!isPlus && (
        <div className="profile-v3-mp-lock-overlay">
          <div className="profile-v3-mp-lock-badge label-mp">
            <HandoffIcon name="lock" size={11} />
            COACH AI · MP+
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// QUEDADAS — actividad social (secundaria, colapsable)
// ─────────────────────────────────────────────────────────────────────
function V3QuedadasBand({ view }: { view: "mine" | "public" }) {
  const me = usePerfilV3Data();
  return (
    <QuedadaPlayerStatsPanel
      stats={me.quedadaStats}
      scope={view}
      surface="profile"
      playerFirstName={me.first}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// ACTIVIDAD — últimos partidos confirmados (sin columna lateral del handoff)
// ─────────────────────────────────────────────────────────────────────
export function V3ActivityBand() {
  const me = usePerfilV3Data();
  const ms = me.recentMatches;
  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <span className="label-mp" style={{ color: v2tk.muted }}>ACTIVIDAD</span>
            <div className="card-title" style={{ fontSize: 20, letterSpacing: '-0.025em' }}>Historial reciente</div>
          </div>
          {me.matches > ms.length ? (
            <span className="profile-v3-body-sm">Mostrando {ms.length} de {me.matches} partidos</span>
          ) : null}
        </div>
        {ms.length === 0 ? (
          <ProfileEmptyState
            icon="history"
            title="Sin partidos en tu historial"
            text="Los partidos confirmados aparecen aquí con rival, marcador y cambio de rating."
            action={{ label: 'Registrar partido', onClick: openCrearMatchModal }}
          />
        ) : ms.map((m, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 14, alignItems: 'flex-start',
            padding: '14px 0', borderTop: i === 0 ? `1px solid ${v2tk.borderSoft}` : `1px solid ${v2tk.borderSoft}`,
          }}>
            <span className="font-heading" style={{
              width: 26, height: 26, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: m.result === 'W' ? v2tk.accentSoft : 'rgba(220,38,38,0.1)',
              color: m.result === 'W' ? v2tk.accent : v2tk.hot,
              fontWeight: 900, fontSize: 12,
            }}>{m.result}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span className="font-heading" style={{ fontWeight: 900, fontSize: 16, letterSpacing: '-0.02em', color: v2tk.ink }}>vs. {m.opp}</span>
                <span className="label-mp" style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 9999, background: v2tk.borderSoft, color: v2tk.muted }}>NIVEL {m.oppLevel}</span>
                <span className="tabular font-heading" style={{ fontWeight: 700, fontSize: 13, color: v2tk.inkSoft, marginLeft: 'auto' }}>{m.score}</span>
              </div>
              <div className="profile-v3-body-sm" style={{ marginTop: 5 }}>
                {m.date} · {m.venue}
              </div>
            </div>
            <div className="tabular font-heading" style={{ textAlign: 'right', fontWeight: 900, fontSize: 15, color: m.delta.startsWith('+') ? v2tk.accent : v2tk.hot }}>{m.delta}</div>
          </div>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BANDA COMUNIDAD + COLECCIÓN — siempre visible
// ─────────────────────────────────────────────────────────────────────
export function V3CommunityBand() {
  const me = usePerfilV3Data();
  const { isMine, friendState, onFriend } = useProfileV3Actions();
  const badgePct = me.badgesTotal > 0 ? Math.round((me.badgesUnlocked / me.badgesTotal) * 100) : 0;
  const extraFriends = Math.max(0, me.friendsCount - me.friendsMembers.length);

  return (
    <div className="pv3-stack-sm" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
      {/* Clubes + amigos */}
      <div
        className="pv3-stack-sm"
        style={{
          display: 'grid',
          gridTemplateColumns: '1.2fr 1fr',
          gap: 12,
        }}
      >
        <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span className="label-mp" style={{ color: v2tk.muted }}>CLUBES · {me.clubs.length}</span>
              <div className="card-title">Donde juega</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {me.clubs.length === 0 ? (
              <ProfileEmptyState
                compact
                icon="building-2"
                title="Sin clubes"
                text={
                  isMine
                    ? 'Únete a un club para que otros jugadores sepan dónde entrenas y juegas.'
                    : 'Este jugador aún no tiene clubes públicos en su perfil.'
                }
                action={isMine ? { label: 'Explorar clubes', href: '/dashboard/user/clubes' } : undefined}
              />
            ) : me.clubs.map((c) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 7, background: c.tone, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: v2tk.ink }}>{c.name}</span>
                    {c.primary && <span style={{ padding: '1px 5px', borderRadius: 9999, background: v2tk.accentSoft, color: v2tk.accentDeep, fontSize: 8.5, fontWeight: 900, letterSpacing: '0.1em' }}>PRINCIPAL</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: v2tk.muted, marginTop: 2 }}>{c.role}</div>
                </div>
                <HandoffIcon name="chevron-right" size={13} color={v2tk.mutedSoft } />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span className="label-mp" style={{ color: v2tk.muted }}>RED</span>
              <div className="card-title">
                {isMine
                  ? `${me.friendsCount} ${me.friendsCount === 1 ? 'amigo' : 'amigos'}`
                  : 'Amigos'}
              </div>
            </div>
          </div>
          {isMine ? (
            me.friendsCount === 0 ? (
              <ProfileEmptyState
                compact
                icon="user-plus"
                title="Tu red está vacía"
                text="Agrega amigos para retarlos más rápido y ver su actividad."
                action={{ label: 'Ir a Amigos', href: '/dashboard/user/amigos' }}
              />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {me.friendsMembers.map((f, i) => (
                  <AvatarBlob key={i} size={32} tone={f.tone} label={f.initials} ring="#fff" ringWidth={2} />
                ))}
                {extraFriends > 0 ? (
                  <div
                    className="font-heading"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: v2tk.cardSoft,
                      border: `1.5px dashed ${v2tk.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 10,
                      color: v2tk.muted,
                    }}
                  >
                    +{extraFriends}
                  </div>
                ) : null}
              </div>
            )
          ) : friendState === 'friends' ? (
            <ProfileEmptyState
              compact
              icon="user-check"
              title="Ya son amigos"
              text="La lista completa de amigos de este jugador no es pública en su perfil."
            />
          ) : friendState === 'pending' ? (
            <ProfileEmptyState
              compact
              icon="clock"
              title="Solicitud enviada"
              text="Cuando acepte, podrán retarse y chatear desde Amigos."
            />
          ) : (
            <ProfileEmptyState
              compact
              icon="lock"
              title="Red privada"
              text="Este jugador no comparte su lista de amigos en el perfil público."
              action={{
                label: 'Agregar amigo',
                onClick: onFriend,
              }}
            />
          )}
        </div>
      </div>

      {/* Colección compacta */}
      <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span className="label-mp" style={{ color: v2tk.muted }}>COLECCIÓN · {me.badgesUnlocked}/{me.badgesTotal}</span>
            <div className="card-title">Insignias</div>
          </div>
          {me.badgesTotal > 0 ? (
            <div style={{ width: 110, height: 5, background: v2tk.borderSoft, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${badgePct}%`, height: '100%', background: v2tk.accent }} />
            </div>
          ) : null}
        </div>
        {me.badgesTotal === 0 ? (
          <ProfileEmptyState
            compact
            icon="award"
            title="Sin insignias en catálogo"
            text="Las insignias se desbloquean al cumplir logros en torneos y partidos."
          />
        ) : (
        <div className="pv3-kpi-strip mp-grid-form-4 gap-2">
          {me.badges.map(b => {
            const isGold = b.rarity === 'Legendaria' || b.rarity === 'Épica';
            return (
              <div key={b.label} style={{ textAlign: 'center', opacity: b.on ? 1 : 0.45 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', margin: '0 auto',
                  background: b.on ? (isGold ? `radial-gradient(circle at 35% 30%, #f6dc8b, ${v2tk.gold} 60%, #8a6b1f)` : v2tk.accent) : v2tk.borderSoft,
                  color: b.on ? (isGold ? '#1a1300' : '#fff') : v2tk.muted,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  border: b.on ? '0' : `1px solid ${v2tk.border}`,
                }}>
                  <HandoffIcon name={b.icon} size={18} />
                </div>
                <div className="label-mp" style={{ marginTop: 5, fontSize: 9, letterSpacing: '0.06em', color: b.on ? v2tk.ink : v2tk.mutedSoft, lineHeight: 1.15 }}>{b.label}</div>
              </div>
            );
          })}
        </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BOARD V3 — el shell completo, todo en un solo scroll
// ─────────────────────────────────────────────────────────────────────
export function PerfilV3Board({ sub = 'plus', view = 'mine' }: { sub?: 'free' | 'plus'; view?: 'mine' | 'public' }) {
  const isMine = view === 'mine';

  return (
    <div className="pv3-board" style={{
      width: '100%', minHeight: '100%', background: v2tk.bg,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* HERO */}
      <V2Hero sub={sub} view={view} />

      {/* H2H banner — solo si ya jugaron entre ustedes */}
      {!isMine ? <V2H2HBanner /> : null}

      {PROFILE_V3_SHOWCASE_ENABLED ? <V2Showcase sub={sub} view={view} /> : null}

      {/* BANDA ANALÍTICA 1 — Rating + Heatmap + Donut · MP+ */}
      <V3AnalyticsBand sub={sub} view={view} />

      {/* BANDA SOCIAL/H2H — Compañeros + Rivales + Shot · MP+ */}
      <V3SocialBand sub={sub} view={view} />

      <V3QuedadasBand view={view} />

      <V3ActivityBand />

      {/* BANDA COMUNIDAD + COLECCIÓN — siempre visible */}
      <V3CommunityBand />

      {isMine ? (
        <div className="pv3-stack-sm">
          <Link
            href="/dashboard/user/cuenta"
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 18px",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "var(--muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="shield" size={18} color="var(--muted-fg)" />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>Privacidad y cuenta</span>
              <span style={{ display: "block", fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
                Exportar datos, políticas y cierre de cuenta
              </span>
            </span>
            <Icon name="chevron-right" size={16} color="var(--muted-fg)" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}


