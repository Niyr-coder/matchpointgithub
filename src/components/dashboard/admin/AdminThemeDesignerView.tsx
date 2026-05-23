"use client";
// Admin · Theme Designer — diseña templates oficiales de flair que los usuarios
// aplican en un click. Migrado del prototipo
// (ui_kits/dashboard/AdminThemeDesignerScreen.jsx): lista (oficiales/borradores/
// archivados) + editor con secciones colapsables + preview en vivo (reusa los
// componentes reales de Personalización) + court designer + save bar.
// data-lucide → <Icon>, window.MP_PERSO_OPTIONS → import de PersonalizacionFlairView.
//
// ⚠️ DEMO: estado local, no persiste. Los "templates oficiales" no existen en
// backend (el sistema real de personalización son PROFILE_THEMES en código +
// el editor à-la-carte localStorage). Se llega desde el botón "Theme designer"
// de admin-cosmetics (Flair de usuarios). Ver 04-placeholders.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ProfilePreviewCard, FriendshipPreviewCard, MatchRowPreview, defaultPersona, type Persona } from "@/components/dashboard/user/PersonalizacionFlairView";

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
const ACCENTS = [{ k: "#10b981", l: "Emerald" }, { k: "#0ea5e9", l: "Sky" }, { k: "#7c3aed", l: "Violeta" }, { k: "#dc2626", l: "Rojo" }, { k: "#f59e0b", l: "Ámbar" }, { k: "#ec4899", l: "Fucsia" }, { k: "#0a0a0a", l: "Negro" }];
const AVATAR_FRAMES = [{ k: "none", l: "Sin marco" }, { k: "halo", l: "Halo" }, { k: "ring", l: "Dual ring" }, { k: "shield", l: "Escudo" }];
const CARD_STYLES = [{ k: "minimal", l: "Minimal" }, { k: "bold", l: "Bold" }, { k: "neon", l: "Neon" }, { k: "glass", l: "Glass" }];
const FRIENDSHIP_STYLES = [{ k: "classic", l: "Classic" }, { k: "photo", l: "Photo" }, { k: "editorial", l: "Editorial" }, { k: "stat", l: "Stat" }];
const BADGES = [{ k: "top50", l: "TOP 50" }, { k: "racha7", l: "Racha 7" }, { k: "champ", l: "Campeón" }, { k: "first", l: "1° match" }, { k: "medal", l: "10 wins" }];

const hexA = (hex: string, a: number) => {
  const h = (hex || "#000000").replace("#", "");
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
};

type CourtExtras = { courtSurface?: string; courtLines?: string; courtStroke?: number; courtLineStyle?: string; customBannerCss?: string };
type TemplateValues = Persona & CourtExtras;
type Status = "published" | "draft" | "archived";
type Template = { id: string; key: string; name: string; desc: string; icon: string; status: Status; usage: number; createdBy: string; createdAt: string; values: TemplateValues };

// Valores parciales del seed, normalizados con defaultPersona() al construir.
function tv(partial: Partial<TemplateValues>): TemplateValues {
  const base = defaultPersona();
  const flag = partial.flag === "none" ? null : partial.flag;
  return { ...base, ...partial, flag: flag ?? base.flag } as TemplateValues;
}

