// @ts-nocheck — port 1:1 del handoff V3 (V2Locked + tabs legacy).
"use client";

import React from "react";
import { HandoffIcon } from "./HandoffIcon";

import { v2tk, V2_ADVANCED, v2Sub } from "./PerfilV2Shared";
import { usePerfilV3Data } from "./PerfilV3Context";
import { useProfileV3Actions } from "./ProfileV3ActionsContext";
// PerfilV2 — secciones de las tabs (estadísticas con paywall MP+,
// comunidad, colección, preferencias) y el board contenedor que orquesta todo.

// ─────────────────────────────────────────────────────────────────────
// LOCKED OVERLAY — para stats avanzadas en Free
// ─────────────────────────────────────────────────────────────────────
export function V2Locked({ title, isMine }: { title: string; isMine: boolean }) {
  const actions = useProfileV3Actions();
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(250,250,249,0.78)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: 14, padding: 28,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 14px', background: 'linear-gradient(135deg,#fbbf24,#d4a13a)', color: '#1a1300', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 20px rgba(212,161,58,0.35)' }}>
          <HandoffIcon name="lock" size={24} />
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 10, letterSpacing: '0.22em', color: v2tk.gold, marginBottom: 6 }}>
          REQUIERE MATCHPOINT+
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, letterSpacing: '-0.025em', color: v2tk.ink, marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: v2tk.muted, lineHeight: 1.45, marginBottom: 16 }}>
          {isMine
            ? 'Desbloquea con MP+: heatmaps, evolución del rating, golpes y compañeros.'
            : `${usePerfilV3Data().first} no es MP+ aún. Estos análisis aparecen cuando el perfil suscribe.`}
        </div>
        {isMine && (
          <button
            type="button"
            style={{
              padding: '12px 22px', borderRadius: 9999, border: 0,
              background: v2tk.ink, color: '#fff',
              fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 11.5, letterSpacing: '0.12em', textTransform: 'uppercase',
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
            onClick={actions.onUpgrade}
          >
            <HandoffIcon name="sparkles" size={13} />
            Probar MATCHPOINT+ 14 días gratis
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STATS — bloque básico (todos) + bloque avanzado (MP+ only, locked en Free)
// ─────────────────────────────────────────────────────────────────────
function V2Stats({ sub, view }) {
  const { isPlus } = v2Sub(sub);
  const isMine = view === 'mine';
  const adv = V2_ADVANCED;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Bloque básico — siempre visible */}
      <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span className="label-mp" style={{ color: v2tk.muted }}>RESUMEN · TEMPORADA 2025</span>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 20, marginTop: 4, letterSpacing: '-0.025em' }}>Cómo juega Camila</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: v2tk.muted, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em' }}>{usePerfilV3Data().matches} partidos · Mar–May</span>
        </div>
        <div className="pv3-stack-sm mp-grid-form-4 gap-3">
          <SplitCard title="Singles vs Dobles" left={{ l: 'Singles', v: adv.bySplit.singles.matches }} right={{ l: 'Dobles', v: adv.bySplit.doubles.matches }} pct={adv.bySplit.doubles.matches / (adv.bySplit.singles.matches + adv.bySplit.doubles.matches)} />
          <SplitCard title="Outdoor vs Indoor" left={{ l: 'Outdoor', v: adv.bySurface.outdoor.matches }} right={{ l: 'Indoor', v: adv.bySurface.indoor.matches }} pct={adv.bySurface.outdoor.matches / (adv.bySurface.outdoor.matches + adv.bySurface.indoor.matches)} />
          <ValueCard label="DURACIÓN PROMEDIO" value={adv.durations.avg} sub={`máx ${adv.durations.longest}`} />
          <ValueCard label="MEJOR RACHA" value={`${adv.bestStreak.count}W`} sub={`logrado en ${adv.bestStreak.when}`} accent />
        </div>
      </div>

      {/* Bloque avanzado — MP+ */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="label-mp" style={{ color: v2tk.gold }}>ANÁLISIS AVANZADO</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 9999,
              background: v2tk.goldSoft, color: v2tk.gold,
              fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>
              <HandoffIcon name="sparkles" size={9} />MP+ ONLY
            </span>
          </div>
          {isPlus && <span style={{ fontSize: 11, color: v2tk.muted, fontWeight: 700 }}>Actualizado hace 4 min</span>}
        </div>

        <div className="pv3-stack-sm mp-grid-split-wide gap-3" style={{ position: 'relative' }}>
          {/* Rating evolution chart */}
          <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <span className="label-mp" style={{ color: v2tk.muted }}>EVOLUCIÓN RATING DUPR · 12M</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
                  <span className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 32, lineHeight: 1, letterSpacing: '-0.035em' }}>{usePerfilV3Data().rating.toFixed(2)}</span>
                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 11.5, color: v2tk.accent }}>+0.45 desde Jun</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['3M', '6M', '1A'].map((t, i) => (
                  <span key={t} style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: i === 2 ? v2tk.ink : 'transparent',
                    color: i === 2 ? '#fff' : v2tk.muted,
                    fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em',
                  }}>{t}</span>
                ))}
              </div>
            </div>
            <Sparkline data={usePerfilV3Data().ratingHistory} w={620} h={140} />
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: v2tk.mutedSoft, letterSpacing: '0.08em' }}>
              {['JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC', 'ENE', 'FEB', 'MAR', 'ABR', 'MAY'].map(m => <span key={m}>{m}</span>)}
            </div>
          </div>

          {/* Win-rate por nivel del rival */}
          <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 24px' }}>
            <span className="label-mp" style={{ color: v2tk.muted }}>WIN RATE POR NIVEL</span>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {adv.byOppLevel.map(r => (
                <div key={r.lvl} style={{ display: 'grid', gridTemplateColumns: '54px 1fr 70px', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13, letterSpacing: '-0.01em' }}>Nivel {r.lvl}</span>
                  <div style={{ height: 8, background: v2tk.borderSoft, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${r.pct}%`, height: '100%', background: r.pct >= 60 ? v2tk.accent : r.pct >= 45 ? v2tk.amber : v2tk.hot }} />
                  </div>
                  <span className="tabular" style={{ textAlign: 'right', fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14 }}>
                    {r.pct}% <span style={{ fontSize: 10, color: v2tk.muted, fontWeight: 700 }}>{r.wins}/{r.matches}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Shot breakdown */}
          <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <span className="label-mp" style={{ color: v2tk.muted }}>% VICTORIA POR GOLPE</span>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 17, marginTop: 4, letterSpacing: '-0.02em' }}>Análisis Coach AI</div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 9999, background: v2tk.cardSoft, color: v2tk.muted, fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.08em' }}>
                <HandoffIcon name="sparkles" size={10} />v2 model
              </span>
            </div>
            <div className="profile-v3-shot-grid mp-grid-form-3 gap-2.5">
              {adv.byShot.map(s => {
                const strong = s.pct >= 65;
                const pct = Math.min(100, Math.max(0, s.pct));
                return (
                  <div
                    key={s.shot}
                    className={`profile-v3-shot-cell${strong ? ' profile-v3-shot-cell--strong' : ''}`}
                    style={{ padding: '12px 14px', borderRadius: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span className="profile-v3-shot-label profile-v3-body-sm" style={{ fontSize: 11.5 }}>{s.shot}</span>
                      <span className="label-mp" style={{ fontSize: 9, color: 'var(--muted-fg)' }}>vol {s.vol}</span>
                    </div>
                    <span className="tabular font-heading profile-v3-shot-pct" style={{ fontSize: 22 }}>{pct}%</span>
                    <div className="profile-v3-shot-track" style={{ marginTop: 6, height: 4 }}>
                      <div className="profile-v3-shot-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Heatmap actividad */}
          <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 24px' }}>
            <V2Heatmap />
          </div>

          {/* Locked overlay para Free, cubre los 4 cards de avanzadas */}
          {!isPlus && <V2Locked title={isMine ? 'Desbloquea tu juego en detalle' : `${usePerfilV3Data().first} no es MP+`} isMine={isMine} />}
        </div>
      </div>
    </div>
  );
}

function SplitCard({ title, left, right, pct }) {
  return (
    <div style={{ background: v2tk.cardSoft, border: `1px solid ${v2tk.borderSoft}`, borderRadius: 10, padding: '14px 16px' }}>
      <div className="label-mp" style={{ color: v2tk.muted }}>{title}</div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, color: v2tk.ink, letterSpacing: '-0.03em' }}>{right.v}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 11, color: v2tk.muted }}>{right.l}</span>
      </div>
      <div style={{ marginTop: 8, height: 6, background: v2tk.border, borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: v2tk.accent }} />
      </div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: v2tk.muted, fontWeight: 700 }}>{left.v} {left.l}</div>
    </div>
  );
}

function ValueCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: v2tk.cardSoft, border: `1px solid ${v2tk.borderSoft}`, borderRadius: 10, padding: '14px 16px' }}>
      <div className="label-mp" style={{ color: v2tk.muted }}>{label}</div>
      <div className="tabular" style={{ marginTop: 10, fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 24, letterSpacing: '-0.03em', color: accent ? v2tk.accent : v2tk.ink }}>{value}</div>
      <div style={{ marginTop: 6, fontSize: 10.5, color: v2tk.muted, fontWeight: 700 }}>{sub}</div>
    </div>
  );
}

function V2Heatmap() {
  const dias = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const hm = usePerfilV3Data().heatmap;
  const palette = ['#f5f5f4', '#bbf7d0', '#86efac', '#10b981'];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <span className="label-mp" style={{ color: v2tk.muted }}>CUÁNDO JUEGA</span>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 17, marginTop: 4, letterSpacing: '-0.02em' }}>Heatmap semanal</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9.5, color: v2tk.muted, fontWeight: 700 }}>menos</span>
          {palette.map(c => <span key={c} style={{ width: 11, height: 11, borderRadius: 2, background: c, border: `1px solid ${v2tk.border}` }} />)}
          <span style={{ fontSize: 9.5, color: v2tk.muted, fontWeight: 700 }}>más</span>
        </div>
      </div>
      <div className="pv3-scroll-x" style={{ display: 'grid', gridTemplateColumns: '22px repeat(6, 1fr)', gap: 4, alignItems: 'center', minWidth: 300 }}>
        <div />
        {['6-9', '9-12', '12-15', '15-18', '18-21', '21-24'].map(f => (
          <div key={f} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: v2tk.muted, textAlign: 'center', letterSpacing: '0.04em' }}>{f}</div>
        ))}
        {hm.map((row, di) => (
          <React.Fragment key={di}>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 11, color: v2tk.ink, textAlign: 'center' }}>{dias[di]}</div>
            {row.map((v, fi) => (
              <div key={fi} style={{ aspectRatio: '1.4/1', borderRadius: 4, background: palette[v], border: v === 0 ? `1px solid ${v2tk.border}` : '1px solid transparent' }} />
            ))}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COMUNIDAD — compañeros + clubes + amigos
// ─────────────────────────────────────────────────────────────────────
function V2Community({ sub }) {
  const { isPlus } = v2Sub(sub);
  return (
    <div className="pv3-stack-sm mp-grid-split gap-4">
      {/* Compañeros */}
      <div style={{ position: 'relative' }}>
        <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span className="label-mp" style={{ color: v2tk.muted }}>COMPAÑEROS FRECUENTES</span>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, marginTop: 4, letterSpacing: '-0.02em' }}>Con quién juega mejor</div>
            </div>
            {!isPlus && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 9999, background: v2tk.goldSoft, color: v2tk.gold, fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 9, letterSpacing: '0.18em' }}>
                <HandoffIcon name="sparkles" size={9} />MP+ DETALLE
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {usePerfilV3Data().partners.map(p => {
              const rate = Math.round((p.wins / p.matches) * 100);
              return (
                <div key={p.name} className="pv3-scroll-x" style={{ display: 'grid', gridTemplateColumns: '40px 1fr 90px 50px', alignItems: 'center', gap: 14, minWidth: 330 }}>
                  <AvatarBlob size={36} tone={p.tone} label={p.initials} ring="#fff" ringWidth={2} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: v2tk.ink }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: v2tk.muted, marginTop: 2 }}>{p.matches} matches juntos{isPlus ? ` · ${p.wins}W ${p.matches - p.wins}L` : ''}</div>
                  </div>
                  <div style={{ height: 6, background: v2tk.borderSoft, borderRadius: 999, overflow: 'hidden', filter: isPlus ? 'none' : 'blur(5px)', opacity: isPlus ? 1 : 0.6 }}>
                    <div style={{ width: `${rate}%`, height: '100%', background: v2tk.accent }} />
                  </div>
                  <span className="tabular" style={{ textAlign: 'right', fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 14, color: v2tk.ink, filter: isPlus ? 'none' : 'blur(5px)' }}>{rate}%</span>
                </div>
              );
            })}
          </div>
          {!isPlus && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: v2tk.cardSoft, borderRadius: 8, border: `1px dashed ${v2tk.goldRing}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, color: v2tk.inkSoft, fontWeight: 600 }}>Las tasas de victoria detalladas se desbloquean con MP+.</span>
              <button style={{ padding: '6px 12px', borderRadius: 9999, background: v2tk.ink, color: '#fff', border: 0, fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>Probar MP+</button>
            </div>
          )}
        </div>
      </div>

      {/* Clubes + amigos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span className="label-mp" style={{ color: v2tk.muted }}>CLUBES</span>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, marginTop: 4, letterSpacing: '-0.02em' }}>Donde juega</div>
            </div>
            <span style={{ fontSize: 11, color: v2tk.muted, fontWeight: 700 }}>3 activos</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { name: 'Cumbayá Pickleball Club', role: 'Miembro principal', primary: true, tone: 'linear-gradient(135deg,#10b981,#047857)' },
              { name: 'Rancho San Francisco',    role: 'Visitante', tone: 'linear-gradient(135deg,#0ea5e9,#1e3a8a)' },
              { name: 'Tumbaco Paddle Club',     role: 'Visitante', tone: 'linear-gradient(135deg,#f59e0b,#dc2626)' },
            ].map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: c.tone, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: v2tk.ink }}>{c.name}</span>
                    {c.primary && <span style={{ padding: '1px 6px', borderRadius: 9999, background: v2tk.accentSoft, color: v2tk.accentDeep, fontSize: 9, fontWeight: 900, letterSpacing: '0.1em' }}>PRINCIPAL</span>}
                  </div>
                  <div style={{ fontSize: 11, color: v2tk.muted, marginTop: 2 }}>{c.role}</div>
                </div>
                <HandoffIcon name="chevron-right" size={14} color={v2tk.mutedSoft } />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span className="label-mp" style={{ color: v2tk.muted }}>RED</span>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, marginTop: 4, letterSpacing: '-0.02em' }}>23 amigos</div>
            </div>
            <button style={{ background: 'transparent', border: `1px solid ${v2tk.border}`, padding: '6px 12px', borderRadius: 9999, fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: v2tk.ink, cursor: 'pointer' }}>
              Ver todos
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { i: 'AP', t: 'linear-gradient(135deg,#7c3aed,#db2777)' },
              { i: 'JR', t: 'linear-gradient(135deg,#f59e0b,#ef4444)' },
              { i: 'SA', t: 'linear-gradient(135deg,#06b6d4,#1e40af)' },
              { i: 'NV', t: 'linear-gradient(135deg,#10b981,#047857)' },
              { i: 'MV', t: 'linear-gradient(135deg,#dc2626,#7f1d1d)' },
              { i: 'DM', t: 'linear-gradient(135deg,#0ea5e9,#1e3a8a)' },
              { i: 'FC', t: 'linear-gradient(135deg,#a855f7,#5b21b6)' },
            ].map((f, i) => <AvatarBlob key={i} size={36} tone={f.t} label={f.i} ring="#fff" ringWidth={2} />)}
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: v2tk.cardSoft, border: `1.5px dashed ${v2tk.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 11, color: v2tk.muted }}>+16</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COLECCIÓN — insignias
// ─────────────────────────────────────────────────────────────────────
function V2Collection() {
  const all = usePerfilV3Data().badges;
  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '24px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <div>
          <span className="label-mp" style={{ color: v2tk.muted }}>COLECCIÓN · 5 DE 8</span>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, marginTop: 4, letterSpacing: '-0.025em' }}>Insignias desbloqueadas</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: v2tk.muted, fontWeight: 700 }}>Progreso 62%</span>
          <div style={{ width: 160, height: 6, background: v2tk.borderSoft, borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: '62%', height: '100%', background: v2tk.accent }} />
          </div>
        </div>
      </div>
      <div className="pv3-stack-sm mp-grid-form-4 gap-3" style={{ marginTop: 22 }}>
        {all.map(b => {
          const isGold = b.rarity === 'Legendaria' || b.rarity === 'Épica';
          return (
            <div key={b.label} style={{
              position: 'relative', overflow: 'hidden',
              border: `1px solid ${b.on ? (isGold ? v2tk.goldRing : v2tk.border) : v2tk.borderSoft}`,
              borderRadius: 12, padding: '18px 16px',
              background: b.on ? (isGold ? `linear-gradient(160deg, ${v2tk.goldSoft}, transparent 70%), ${v2tk.card}` : v2tk.card) : v2tk.cardSoft,
              opacity: b.on ? 1 : 0.55,
              display: 'flex', gap: 14, alignItems: 'center',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: b.on ? (isGold ? `radial-gradient(circle at 35% 30%, #f6dc8b, ${v2tk.gold} 60%, #8a6b1f)` : v2tk.accent) : v2tk.borderSoft,
                color: b.on ? (isGold ? '#1a1300' : '#fff') : v2tk.muted,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <HandoffIcon name={b.icon} size={22} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 15, lineHeight: 1, letterSpacing: '-0.02em', color: v2tk.ink, textTransform: 'uppercase' }}>{b.label}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: v2tk.muted, lineHeight: 1.4 }}>{b.desc}</div>
                <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 9, letterSpacing: '0.18em', color: b.on ? (isGold ? v2tk.gold : v2tk.accentDeep) : v2tk.mutedSoft }}>
                  {b.on ? `${b.rarity.toUpperCase()} · ${b.when.toUpperCase()}` : b.rarity.toUpperCase()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PREFERENCIAS — sólo vista propia
// ─────────────────────────────────────────────────────────────────────
function V2Preferences({ sub }) {
  const { isPlus } = v2Sub(sub);
  return (
    <div className="mp-grid-form-2 gap-4">
      {/* Personalización */}
      <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <span className="label-mp" style={{ color: v2tk.muted }}>PERSONALIZACIÓN</span>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, marginTop: 4, letterSpacing: '-0.02em' }}>Cómo se ve tu perfil</div>

        {/* Cover picker */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: v2tk.muted, textTransform: 'uppercase', marginBottom: 8 }}>Portada</div>
          <div className="pv3-scroll-x" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, minWidth: 300 }}>
            {Object.entries(v2tk.covers).map(([k, c]) => {
              const selected = k === V2_PERSONALIZATION.cover;
              const locked = !c.free && !isPlus;
              return (
                <div key={k} style={{
                  position: 'relative', aspectRatio: '16/10', borderRadius: 8,
                  background: c.grad,
                  border: selected ? `2px solid ${v2tk.ink}` : `1px solid ${v2tk.border}`,
                  cursor: locked ? 'default' : 'pointer', overflow: 'hidden',
                  opacity: locked ? 0.6 : 1,
                }}>
                  {locked && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fcd34d' }}>
                      <HandoffIcon name="lock" size={14} />
                    </div>
                  )}
                  {selected && (
                    <div style={{ position: 'absolute', bottom: 4, right: 4, width: 18, height: 18, borderRadius: '50%', background: v2tk.ink, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <HandoffIcon name="check" size={11} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Showcase pins */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: v2tk.muted, textTransform: 'uppercase' }}>Pins destacados</span>
            {!isPlus && <span style={{ fontSize: 10, fontWeight: 900, color: v2tk.gold, letterSpacing: '0.12em' }}>MP+</span>}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['Mejor match', 'Compañera fija', 'Insignia top'].map((p, i) => (
                <div key={p} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: isPlus ? v2tk.accentSoft : v2tk.cardSoft,
                  border: `1px ${isPlus ? 'solid' : 'dashed'} ${isPlus ? v2tk.accentRing : v2tk.border}`,
                  fontSize: 11.5, fontWeight: 700, color: isPlus ? v2tk.accentDeep : v2tk.muted, textAlign: 'center',
                }}>{p}</div>
              ))}
            </div>
            {!isPlus && (
              <div style={{ marginTop: 8, fontSize: 11, color: v2tk.muted, fontWeight: 600 }}>
                Suscríbete a MP+ para elegir tus pins.
              </div>
            )}
          </div>
        </div>

        {/* Tagline edit */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: v2tk.muted, textTransform: 'uppercase', marginBottom: 8 }}>Tagline</div>
          <div style={{ padding: '12px 14px', borderRadius: 8, background: v2tk.cardSoft, border: `1px solid ${v2tk.borderSoft}`, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14, color: v2tk.inkSoft, lineHeight: 1.45 }}>
            “{V2_PERSONALIZATION.tagline}”
          </div>
        </div>
      </div>

      {/* Privacidad + visibilidad */}
      <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <span className="label-mp" style={{ color: v2tk.muted }}>PRIVACIDAD Y VISIBILIDAD</span>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, marginTop: 4, letterSpacing: '-0.02em' }}>Qué ven los demás</div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[
            { l: 'Perfil', v: 'Público', icon: 'globe' },
            { l: 'Disponibilidad para retos', v: 'Activada', icon: 'circle-check-big', on: true },
            { l: 'Mostrar historial de matches', v: 'Sí', icon: 'history', on: true },
            { l: 'Mostrar clubes', v: 'Sí', icon: 'building-2', on: true },
            { l: 'Mostrar amigos', v: 'Sólo amigos', icon: 'users' },
            { l: 'Notificaciones', v: 'Email + Push', icon: 'bell' },
          ].map((f, i) => (
            <div key={f.l} style={{ display: 'flex', alignItems: 'center', padding: '12px 4px', borderTop: i === 0 ? 0 : `1px solid ${v2tk.borderSoft}` }}>
              <HandoffIcon name={f.icon} size={14} color={v2tk.muted} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: v2tk.ink }}>{f.l}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: f.on ? v2tk.accent : v2tk.muted }}>{f.v}</span>
              <HandoffIcon name="chevron-right" size={14} color={v2tk.mutedSoft} style={{ marginLeft: 10 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BOARD — el shell completo. Renderiza hero, showcase, KPIs, tabs.
// ─────────────────────────────────────────────────────────────────────
function PerfilV2Board({ sub = 'plus', view = 'mine' }) {
  const [tab, setTab] = React.useState('actividad');
  const { isPlus } = v2Sub(sub);
  const isMine = view === 'mine';

  return (
    <div style={{
      width: '100%', minHeight: '100%', background: v2tk.bg, color: v2tk.ink,
      padding: 24, fontFamily: 'var(--font-sans)',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* Label de la vista (esquina) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: -8 }}>
        <ViewLabel kind={isMine ? 'mine' : 'public'} />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 9999,
          background: isPlus ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : v2tk.borderSoft,
          color: isPlus ? '#1a1300' : v2tk.muted,
          fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>
          {isPlus ? <><HandoffIcon name="crown" size={11} /> Camila tiene MP+</> : <>Camila es Free</>}
        </span>
      </div>

      <V2Hero sub={sub} view={view} />

      {/* H2H banner — sólo vista pública */}
      {!isMine && <V2H2HBanner />}

      <V2Showcase sub={sub} view={view} />

      <V2Tabs active={tab} setActive={setTab} isMine={isMine} />

      <div>
        {tab === 'actividad'    && <V2Activity sub={sub} />}
        {tab === 'stats'        && <V2Stats sub={sub} view={view} />}
        {tab === 'comunidad'    && <V2Community sub={sub} />}
        {tab === 'coleccion'    && <V2Collection />}
        {tab === 'preferencias' && <V2Preferences sub={sub} />}
      </div>
    </div>
  );
}

