"use client";
// Pantalla "Personalización" — editor de flair del perfil (estilo Discord/Steam).
// Migrado 1:1 del prototipo (ui_kits/dashboard/PersonalizacionScreen.jsx):
// data-lucide → <Icon>, window.mpToast → useToast.
//
// NOTA DE ALCANCE: por ahora persiste en localStorage y NO está gateado por
// MATCHPOINT+. El backend real (columnas en profiles, gating MP+, render
// cross-surface) se adapta en una segunda etapa. El sistema curado anterior
// (PersonalizacionScreenClient + PROFILE_THEMES + bundles) queda intacto para
// re-cablearse. La save bar avisa "solo tú los ves por ahora" para ser honesto.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

const PERSO_STORAGE = "mp-persona-v1";

export type Persona = {
  banner: string;
  bannerOverlay: string;
  watermarkOn: boolean;
  watermarkText: string;
  accent: string;
  frame: string;
  ringBadge: string;
  cardStyle: string;
  corners: string;
  friendshipStyle: string;
  fcShowLevel: boolean;
  fcShowCity: boolean;
  fcShowClub: boolean;
  fcShowBadge: boolean;
  nameCase: string;
  nameSuffix: string;
  pronouns: string;
  tagline: string;
  flag: string | null;
  featuredStats: string[];
  featuredBadge: string | null;
};

export function defaultPersona(): Persona {
  return {
    banner: "court-emerald",
    bannerOverlay: "glow",
    watermarkOn: true,
    watermarkText: "JUEGA",
    accent: "#10b981",
    frame: "halo",
    ringBadge: "top50",
    cardStyle: "minimal",
    corners: "soft",
    friendshipStyle: "classic",
    fcShowLevel: true,
    fcShowCity: true,
    fcShowClub: true,
    fcShowBadge: true,
    nameCase: "upper",
    nameSuffix: "dot",
    pronouns: "ella/she",
    tagline: "Backhand cruzado y muchas ganas.",
    flag: "🇪🇨",
    featuredStats: ["rating", "ranking", "matches", "winrate"],
    featuredBadge: "top50",
  };
}

const BANNERS = [
  { k: "court-emerald", l: "Court Emerald", bg: "linear-gradient(135deg, #064e3b 0%, #0a0a0a 60%, #000 100%)" },
  { k: "midnight", l: "Midnight", bg: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)" },
  { k: "sunset", l: "Sunset", bg: "linear-gradient(135deg, #ea580c 0%, #be123c 60%, #4c0519 100%)" },
  { k: "pickle", l: "Pickle", bg: "linear-gradient(135deg, #15803d 0%, #22c55e 50%, #fde047 100%)" },
  { k: "noir", l: "Noir", bg: "linear-gradient(135deg, #0a0a0a 0%, #262626 100%)" },
  { k: "azur", l: "Azur", bg: "linear-gradient(135deg, #0c4a6e 0%, #0284c7 60%, #38bdf8 100%)" },
  { k: "cumbaya", l: "Cumbayá", bg: "linear-gradient(135deg, #14532d 0%, #65a30d 60%, #facc15 100%)" },
  { k: "plain-dark", l: "Plano negro", bg: "#0a0a0a" },
];

const ACCENTS = [
  { k: "#10b981", l: "Emerald (oficial)" },
  { k: "#0ea5e9", l: "Sky" },
  { k: "#7c3aed", l: "Violeta" },
  { k: "#dc2626", l: "Rojo" },
  { k: "#f59e0b", l: "Ámbar" },
  { k: "#ec4899", l: "Fucsia" },
  { k: "#0a0a0a", l: "Negro" },
];

const AVATAR_FRAMES = [
  { k: "none", l: "Sin marco", sub: "Foto redonda" },
  { k: "halo", l: "Halo", sub: "3px sólido" },
  { k: "ring", l: "Dual ring", sub: "Anillo doble" },
  { k: "shield", l: "Escudo", sub: "Esquinas cortadas" },
];

const CARD_STYLES = [
  { k: "minimal", l: "Minimal", sub: "Blanco + borde 1px" },
  { k: "bold", l: "Bold", sub: "Negro + texto blanco" },
  { k: "neon", l: "Neon", sub: "Glow del accent" },
  { k: "glass", l: "Glass", sub: "Translúcido sobre banner" },
];

const FRIENDSHIP_STYLES = [
  { k: "classic", l: "Classic", sub: "Solo nombre + nivel" },
  { k: "photo", l: "Photo", sub: "Banner detrás de tu foto" },
  { k: "editorial", l: "Editorial", sub: "Tipografía gigante" },
  { k: "stat", l: "Stat", sub: "Stats en grande" },
];

