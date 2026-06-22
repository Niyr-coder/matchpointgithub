"use client";
// Buscar Match — lobby de matches abiertos (rediseño). Migrado 1:1 del prototipo
// (ui_kits/dashboard/BuscarMatchScreen.jsx): cada tarjeta enfatiza el slot vacío
// como avatar punteado con "+". Header scoreboard, cinta "se acaba de abrir",
// filtros rápidos, match destacado, vistas cards/lista/mapa.
// data-lucide → <Icon>, evento mp-open-crear-match → useToast.
//
// ⚠️ DEMO: datos mock. El "Busco partido" REAL (feature flag match_seeks_enabled,
// server actions match-seeks: avisos + aplicaciones) vive en BuscoPartidoScreen
// + BuscoPartidoScreenView, preservados y des-importados para re-cablear este
// diseño al modelo real después. Ver docs/guides/04-placeholders.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

const BM_LIST_COLS = "110px 1.5fr 1fr 130px 100px 130px";

type Player = { a: string; b: string };
type Match = {
  id: string;
  host: string;
  hostLevel: number;
  sport: string;
  mode: string;
  club: string;
  dist: string;
  date: string;
  time: string;
  startsIn: string;
  urgency: "hot" | "today" | "tomorrow" | "later";
  levelRange: [number, number];
  slotsTotal: number;
  players: Player[];
  cost: number;
  ranked: boolean;
  fit: number;
  viewing: number;
  featured?: boolean;
};

const ME = { level: 3.5, name: "Camila", club: "Cumbayá PB" };

const ALL_MATCHES: Match[] = [
  { id: "m1", host: "Mateo Vélez", hostLevel: 3.8, sport: "Pickleball", mode: "Dobles", club: "Cumbayá Pickleball", dist: "4 km", date: "Hoy", time: "19:00", startsIn: "2h 15m", urgency: "hot", levelRange: [3.0, 4.0], slotsTotal: 4, players: [{ a: "MV", b: "linear-gradient(135deg,#10b981,#047857)" }, { a: "AS", b: "linear-gradient(135deg,#0891b2,#06b6d4)" }, { a: "JR", b: "linear-gradient(135deg,#ca8a04,#facc15)" }], cost: 6, ranked: true, fit: 96, viewing: 4, featured: true },
  { id: "m2", host: "Sofía Andrade", hostLevel: 3.6, sport: "Pickleball", mode: "Dobles", club: "Rancho San Francisco", dist: "8 km", date: "Hoy", time: "20:30", startsIn: "3h 45m", urgency: "today", levelRange: [3.0, 4.0], slotsTotal: 4, players: [{ a: "SA", b: "linear-gradient(135deg,#7c3aed,#db2777)" }, { a: "NV", b: "linear-gradient(135deg,#dc2626,#fb923c)" }], cost: 7, ranked: false, fit: 89, viewing: 2 },
  { id: "m3", host: "Diego Salazar", hostLevel: 3.5, sport: "Pickleball", mode: "Singles", club: "Academia Norte", dist: "6 km", date: "Mañana", time: "07:00", startsIn: "Mañ 07:00", urgency: "tomorrow", levelRange: [3.0, 3.5], slotsTotal: 2, players: [{ a: "DS", b: "linear-gradient(135deg,#0a0a0a,#374151)" }], cost: 12, ranked: true, fit: 92, viewing: 1 },
  { id: "m4", host: "Andrea Pinto", hostLevel: 4.5, sport: "Pickleball", mode: "Dobles", club: "Tumbaco PB", dist: "12 km", date: "Sáb", time: "10:00", startsIn: "Sáb 10:00", urgency: "later", levelRange: [4.0, 4.8], slotsTotal: 4, players: [{ a: "AP", b: "linear-gradient(135deg,#ca8a04,#facc15)" }, { a: "JR", b: "linear-gradient(135deg,#dc2626,#fb923c)" }, { a: "TB", b: "linear-gradient(135deg,#7c3aed,#db2777)" }], cost: 8, ranked: true, fit: 42, viewing: 7 },
  { id: "m5", host: "Joaquín Ruiz", hostLevel: 3.4, sport: "Pickleball", mode: "Dobles", club: "Cumbayá Pickleball", dist: "4 km", date: "Mañana", time: "18:00", startsIn: "Mañ 18:00", urgency: "tomorrow", levelRange: [3.0, 3.8], slotsTotal: 4, players: [{ a: "JR", b: "linear-gradient(135deg,#dc2626,#fb923c)" }, { a: "VM", b: "linear-gradient(135deg,#10b981,#047857)" }, { a: "IO", b: "linear-gradient(135deg,#0891b2,#06b6d4)" }], cost: 6, ranked: false, fit: 94, viewing: 3 },
  { id: "m6", host: "Valentina Mora", hostLevel: 3.3, sport: "Pickleball", mode: "Singles", club: "Quito Tenis", dist: "9 km", date: "Hoy", time: "21:30", startsIn: "4h 45m", urgency: "today", levelRange: [3.0, 3.5], slotsTotal: 2, players: [{ a: "VM", b: "linear-gradient(135deg,#10b981,#047857)" }], cost: 11, ranked: true, fit: 88, viewing: 1 },
  { id: "m7", host: "Sebastián León", hostLevel: 3.8, sport: "Pickleball", mode: "Dobles", club: "Rancho San Francisco", dist: "8 km", date: "Dom", time: "09:00", startsIn: "Dom 09:00", urgency: "later", levelRange: [3.5, 4.2], slotsTotal: 4, players: [{ a: "SL", b: "linear-gradient(135deg,#0891b2,#06b6d4)" }], cost: 7, ranked: true, fit: 78, viewing: 5 },
];

