// @ts-nocheck — port 1:1 del handoff V3; tipado fino en fase posterior.
"use client";

import React, { useEffect, useState } from "react";
import { HandoffIcon } from "./HandoffIcon";
import {
  loadShowcaseDismissedOwner,
  loadShowcaseDismissedView,
  saveShowcaseDismissedOwner,
  saveShowcaseDismissedView,
} from "@/lib/profile/showcase-pins";

import { v2tk, V2_PINS, V2_PERSONALIZATION, v2Sub } from "./PerfilV2Shared";
import { AvatarBlob, Sparkline, ViewLabel } from "./PerfilShared";
import { usePerfilV3Data } from "./PerfilV3Context";
import { useProfileV3Actions } from "./ProfileV3ActionsContext";
// PerfilV2 — perfil rediseñado · profile-first con sello MATCHPOINT.
// Props del board: { sub: 'free'|'plus', view: 'mine'|'public' }.
// 4 combinaciones renderizables: Free+mine, Plus+mine, Free+public, Plus+public.

// ─────────────────────────────────────────────────────────────────────
// HERO — cover personalizable + avatar overlap + identidad + acciones
// ─────────────────────────────────────────────────────────────────────
export function V2Hero({ sub, view }: { sub: 'free' | 'plus'; view: 'mine' | 'public' }) {
  const { isPlus } = v2Sub(sub);
  const me = usePerfilV3Data();
  const isMine = view === 'mine';
  const cover = isMine
    ? (v2tk.covers[V2_PERSONALIZATION.cover] ?? v2tk.covers.emerald)
    : v2tk.covers.emerald;
  const actions = useProfileV3Actions();
  const avatarInitials = `${me.first[0] ?? ""}${me.last[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 16, overflow: 'hidden' }}>
      {/* Cover */}
      <div style={{ position: 'relative', height: 220, background: cover.grad, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 78% 30%, ${cover.glow}, transparent 60%)` }} />
        {/* Watermark inicial gigante */}
        <div className="font-heading" style={{
          position: 'absolute', right: -32, bottom: -90,
          fontWeight: 900, fontSize: 360,
          color: 'rgba(255,255,255,0.04)', lineHeight: 0.85, letterSpacing: '-0.06em', pointerEvents: 'none',
        }}>{me.first[0]}</div>

        {/* Acciones de portada (personalización) — sólo en vista propia */}
        {isMine && (
          <div className="pv3-cover-actions" style={{ position: 'absolute', top: 18, right: 24, display: 'flex', gap: 8 }}>
            <button style={hCoverBtn}><HandoffIcon name="image" size={12} />Cambiar portada</button>
            {!isPlus && (
              <button style={{ ...hCoverBtn, background: 'rgba(212,161,58,0.16)', color: '#fcd34d', border: '1px solid rgba(212,161,58,0.4)' }}>
                <HandoffIcon name="sparkles" size={12} />Más con MP+
              </button>
            )}
          </div>
        )}
      </div>

      {/* Identidad — sobresale del cover */}
      <div className="pv3-stack-sm pv3-hero-identity" style={{ display: 'grid', gridTemplateColumns: '156px 1fr auto', alignItems: 'flex-end', gap: 24, padding: '0 28px 22px' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', marginTop: -70, paddingBottom: 4 }}>
          <div style={{
            width: 140, height: 140, borderRadius: '50%',
            background: me.avatarUrl ? `url(${me.avatarUrl}) center/cover no-repeat` : 'linear-gradient(135deg,#10b981,#047857)',
            border: '5px solid #fff', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 900, fontSize: 50, letterSpacing: '-0.04em',
          }} className="font-heading">
            {!me.avatarUrl ? avatarInitials : null}
          </div>
          {isMine && (
            <button type="button" onClick={actions.onAvatar} style={{
              position: 'absolute', bottom: 6, right: 2, width: 30, height: 30, borderRadius: '50%',
              background: v2tk.ink, color: '#fff', border: '3px solid #fff', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}><HandoffIcon name="pencil" size={13} /></button>
          )}
        </div>

        {/* Bloque nombre + chips + bio */}
        <div style={{ paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
            <h1 className="profile-v3-name">
              {me.name}<span style={{ color: v2tk.accent }}>.</span>
            </h1>
            <span className="profile-v3-handle">{me.handle}</span>
          </div>

          {/* Tagline */}
          {me.tagline ? (
            <div className="profile-v3-lead" style={{ color: v2tk.inkSoft, marginBottom: 12 }}>
              {me.tagline}
            </div>
          ) : null}

          {/* Meta (texto plano, sin pills) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8 }}>
            <span className="profile-v3-meta" style={metaItem}><HandoffIcon name="map-pin" size={13} color={v2tk.mutedSoft} />{me.city}, {me.country}</span>
            <span className="profile-v3-meta" style={metaItem}><HandoffIcon name="building-2" size={13} color={v2tk.mutedSoft} />{me.club}</span>
            <span className="profile-v3-meta" style={metaItem}><HandoffIcon name="calendar" size={13} color={v2tk.mutedSoft} />Activa desde {me.member}</span>
            {!isMine && (
              <span className="profile-v3-meta" style={metaItemAccent}>
                <HandoffIcon name="circle-check-big" size={13} color={v2tk.accent} />Acepta retos
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 240, paddingBottom: 4 }}>
          {isMine ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onEditBio}>
                <HandoffIcon name="palette" size={13} />
                Personalizar
              </button>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={actions.onShare}>
                <HandoffIcon name="share-2" size={13} />
                Compartir
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn-primary" onClick={actions.onChallenge}>
                <HandoffIcon name="swords" size={14} />
                Retar a match
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {actions.friendState === 'none' && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                    disabled={actions.actionPending}
                    onClick={actions.onFriend}
                  >
                    <HandoffIcon name="user-plus" size={13} />
                    Agregar
                  </button>
                )}
                {actions.friendState === 'pending' && (
                  <button type="button" className="btn btn-outline" style={{ flex: 1 }} disabled>
                    <HandoffIcon name="clock" size={13} />
                    Enviada
                  </button>
                )}
                {actions.friendState === 'friends' && (
                  <button type="button" className="btn btn-outline" style={{ flex: 1 }} disabled>
                    <HandoffIcon name="user-check" size={13} />
                    Amigos
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                  disabled={actions.actionPending}
                  onClick={actions.onMessage}
                >
                  <HandoffIcon name="message-square" size={13} />
                  Mensaje
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <V2HeroKpisStrip />
    </div>
  );
}

function V2HeroKpisStrip() {
  const me = usePerfilV3Data();
  const items = [
    {
      l: 'RATING MPR',
      v: me.rating.toFixed(2),
      d: me.ratingDelta !== 0 ? `${me.ratingDelta >= 0 ? '↑' : '↓'} ${Math.abs(me.ratingDelta).toFixed(2)}` : 'Oficial',
      accent: true,
      detailAccent: me.ratingDelta > 0,
    },
    {
      l: 'RANKING NACIONAL',
      v: me.ranking > 0 ? `#${me.ranking}` : '—',
      d: me.rankingDelta !== 0 ? `${me.rankingDelta >= 0 ? '↑' : '↓'} ${Math.abs(me.rankingDelta)} pos` : 'Pickleball',
      detailAccent: me.rankingDelta > 0,
    },
    {
      l: `PARTIDOS · ${new Date().getFullYear()}`,
      v: String(me.matches),
      d: `${me.wins}W · ${me.losses}L`,
      detailAccent: false,
    },
    {
      l: 'WIN RATE · 30D',
      v: me.matches > 0 ? `${me.winRate}%` : '—',
      d: me.matches > 0 ? 'Temporada actual' : 'Sin partidos aún',
      detailAccent: false,
    },
  ];

  return (
    <div
      style={{
        borderTop: `1px solid ${v2tk.borderSoft}`,
        background: v2tk.card,
        padding: '14px 28px 20px',
      }}
    >
      <div className="pv3-stack-sm pv3-kpi-strip mp-grid-form-4 gap-3">
        {items.map((it) => (
          <div
            key={it.l}
            style={{
              background: '#fff',
              border: `1px solid ${v2tk.borderSoft}`,
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div className="label-mp" style={{ color: v2tk.muted }}>{it.l}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <span
                className="tabular profile-v3-stat-value"
                style={{ color: it.accent ? v2tk.accent : v2tk.ink }}
              >
                {it.v}
              </span>
              <span
                className="profile-v3-body-sm"
                style={{ color: it.detailAccent ? v2tk.accent : v2tk.muted }}
              >
                {it.d}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const hCoverBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 9999,
  background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)',
  fontWeight: 800, fontSize: 11, cursor: 'pointer',
  backdropFilter: 'blur(8px)',
};
const metaItem = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  color: v2tk.muted,
};
const metaItemAccent = { ...metaItem, color: v2tk.accentDeep };
// ─────────────────────────────────────────────────────────────────────
// H2H BANNER — solo vista pública si MP+ owner & jugaron antes
// ─────────────────────────────────────────────────────────────────────
function h2hHeadline(h: { played: number; mineWins: number; theirWins: number }): string {
  if (h.mineWins > h.theirWins) return `${h.played} partidos · vas ganando`;
  if (h.mineWins < h.theirWins) return `${h.played} partidos · vas perdiendo`;
  return `${h.played} partidos · están empatados`;
}

export function V2H2HBanner() {
  const h = usePerfilV3Data().h2hViewer;
  const actions = useProfileV3Actions();
  if (h.played <= 0) return null;
  return (
    <div style={{
      background: 'linear-gradient(110deg, #0a0a0a 0%, #0e2018 100%)',
      borderRadius: 16, color: '#fff',
      padding: '20px 24px',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: v2tk.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#001a10' }}>
          <HandoffIcon name="swords" size={22} />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 10, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.55)' }}>YA JUGARON ENTRE USTEDES</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, marginTop: 2, letterSpacing: '-0.025em' }}>{h2hHeadline(h)}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, justifySelf: 'center' }}>
        <span className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 52, lineHeight: 1, color: '#fff', letterSpacing: '-0.04em' }}>{h.theirWins}</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 18, color: 'rgba(255,255,255,0.45)' }}>vs</span>
        <span className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 52, lineHeight: 1, color: v2tk.accent, letterSpacing: '-0.04em' }}>{h.mineWins}</span>
        <div style={{ marginLeft: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>
          Último: {h.last}<br />{h.lastDate}
        </div>
      </div>
      <button style={{
        padding: '12px 20px', borderRadius: 9999, border: 0,
        background: v2tk.accent, color: '#fff',
        fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
      }}
        onClick={actions.onChallenge}
      >
        <HandoffIcon name="swords" size={13} />
        Pedir revancha
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SHOWCASE — 3 pins curados por la jugadora (MP+) o upgrade banner (Free)
// ─────────────────────────────────────────────────────────────────────
export function V2Showcase({ sub, view }: { sub: 'free' | 'plus'; view: 'mine' | 'public' }) {
  const { isPlus } = v2Sub(sub);
  const isMine = view === 'mine';
  const me = usePerfilV3Data();
  const profileUserId = me.profileUserId;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!profileUserId) {
      setDismissed(false);
      return;
    }
    setDismissed(
      isMine ? loadShowcaseDismissedOwner(profileUserId) : loadShowcaseDismissedView(profileUserId),
    );
  }, [profileUserId, isMine]);

  const persistDismiss = (hidden: boolean) => {
    if (!profileUserId) return;
    if (isMine) saveShowcaseDismissedOwner(profileUserId, hidden);
    else saveShowcaseDismissedView(profileUserId, hidden);
    setDismissed(hidden);
  };

  if (!isPlus) return <V2ShowcaseLockedBanner isMine={isMine} />;

  if (dismissed) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 14px',
          borderRadius: 10,
          border: `1px dashed ${v2tk.border}`,
          background: v2tk.cardSoft,
        }}
      >
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700, color: v2tk.muted }}>
          {isMine ? 'Showcase oculto en tu perfil' : 'Showcase oculto'}
        </span>
        <button
          type="button"
          onClick={() => persistDismiss(false)}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: `1px solid ${v2tk.border}`,
            background: '#fff',
            color: v2tk.inkSoft,
            fontFamily: 'var(--font-sans)',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Mostrar de nuevo
        </button>
      </div>
    );
  }

  const dismissBtnStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 6,
    background: 'transparent',
    border: `1px solid ${v2tk.border}`,
    color: v2tk.muted,
    cursor: 'pointer',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="label-mp" style={{ color: v2tk.muted }}>DESTACADO POR {isMine ? 'TI' : me.first.toUpperCase()}</span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: v2tk.mutedSoft, letterSpacing: '0.12em' }}>· 3 pins</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isMine && (
            <button
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: 'transparent', border: `1px solid ${v2tk.border}`, color: v2tk.inkSoft, fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              <HandoffIcon name="pin" size={11} />Editar pins
            </button>
          )}
          <button
            type="button"
            aria-label="Ocultar showcase"
            title="Ocultar showcase"
            onClick={() => persistDismiss(true)}
            style={dismissBtnStyle}
          >
            <HandoffIcon name="x" size={14} />
          </button>
        </div>
      </div>
      <div className="mp-grid-form-3 gap-3">
        <PinMatch />
        <PinPartner />
        <PinBadge />
      </div>
    </div>
  );
}

function PinMatch() {
  const p = V2_PINS.match;
  return (
    <div style={{
      position: 'relative', background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14,
      padding: 18, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: p.tone, pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span className="label-mp" style={{ color: v2tk.accent }}>{p.kicker}</span>
          <HandoffIcon name="pin" size={13} color={v2tk.muted} style={{ transform: "rotate(35deg)" }} />
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.025em', color: v2tk.ink, marginBottom: 8 }}>
          {p.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 26, height: 26, borderRadius: 6, background: v2tk.accentSoft, color: v2tk.accentDeep, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 12 }}>W</span>
          <div style={{ fontSize: 13, fontWeight: 700, color: v2tk.ink }}>vs. {p.opp} · Nivel {p.oppLevel}</div>
        </div>
        <div className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 15, color: v2tk.inkSoft, letterSpacing: '-0.01em' }}>{p.score}</div>
        <div style={{ marginTop: 4, fontFamily: 'var(--font-sans)', fontSize: 11, color: v2tk.muted }}>{p.date} · {p.venue}</div>
        <div style={{ marginTop: 12, padding: '10px 12px', background: v2tk.cardSoft, borderRadius: 8, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13, color: v2tk.inkSoft, lineHeight: 1.4 }}>
          “{p.note}”
        </div>
      </div>
    </div>
  );
}

function PinPartner() {
  const p = V2_PINS.partner;
  return (
    <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span className="label-mp" style={{ color: v2tk.accent }}>{p.kicker}</span>
        <HandoffIcon name="pin" size={13} color={v2tk.muted} style={{ transform: "rotate(35deg)" }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <AvatarBlob size={56} tone={p.avTone} label={p.initials} ring="#fff" ringWidth={3} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, lineHeight: 1, letterSpacing: '-0.02em', color: v2tk.ink }}>{p.name}</div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: v2tk.muted, fontWeight: 600 }}>{p.matchesTogether} matches juntos · {p.winsTogether}W</div>
        </div>
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${v2tk.border}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 32, color: v2tk.accent, lineHeight: 1, letterSpacing: '-0.03em' }}>{p.pct}%</span>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 11, color: v2tk.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Win rate juntas</span>
      </div>
      <div style={{ marginTop: 12, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 12.5, color: v2tk.inkSoft, lineHeight: 1.4 }}>“{p.note}”</div>
    </div>
  );
}

function PinBadge() {
  const p = V2_PINS.badge;
  return (
    <div style={{
      position: 'relative', background: `linear-gradient(160deg, ${v2tk.goldSoft}, transparent 70%), ${v2tk.card}`,
      border: `1px solid ${v2tk.goldRing}`, borderRadius: 14, padding: 18, overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(125deg, transparent 35%, rgba(255,255,255,0.4) 50%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span className="label-mp" style={{ color: v2tk.gold }}>{p.kicker}</span>
          <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 9, letterSpacing: '0.22em', color: v2tk.gold, padding: '3px 8px', border: `1px solid ${v2tk.goldRing}`, borderRadius: 4 }}>
            {p.rarity.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, #f6dc8b, ${v2tk.gold} 60%, #8a6b1f)`,
            color: '#1a1300', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <HandoffIcon name={p.icon} size={26} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', textTransform: 'uppercase', color: v2tk.ink }}>{p.label}</div>
            <div style={{ marginTop: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, color: v2tk.muted, letterSpacing: '0.12em' }}>{p.when.toUpperCase()}</div>
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13, color: v2tk.inkSoft, lineHeight: 1.4 }}>“{p.note}”</div>
      </div>
    </div>
  );
}

function V2ShowcaseLockedBanner({ isMine }) {
  // Free — no puede personalizar pins. CTA distinto en propia vs pública.
  return (
    <div style={{
      position: 'relative',
      background: `linear-gradient(110deg, ${v2tk.cardSoft} 0%, ${v2tk.goldSoft} 100%)`,
      border: `1px dashed ${v2tk.goldRing}`, borderRadius: 14, padding: '18px 22px',
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 20, alignItems: 'center',
    }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg,#fbbf24,#d4a13a)', color: '#1a1300', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <HandoffIcon name="pin" size={22} />
      </div>
      <div>
        <span className="label-mp" style={{ color: v2tk.gold }}>{isMine ? 'PERSONALIZA TU SHOWCASE' : 'SIN PINS DESTACADOS'}</span>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 19, marginTop: 4, letterSpacing: '-0.02em', color: v2tk.ink }}>
          {isMine
            ? 'Elige 3 momentos para destacar arriba'
            : `${usePerfilV3Data().first} aún no destaca pins en su perfil`}
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: v2tk.muted, lineHeight: 1.45, maxWidth: 600 }}>
          {isMine
            ? 'Tu mejor match, tu compañera de cancha, tu insignia más rara — lo que tú elijas. Disponible con MP+.'
            : 'Los miembros MP+ pueden destacar 3 momentos en su perfil. Suscríbete para personalizar el tuyo.'}
        </div>
      </div>
      {isMine && (
        <button style={{
          padding: '11px 18px', borderRadius: 9999, border: 0,
          background: v2tk.ink, color: '#fff',
          fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
          <HandoffIcon name="sparkles" size={13} />Probar MP+ 14 días gratis
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// KPIs — 4 stats básicas visibles para todos
// ─────────────────────────────────────────────────────────────────────
/** @deprecated KPIs viven dentro de V2Hero; se mantiene por PerfilV2Sections legacy. */
export function V2KPIs() {
  return <V2HeroKpisStrip />;
}

// ─────────────────────────────────────────────────────────────────────
// TABS NAV
// ─────────────────────────────────────────────────────────────────────
function V2Tabs({ active, setActive, isMine }) {
  const tabs = [
    { k: 'actividad', label: 'Actividad', icon: 'history', count: 47 },
    { k: 'stats',     label: 'Estadísticas', icon: 'bar-chart-3' },
    { k: 'comunidad', label: 'Comunidad', icon: 'users', count: 23 },
    { k: 'coleccion', label: 'Colección', icon: 'award', count: '5/8' },
    ...(isMine ? [{ k: 'preferencias', label: 'Preferencias', icon: 'settings-2' }] : []),
  ];
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${v2tk.border}` }}>
      {tabs.map(t => {
        const on = active === t.k;
        return (
          <button key={t.k} type="button" className="profile-v3-tab" aria-selected={on} onClick={() => setActive(t.k)} style={{
            border: 0, background: 'transparent', padding: '14px 18px',
            borderBottom: on ? `2px solid ${v2tk.accent}` : '2px solid transparent',
            color: on ? v2tk.ink : v2tk.muted,
            fontSize: 12,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: -1,
          }}>
            <HandoffIcon name={t.icon} size={13} />
            {t.label}
            {t.count != null && <span style={{ padding: '1px 7px', borderRadius: 9999, background: on ? v2tk.accentSoft : v2tk.borderSoft, color: on ? v2tk.accentDeep : v2tk.muted, fontSize: 10 }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ACTIVIDAD — match history narrativo, no tabla seca
// ─────────────────────────────────────────────────────────────────────
function V2Activity({ sub }) {
  const ms = usePerfilV3Data().recentMatches;
  return (
    <div className="mp-grid-split-wide gap-4">
      <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '4px 22px 18px' }}>
        {ms.map((m, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 16, alignItems: 'flex-start',
            padding: '18px 0', borderTop: i === 0 ? 0 : `1px solid ${v2tk.borderSoft}`,
          }}>
            {/* Result chip */}
            <span style={{
              width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: m.result === 'W' ? v2tk.accentSoft : 'rgba(220,38,38,0.1)',
              color: m.result === 'W' ? v2tk.accent : v2tk.hot,
              fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 13,
            }}>{m.result}</span>
            {/* Story */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 17, letterSpacing: '-0.02em', color: v2tk.ink }}>
                  vs. {m.opp}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 9999, background: v2tk.borderSoft, color: v2tk.muted, letterSpacing: '0.06em' }}>NIVEL {m.oppLevel}</span>
                <span className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 13.5, color: v2tk.inkSoft, marginLeft: 'auto' }}>{m.score}</span>
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: v2tk.muted, fontWeight: 600 }}>
                <HandoffIcon name="calendar" size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />
                {m.date} ·
                <HandoffIcon name="map-pin" size={11} style={{ verticalAlign: "-1px", marginLeft: 8, marginRight: 4 }} />
                {m.venue}
              </div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 13, color: v2tk.inkSoft, lineHeight: 1.4, maxWidth: 540 }}>
                {m.result === 'W' ? 'Cerró el match con un drop limpio sobre el lado abierto.' : 'Cedió en el desempate; cuatro saques largos en el momento clave.'}
              </div>
            </div>
            {/* Delta */}
            <div style={{ textAlign: 'right' }}>
              <div className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, color: m.delta.startsWith('+') ? v2tk.accent : v2tk.hot }}>{m.delta}</div>
              <div style={{ fontSize: 10, color: v2tk.muted, fontWeight: 700, letterSpacing: '0.1em', marginTop: 2 }}>DUPR</div>
            </div>
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${v2tk.borderSoft}`, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: v2tk.muted, fontWeight: 700 }}>Mostrando 5 de {usePerfilV3Data().matches}</span>
          <button style={{ background: 'transparent', border: `1px solid ${v2tk.border}`, padding: '8px 14px', borderRadius: 9999, fontFamily: 'var(--font-sans)', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: v2tk.ink, cursor: 'pointer' }}>
            Ver historial completo
          </button>
        </div>
      </div>

      {/* Side — próximos partidos */}
      <div style={{ background: v2tk.card, border: `1px solid ${v2tk.border}`, borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <span className="label-mp" style={{ color: v2tk.muted }}>PRÓXIMOS</span>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, marginTop: 4, letterSpacing: '-0.02em' }}>Agendados</div>
          </div>
          <HandoffIcon name="calendar-check" size={18} color={v2tk.muted } />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {usePerfilV3Data().upcoming.map((u, i) => (
            <div key={i} style={{
              display: 'flex', gap: 12, alignItems: 'center',
              padding: '12px 14px', borderRadius: 10,
              background: i === 0 ? v2tk.accentSoft : v2tk.cardSoft,
              border: `1px solid ${i === 0 ? v2tk.accentRing : v2tk.borderSoft}`,
            }}>
              <div style={{ width: 42, textAlign: 'center' }}>
                <div className="tabular" style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 18, lineHeight: 1 }}>{u.date.split(' ')[1]}</div>
                <div style={{ fontWeight: 900, fontSize: 9.5, color: v2tk.muted, letterSpacing: '0.16em', marginTop: 2 }}>{u.date.split(' ')[0].toUpperCase()}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: v2tk.ink }}>vs. {u.opp}</div>
                <div style={{ fontSize: 11, color: v2tk.muted, marginTop: 2 }}>{u.club} · {u.type}</div>
              </div>
              <HandoffIcon name="chevron-right" size={14} color={v2tk.mutedSoft } />
            </div>
          ))}
        </div>
        {/* Estado de "open to play" */}
        <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: v2tk.cardSoft, border: `1px solid ${v2tk.borderSoft}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: v2tk.accent, boxShadow: `0 0 0 3px ${v2tk.accentSoft}` }} />
            <span className="label-mp" style={{ color: v2tk.accentDeep }}>DISPONIBLE PARA JUGAR</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: v2tk.ink }}>Sáb-Dom · mañanas</div>
          <div style={{ fontSize: 11.5, color: v2tk.muted, marginTop: 2 }}>Acepta retos de 3.5 a 4.5 · pickleball</div>
        </div>
      </div>
    </div>
  );
}