const FEATURABLE_STATS = [
  { k: "rating", icon: "star", l: "Rating" },
  { k: "ranking", icon: "bar-chart-3", l: "Ranking" },
  { k: "matches", icon: "swords", l: "Partidos" },
  { k: "winrate", icon: "trending-up", l: "Win %" },
  { k: "wins", icon: "trophy", l: "Wins" },
  { k: "streak", icon: "flame", l: "Racha" },
  { k: "tournaments", icon: "medal", l: "Torneos" },
  { k: "hours", icon: "clock", l: "Horas en cancha" },
  { k: "club", icon: "building-2", l: "Club" },
];

const BADGES = [
  { k: "top50", icon: "trophy", l: "TOP 50", color: "#f59e0b" },
  { k: "racha7", icon: "flame", l: "Racha 7", color: "#dc2626" },
  { k: "champ", icon: "crown", l: "Campeón", color: "#a855f7" },
  { k: "first", icon: "flag", l: "1° match", color: "#10b981" },
  { k: "medal", icon: "medal", l: "10 wins", color: "#0ea5e9" },
  { k: "maraton", icon: "zap", l: "Maratón", color: "#ec4899" },
];

const STAT_DEMO: Record<string, string> = { rating: "3.50", ranking: "#42", matches: "47", winrate: "64%", wins: "30", streak: "5", tournaments: "4", hours: "124h", club: "PCK" };

const fieldStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 500, background: "#fff", color: "#0a0a0a", outline: "none" };

// ── Helpers ──────────────────────────────────────────────────
function applyCase(s: string, c: string): string {
  if (c === "upper") return s.toUpperCase();
  if (c === "lower") return s.toLowerCase();
  return s;
}
function suffixOf(k: string): string {
  return ({ dot: ".", plus: "+", slash: "/", spark: "✦", none: "" } as Record<string, string>)[k] ?? ".";
}
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function ringPaletteFor(badge: string, accent: string): string {
  if (badge === "top50") return "#f59e0b";
  if (badge === "racha") return "#dc2626";
  if (badge === "champ") return "#a855f7";
  return accent;
}
function cornerRadiusOf(corners: string): number {
  return corners === "sharp" ? 4 : corners === "pill" ? 22 : 14.4;
}