const JUST_OPENED = [
  { name: "Felipe D.", when: "Hoy 18:00", club: "Cumbayá PB", ago: "hace 2 min", av: "FD", bg: "linear-gradient(135deg,#10b981,#047857)" },
  { name: "Constanza R.", when: "Sáb 11:00", club: "Rancho SF", ago: "hace 6 min", av: "CR", bg: "linear-gradient(135deg,#7c3aed,#db2777)" },
  { name: "Joaquín S.", when: "Hoy 20:00", club: "Tumbaco", ago: "hace 9 min", av: "JS", bg: "linear-gradient(135deg,#ca8a04,#facc15)" },
  { name: "Bárbara N.", when: "Mañ 07:30", club: "Academia N.", ago: "hace 12 min", av: "BN", bg: "linear-gradient(135deg,#dc2626,#fb923c)" },
  { name: "Matías R.", when: "Sáb 19:00", club: "Quito Tenis", ago: "hace 14 min", av: "MR", bg: "linear-gradient(135deg,#0891b2,#06b6d4)" },
];

type Scope = "para-ti" | "hoy" | "nivel" | "club" | "cerca" | "vacante1" | "ranked";
type View = "cards" | "list" | "map";
type SortBy = "relevancia" | "hora" | "distancia";

function computeFit(m: Match): { label: string } {
  if (m.fit >= 90) return { label: "casi perfecto" };
  if (m.fit >= 70) return { label: "buen fit" };
  return { label: "arriésgate" };
}