const SEED: Template[] = [
  { id: "t1", key: "tournament", name: "Tournament", desc: "Negro · Rojo · Editorial · para perfiles competitivos.", icon: "swords", status: "published", usage: 1240, createdBy: "María C.", createdAt: "feb 2024", values: tv({ banner: "noir", bannerOverlay: "glow", accent: "#dc2626", frame: "shield", ringBadge: "champ", cardStyle: "bold", corners: "sharp", friendshipStyle: "editorial", nameCase: "upper", nameSuffix: "plus", watermarkOn: true, watermarkText: "KILL", pronouns: "él/he", tagline: "Sin excusas. Solo wins.", flag: "🇪🇨", featuredStats: ["rating", "ranking", "wins", "streak"], featuredBadge: "champ", courtSurface: "noche", courtLines: "#fbbf24", courtStroke: 3, courtLineStyle: "bold" }) },
  { id: "t2", key: "editorial", name: "Editorial", desc: "Mono · tipografía gigante · vibes minimalistas.", icon: "type", status: "published", usage: 920, createdBy: "Diego M.", createdAt: "mar 2024", values: tv({ banner: "plain-dark", bannerOverlay: "none", accent: "#0a0a0a", frame: "none", ringBadge: "none", cardStyle: "minimal", corners: "sharp", friendshipStyle: "editorial", nameCase: "upper", nameSuffix: "dot", watermarkOn: false, watermarkText: "", pronouns: "", tagline: "Backhand sin firma.", featuredStats: ["rating", "matches", "winrate", "hours"], featuredBadge: "medal" }) },
  { id: "t3", key: "neon", name: "Neon", desc: "Violeta · glow · cards translúcidas. Maximalista.", icon: "zap", status: "published", usage: 640, createdBy: "María C.", createdAt: "jun 2024", values: tv({ banner: "midnight", bannerOverlay: "glow", accent: "#7c3aed", frame: "ring", ringBadge: "top50", cardStyle: "neon", corners: "pill", friendshipStyle: "photo", nameCase: "upper", nameSuffix: "spark", watermarkOn: true, watermarkText: "NEON", pronouns: "they/them", tagline: "Bright lights, big serves.", flag: "none", featuredStats: ["rating", "wins", "streak", "tournaments"], featuredBadge: "top50", courtSurface: "purple", courtLines: "#ec4899", courtLineStyle: "neon" }) },
  { id: "t4", key: "oldschool", name: "Old school", desc: "Court emerald · halo · court lines. El default elegante.", icon: "star", status: "published", usage: 480, createdBy: "Diego M.", createdAt: "feb 2024", values: tv({ banner: "court-emerald", bannerOverlay: "lines", accent: "#10b981", frame: "halo", ringBadge: "first", cardStyle: "glass", corners: "soft", friendshipStyle: "photo", nameCase: "title", nameSuffix: "dot", watermarkOn: true, watermarkText: "JUEGA", tagline: "Backhand cruzado y muchas ganas.", featuredStats: ["rating", "ranking", "matches", "winrate"], featuredBadge: "first", courtSurface: "emerald", courtLines: "#ffffff" }) },
  { id: "t5", key: "minimal", name: "Minimal", desc: "Plano · sin watermark · soft corners. Para los low-key.", icon: "minus", status: "published", usage: 340, createdBy: "María C.", createdAt: "oct 2024", values: tv({ banner: "plain-dark", bannerOverlay: "none", accent: "#10b981", frame: "halo", ringBadge: "none", cardStyle: "minimal", corners: "soft", friendshipStyle: "classic", nameCase: "title", nameSuffix: "dot", watermarkOn: false, watermarkText: "", pronouns: "", tagline: "", featuredStats: ["rating", "matches"], featuredBadge: null }) },
  { id: "t6", key: "champion", name: "Champion", desc: "Premiado · oro y púrpura · perfiles top.", icon: "crown", status: "draft", usage: 0, createdBy: "Lucía V.", createdAt: "hace 3 días", values: tv({ banner: "sunset", bannerOverlay: "glow", accent: "#fbbf24", frame: "shield", ringBadge: "champ", cardStyle: "neon", corners: "soft", friendshipStyle: "stat", nameCase: "upper", nameSuffix: "spark", watermarkOn: true, watermarkText: "CROWN", tagline: "Ganar como costumbre.", featuredStats: ["ranking", "tournaments", "wins", "winrate"], featuredBadge: "champ", courtSurface: "sunset", courtLines: "#fbbf24" }) },
  { id: "t7", key: "pastel", name: "Pastel", desc: "Fucsia + Sky · vibes casuales · sin watermark.", icon: "cloud", status: "draft", usage: 0, createdBy: "María C.", createdAt: "hace 1 día", values: tv({ banner: "azur", bannerOverlay: "grain", accent: "#ec4899", frame: "halo", ringBadge: "none", cardStyle: "glass", corners: "pill", friendshipStyle: "photo", nameCase: "lower", nameSuffix: "spark", watermarkOn: false, watermarkText: "", pronouns: "ella/she", tagline: "aquí pa pasarla bien.", flag: "🇲🇽", featuredStats: ["matches", "winrate", "club"], featuredBadge: "first", courtSurface: "royal", courtLines: "#ffffff" }) },
];

const STATUS_LABEL: Record<Status, string> = { published: "Publicado", draft: "Borrador", archived: "Archivado" };
const STATUS_COLOR: Record<Status, string> = { published: "#10b981", draft: "#fbbf24", archived: "#737373" };