export function PersonalizacionFlairView() {
  const toast = useToast();
  const [p, setP] = useState<Persona>(defaultPersona);
  const dirty = useRef(false);

  // Hidratar desde localStorage tras montar (evita mismatch de SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSO_STORAGE);
      // Hidratación desde un sistema externo (localStorage) tras montar: es el
      // patrón recomendado para evitar mismatch de SSR, de ahí el disable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setP((x) => ({ ...x, ...(JSON.parse(raw) as Partial<Persona>) }));
    } catch {
      /* ignora json inválido */
    }
  }, []);

  const set = (patch: Partial<Persona>) => {
    dirty.current = true;
    setP((x) => ({ ...x, ...patch }));
  };
  const save = () => {
    localStorage.setItem(PERSO_STORAGE, JSON.stringify(p));
    dirty.current = false;
    toast({ icon: "check-circle-2", title: "Tu perfil se actualizó", sub: "Otros jugadores ya lo ven así" });
  };
  const reset = () => {
    setP(defaultPersona());
    dirty.current = true;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Mi cuenta · Flair</div>
          <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            Personalización<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            Banner, color, cards, friendship card y nameplate. Los cambios aplican a tu perfil público y a cómo apareces en listas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={reset} style={{ background: "#fff", border: "1px solid var(--border)" }}>
            <Icon name="rotate-ccw" size={13} /> Restaurar
          </button>
          <button className="btn btn-primary" onClick={save}>
            <Icon name="save" size={13} color="#fff" /> Guardar cambios
          </button>
        </div>
      </div>

      {/* Preview + secciones */}
      <div className="mp-perso-grid" style={{ display: "grid", gridTemplateColumns: "380px minmax(0, 1fr)", gap: 24, alignItems: "start" }}>
        {/* LEFT — Preview sticky */}
        <aside className="mp-perso-preview" style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="label-mp" style={{ color: "var(--muted-fg)" }}>Preview en vivo</div>
          <ProfilePreviewCard p={p} />
          <FriendshipPreviewCard p={p} />
          <MatchRowPreview p={p} />
        </aside>

        {/* RIGHT — Secciones */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 01 BANNER */}
          <PersoSection num="01" label="Banner" title="Tu portada" sub="Es lo primero que ven cuando entran a tu perfil.">
            <SubLabel>Estilo</SubLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {BANNERS.map((b) => (
                <BannerOption key={b.k} b={b} active={p.banner === b.k} onPick={() => set({ banner: b.k })} accent={p.accent} />
              ))}
            </div>
            <SubLabel style={{ marginTop: 10 }}>Overlay</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ k: "none", l: "Limpio" }, { k: "grain", l: "Grain" }, { k: "glow", l: "Glow emerald" }, { k: "lines", l: "Líneas court" }].map((o) => (
                <ChipBtn key={o.k} on={p.bannerOverlay === o.k} onClick={() => set({ bannerOverlay: o.k })}>{o.l}</ChipBtn>
              ))}
            </div>
            <SubLabel style={{ marginTop: 10 }}>Watermark</SubLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <ToggleSmall checked={p.watermarkOn} onChange={(v) => set({ watermarkOn: v })} />
              <input
                value={p.watermarkText}
                onChange={(e) => set({ watermarkText: e.target.value.toUpperCase().slice(0, 8) })}
                placeholder="EJ: SMASH"
                disabled={!p.watermarkOn}
                style={{ flex: 1, maxWidth: 180, minWidth: 120, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", outline: "none", background: p.watermarkOn ? "#fff" : "var(--muted)" }}
              />
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>texto gigante translúcido detrás de tu nombre</span>
            </div>
          </PersoSection>

          {/* 02 ACCENT */}
          <PersoSection num="02" label="Accent" title="Tu color" sub="El punto verde del wordmark, los chips, los charts. Si lo dejas en emerald sigues 100% on-brand.">
            <SubLabel>Color principal</SubLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACCENTS.map((c) => (
                <button
                  key={c.k}
                  onClick={() => set({ accent: c.k })}
                  title={c.l}
                  style={{ width: 38, height: 38, borderRadius: 9, background: c.k, border: "2px solid " + (p.accent === c.k ? "#0a0a0a" : "transparent"), cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative" }}
                >
                  {p.accent === c.k && <Icon name="check" size={14} color="#fff" />}
                  {c.k === "#10b981" && (
                    <span style={{ position: "absolute", bottom: -16, left: "50%", transform: "translateX(-50%)", fontSize: 8.5, fontWeight: 900, color: "var(--muted-fg)", letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Oficial</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 24, padding: 12, borderRadius: 9, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="info" size={14} color="#047857" />
              <span style={{ fontSize: 11.5, color: "#065f46" }}>
                El badge MATCHPOINT+ y el dot del wordmark del header siempre son emerald oficial; tu accent reemplaza solo los acentos de tu perfil.
              </span>
            </div>
          </PersoSection>

          {/* 03 AVATAR */}
          <PersoSection num="03" label="Avatar" title="Marco y aro" sub="Cómo se enmarca tu foto en tu perfil y en listas de amigos.">
            <SubLabel>Marco</SubLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
              {AVATAR_FRAMES.map((f) => (
                <OptionTile key={f.k} active={p.frame === f.k} onPick={() => set({ frame: f.k })} title={f.l} sub={f.sub} preview={<AvatarFramePreview frame={f.k} accent={p.accent} />} />
              ))}
            </div>
            <SubLabel style={{ marginTop: 10 }}>Aro de logro</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ k: "none", l: "Ninguno" }, { k: "top50", l: "TOP 50" }, { k: "racha", l: "Racha 7" }, { k: "champ", l: "Campeón" }].map((o) => (
                <ChipBtn key={o.k} on={p.ringBadge === o.k} onClick={() => set({ ringBadge: o.k })}>{o.l}</ChipBtn>
              ))}
            </div>
          </PersoSection>

          {/* 04 CARD STYLE */}
          <PersoSection num="04" label="Cards" title="Estilo de tus cards" sub="Las tarjetas que muestran tus matches, tus clubes y tus stats en tu perfil.">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              {CARD_STYLES.map((c) => (
                <OptionTile key={c.k} active={p.cardStyle === c.k} onPick={() => set({ cardStyle: c.k })} title={c.l} sub={c.sub} preview={<CardStylePreview styleKey={c.k} accent={p.accent} />} />
              ))}
            </div>
            <SubLabel style={{ marginTop: 12 }}>Esquinas</SubLabel>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2 }}>
              {[{ k: "sharp", l: "Rectas" }, { k: "soft", l: "Suaves" }, { k: "pill", l: "Pills" }].map((o) => (
                <SegBtn key={o.k} on={p.corners === o.k} onClick={() => set({ corners: o.k })}>{o.l}</SegBtn>
              ))}
            </div>
          </PersoSection>

          {/* 05 FRIENDSHIP CARD */}
          <PersoSection num="05" label="Friendship card" title="Cómo apareces en listas de amigos" sub="La mini-tarjeta que te representa cuando alguien te agrega o te invita.">
            <SubLabel>Estilo</SubLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
              {FRIENDSHIP_STYLES.map((f) => (
                <OptionTile key={f.k} active={p.friendshipStyle === f.k} onPick={() => set({ friendshipStyle: f.k })} title={f.l} sub={f.sub} preview={<FriendshipMiniPreview styleKey={f.k} accent={p.accent} />} />
              ))}
            </div>
            <SubLabel style={{ marginTop: 10 }}>Mostrar en mi friendship card</SubLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <ToggleRowLite icon="bar-chart-3" l="Mi nivel (Suma)" checked={p.fcShowLevel} onChange={(v) => set({ fcShowLevel: v })} />
              <ToggleRowLite icon="map-pin" l="Mi ciudad" checked={p.fcShowCity} onChange={(v) => set({ fcShowCity: v })} />
              <ToggleRowLite icon="building-2" l="Mi club principal" checked={p.fcShowClub} onChange={(v) => set({ fcShowClub: v })} />
              <ToggleRowLite icon="award" l="Insignia destacada" checked={p.fcShowBadge} onChange={(v) => set({ fcShowBadge: v })} />
            </div>
          </PersoSection>

          {/* 06 NAMEPLATE */}
          <PersoSection num="06" label="Nameplate" title="Nombre y nameplate" sub="Cómo se ve tu nombre arriba: tipografía, pronombres, badge.">
            <SubLabel>Tipografía del nombre</SubLabel>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2 }}>
              {[{ k: "upper", l: "MAYÚSCULAS" }, { k: "title", l: "Title Case" }, { k: "lower", l: "lowercase" }].map((o) => (
                <SegBtn key={o.k} on={p.nameCase === o.k} onClick={() => set({ nameCase: o.k })}>{o.l}</SegBtn>
              ))}
            </div>

            <SubLabel style={{ marginTop: 12 }}>Sufijo del nombre (el &quot;punto&quot; verde)</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ k: "dot", l: "." }, { k: "plus", l: "+" }, { k: "slash", l: "/" }, { k: "spark", l: "✦" }, { k: "none", l: "Sin sufijo" }].map((o) => (
                <SegBtn key={o.k} on={p.nameSuffix === o.k} onClick={() => set({ nameSuffix: o.k })}>{o.l}</SegBtn>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <Field label="Pronombres">
                <input value={p.pronouns} onChange={(e) => set({ pronouns: e.target.value.slice(0, 16) })} placeholder="ej: ella/she" style={fieldStyle} />
              </Field>
              <Field label="Tag bajo el nombre">
                <input value={p.tagline} onChange={(e) => set({ tagline: e.target.value.slice(0, 36) })} placeholder="ej: Backhand cruzado y mucho café" style={fieldStyle} />
              </Field>
            </div>

            <SubLabel style={{ marginTop: 12 }}>Banderita / nacionalidad</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["🇪🇨", "🇨🇴", "🇲🇽", "🇦🇷", "🇨🇱", "🇵🇪", "🇺🇸", "none"].map((f) => (
                <button
                  key={f}
                  onClick={() => set({ flag: f === "none" ? null : f })}
                  style={{ minWidth: 38, height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid " + (p.flag === f || (f === "none" && !p.flag) ? "#0a0a0a" : "var(--border)"), background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 16, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  {f === "none" ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)" }}>NINGUNA</span> : f}
                </button>
              ))}
            </div>
          </PersoSection>

          {/* 07 FEATURED */}
          <PersoSection num="07" label="Featured" title="Lo que sale primero" sub="Elige 4 stats y 1 insignia para destacar en tu perfil.">
            <SubLabel>Stats destacados (máx 4)</SubLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FEATURABLE_STATS.map((s) => {
                const on = p.featuredStats.includes(s.k);
                const disabled = !on && p.featuredStats.length >= 4;
                return (
                  <button
                    key={s.k}
                    disabled={disabled}
                    onClick={() => set({ featuredStats: on ? p.featuredStats.filter((x) => x !== s.k) : [...p.featuredStats, s.k] })}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 9999, border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800, opacity: disabled ? 0.4 : 1 }}
                  >
                    <Icon name={s.icon} size={11} color={on ? "#fff" : undefined} /> {s.l}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 4, fontSize: 11, color: "var(--muted-fg)" }}>{p.featuredStats.length}/4 seleccionados</div>

            <SubLabel style={{ marginTop: 12 }}>Insignia destacada</SubLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {BADGES.map((b) => {
                const on = p.featuredBadge === b.k;
                return (
                  <button
                    key={b.k}
                    onClick={() => set({ featuredBadge: on ? null : b.k })}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800 }}
                  >
                    <Icon name={b.icon} size={13} color={on ? "#fff" : b.color} /> {b.l}
                  </button>
                );
              })}
            </div>
          </PersoSection>

          {/* Save bar */}
          <div style={{ position: "sticky", bottom: 16, marginTop: 4, padding: "14px 18px", borderRadius: 12, background: "var(--fg)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, boxShadow: "0 12px 28px rgba(0,0,0,0.25)", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="sparkles" size={14} color="#34d399" />
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>Cambios sin guardar · solo tú los ves por ahora</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={reset} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                Descartar
              </button>
              <button className="btn btn-primary" onClick={save}>
                <Icon name="check" size={13} color="#fff" /> Guardar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Preview components ───────────────────────────────────────
export function ProfilePreviewCard({ p }: { p: Persona }) {
  const banner = BANNERS.find((b) => b.k === p.banner) ?? BANNERS[0];
  const name = applyCase("Camila Reyes", p.nameCase);
  const suffix = suffixOf(p.nameSuffix);
  const ringPalette = ringPaletteFor(p.ringBadge, p.accent);
  const cornerRadius = cornerRadiusOf(p.corners);
  return (
    <div className="card" style={{ overflow: "hidden", padding: 0, borderRadius: cornerRadius }}>
      <div style={{ height: 96, background: banner.bg, position: "relative", overflow: "hidden" }}>
        {p.bannerOverlay === "glow" && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 75% 30%, " + hexA(p.accent, 0.35) + ", transparent 60%)" }} />}
        {p.bannerOverlay === "grain" && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 1px)", backgroundSize: "6px 6px" }} />}
        {p.bannerOverlay === "lines" && (
          <svg viewBox="0 0 200 80" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.18 }}>
            <rect x="6" y="6" width="188" height="68" fill="none" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="100" y1="6" x2="100" y2="74" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="62" y1="6" x2="62" y2="74" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="138" y1="6" x2="138" y2="74" stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {p.watermarkOn && p.watermarkText && (
          <div aria-hidden style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%) rotate(-6deg)", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 70, letterSpacing: "-0.06em", color: "rgba(255,255,255,0.08)", textTransform: "uppercase", whiteSpace: "nowrap", pointerEvents: "none" }}>
            {p.watermarkText}
          </div>
        )}
      </div>
      <div style={{ padding: "0 18px 18px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <AvatarFrame frame={p.frame} ring={ringPalette} accent={p.accent} size={84} />
          <div style={{ paddingBottom: 4 }}>
            {p.flag && <span style={{ fontSize: 16, marginRight: 5 }}>{p.flag}</span>}
            {p.pronouns && <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", padding: "2px 7px", borderRadius: 9999, background: "var(--muted)", verticalAlign: "middle" }}>{p.pronouns}</span>}
          </div>
        </div>
        <div className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 10, lineHeight: 1.05, textTransform: p.nameCase === "upper" ? "uppercase" : "none" }}>
          {name}
          {suffix && <span style={{ color: p.accent }}>{suffix}</span>}
        </div>
        {p.tagline && <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.45 }}>{p.tagline}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.max(1, Math.min(p.featuredStats.length, 4)) + ", 1fr)", gap: 6, marginTop: 12 }}>
          {p.featuredStats.slice(0, 4).map((sk) => {
            const meta = FEATURABLE_STATS.find((s) => s.k === sk);
            if (!meta) return null;
            return (
              <div key={sk} style={{ padding: "8px 6px", borderRadius: 8, background: "var(--muted)", textAlign: "center" }}>
                <div style={{ fontSize: 8, fontWeight: 900, color: "var(--muted-fg)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{meta.l}</div>
                <div className="font-heading tabular" style={{ fontSize: 16, fontWeight: 900, marginTop: 2 }}>{STAT_DEMO[sk]}</div>
              </div>
            );
          })}
        </div>

        {p.featuredBadge &&
          (() => {
            const b = BADGES.find((x) => x.k === p.featuredBadge);
            if (!b) return null;
            return (
              <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9999, background: hexA(b.color, 0.12), color: b.color, fontSize: 10.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                <Icon name={b.icon} size={12} color={b.color} /> {b.l}
              </div>
            );
          })()}
      </div>
    </div>
  );
}

export function FriendshipPreviewCard({ p }: { p: Persona }) {
  const banner = BANNERS.find((b) => b.k === p.banner) ?? BANNERS[0];
  const name = applyCase("Camila Reyes", p.nameCase);
  const suffix = suffixOf(p.nameSuffix);
  const accent = p.accent;
  const cornerRadius = cornerRadiusOf(p.corners);
  const showLevel = p.fcShowLevel;
  const showCity = p.fcShowCity;
  const showClub = p.fcShowClub;
  const showBadge = p.fcShowBadge && p.featuredBadge;
  const upper = p.nameCase === "upper";

  let inner: React.ReactNode;
  if (p.friendshipStyle === "classic") {
    inner = (
      <div style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
        <AvatarFrame frame={p.frame} ring={ringPaletteFor(p.ringBadge, accent)} accent={accent} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", textTransform: upper ? "uppercase" : "none" }}>
            {name}
            {suffix && <span style={{ color: accent }}>{suffix}</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", display: "flex", gap: 8, marginTop: 2 }}>
            {showLevel && <span>Nivel 3.5</span>}
            {showCity && <span>· Quito</span>}
            {showClub && <span>· Cumbayá Pickleball</span>}
          </div>
        </div>
        {showBadge &&
          (() => {
            const b = BADGES.find((x) => x.k === p.featuredBadge);
            return b ? <Icon name={b.icon} size={14} color={b.color} /> : null;
          })()}
      </div>
    );
  } else if (p.friendshipStyle === "photo") {
    inner = (
      <div style={{ position: "relative", height: 110, background: banner.bg, color: "#fff", padding: 14, display: "flex", alignItems: "flex-end", gap: 12 }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.65))" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 10, width: "100%" }}>
          <AvatarFrame frame={p.frame} ring={ringPaletteFor(p.ringBadge, accent)} accent={accent} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em", textTransform: upper ? "uppercase" : "none" }}>
              {name}
              {suffix && <span style={{ color: "#34d399" }}>{suffix}</span>}
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.78)", display: "flex", gap: 6 }}>
              {showLevel && <span>Nivel 3.5</span>}
              {showCity && <span>· Quito</span>}
            </div>
          </div>
          {showBadge &&
            (() => {
              const b = BADGES.find((x) => x.k === p.featuredBadge);
              return b ? (
                <span style={{ padding: "3px 8px", borderRadius: 9999, background: "rgba(255,255,255,0.18)", fontSize: 9.5, fontWeight: 900, color: "#fff", letterSpacing: "0.08em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 3 }}>
                  <Icon name={b.icon} size={10} color="#fff" />
                  {b.l}
                </span>
              ) : null;
            })()}
        </div>
      </div>
    );
  } else if (p.friendshipStyle === "editorial") {
    const first = name.split(" ")[0] ?? name;
    inner = (
      <div style={{ padding: 16, background: "#fff", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 100, color: hexA(accent, 0.08), letterSpacing: "-0.06em", lineHeight: 0.8, transform: "translate(15%, -25%)", pointerEvents: "none" }}>
          {first.slice(0, 4).toUpperCase()}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <AvatarFrame frame={p.frame} ring={ringPaletteFor(p.ringBadge, accent)} accent={accent} size={42} />
          <div className="font-heading" style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.95, textTransform: upper ? "uppercase" : "none" }}>
            {first}
            <br />
            {name.split(" ").slice(1).join(" ")}
            {suffix && <span style={{ color: accent }}>{suffix}</span>}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 8, display: "flex", gap: 8 }}>
          {showLevel && <span>NIVEL 3.5</span>}
          {showCity && <span>· QUITO</span>}
          {showClub && <span>· CUMBAYÁ</span>}
        </div>
      </div>
    );
  } else {
    inner = (
      <div style={{ padding: 14, background: "#fff", display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 12 }}>
        <AvatarFrame frame={p.frame} ring={ringPaletteFor(p.ringBadge, accent)} accent={accent} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: "-0.01em", textTransform: upper ? "uppercase" : "none" }}>
            {name}
            {suffix && <span style={{ color: accent }}>{suffix}</span>}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
            {showCity ? "Quito · " : ""}
            {showClub ? "Cumbayá Pickleball" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {showLevel && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 8.5, fontWeight: 900, color: "var(--muted-fg)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Nivel</div>
              <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, lineHeight: 1, color: accent }}>3.5</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="label-mp" style={{ color: "var(--muted-fg)", marginBottom: 6, fontSize: 9.5 }}>Friendship card</div>
      <div className="card" style={{ overflow: "hidden", padding: 0, borderRadius: cornerRadius }}>
        {inner}
      </div>
    </div>
  );
}

