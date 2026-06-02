// @ts-nocheck
"use client";

import React from "react";
import { HandoffIcon } from "./HandoffIcon";

// Datos extra y tokens para PerfilV2 (showcase pin, MP+ stats, personalización).
// Se monta sobre usePerfilV3Data() — extiende sin sustituir.

const V2_W = 1240;

// Tokens locales — apuntan a variables del design system (globals.css).
const v2tk = {
  bg: 'var(--bg)',
  card: 'var(--card)',
  cardSoft: 'var(--muted)',
  border: 'var(--border)',
  borderSoft: 'var(--border-subtle)',
  ink: 'var(--fg)',
  inkSoft: '#262626',
  muted: 'var(--muted-fg)',
  mutedSoft: '#a3a3a3',
  accent: 'var(--primary)',
  accentDeep: 'var(--primary-active)',
  accentSoft: 'var(--primary-glow)',
  accentRing: 'rgba(16,185,129,0.28)',
  gold: 'var(--warning-fg)',
  goldSoft: 'var(--warning-bg)',
  goldRing: 'rgba(212,161,58,0.45)',
  hot: 'var(--destructive-fg)',
  amber: '#f59e0b',
  // Cover gradients — paleta curada (free obtiene 4, MP+ todas)
  covers: {
    emerald:  { name: 'Emerald · Forest', grad: 'linear-gradient(135deg, #064e3b 0%, #0a0a0a 55%, #022c22 100%)', glow: 'rgba(16,185,129,0.32)', free: true },
    night:    { name: 'Midnight Court',   grad: 'linear-gradient(135deg, #0a0a0a 0%, #18181b 100%)',             glow: 'rgba(16,185,129,0.18)', free: true },
    clay:     { name: 'Clay Sunset',      grad: 'linear-gradient(135deg, #7c2d12 0%, #431407 100%)',             glow: 'rgba(251,146,60,0.28)', free: true },
    ocean:    { name: 'Ocean Indoor',     grad: 'linear-gradient(135deg, #1e3a8a 0%, #0c1a3a 100%)',             glow: 'rgba(99,102,241,0.28)', free: true },
    holo:     { name: 'Holo VIP',         grad: 'linear-gradient(135deg, #d4a13a 0%, #1a1300 50%, #d4a13a 100%)', glow: 'rgba(212,161,58,0.35)', free: false },
    aurora:   { name: 'Aurora',           grad: 'linear-gradient(135deg, #ec4899 0%, #1e1b4b 60%, #06b6d4 100%)', glow: 'rgba(236,72,153,0.28)',  free: false },
  },
};

// Showcase pinneable — MP+ usuarios pueden elegir qué destacar.
// Camila eligió: su mejor match, su compañera más sólida, y su insignia más rara.
const V2_PINS = {
  match: {
    kicker: 'MATCH MEMORABLE',
    title: 'La revancha contra Mateo',
    date: 'Vie 02 may',
    opp: 'Mateo Vélez',
    oppLevel: '4.5',
    score: '11-7, 9-11, 11-9',
    delta: '+0.08',
    venue: 'Cumbayá · Cancha 3',
    note: 'Tras perder dos seguidas, cerró el tercer set con un drop perfecto.',
    tone: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.04))',
  },
  partner: {
    kicker: 'COMPAÑERA FIJA',
    name: 'Andrea Pinto',
    initials: 'AP',
    avTone: 'linear-gradient(135deg,#7c3aed,#db2777)',
    matchesTogether: 12,
    winsTogether: 9,
    pct: 75,
    note: 'Dúo más sólido de la temporada. Sincronía total en remate-defensa.',
  },
  badge: {
    kicker: 'INSIGNIA TOP',
    label: 'Top 50',
    icon: 'trophy',
    rarity: 'Rara',
    when: 'Abr 2025',
    note: 'Entró al Top 50 nacional tras 5 wins consecutivos.',
  },
};

// Stats avanzadas — MP+ only
const V2_ADVANCED = {
  // Por tipo de juego
  bySplit: {
    singles:  { matches: 15, wins: 8,  pct: 53 },
    doubles:  { matches: 32, wins: 22, pct: 69 },
  },
  // Por superficie
  bySurface: {
    outdoor: { matches: 28, wins: 19, pct: 68 },
    indoor:  { matches: 19, wins: 11, pct: 58 },
  },
  // Por nivel del rival
  byOppLevel: [
    { lvl: '3.0',   matches: 6,  wins: 6,  pct: 100 },
    { lvl: '3.5',   matches: 18, wins: 13, pct: 72 },
    { lvl: '4.0',   matches: 15, wins: 8,  pct: 53 },
    { lvl: '4.5+',  matches: 8,  wins: 3,  pct: 38 },
  ],
  durations: { avg: '42 min', median: '38 min', longest: '1h 18 min' },
  // % win por tipo de golpe (Coach AI)
  byShot: [
    { shot: 'Saque',         pct: 72, vol: 'alto' },
    { shot: 'Volea',         pct: 68, vol: 'medio' },
    { shot: 'Drop',          pct: 81, vol: 'alto' },
    { shot: 'Drive',         pct: 54, vol: 'alto' },
    { shot: 'Defensa',       pct: 49, vol: 'medio' },
    { shot: 'Tercer golpe',  pct: 63, vol: 'medio' },
  ],
  // racha histórica máxima
  bestStreak: { type: 'W', count: 7, when: 'Mar 2025' },
};

// Sub-states del perfil — combinaciones a renderizar
function v2Sub(sub) {
  return { isPlus: sub === 'plus', isFree: sub === 'free' };
}

// Personalización actual (lo que Camila eligió)
const V2_PERSONALIZATION = {
  cover: 'emerald',
  accentTone: 'emerald',   // futuro: paleta de acentos
  tagline: 'Backhand cruzado y muchas ganas.',  // se muestra debajo del nombre como tagline corto
  bio: 'Disponible fines de semana en la mañana. Prefiere dobles. Acepta retos de 3.5 a 4.5.',
  showcasePins: ['match', 'partner', 'badge'],
};


export { V2_W, v2tk, V2_PINS, V2_ADVANCED, V2_PERSONALIZATION, v2Sub };