export function AdminThemeDesignerView() {
  const [templates, setTemplates] = useState<Template[]>(SEED);
  const [selectedId, setSelectedId] = useState("t1");
  const [savedSnap, setSavedSnap] = useState(() => JSON.stringify(SEED));
  const [previewTab, setPreviewTab] = useState<"profile" | "friend" | "row">("profile");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ banner: true, color: true, avatar: false, cards: false, name: false, social: false, court: false });

  const dirty = JSON.stringify(templates) !== savedSnap;
  const selected = templates.find((t) => t.id === selectedId)!;
  const updateSelected = (patch: Partial<Template>) => setTemplates((ts) => ts.map((t) => (t.id === selectedId ? { ...t, ...patch } : t)));
  const updateValues = (patch: Partial<TemplateValues>) => setTemplates((ts) => ts.map((t) => (t.id === selectedId ? { ...t, values: { ...t.values, ...patch } } : t)));
  const discard = () => { try { setTemplates(JSON.parse(savedSnap)); } catch { /* ignore */ } };
  const save = () => setSavedSnap(JSON.stringify(templates));
  const publish = () => updateSelected({ status: "published" });
  const archive = () => updateSelected({ status: "archived" });
  const duplicate = () => {
    const id = "t" + Date.now();
    setTemplates([...templates, { ...selected, id, key: selected.key + "-copy", name: selected.name + " (copia)", status: "draft", usage: 0, createdAt: "ahora" }]);
    setSelectedId(id);
  };
  const createNew = () => {
    const id = "t" + Date.now();
    setTemplates([...templates, { id, key: "untitled-" + (templates.length + 1), name: "Untitled", desc: "Nuevo template sin describir.", icon: "sparkles", status: "draft", usage: 0, createdBy: "Admin", createdAt: "ahora", values: tv({ ...SEED[4].values }) }]);
    setSelectedId(id);
  };

  const grouped: Record<Status, Template[]> = {
    published: templates.filter((t) => t.status === "published"),
    draft: templates.filter((t) => t.status === "draft"),
    archived: templates.filter((t) => t.status === "archived"),
  };
  const toggleSec = (k: string) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "#7c3aed" }}>● Templates oficiales · diseñador</div>
            <h1 className="font-heading" style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1, margin: "8px 0 0" }}>
              Theme designer<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
              Diseña los estilos que los <b style={{ color: "#0a0a0a" }}>{templates.reduce((s, t) => s + t.usage, 0).toLocaleString()} usuarios</b> con flair pueden aplicar en un click · oficial = público, borrador = solo admin
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={duplicate} style={{ background: "#fff", border: "1px solid var(--border)" }}>
              <Icon name="copy" size={13} />Duplicar
            </button>
            <button className="btn btn-primary" onClick={createNew}>
              <Icon name="plus" size={13} color="#fff" />Nuevo template
            </button>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="mp-td-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr 360px", gap: 16, alignItems: "flex-start" }}>
        {/* LIST */}
        <div className="mp-td-list" style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {([{ k: "published", l: "Oficiales", i: "check-circle-2" }, { k: "draft", l: "Borradores", i: "edit-3" }, { k: "archived", l: "Archivados", i: "archive" }] as const).map((g) => {
            const list = grouped[g.k];
            if (list.length === 0 && g.k === "archived") return null;
            return (
              <div key={g.k} className="card" style={{ padding: 8 }}>
                <div style={{ padding: "8px 10px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
                    <Icon name={g.i} size={11} color={STATUS_COLOR[g.k]} />
                    {g.l}
                  </span>
                  <span style={{ fontSize: 9.5, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace" }}>{list.length}</span>
                </div>
                {list.map((t) => (
                  <TemplateMiniCard key={t.id} t={t} active={selectedId === t.id} onClick={() => setSelectedId(t.id)} />
                ))}
                {list.length === 0 && <div style={{ padding: 14, textAlign: "center", fontSize: 11, color: "var(--muted-fg)" }}>Vacío</div>}
              </div>
            );
          })}
        </div>

        {/* EDITOR */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "20px 22px", background: "#0a0a0a", color: "#fff", position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 85% 20%, ${hexA(selected.values.accent, 0.28)}, transparent 60%)` }} />
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[selected.status] }} />
                  {STATUS_LABEL[selected.status]}
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={archive} style={{ padding: "6px 11px", borderRadius: 9999, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontFamily: "inherit", fontSize: 10, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Icon name="archive" size={10} color="#fff" />Archivar
                  </button>
                  {selected.status !== "published" && (
                    <button onClick={publish} style={{ padding: "6px 11px", borderRadius: 9999, background: "var(--primary)", border: 0, color: "#fff", fontFamily: "inherit", fontSize: 10, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="rocket" size={10} color="#fff" />Publicar
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <span style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.1)", color: selected.values.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid rgba(255,255,255,0.15)" }}>
                  <Icon name={selected.icon} size={20} color={selected.values.accent} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} style={{ width: "100%", background: "transparent", border: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 24, letterSpacing: "-0.025em", textTransform: "uppercase", color: "#fff", outline: "none", padding: 0 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>tpl.</span>
                    <input value={selected.key} onChange={(e) => updateSelected({ key: e.target.value.toLowerCase().replace(/\s/g, "-") })} style={{ flex: 1, background: "transparent", border: 0, fontFamily: "ui-monospace, monospace", fontSize: 11, color: "rgba(255,255,255,0.85)", outline: "none", padding: 0 }} />
                  </div>
                </div>
              </div>
              <textarea value={selected.desc} onChange={(e) => updateSelected({ desc: e.target.value })} placeholder="Una línea que describa el theme…" style={{ width: "100%", background: "transparent", border: "1px dashed rgba(255,255,255,0.15)", borderRadius: 8, padding: "8px 10px", marginTop: 14, color: "rgba(255,255,255,0.85)", fontFamily: "inherit", fontSize: 12, resize: "none", outline: "none", minHeight: 40 }} />
              <div style={{ display: "flex", gap: 18, marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 10.5, color: "rgba(255,255,255,0.6)", flexWrap: "wrap" }}>
                <span><b style={{ color: "#fff" }}>{selected.usage.toLocaleString()}</b> usuarios</span>
                <span>Creado por <b style={{ color: "#fff" }}>{selected.createdBy}</b></span>
                <span>{selected.createdAt}</span>
              </div>
            </div>
          </div>

          {/* SECTIONS */}
          <Section title="Banner & overlay" icon="image" expanded={expanded.banner} toggle={() => toggleSec("banner")}>
            <SubLabel>Tipo de banner</SubLabel>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2, marginBottom: 10 }}>
              <Seg on={selected.values.banner !== "custom"} onClick={() => updateValues({ banner: selected.values.banner === "custom" ? "noir" : selected.values.banner })}>Preset</Seg>
              <Seg on={selected.values.banner === "custom"} onClick={() => updateValues({ banner: "custom", customBannerCss: selected.values.customBannerCss || "linear-gradient(135deg, #0a0a0a 0%, #581c87 50%, #ec4899 100%)" })}>Custom gradient</Seg>
            </div>
            {selected.values.banner !== "custom" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {BANNERS.map((b) => (
                  <BannerPick key={b.k} b={b} active={selected.values.banner === b.k} onPick={() => updateValues({ banner: b.k })} accent={selected.values.accent} />
                ))}
              </div>
            ) : (
              <GradientEditor css={selected.values.customBannerCss || ""} onChange={(css) => updateValues({ customBannerCss: css })} />
            )}
            <SubLabel style={{ marginTop: 14 }}>Overlay</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ k: "none", l: "Limpio" }, { k: "grain", l: "Grain" }, { k: "glow", l: "Glow" }, { k: "lines", l: "Court lines" }].map((o) => (
                <Chip key={o.k} on={selected.values.bannerOverlay === o.k} onClick={() => updateValues({ bannerOverlay: o.k })}>{o.l}</Chip>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Watermark</SubLabel>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Toggle on={selected.values.watermarkOn} onChange={(v) => updateValues({ watermarkOn: v })} />
              <input value={selected.values.watermarkText} onChange={(e) => updateValues({ watermarkText: e.target.value.toUpperCase().slice(0, 8) })} placeholder="EJ: SMASH" disabled={!selected.values.watermarkOn} style={{ flex: 1, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", outline: "none", background: selected.values.watermarkOn ? "#fff" : "var(--muted)" }} />
            </div>
          </Section>

          <Section title="Color de acento" icon="palette" expanded={expanded.color} toggle={() => toggleSec("color")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {ACCENTS.map((c) => (
                <button key={c.k} onClick={() => updateValues({ accent: c.k })} title={c.l} style={{ width: 40, height: 40, borderRadius: 9, background: c.k, border: "2px solid " + (selected.values.accent === c.k ? "#0a0a0a" : "transparent"), cursor: "pointer", position: "relative" }}>
                  {selected.values.accent === c.k && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}><Icon name="check" size={14} color="#fff" /></span>}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Custom:</span>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(selected.values.accent) ? selected.values.accent : "#10b981"} onChange={(e) => updateValues({ accent: e.target.value })} style={{ width: 36, height: 36, padding: 0, border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", background: "transparent" }} />
              <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#0a0a0a" }}>{selected.values.accent}</code>
            </div>
          </Section>

          <Section title="Avatar · marco y aro" icon="user-circle-2" expanded={expanded.avatar} toggle={() => toggleSec("avatar")}>
            <SubLabel>Marco</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {AVATAR_FRAMES.map((f) => (
                <Chip key={f.k} on={selected.values.frame === f.k} onClick={() => updateValues({ frame: f.k })}>{f.l}</Chip>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Aro de logro</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ k: "none", l: "Ninguno" }, { k: "top50", l: "TOP 50" }, { k: "racha", l: "Racha 7" }, { k: "champ", l: "Campeón" }, { k: "first", l: "1° match" }].map((o) => (
                <Chip key={o.k} on={selected.values.ringBadge === o.k} onClick={() => updateValues({ ringBadge: o.k })}>{o.l}</Chip>
              ))}
            </div>
          </Section>

          <Section title="Cards · estilo y esquinas" icon="layers" expanded={expanded.cards} toggle={() => toggleSec("cards")}>
            <SubLabel>Estilo</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {CARD_STYLES.map((c) => (
                <Chip key={c.k} on={selected.values.cardStyle === c.k} onClick={() => updateValues({ cardStyle: c.k })}>{c.l}</Chip>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Esquinas</SubLabel>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2 }}>
              {[{ k: "sharp", l: "Rectas" }, { k: "soft", l: "Suaves" }, { k: "pill", l: "Pills" }].map((o) => (
                <Seg key={o.k} on={selected.values.corners === o.k} onClick={() => updateValues({ corners: o.k })}>{o.l}</Seg>
              ))}
            </div>
          </Section>

          <Section title="Nombre · case, sufijo, defaults" icon="type" expanded={expanded.name} toggle={() => toggleSec("name")}>
            <SubLabel>Capitalización</SubLabel>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2 }}>
              {[{ k: "upper", l: "UPPER" }, { k: "title", l: "Title" }, { k: "lower", l: "lower" }].map((o) => (
                <Seg key={o.k} on={selected.values.nameCase === o.k} onClick={() => updateValues({ nameCase: o.k })}>{o.l}</Seg>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Sufijo · el &quot;punto&quot; característico</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ k: "dot", l: "." }, { k: "plus", l: "+" }, { k: "slash", l: "/" }, { k: "spark", l: "✦" }, { k: "none", l: "Ninguno" }].map((o) => (
                <Chip key={o.k} on={selected.values.nameSuffix === o.k} onClick={() => updateValues({ nameSuffix: o.k })}>{o.l}</Chip>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Tagline default</SubLabel>
            <input value={selected.values.tagline} onChange={(e) => updateValues({ tagline: e.target.value.slice(0, 60) })} placeholder="ej: Backhand cruzado y muchas ganas." style={{ width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 12.5, outline: "none" }} />
          </Section>

          <Section title="Friendship card" icon="users" expanded={expanded.social} toggle={() => toggleSec("social")}>
            <SubLabel>Estilo</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FRIENDSHIP_STYLES.map((f) => (
                <Chip key={f.k} on={selected.values.friendshipStyle === f.k} onClick={() => updateValues({ friendshipStyle: f.k })}>{f.l}</Chip>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Insignia por defecto</SubLabel>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Chip on={!selected.values.featuredBadge} onClick={() => updateValues({ featuredBadge: null })}>Ninguna</Chip>
              {BADGES.map((b) => (
                <Chip key={b.k} on={selected.values.featuredBadge === b.k} onClick={() => updateValues({ featuredBadge: b.k })}>{b.l}</Chip>
              ))}
            </div>
          </Section>

          <Section title="Cancha visual" icon="square-dashed" expanded={expanded.court} toggle={() => toggleSec("court")}>
            <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--muted-fg)" }}>Los colores de cancha aplican en visualizaciones de match, brackets y mapa para usuarios con este theme.</p>
            <CourtPreview values={selected.values} />
            <SubLabel style={{ marginTop: 14 }}>Color de superficie</SubLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[{ k: "emerald", l: "Emerald · USAPA", c: "#10b981" }, { k: "royal", l: "Royal blue", c: "#1e40af" }, { k: "usopen", l: "US Open", c: "#0e7490" }, { k: "clay", l: "Red clay", c: "#b45309" }, { k: "indoor", l: "Indoor grey", c: "#52525b" }, { k: "noche", l: "Night black", c: "#0a0a0a" }, { k: "sunset", l: "Sunset", c: "#ea580c" }, { k: "purple", l: "Purple", c: "#581c87" }].map((o) => {
                const on = (selected.values.courtSurface || "emerald") === o.k;
                return (
                  <button key={o.k} onClick={() => updateValues({ courtSurface: o.k })} style={{ padding: 4, borderRadius: 9, border: "2px solid " + (on ? "#0a0a0a" : "var(--border)"), background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <div style={{ height: 28, borderRadius: 6, background: o.c }} />
                    <div style={{ fontSize: 9.5, fontWeight: 800, marginTop: 4, padding: "0 2px" }}>{o.l}</div>
                  </button>
                );
              })}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Color de líneas</SubLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["#ffffff", "#fbbf24", "#10b981", "#0a0a0a", "#ec4899"].map((c) => {
                const on = (selected.values.courtLines || "#ffffff") === c;
                return (
                  <button key={c} onClick={() => updateValues({ courtLines: c })} title={c} style={{ width: 36, height: 36, borderRadius: 8, background: c, border: "2px solid " + (on ? "#0a0a0a" : "var(--border)"), cursor: "pointer", position: "relative" }}>
                    {on && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: c === "#ffffff" || c === "#fbbf24" ? "#0a0a0a" : "#fff", fontSize: 14 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Estilo de líneas</SubLabel>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2 }}>
              {[{ k: "classic", l: "Clásicas" }, { k: "bold", l: "Bold" }, { k: "dashed", l: "Dashed" }, { k: "neon", l: "Neon glow" }].map((o) => (
                <Seg key={o.k} on={(selected.values.courtLineStyle || "classic") === o.k} onClick={() => updateValues({ courtLineStyle: o.k })}>{o.l}</Seg>
              ))}
            </div>
            <SubLabel style={{ marginTop: 14 }}>Grosor · <span style={{ color: "var(--muted-fg)", fontWeight: 700 }}>{selected.values.courtStroke || 3} px</span></SubLabel>
            <input type="range" min={1} max={8} value={selected.values.courtStroke || 3} onChange={(e) => updateValues({ courtStroke: +e.target.value })} style={{ width: "100%", accentColor: "#0a0a0a" }} />
          </Section>
        </div>

        {/* PREVIEW */}
        <div className="mp-td-preview" style={{ position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: "var(--muted)", borderRadius: 9999, padding: 3 }}>
              {([{ k: "profile", l: "Perfil" }, { k: "friend", l: "Friendship" }, { k: "row", l: "Match" }] as const).map((o) => (
                <button key={o.k} onClick={() => setPreviewTab(o.k)} style={{ padding: "6px 12px", borderRadius: 9999, border: 0, background: previewTab === o.k ? "#0a0a0a" : "transparent", color: previewTab === o.k ? "#fff" : "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800 }}>{o.l}</button>
              ))}
            </div>
            <div style={{ display: "inline-flex", gap: 3, background: "var(--muted)", borderRadius: 9999, padding: 3 }}>
              {([{ k: "mobile", i: "smartphone" }, { k: "desktop", i: "monitor" }] as const).map((o) => (
                <button key={o.k} onClick={() => setDevice(o.k)} style={{ padding: "5px 9px", borderRadius: 9999, border: 0, background: device === o.k ? "#0a0a0a" : "transparent", color: device === o.k ? "#fff" : "var(--muted-fg)", cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
                  <Icon name={o.i} size={12} color={device === o.k ? "#fff" : undefined} />
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: "linear-gradient(180deg, #fafafa, #f5f5f5)" }}>
            <div style={{ maxWidth: device === "mobile" ? 300 : "100%", margin: "0 auto" }}>
              {previewTab === "profile" && <ProfilePreviewCard p={selected.values} />}
              {previewTab === "friend" && <FriendshipPreviewCard p={selected.values} />}
              {previewTab === "row" && <MatchRowPreview p={selected.values} />}
            </div>
          </div>
        </div>
      </div>

      {/* SAVE BAR */}
      {dirty && (
        <div style={{ position: "sticky", bottom: 16, zIndex: 100 }}>
          <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 12px 32px rgba(0,0,0,0.25)", border: "1px solid #fbbf24", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fbbf24", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="sparkles" size={15} color="#0a0a0a" />
              </span>
              <div>
                <div className="font-heading" style={{ fontWeight: 900, fontSize: 14, letterSpacing: "-0.01em" }}>Cambios sin guardar</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Demo — guardar/publicar no persiste todavía.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={discard} style={{ padding: "8px 16px", borderRadius: 9999, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }}>Descartar</button>
              <button onClick={save} style={{ padding: "8px 16px", borderRadius: 9999, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.3)", fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="save" size={11} color="#fff" />Guardar borrador
              </button>
              <button onClick={() => { publish(); save(); }} style={{ padding: "8px 16px", borderRadius: 9999, background: "var(--primary)", color: "#fff", border: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name="rocket" size={11} color="#fff" />Publicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateMiniCard({ t, active, onClick }: { t: Template; active: boolean; onClick: () => void }) {
  const banner = BANNERS.find((b) => b.k === t.values.banner);
  return (
    <button onClick={onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: 8, borderRadius: 8, background: active ? "#0a0a0a" : "transparent", color: active ? "#fff" : "#0a0a0a", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 2 }}>
      <div style={{ width: 44, height: 32, borderRadius: 6, background: banner?.bg || "#0a0a0a", position: "relative", flexShrink: 0, overflow: "hidden", border: "1px solid " + (active ? "rgba(255,255,255,0.2)" : "var(--border)") }}>
        {t.values.watermarkOn && t.values.watermarkText && (
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%) rotate(-6deg)", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 12, color: "rgba(255,255,255,0.16)", letterSpacing: "-0.04em", textTransform: "uppercase" }}>{t.values.watermarkText.slice(0, 5)}</div>
        )}
        <span style={{ position: "absolute", bottom: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: t.values.accent, border: "1px solid rgba(255,255,255,0.4)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
        <div style={{ fontSize: 9.5, color: active ? "rgba(255,255,255,0.55)" : "var(--muted-fg)", fontFamily: "ui-monospace, monospace", marginTop: 1 }}>{t.usage > 0 ? t.usage.toLocaleString() + " users" : "sin usuarios"}</div>
      </div>
    </button>
  );
}

function BannerPick({ b, active, onPick, accent }: { b: { k: string; l: string; bg: string }; active: boolean; onPick: () => void; accent: string }) {
  return (
    <button onClick={onPick} style={{ padding: 4, borderRadius: 9, border: "2px solid " + (active ? "#0a0a0a" : "var(--border)"), background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <div style={{ height: 38, borderRadius: 6, background: b.bg, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 75% 30%," + ((accent || "#10b981") + "55") + ", transparent 60%)" }} />
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 800, marginTop: 4, padding: "0 2px" }}>{b.l}</div>
    </button>
  );
}

function Section({ title, icon, expanded, toggle, children }: { title: string; icon: string; expanded: boolean; toggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button onClick={toggle} style={{ width: "100%", padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name={icon} size={13} />
          </span>
          <span className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>{title}</span>
        </span>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} color="var(--muted-fg)" />
      </button>
      {expanded && <div style={{ padding: "0 22px 18px" }}>{children}</div>}
    </div>
  );
}

function SubLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)", marginBottom: 6, ...style }}>{children}</div>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "6px 11px", borderRadius: 9999, border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>{children}</button>
  );
}
function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 13px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)" }}>{children}</button>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ flexShrink: 0, width: 36, height: 20, borderRadius: 9999, background: on ? "var(--primary)" : "#e5e5e5", position: "relative", cursor: "pointer", border: 0, padding: 0, transition: "background 150ms" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 150ms" }} />
    </button>
  );
}

// ── Gradient editor ───────────────────────────────────────────
type Grad = { angle: number; stops: { c: string; p: number }[] };
function parseGradient(css: string): Grad {
  const m = /linear-gradient\(([^,]+),(.+)\)$/.exec((css || "").trim());
  if (!m) return { angle: 135, stops: [{ c: "#0a0a0a", p: 0 }, { c: "#581c87", p: 50 }, { c: "#ec4899", p: 100 }] };
  const angle = m[1].includes("deg") ? parseFloat(m[1]) : 135;
  const stops = m[2].split(/,(?![^()]*\))/).map((s) => {
    const [color, pos] = s.trim().split(/\s+/);
    return { c: color, p: pos ? parseFloat(pos) : 50 };
  });
  return { angle, stops: stops.length >= 2 ? stops : [{ c: "#0a0a0a", p: 0 }, { c: "#581c87", p: 100 }] };
}
const renderGradient = (g: Grad) => `linear-gradient(${g.angle}deg, ${g.stops.map((s) => `${s.c} ${s.p}%`).join(", ")})`;

function GradientEditor({ css, onChange }: { css: string; onChange: (css: string) => void }) {
  const g = parseGradient(css);
  const update = (next: Grad) => onChange(renderGradient(next));
  const setStop = (i: number, patch: Partial<{ c: string; p: number }>) => update({ ...g, stops: g.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const addStop = () => { if (g.stops.length >= 4) return; update({ ...g, stops: [...g.stops.slice(0, -1), { c: "#10b981", p: 50 }, g.stops[g.stops.length - 1]] }); };
  const removeStop = (i: number) => { if (g.stops.length <= 2) return; update({ ...g, stops: g.stops.filter((_, j) => j !== i) }); };
  const presets = [
    { l: "Nebula", css: "linear-gradient(135deg, #0a0a0a 0%, #581c87 50%, #ec4899 100%)" },
    { l: "Aurora", css: "linear-gradient(135deg, #064e3b 0%, #10b981 50%, #38bdf8 100%)" },
    { l: "Sunset", css: "linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fde047 100%)" },
    { l: "Ice", css: "linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 60%, #f0f9ff 100%)" },
    { l: "Fire", css: "linear-gradient(135deg, #18181b 0%, #b91c1c 50%, #fbbf24 100%)" },
    { l: "Mint", css: "linear-gradient(135deg, #064e3b 0%, #34d399 100%)" },
  ];
  return (
    <div style={{ padding: 14, borderRadius: 10, border: "1px solid var(--border)", background: "#fafafa" }}>
      <div style={{ height: 56, borderRadius: 8, background: renderGradient(g), marginBottom: 14, position: "relative", overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }}>
        <div style={{ position: "absolute", bottom: 4, left: 6, fontFamily: "ui-monospace, monospace", fontSize: 9, color: "rgba(255,255,255,0.6)", background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 4 }}>{Math.round(g.angle)}° · {g.stops.length} stops</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em", minWidth: 40 }}>Ángulo</span>
        <input type="range" min={0} max={360} value={g.angle} onChange={(e) => update({ ...g, angle: +e.target.value })} style={{ flex: 1, accentColor: "#0a0a0a" }} />
        <span className="tabular" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, fontWeight: 800, minWidth: 42, textAlign: "right" }}>{Math.round(g.angle)}°</span>
      </div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Color stops</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {g.stops.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(s.c) ? s.c : "#000000"} onChange={(e) => setStop(i, { c: e.target.value })} style={{ width: 32, height: 32, padding: 0, border: "1px solid var(--border)", borderRadius: 7, cursor: "pointer", background: "transparent" }} />
            <input value={s.c} onChange={(e) => setStop(i, { c: e.target.value })} style={{ width: 78, padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontFamily: "ui-monospace, monospace", fontSize: 11, outline: "none" }} />
            <input type="range" min={0} max={100} value={s.p} onChange={(e) => setStop(i, { p: +e.target.value })} style={{ flex: 1, accentColor: s.c }} />
            <span className="tabular" style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: "var(--muted-fg)", minWidth: 32, textAlign: "right" }}>{Math.round(s.p)}%</span>
            <button onClick={() => removeStop(i)} disabled={g.stops.length <= 2} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid var(--border)", background: "#fff", cursor: g.stops.length <= 2 ? "not-allowed" : "pointer", color: "var(--muted-fg)", opacity: g.stops.length <= 2 ? 0.35 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="trash-2" size={11} />
            </button>
          </div>
        ))}
      </div>
      {g.stops.length < 4 && (
        <button onClick={addStop} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 9999, border: "1px dashed var(--border)", background: "transparent", color: "var(--muted-fg)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+ Agregar stop</button>
      )}
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 14, marginBottom: 6 }}>Presets</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5 }}>
        {presets.map((p) => (
          <button key={p.l} onClick={() => onChange(p.css)} title={p.l} style={{ height: 32, borderRadius: 7, background: p.css, border: "1px solid rgba(0,0,0,0.1)", cursor: "pointer", position: "relative" }}>
            <span style={{ position: "absolute", bottom: 2, left: 4, fontSize: 8.5, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>{p.l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Court visual (pickleball, SVG real) ───────────────────────
function CourtPreview({ values }: { values: TemplateValues }) {
  const surfaces: Record<string, string> = { emerald: "#10b981", royal: "#1e40af", usopen: "#0e7490", clay: "#b45309", indoor: "#52525b", noche: "#0a0a0a", sunset: "#ea580c", purple: "#581c87" };
  const surface = surfaces[values.courtSurface || "emerald"];
  const lineColor = values.courtLines || "#ffffff";
  const strokeW = values.courtStroke || 3;
  const style = values.courtLineStyle || "classic";
  const dasharray = style === "dashed" ? `${strokeW * 4} ${strokeW * 2}` : undefined;
  const filter = style === "neon" ? `drop-shadow(0 0 ${strokeW}px ${lineColor})` : undefined;
  const sw = style === "bold" ? strokeW + 1.5 : strokeW;
  const ln = { stroke: lineColor, strokeWidth: sw, strokeDasharray: dasharray, fill: "none" as const };
  return (
    <div style={{ borderRadius: 10, overflow: "hidden", background: surface, padding: 16, position: "relative" }}>
      <svg viewBox="0 0 903 419" style={{ width: "100%", height: "auto", display: "block", filter }}>
        <rect x="13" y="9" width="434" height="399" {...ln} />
        <rect x="447" y="9" width="434" height="399" {...ln} />
        <rect x="22" y="18" width="284" height="186" {...ln} />
        <rect x="22" y="213" width="284" height="186" {...ln} />
        <line x1="315" y1="18" x2="315" y2="399" {...ln} />
        <line x1="452" y1="18" x2="452" y2="399" {...ln} />
        <line x1="579" y1="18" x2="579" y2="399" {...ln} />
        <line x1="447" y1="9" x2="447" y2="408" stroke={lineColor} strokeWidth={sw + 1.5} fill="none" />
        <rect x="588" y="18" width="284" height="186" {...ln} />
        <rect x="588" y="213" width="284" height="186" {...ln} />
        <circle cx="160" cy="110" r="10" fill="#fbbf24" />
        <circle cx="160" cy="300" r="10" fill="#fbbf24" />
        <circle cx="730" cy="110" r="10" fill={values.accent || "#10b981"} />
        <circle cx="730" cy="300" r="10" fill={values.accent || "#10b981"} />
      </svg>
      <div style={{ position: "absolute", top: 10, right: 12, padding: "3px 8px", borderRadius: 4, background: "rgba(0,0,0,0.4)", color: "#fff", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase" }}>Cancha 3 · Cumbayá</div>
    </div>
  );
}