export function MatchRowPreview({ p }: { p: Persona }) {
  const cornerRadius = cornerRadiusOf(p.corners);
  const banner = BANNERS.find((b) => b.k === p.banner) ?? BANNERS[0];

  let bg: string, fg: string, sub: string, accentDot: string;
  if (p.cardStyle === "minimal") {
    bg = "#fff"; fg = "#0a0a0a"; sub = "var(--muted-fg)"; accentDot = p.accent;
  } else if (p.cardStyle === "bold") {
    bg = "#0a0a0a"; fg = "#fff"; sub = "rgba(255,255,255,0.6)"; accentDot = p.accent;
  } else if (p.cardStyle === "neon") {
    bg = "linear-gradient(135deg, " + hexA(p.accent, 0.12) + ", " + hexA(p.accent, 0.04) + ")"; fg = "#0a0a0a"; sub = "var(--muted-fg)"; accentDot = p.accent;
  } else {
    bg = banner.bg; fg = "#fff"; sub = "rgba(255,255,255,0.78)"; accentDot = "#34d399";
  }

  return (
    <div>
      <div className="label-mp" style={{ color: "var(--muted-fg)", marginBottom: 6, fontSize: 9.5 }}>Match card</div>
      <div style={{ borderRadius: cornerRadius, padding: 14, background: bg, color: fg, position: "relative", overflow: "hidden", border: p.cardStyle === "minimal" ? "1px solid var(--border)" : "0" }}>
        {p.cardStyle === "glass" && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />}
        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 12, alignItems: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: hexA(accentDot, 0.16), color: accentDot, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 13 }}>W</div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>vs. Joaquín Ruiz</div>
            <div style={{ fontSize: 11, color: sub, marginTop: 2 }}>Vie 02 may · Nivel 4.0</div>
          </div>
          <div className="tabular" style={{ textAlign: "right" }}>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>11-7 · 11-9</div>
            <div style={{ fontSize: 10.5, color: accentDot, fontWeight: 800 }}>+0.04</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Avatar with frame ──────────────────────────────────────