export function BuscarMatchView() {
  const toast = useToast();
  const [scope, setScope] = useState<Scope>("para-ti");
  const [view, setView] = useState<View>("cards");
  const [sortBy, setSortBy] = useState<SortBy>("relevancia");
  const [mode, setMode] = useState("all");
  const [day, setDay] = useState("cualquier");

  const openCrear = () => toast({ icon: "plus-circle", title: "Crear match · próximamente" });

  // Tolerancia flex ±0.4 (el selector de estrictez del prototipo era un tweak
  // del editor; acá se fija en flexible).
  const matchesLevel = (m: Match) => ME.level >= m.levelRange[0] - 0.4 && ME.level <= m.levelRange[1] + 0.4;
  const matchesScope = (m: Match) => {
    if (scope === "para-ti") return m.fit >= 80;
    if (scope === "hoy") return m.date === "Hoy";
    if (scope === "nivel") return ME.level >= m.levelRange[0] && ME.level <= m.levelRange[1];
    if (scope === "club") return m.club === ME.club;
    if (scope === "cerca") return parseFloat(m.dist) <= 6;
    if (scope === "vacante1") return m.slotsTotal - m.players.length === 1;
    if (scope === "ranked") return m.ranked;
    return true;
  };
  const matchesDay = (m: Match) => (day === "cualquier" ? true : day === "hoy" ? m.date === "Hoy" : day === "mañana" ? m.date === "Mañana" : true);
  const matchesMode = (m: Match) => (mode === "all" ? true : m.mode.toLowerCase() === mode);

  const filtered = ALL_MATCHES.filter((m) => matchesLevel(m) && matchesScope(m) && matchesDay(m) && matchesMode(m));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "hora") {
      const order: Record<string, number> = { Hoy: 0, Mañana: 1, Sáb: 2, Dom: 3 };
      return order[a.date] - order[b.date] || a.time.localeCompare(b.time);
    }
    if (sortBy === "distancia") return parseFloat(a.dist) - parseFloat(b.dist);
    return b.fit - a.fit;
  });

  const featured = ALL_MATCHES.find((m) => m.featured) ?? ALL_MATCHES[0];
  const rest = sorted.filter((m) => m.id !== featured.id);

  const counts: Record<Scope, number> = {
    "para-ti": ALL_MATCHES.filter((m) => m.fit >= 80).length,
    hoy: ALL_MATCHES.filter((m) => m.date === "Hoy").length,
    nivel: ALL_MATCHES.filter((m) => ME.level >= m.levelRange[0] && ME.level <= m.levelRange[1]).length,
    club: ALL_MATCHES.filter((m) => m.club === ME.club).length,
    cerca: ALL_MATCHES.filter((m) => parseFloat(m.dist) <= 6).length,
    vacante1: ALL_MATCHES.filter((m) => m.slotsTotal - m.players.length === 1).length,
    ranked: ALL_MATCHES.filter((m) => m.ranked).length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp">Lobby · matches abiertos en tu zona</div>
          <h1 className="font-heading" style={{ fontWeight: 900, fontSize: 44, textTransform: "uppercase", letterSpacing: "-0.03em", lineHeight: 1, margin: "8px 0 0" }}>
            Buscar match<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--muted-fg)", fontSize: 13.5, margin: "8px 0 0" }}>
            <b style={{ color: "#0a0a0a" }}>{ALL_MATCHES.length} matches abiertos</b> · <span style={{ color: "var(--primary)" }}>{counts.nivel} a tu nivel</span> · {counts.hoy} hoy
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <SegBM options={[{ k: "cards", i: "layout-grid" }, { k: "list", i: "list" }, { k: "map", i: "map" }]} value={view} onChange={(v) => setView(v as View)} />
          <SortMenu value={sortBy} onChange={(v) => setSortBy(v as SortBy)} />
          <button className="btn btn-primary" onClick={openCrear}>
            <Icon name="plus" size={13} color="#fff" /> Crear el mío
          </button>
        </div>
      </div>

      {/* CINTA SE ACABA DE ABRIR */}
      <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: 14.4, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingRight: 14, borderRight: "1px solid rgba(255,255,255,0.12)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", boxShadow: "0 0 0 4px rgba(16,185,129,0.25)", animation: "mp-pulse 2s infinite" }} />
          <div className="font-heading" style={{ fontWeight: 900, fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Se acaba
            <br />
            de abrir
          </div>
        </div>
        <div className="mp-touch-hscroll" style={{ display: "flex", gap: 22, alignItems: "center", flex: 1 }}>
          {JUST_OPENED.map((j) => (
            <div key={j.name} style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: j.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #1f1f1f", flexShrink: 0 }}>
                <span className="font-heading" style={{ fontSize: 10.5, fontWeight: 900 }}>{j.av}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
                  {j.name} <span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>· {j.when}</span>
                </div>
                <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 700, marginTop: 1 }}>{j.club} · {j.ago}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTROS RÁPIDOS */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {([
          { k: "para-ti", l: "Para ti", i: "sparkles" },
          { k: "hoy", l: "Hoy", i: "sun" },
          { k: "nivel", l: "Tu nivel", i: "zap" },
          { k: "club", l: "Tu club", i: "building-2" },
          { k: "cerca", l: "Cerca · ≤6 km", i: "map-pin" },
          { k: "vacante1", l: "Falta 1", i: "user-plus" },
          { k: "ranked", l: "Ranked", i: "trophy" },
        ] as const).map((c) => {
          const on = scope === c.k;
          return (
            <button key={c.k} onClick={() => setScope(c.k)} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9999, background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Icon name={c.i} size={12} color={on ? "var(--primary)" : "#0a0a0a"} />
              {c.l}
              <span style={{ padding: "1px 6px", borderRadius: 9999, background: on ? "rgba(255,255,255,0.18)" : "var(--muted)", color: on ? "#fff" : "var(--muted-fg)", fontSize: 10, fontWeight: 900, marginLeft: 2 }}>{counts[c.k] || 0}</span>
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <FineFilter label="Modalidad" value={mode} onChange={setMode} options={[{ k: "all", l: "Todas" }, { k: "singles", l: "Singles" }, { k: "dobles", l: "Dobles" }]} />
        <FineFilter label="Día" value={day} onChange={setDay} options={[{ k: "cualquier", l: "Cualquier día" }, { k: "hoy", l: "Hoy" }, { k: "mañana", l: "Mañana" }]} />
      </div>

      {/* MATCH DESTACADO */}
      <FeaturedMatch m={featured} onJoin={openCrear} />

      {/* GRID / LISTA / MAPA */}
      {view === "map" ? (
        <MapView matches={sorted} />
      ) : view === "list" ? (
        <ListView matches={rest} onJoin={openCrear} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))", gap: 16 }}>
          {rest.map((m) => (
            <MatchCard key={m.id} m={m} onJoin={openCrear} />
          ))}
        </div>
      )}

      {/* EMPTY STATE FOOTER */}
      <div className="card" style={{ padding: 28, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, background: "linear-gradient(135deg,#fafafa 0%, #fff 50%, #ecfdf5 100%)", flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● No encuentras tu match</div>
          <h2 className="font-heading" style={{ fontSize: 28, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.025em", margin: "6px 0 0", lineHeight: 1 }}>
            Créalo tú<span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0", maxWidth: 440 }}>En 60 segundos publicas un match con tu cancha, hora y nivel. Te avisamos cuando se llene.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => toast({ icon: "bell", title: "Alerta de match · próximamente" })}>
            <Icon name="bell" size={13} /> Crear alerta de match
          </button>
          <button className="btn btn-primary" onClick={openCrear}>
            <Icon name="plus-circle" size={13} color="#fff" /> Crear match
          </button>
        </div>
      </div>
    </div>
  );
}

function FeaturedMatch({ m, onJoin }: { m: Match; onJoin: () => void }) {
  const empty = m.slotsTotal - m.players.length;
  const fit = computeFit(m);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", background: "#0a0a0a", color: "#fff", position: "relative", border: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 85% 30%, rgba(16,185,129,0.28), transparent 55%), radial-gradient(ellipse at 5% 90%, rgba(251,191,36,0.10), transparent 55%)" }} />
      <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 240, color: "rgba(255,255,255,0.04)", letterSpacing: "-0.06em", lineHeight: 0.8, transform: "rotate(-6deg) translate(8%, -18%)", textTransform: "uppercase", pointerEvents: "none" }}>MATCH</div>

      <div className="mp-bm-featured" style={{ position: "relative", padding: "24px 28px", display: "grid", gridTemplateColumns: "1.5fr auto 1fr", gap: 28, alignItems: "center" }}>
        <div>
          <div className="chip-green" style={{ marginBottom: 10 }}>
            <span className="chip-dot" />Match destacado para ti
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div className="font-heading" style={{ fontWeight: 900, fontSize: 30, textTransform: "uppercase", letterSpacing: "-0.03em", lineHeight: 1 }}>
              {m.sport} · {m.mode}<span style={{ color: "var(--primary)" }}>.</span>
            </div>
            <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: 18, color: "#fbbf24", letterSpacing: "-0.02em" }}>{m.date} · {m.time}</div>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.75)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="map-pin" size={12} />{m.club} · {m.dist}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="zap" size={12} color="#fbbf24" />Nivel {m.levelRange[0]}–{m.levelRange[1]}</span>
            {m.ranked && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--primary)" }}><Icon name="trophy" size={12} color="var(--primary)" />Cuenta para ranking</span>}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="eye" size={12} />{m.viewing} mirando</span>
          </div>
        </div>

        <SlotsRow players={m.players} total={m.slotsTotal} large dark />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          <FitRing pct={m.fit} />
          <div style={{ textAlign: "right" }}>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>Empieza en</div>
            <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1, marginTop: 4 }}>{m.startsIn}</div>
          </div>
          <button className="btn btn-primary" style={{ padding: "12px 22px", fontSize: 12.5 }} onClick={onJoin}>
            <Icon name="arrow-right" size={14} color="#fff" />Unirme · ${m.cost}
          </button>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: empty === 1 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
            {empty === 1 ? "⚠ último cupo" : empty + " cupos libres"} · {fit.label}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchCard({ m, onJoin }: { m: Match; onJoin: () => void }) {
  const empty = m.slotsTotal - m.players.length;
  const urgencyColor = m.urgency === "hot" ? "#dc2626" : m.urgency === "today" ? "#fbbf24" : m.urgency === "tomorrow" ? "#0a0a0a" : "var(--muted-fg)";
  return (
    <div className="card mp-card-hover" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: urgencyColor, animation: m.urgency === "hot" ? "mp-pulse 1.5s infinite" : "none" }} />
          <span className="font-heading tabular" style={{ fontWeight: 900, fontSize: 13, letterSpacing: "-0.01em" }}>{m.startsIn}</span>
        </div>
        <FitChip pct={m.fit} />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: 17, textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {m.sport} · {m.mode}<span className="dot">.</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="map-pin" size={11} />
            {m.club} · {m.dist}
          </div>
        </div>

        <SlotsRow players={m.players} total={m.slotsTotal} />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
          <LevelBadge range={m.levelRange} />
          {m.ranked && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.1)", color: "var(--primary)", fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <Icon name="trophy" size={9} color="var(--primary)" />Ranked
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="tabular" style={{ fontSize: 11.5, fontWeight: 800, color: "#0a0a0a" }}>${m.cost}<span style={{ color: "var(--muted-fg)", fontWeight: 600 }}>/c.u.</span></span>
        </div>
      </div>

      <div style={{ padding: "10px 14px", background: "#fafafa", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="eye" size={10} />{m.viewing} mirando
        </span>
        <button className="btn btn-primary" style={{ padding: "7px 13px", fontSize: 10.5 }} onClick={onJoin}>
          {empty === 1 ? <>Tomar último cupo<Icon name="zap" size={11} color="#fff" /></> : <>Unirme<Icon name="arrow-right" size={11} color="#fff" /></>}
        </button>
      </div>
    </div>
  );
}

function SlotsRow({ players, total, large, dark }: { players: Player[]; total: number; large?: boolean; dark?: boolean }) {
  const size = large ? 52 : 38;
  const fs = large ? 14 : 11;
  const empty = total - players.length;
  return (
    <div style={{ display: "flex", gap: large ? 10 : 8, alignItems: "center", flexWrap: "wrap" }}>
      {players.map((p, i) => (
        <div key={i} style={{ position: "relative" }}>
          <div style={{ width: size, height: size, borderRadius: "50%", background: p.b, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", border: dark ? "2.5px solid #1f1f1f" : "2px solid #fff", boxShadow: large ? "0 4px 10px rgba(0,0,0,0.25)" : "0 1px 4px rgba(0,0,0,0.08)" }}>
            <span className="font-heading" style={{ fontSize: fs, fontWeight: 900, letterSpacing: "-0.01em" }}>{p.a}</span>
          </div>
          <span style={{ position: "absolute", bottom: -2, right: -2, width: large ? 16 : 12, height: large ? 16 : 12, borderRadius: "50%", background: "var(--primary)", border: dark ? "2px solid #0a0a0a" : "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" size={large ? 8 : 6} color="#fff" />
          </span>
        </div>
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <div key={"e" + i} style={{ width: size, height: size, borderRadius: "50%", border: "2px dashed " + (dark ? "rgba(16,185,129,0.6)" : "var(--primary)"), background: dark ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.04)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)", position: "relative", animation: i === 0 ? "mp-pulse 2.4s infinite" : "none" }}>
          <Icon name="plus" size={large ? 22 : 16} color="var(--primary)" />
          {i === 0 && !large && (
            <span style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", padding: "1px 5px", borderRadius: 4, background: "var(--primary)", color: "#fff", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>TÚ</span>
          )}
        </div>
      ))}
      <div style={{ marginLeft: large ? 6 : 4, paddingLeft: large ? 12 : 8, borderLeft: "1px dashed " + (dark ? "rgba(255,255,255,0.18)" : "var(--border)") }}>
        <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: large ? 22 : 15, letterSpacing: "-0.02em", color: dark ? "#fff" : "#0a0a0a", lineHeight: 1 }}>
          {players.length}<span style={{ color: dark ? "rgba(255,255,255,0.3)" : "#a3a3a3" }}>/{total}</span>
        </div>
        <div style={{ fontSize: large ? 9.5 : 8.5, color: dark ? "rgba(255,255,255,0.5)" : "var(--muted-fg)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em", marginTop: 2 }}>
          {empty === 1 ? "1 cupo" : empty + " cupos"}
        </div>
      </div>
    </div>
  );
}

function LevelBadge({ range }: { range: [number, number] }) {
  const fits = ME.level >= range[0] && ME.level <= range[1];
  const above = ME.level > range[1];
  const icon = fits ? "check" : above ? "arrow-down" : "arrow-up";
  const label = fits ? "Encajas" : above ? "Te queda bajo" : "Te queda alto";
  const bg = fits ? "rgba(16,185,129,0.1)" : "rgba(251,191,36,0.15)";
  const color = fits ? "var(--primary)" : "#92400e";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 9999, background: bg, color, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      <Icon name={icon} size={9} color={color} />
      {range[0]}–{range[1]} · {label}
    </span>
  );
}

function FitChip({ pct }: { pct: number }) {
  const color = pct >= 90 ? "var(--primary)" : pct >= 70 ? "#0a0a0a" : "#a3a3a3";
  return (
    <span className="tabular" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 9999, background: pct >= 90 ? "rgba(16,185,129,0.12)" : "var(--muted)", color, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {pct}% match
    </span>
  );
}

function FitRing({ pct }: { pct: number }) {
  const r = 28;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 76, height: 76 }}>
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="#10b981" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 38 38)" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff" }}>
        <span className="font-heading tabular" style={{ fontWeight: 900, fontSize: 19, letterSpacing: "-0.02em", lineHeight: 1 }}>{pct}<span style={{ fontSize: 11 }}>%</span></span>
        <span style={{ fontSize: 7.5, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Match</span>
      </div>
    </div>
  );
}