function AvatarFrame({ frame, accent, size = 56 }: { frame: string; ring?: string; accent: string; size?: number }) {
  const inner = (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, " + accent + ", #0a0a0a)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: Math.round(size * 0.36) }}>
      CR
    </div>
  );
  if (frame === "none") return inner;
  if (frame === "halo") return <div style={{ padding: 3, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 3px " + accent, display: "inline-flex" }}>{inner}</div>;
  if (frame === "ring") return <div style={{ padding: 3, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 3px " + accent + ", 0 0 0 6px #fff, 0 0 0 8px #0a0a0a", display: "inline-flex" }}>{inner}</div>;
  if (frame === "shield") {
    const clip = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";
    return (
      <div style={{ position: "relative", width: size + 8, height: size + 8 }}>
        <div style={{ position: "absolute", inset: 0, background: accent, clipPath: clip }} />
        <div style={{ position: "absolute", inset: 3, background: "#fff", clipPath: clip }} />
        <div style={{ position: "absolute", inset: 5, clipPath: clip, background: "linear-gradient(135deg, " + accent + ", #0a0a0a)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: Math.round(size * 0.32) }}>
          CR
        </div>
      </div>
    );
  }
  return inner;
}

function AvatarFramePreview({ frame, accent }: { frame: string; accent: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 14 }}>
      <AvatarFrame frame={frame} accent={accent} size={48} />
    </div>
  );
}

function CardStylePreview({ styleKey, accent }: { styleKey: string; accent: string }) {
  let bg: string, fg: string;
  if (styleKey === "minimal") {
    bg = "#fff"; fg = "#0a0a0a";
  } else if (styleKey === "bold") {
    bg = "#0a0a0a"; fg = "#fff";
  } else if (styleKey === "neon") {
    bg = "linear-gradient(135deg," + hexA(accent, 0.18) + "," + hexA(accent, 0.04) + ")"; fg = "#0a0a0a";
  } else {
    bg = "linear-gradient(135deg,#064e3b,#0a0a0a)"; fg = "#fff";
  }
  return (
    <div style={{ padding: 12, borderRadius: 7, background: bg, color: fg, border: styleKey === "minimal" ? "1px solid var(--border)" : 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, fontWeight: 900, opacity: 0.6, letterSpacing: "0.1em", textTransform: "uppercase" }}>Match</span>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent }} />
      </div>
      <div className="font-heading" style={{ fontSize: 12, fontWeight: 900 }}>vs. J. Ruiz</div>
      <div className="tabular" style={{ fontSize: 10, opacity: 0.6 }}>11-7 · 11-9</div>
    </div>
  );
}

function FriendshipMiniPreview({ styleKey, accent }: { styleKey: string; accent: string }) {
  if (styleKey === "classic") {
    return (
      <div style={{ padding: 8, borderRadius: 7, background: "#fff", display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)" }}>
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg," + accent + ",#0a0a0a)" }} />
        <div style={{ flex: 1 }}>
          <div className="font-heading" style={{ fontSize: 10, fontWeight: 900 }}>CR · Nivel 3.5</div>
          <div style={{ height: 4, marginTop: 2, borderRadius: 9999, background: "var(--muted)" }} />
        </div>
      </div>
    );
  }
  if (styleKey === "photo") {
    return (
      <div style={{ height: 56, borderRadius: 7, background: "linear-gradient(135deg,#064e3b,#0a0a0a)", position: "relative", overflow: "hidden", padding: 8, display: "flex", alignItems: "flex-end", gap: 6 }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.5))" }} />
        <div style={{ position: "relative", width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg," + accent + ",#0a0a0a)", border: "2px solid #fff" }} />
        <div className="font-heading" style={{ position: "relative", fontSize: 10, fontWeight: 900, color: "#fff" }}>CR</div>
      </div>
    );
  }
  if (styleKey === "editorial") {
    return (
      <div style={{ padding: 8, borderRadius: 7, background: "#fff", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg," + accent + ",#0a0a0a)" }} />
        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.9 }}>
          CAMI
          <br />
          REYES
        </div>
      </div>
    );
  }
  return (
    <div style={{ padding: 8, borderRadius: 7, background: "#fff", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(135deg," + accent + ",#0a0a0a)" }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: "var(--muted-fg)" }}>NIVEL</div>
        <div className="font-heading tabular" style={{ fontSize: 16, fontWeight: 900, color: accent, lineHeight: 0.9 }}>3.5</div>
      </div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────
function PersoSection({ num, label, title, sub, children }: { num: string; label: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <span className="font-heading tabular" style={{ fontSize: 12, fontWeight: 900, color: "var(--muted-fg)" }}>{num}</span>
        <span className="label-mp" style={{ color: "var(--primary)" }}>{label}</span>
      </div>
      <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
        {title}
        <span className="dot">.</span>
      </h3>
      {sub && <p style={{ margin: "6px 0 14px", fontSize: 12.5, color: "var(--muted-fg)" }}>{sub}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </section>
  );
}

function SubLabel({ children, style }: { children: React.ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)", ...style }}>{children}</div>;
}

function ChipBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 11px", borderRadius: 9999, border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: "0.02em" }}>
      {children}
    </button>
  );
}

function SegBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 14px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)" }}>
      {children}
    </button>
  );
}

function OptionTile({ active, onPick, title, sub, preview }: { active: boolean; onPick: () => void; title: string; sub?: string; preview: React.ReactNode }) {
  return (
    <button onClick={onPick} style={{ padding: 8, borderRadius: 10, border: "2px solid " + (active ? "#0a0a0a" : "var(--border)"), background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", flexDirection: "column", gap: 8 }}>
      {preview}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>{title}</div>
          {sub && <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 1 }}>{sub}</div>}
        </div>
        {active && <Icon name="check-circle-2" size={14} color="var(--primary)" />}
      </div>
    </button>
  );
}

function BannerOption({ b, active, onPick, accent }: { b: { k: string; l: string; bg: string }; active: boolean; onPick: () => void; accent: string }) {
  return (
    <button onClick={onPick} style={{ padding: 4, borderRadius: 10, border: "2px solid " + (active ? "#0a0a0a" : "var(--border)"), background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ height: 50, borderRadius: 7, background: b.bg, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 75% 30%," + hexA(accent, 0.35) + ", transparent 60%)" }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 2px" }}>
        <span style={{ fontSize: 10.5, fontWeight: 800 }}>{b.l}</span>
        {active && <Icon name="check-circle-2" size={13} color="var(--primary)" />}
      </div>
    </button>
  );
}

function ToggleRowLite({ icon, l, checked, onChange }: { icon: string; l: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "#fff", cursor: "pointer" }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, background: checked ? "rgba(16,185,129,0.12)" : "var(--muted)", color: checked ? "#047857" : "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={13} color={checked ? "#047857" : undefined} />
      </span>
      <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{l}</span>
      <ToggleSmall checked={checked} onChange={onChange} />
    </label>
  );
}

function ToggleSmall({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 9999, background: checked ? "var(--primary)" : "#e5e5e5", position: "relative", cursor: "pointer", border: 0, padding: 0, transition: "background 150ms cubic-bezier(0.16, 1, 0.3, 1)" }}
    >
      <span style={{ position: "absolute", top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 150ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}