function SegBM({ options, value, onChange }: { options: { k: string; i: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", background: "#f5f5f5", borderRadius: 9999, padding: 3 }}>
      {options.map((o) => (
        <button key={o.k} onClick={() => onChange(o.k)} style={{ border: 0, background: value === o.k ? "#0a0a0a" : "transparent", color: value === o.k ? "#fff" : "#737373", padding: "7px 12px", borderRadius: 9999, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center" }}>
          <Icon name={o.i} size={13} color={value === o.k ? "#fff" : "#737373"} />
        </button>
      ))}
    </div>
  );
}

function SortMenu({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff" }}>
      <Icon name="arrow-up-down" size={12} color="var(--muted-fg)" />
      <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-fg)" }}>Ordenar</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, background: "transparent", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", outline: "none" }}>
        <option value="relevancia">Relevancia</option>
        <option value="hora">Más pronto</option>
        <option value="distancia">Más cerca</option>
      </select>
    </div>
  );
}

function FineFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { k: string; l: string }[] }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff" }}>
      <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-fg)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, background: "transparent", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", outline: "none" }}>
        {options.map((o) => (
          <option key={o.k} value={o.k}>{o.l}</option>
        ))}
      </select>
    </div>
  );
}

function ListView({ matches, onJoin }: { matches: Match[]; onJoin: () => void }) {
  return (
    <div className="card mp-touch-hscroll" style={{ padding: 0 }}>
      <div style={{ minWidth: 720 }}>
        <div style={{ padding: "12px 22px", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: BM_LIST_COLS, gap: 14, alignItems: "center", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
          <div>Cuándo</div>
          <div>Match</div>
          <div>Jugadores</div>
          <div>Nivel</div>
          <div style={{ textAlign: "right" }}>Fit / $</div>
          <div />
        </div>
        {matches.map((m) => {
          const empty = m.slotsTotal - m.players.length;
          return (
            <div key={m.id} style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: BM_LIST_COLS, gap: 14, alignItems: "center" }}>
              <div>
                <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: 14 }}>{m.date}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>{m.time}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{m.sport} · {m.mode}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{m.club} · {m.dist}</div>
              </div>
              <SlotsRow players={m.players} total={m.slotsTotal} />
              <div><LevelBadge range={m.levelRange} /></div>
              <div style={{ textAlign: "right" }}>
                <FitChip pct={m.fit} />
                <div className="tabular" style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>${m.cost}</div>
              </div>
              <button className="btn btn-primary" style={{ padding: "8px 13px", fontSize: 10.5 }} onClick={onJoin}>
                {empty === 1 ? "Último cupo" : "Unirme"}<Icon name="arrow-right" size={11} color="#fff" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapView({ matches }: { matches: Match[] }) {
  const positions = [
    { left: "32%", top: "38%" },
    { left: "58%", top: "28%" },
    { left: "72%", top: "55%" },
    { left: "25%", top: "64%" },
    { left: "48%", top: "72%" },
    { left: "64%", top: "42%" },
  ];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", height: 520, position: "relative", background: "radial-gradient(ellipse at 50% 50%, #e7f0ec 0%, #d6e3dd 35%, #c7d6cf 70%, #b6c8c0 100%)" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <defs>
          <pattern id="bm-grid" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
            <path d="M 0 40 L 80 40 M 40 0 L 40 80" stroke="#fff" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bm-grid)" />
        <path d="M 0 280 Q 200 240 400 290 T 800 270 T 1200 310" stroke="#fff" strokeWidth="6" fill="none" opacity="0.7" />
        <path d="M 380 0 Q 360 200 410 360 T 440 720" stroke="#fff" strokeWidth="6" fill="none" opacity="0.7" />
      </svg>

      {matches.slice(0, 6).map((m, i) => {
        const empty = m.slotsTotal - m.players.length;
        return (
          <div key={m.id} style={{ position: "absolute", ...positions[i], transform: "translate(-50%, -100%)" }}>
            <div style={{ background: "#fff", border: "2px solid #0a0a0a", borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 18px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.players[0].b, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 900, fontFamily: "var(--font-heading)" }}>{m.players[0].a}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900 }}>{m.date} · {m.time}</div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.club.slice(0, 16)} · {empty} cupos</div>
              </div>
              <span style={{ padding: "2px 7px", borderRadius: 9999, background: "var(--primary)", color: "#fff", fontSize: 9, fontWeight: 900 }}>{m.fit}%</span>
            </div>
            <div style={{ width: 12, height: 12, background: "#0a0a0a", transform: "rotate(45deg)", margin: "-7px auto 0", position: "relative", zIndex: -1 }} />
          </div>
        );
      })}

      <div style={{ position: "absolute", left: "45%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#3b82f6", border: "3px solid #fff", boxShadow: "0 0 0 6px rgba(59,130,246,0.2), 0 2px 8px rgba(0,0,0,0.25)" }} />
      </div>

      <div style={{ position: "absolute", bottom: 16, left: 16, background: "#fff", padding: "10px 14px", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", display: "flex", gap: 14, alignItems: "center", fontSize: 11, fontWeight: 700 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} /> Tú</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0a0a0a" }} /> Match abierto</span>
      </div>
      <div style={{ position: "absolute", top: 16, right: 16, background: "#fff", padding: "8px 12px", borderRadius: 9999, boxShadow: "0 4px 10px rgba(0,0,0,0.08)", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Icon name="navigation" size={12} color="var(--primary)" /> Quito · Valles
      </div>
    </div>
  );
}
