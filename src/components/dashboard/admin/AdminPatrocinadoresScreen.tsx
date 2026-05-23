"use client";
// Pantalla del ADMIN: Patrocinadores. CRM de marcas + inventario de slots +
// brand kit con previews de cómo se renderiza la marca en cada superficie.
// Migrada 1:1 del prototipo (ui_kits/dashboard/AdminPatrocinadoresScreen.jsx):
// data-lucide → <Icon>, window.mpToast → useToast.
//
// ⚠️ DEMO: no hay backend de patrocinadores (ni tabla, ni slots, ni métricas).
// Todo el contenido es de muestra y los botones de mutación muestran toast
// "próximamente". Documentado en docs/guides/04-placeholders.md. Si se cablea:
// tabla sponsors + slots + RLS admin + métricas, y los placements reales en cada
// superficie (quedada, torneo, shop, mapa, perfil, comprobante, email, ranking).
import { useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

type Status = "active" | "paused" | "pitch";
type Brand = {
  id: string;
  name: string;
  vertical: string;
  primary: string;
  secondary: string;
  logo: string;
  tag: string;
  spend: number;
  status: Status;
  contract: string;
  contact: string;
  activeSlots: number;
  impressions: number;
  ctr: number;
  bookings: string[];
};
type Slot = { k: string; surface: string; l: string; dim: string; cpm: number; flat: number; sold: string; utilization: number };

const SPONSOR_BRANDS: Brand[] = [
  { id: "bullpadel", name: "Bullpadel", vertical: "Paddles", primary: "#facc15", secondary: "#0a0a0a", logo: "BP", tag: "Performance Pickleball", spend: 4200000, status: "active", contract: "Anual · ene 2026 → ene 2027", contact: "m.lara@bullpadel.com", activeSlots: 6, impressions: 248000, ctr: 3.2, bookings: ["Open MatchPoint Verano", "Coach AI tactic notes", "3 quedadas this week"] },
  { id: "pichincha", name: "Banco Pichincha", vertical: "Banca", primary: "#0066b3", secondary: "#fff", logo: "BP", tag: "Tu banco amigo", spend: 6800000, status: "active", contract: "Anual · mar 2026 → mar 2027", contact: "sponsors@pichincha.ec", activeSlots: 4, impressions: 412000, ctr: 4.1, bookings: ["Title sponsor · 3 torneos", "Email digest banner", "Pay button placement"] },
  { id: "gatorade", name: "Gatorade", vertical: "Hidratación", primary: "#fb923c", secondary: "#0a0a0a", logo: "G", tag: "Es el agua del jugador", spend: 3100000, status: "active", contract: "Trimestral · oct → dic 2026", contact: "sponsorship@pepsico.ec", activeSlots: 5, impressions: 186000, ctr: 2.4, bookings: ["Hidratación cortesía · 12 quedadas", "Stat sponsorship", "Coach AI note"] },
  { id: "joola", name: "Joola", vertical: "Paddles", primary: "#dc2626", secondary: "#fff", logo: "JL", tag: "Born to compete", spend: 2400000, status: "active", contract: "Trimestral · sep → dic 2026", contact: "partners@joola.com", activeSlots: 3, impressions: 142000, ctr: 3.6, bookings: ["Featured pro shop", "Video tutorials · Joola Academy", "Open Sumas 5.0"] },
  { id: "redbull", name: "Red Bull", vertical: "Energía", primary: "#dc2626", secondary: "#0a0a0a", logo: "RB", tag: "Te da alas", spend: 1800000, status: "paused", contract: "Pausa · vuelve feb 2026", contact: "sports@redbull.ec", activeSlots: 0, impressions: 0, ctr: 0, bookings: [] },
  { id: "wilson", name: "Wilson", vertical: "Paddles", primary: "#dc2626", secondary: "#fff", logo: "W", tag: "Play your heart out", spend: 0, status: "pitch", contract: "Propuesta · pendiente firma", contact: "pickleball@wilson.com", activeSlots: 0, impressions: 0, ctr: 0, bookings: [] },
];

const SPONSOR_SLOTS: Slot[] = [
  { k: "quedada-pres", surface: "Quedada", l: "Quedada presentada por", dim: "Banner + carnet + podio", cpm: 0, flat: 3500, sold: "Bullpadel", utilization: 78 },
  { k: "torneo-title", surface: "Torneo", l: "Title sponsor torneo", dim: "Banner + brackets + premios", cpm: 0, flat: 25000, sold: "Banco Pichincha", utilization: 92 },
  { k: "torneo-cat", surface: "Torneo", l: "Categoría co-branded", dim: "Header de categoría", cpm: 0, flat: 8000, sold: "Joola", utilization: 64 },
  { k: "featured-club", surface: "Clubes", l: "Featured Club", dim: "Slot top en /clubes", cpm: 4, flat: 0, sold: "Club Norte", utilization: 100 },
  { k: "featured-shop", surface: "Shop", l: "Featured Pro Shop", dim: "Slot top en /shop", cpm: 6, flat: 0, sold: "Joola", utilization: 88 },
  { k: "mappin", surface: "Mapa", l: "MapPin promovido", dim: "Halo emerald en mapa", cpm: 2, flat: 0, sold: "Pickle Garden", utilization: 56 },
  { k: "stat-sponsor", surface: "Perfil", l: "Stat sponsorship sutil", dim: 'Card con "by [Brand]"', cpm: 1, flat: 0, sold: "Gatorade", utilization: 42 },
  { k: "coach-ai-note", surface: "Coach AI", l: "Coach AI tactic note", dim: '"Powered by" en análisis', cpm: 3, flat: 0, sold: "Bullpadel", utilization: 71 },
  { k: "comprobante", surface: "Comprobante", l: '"Cortesía de" en recibo', dim: "Línea inferior", cpm: 0, flat: 1500, sold: "Gatorade", utilization: 64 },
  { k: "email-digest", surface: "Email", l: "Email digest banner", dim: "1 slot por edición", cpm: 8, flat: 0, sold: "Banco Pichincha", utilization: 100 },
  { k: "jersey-patch", surface: "Ranking", l: "Player patch (top 100)", dim: "Patch en nameplate", cpm: 0, flat: 0, sold: "Marketplace", utilization: 28 },
  { k: "video-tutorial", surface: "Ayuda", l: "Video tutorial brandeado", dim: "Card en categoría", cpm: 0, flat: 4500, sold: "Joola Academy", utilization: 50 },
];

const moneyK = (c: number) => {
  const n = c / 100;
  return n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + n.toFixed(0);
};
const moneyM = (c: number) => "$" + (c / 100000).toFixed(c / 100000 >= 10 ? 0 : 1) + "k";

const STATUS_PALETTE: Record<Status, { bg: string; fg: string; l: string }> = {
  active: { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Activa" },
  paused: { bg: "#fef3c7", fg: "#92400e", l: "Pausada" },
  pitch: { bg: "rgba(14,165,233,0.12)", fg: "#0369a1", l: "Pitch" },
};

export function AdminPatrocinadoresScreen() {
  const toast = useToast();
  const [tab, setTab] = useState<"marcas" | "inventario" | "placements">("marcas");
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");

  const totalSpend = SPONSOR_BRANDS.reduce((s, b) => s + b.spend, 0);
  const activeBrands = SPONSOR_BRANDS.filter((b) => b.status === "active").length;
  const totalImpressions = SPONSOR_BRANDS.reduce((s, b) => s + b.impressions, 0);
  const avgCtr = (SPONSOR_BRANDS.filter((b) => b.ctr > 0).reduce((s, b) => s + b.ctr, 0) / activeBrands).toFixed(1);
  const inventoryUtil = Math.round(SPONSOR_SLOTS.reduce((s, sl) => s + sl.utilization, 0) / SPONSOR_SLOTS.length);

  const filtered = SPONSOR_BRANDS.filter((b) => statusFilter === "all" || b.status === statusFilter);
  const soon = (title: string) => toast({ icon: "sparkles", title });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Admin · Sistema · Sponsors</div>
          <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            Patrocinadores<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {activeBrands} marcas activas · {SPONSOR_SLOTS.length} slots · ingresos mes {moneyM(totalSpend)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => soon("Rate card · próximamente")}>
            <Icon name="file-text" size={13} /> Rate card
          </button>
          <button className="btn btn-primary" onClick={() => soon("Nueva marca · próximamente")}>
            <Icon name="plus" size={13} color="#fff" /> Añadir marca
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mp-spon-kpis" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", gap: 14 }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)", color: "#fff", padding: 18 }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "#34d399" }}>● Ad revenue</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399" }}>+24% vs mes pasado</span>
            </div>
            <div className="font-heading tabular" style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
              {moneyM(totalSpend)}
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginLeft: 6 }}>/mes</span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>{activeBrands} marcas activas · 1 pitch en curso</div>
          </div>
        </div>
        <SponKpi icon="star" label="Marcas activas" value={String(activeBrands)} sub="6 totales · 1 pausada" />
        <SponKpi icon="eye" label="Impresiones mes" value={(totalImpressions / 1000).toFixed(0) + "k"} sub="agregado todas las marcas" />
        <SponKpi icon="mouse-pointer-click" label="CTR promedio" value={avgCtr + "%"} sub="industria pickleball ~2%" emerald />
        <SponKpi icon="layout-grid" label="Inventario usado" value={inventoryUtil + "%"} sub={SPONSOR_SLOTS.length + " tipos de slot"} warn={inventoryUtil < 60} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {([{ k: "marcas", l: "Marcas", icon: "star" }, { k: "inventario", l: "Inventario de slots", icon: "layout-grid" }, { k: "placements", l: "Cómo se ven (preview)", icon: "eye" }] as const).map((t) => {
          const on = tab === t.k;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ padding: "12px 18px", border: 0, borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent", background: "transparent", color: on ? "#0a0a0a" : "var(--muted-fg)", fontFamily: "inherit", fontWeight: on ? 900 : 600, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: -1 }}>
              <Icon name={t.icon} size={13} /> {t.l}
            </button>
          );
        })}
      </div>

      {tab === "marcas" && (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2 }}>
              {([{ k: "all", l: "Todas" }, { k: "active", l: "Activas" }, { k: "paused", l: "Pausadas" }, { k: "pitch", l: "En pitch" }] as const).map((s) => {
                const on = statusFilter === s.k;
                return (
                  <button key={s.k} onClick={() => setStatusFilter(s.k)} style={{ padding: "6px 12px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)" }}>
                    {s.l}
                  </button>
                );
              })}
            </div>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted-fg)" }}>{filtered.length} marcas</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {filtered.map((b) => (
              <BrandCard key={b.id} brand={b} onOpen={() => setOpenBrand(b.id)} />
            ))}
          </div>
        </>
      )}

      {tab === "inventario" && (
        <div className="card" style={{ overflow: "auto" }}>
          <div style={{ minWidth: 760 }}>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1.6fr 1.4fr 80px 90px 110px 110px", gap: 12, padding: "12px 18px", background: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
              <span>Superficie</span>
              <span>Slot</span>
              <span>Especificaciones</span>
              <span>CPM</span>
              <span>Flat</span>
              <span>Vendido a</span>
              <span style={{ textAlign: "right" }}>Ocupación</span>
            </div>
            {SPONSOR_SLOTS.map((s, i) => (
              <div key={s.k} style={{ display: "grid", gridTemplateColumns: "120px 1.6fr 1.4fr 80px 90px 110px 110px", gap: 12, padding: "12px 18px", alignItems: "center", borderBottom: i < SPONSOR_SLOTS.length - 1 ? "1px solid var(--border)" : 0 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.surface}</span>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{s.l}</div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{s.dim}</div>
                <span className="tabular" style={{ fontSize: 12, fontWeight: 700 }}>{s.cpm > 0 ? "$" + s.cpm : "—"}</span>
                <span className="tabular" style={{ fontSize: 12, fontWeight: 700 }}>{s.flat > 0 ? "$" + s.flat : "—"}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{s.sold}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <div style={{ width: 50, height: 5, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: s.utilization + "%", background: s.utilization >= 90 ? "#dc2626" : s.utilization >= 70 ? "#10b981" : "#b45309" }} />
                  </div>
                  <span className="tabular" style={{ fontSize: 11, fontWeight: 800, minWidth: 32, textAlign: "right" }}>{s.utilization}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "placements" && <PlacementsGallery brand={SPONSOR_BRANDS[0]} />}

      {openBrand &&
        (() => {
          const b = SPONSOR_BRANDS.find((x) => x.id === openBrand);
          return b ? <BrandKitDrawer brand={b} onClose={() => setOpenBrand(null)} /> : null;
        })()}
    </div>
  );
}

function SponKpi({ icon, label, value, sub, emerald, warn }: { icon: string; label: string; value: string; sub?: string; emerald?: boolean; warn?: boolean }) {
  const c = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: emerald ? "rgba(16,185,129,0.12)" : warn ? "#fef3c7" : "var(--muted)", color: c, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em", color: c }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BrandCard({ brand, onOpen }: { brand: Brand; onOpen: () => void }) {
  const sp = STATUS_PALETTE[brand.status];
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 80, background: "linear-gradient(135deg, " + brand.primary + " 0%, " + brand.secondary + " 130%)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: brand.secondary, color: brand.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em" }}>{brand.logo}</div>
        <span style={{ position: "absolute", top: 10, right: 10, padding: "3px 9px", borderRadius: 9999, background: sp.bg, color: sp.fg, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>● {sp.l}</span>
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            {brand.name}
            <span className="dot">.</span>
          </h3>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{brand.vertical} · {brand.tag}</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, padding: "10px 0", borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)" }}>
          {[
            { l: "Spend", v: moneyK(brand.spend), c: "#0a0a0a" },
            { l: "Slots", v: String(brand.activeSlots), c: "#0a0a0a" },
            { l: "CTR", v: brand.ctr > 0 ? brand.ctr + "%" : "—", c: brand.ctr >= 3 ? "#047857" : "#0a0a0a" },
          ].map((m) => (
            <div key={m.l}>
              <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{m.l}</div>
              <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, marginTop: 2, color: m.c }}>{m.v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          <Icon name="calendar" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
          {brand.contract}
        </div>
        <button onClick={onOpen} className="btn" style={{ marginTop: "auto", background: "#0a0a0a", color: "#fff", justifyContent: "space-between", padding: "10px 14px" }}>
          <span>Abrir brand kit</span>
          <Icon name="arrow-right" size={13} color="#fff" />
        </button>
      </div>
    </div>
  );
}

function BrandKitDrawer({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const toast = useToast();
  const headerText = brand.secondary === "#fff" ? "#fff" : brand.primary === "#0a0a0a" ? "#fff" : "#0a0a0a";
  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", display: "flex", justifyContent: "flex-end" }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: "100vw", background: "#fafafa", height: "100vh", overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", background: "linear-gradient(135deg, " + brand.primary + ", " + brand.secondary + ")", color: headerText, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: brand.secondary, color: brand.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 20 }}>{brand.logo}</div>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>Brand kit</div>
              <h2 className="font-heading" style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                {brand.name}
                <span className="dot">.</span>
              </h2>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 9999, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.15)", color: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={14} color={headerText} />
          </button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Brand kit editor */}
          <div className="card" style={{ padding: 18 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>01 · Brand kit</div>
            <h3 className="font-heading" style={{ margin: "4px 0 12px", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Assets de la marca<span className="dot">.</span>
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <KitField label="Logo (PNG transparente)">
                <div style={uploadBoxStyle}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: brand.secondary, color: brand.primary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 15 }}>{brand.logo}</div>
                  <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>logo-light.png · 92 KB</span>
                  <button style={tinyBtn} onClick={() => toast({ icon: "upload", title: "Reemplazar · próximamente" })}>Reemplazar</button>
                </div>
              </KitField>
              <KitField label="Logo (sobre fondo claro)">
                <div style={uploadBoxStyle}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: brand.primary, color: brand.secondary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 15 }}>{brand.logo}</div>
                  <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>logo-dark.png · 88 KB</span>
                  <button style={tinyBtn} onClick={() => toast({ icon: "upload", title: "Reemplazar · próximamente" })}>Reemplazar</button>
                </div>
              </KitField>
              <KitField label="Color primario">
                <div style={swatchBox}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: brand.primary, border: "1px solid var(--border)" }} />
                  <span className="tabular" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700 }}>{brand.primary}</span>
                </div>
              </KitField>
              <KitField label="Color secundario">
                <div style={swatchBox}>
                  <span style={{ width: 28, height: 28, borderRadius: 6, background: brand.secondary, border: "1px solid var(--border)" }} />
                  <span className="tabular" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700 }}>{brand.secondary}</span>
                </div>
              </KitField>
              <KitField label="Tagline (máx 32 chars)" full>
                <input defaultValue={brand.tag} maxLength={32} style={kitInput} />
              </KitField>
              <KitField label="CTA preferido" full>
                <input defaultValue="Conoce más" maxLength={20} style={kitInput} />
              </KitField>
              <KitField label="URL destino" full>
                <input defaultValue={"https://" + brand.id + ".com/matchpoint"} style={{ ...kitInput, fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
              </KitField>
            </div>
          </div>

          {/* Placements activos */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div className="label-mp" style={{ color: "var(--primary)" }}>02 · Placements activos</div>
                <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                  Dónde aparece {brand.name}<span className="dot">.</span>
                </h3>
              </div>
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{brand.activeSlots} slots activos</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {brand.bookings.length === 0 && <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin placements activos.</span>}
              {brand.bookings.map((b) => (
                <div key={b} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, background: "var(--muted)" }}>
                  <Icon name="check-circle-2" size={14} color="#047857" />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{b}</span>
                  <button style={tinyBtn} onClick={() => toast({ icon: "bar-chart-3", title: "Métricas · próximamente" })}>Ver métricas</button>
                </div>
              ))}
            </div>
          </div>

          {/* Slot previews */}
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>03 · Slot previews</div>
            <h3 className="font-heading" style={{ margin: "4px 0 4px", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Cómo se renderiza tu marca<span className="dot">.</span>
            </h3>
            <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--muted-fg)" }}>Estas son las superficies disponibles. Lo que ves aquí es exactamente lo que verán los jugadores.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              <PreviewQuedadaCard brand={brand} />
              <PreviewStatSponsor brand={brand} />
              <PreviewCoachAI brand={brand} />
              <PreviewMapPin brand={brand} />
              <PreviewFeaturedClub brand={brand} />
              <PreviewComprobante brand={brand} />
              <PreviewEmailBanner brand={brand} />
              <PreviewJerseyPatch brand={brand} />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "pause", title: "Pausar marca · próximamente" })}>
              <Icon name="pause" size={13} /> Pausar marca
            </button>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "bar-chart-3", title: "Reporte · próximamente" })}>
              <Icon name="bar-chart-3" size={13} /> Ver reporte
            </button>
            <button className="btn btn-primary" onClick={() => { onClose(); toast({ icon: "check-circle-2", title: "Brand kit guardado (demo)" }); }}>
              <Icon name="save" size={13} color="#fff" /> Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KitField({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: full ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

const uploadBoxStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px dashed var(--border)", borderRadius: 9, background: "#fff" };
const swatchBox: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: 8, border: "1px solid var(--border)", borderRadius: 8, background: "#fff" };
const tinyBtn: CSSProperties = { padding: "4px 9px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "#0a0a0a", marginLeft: "auto" };
const kitInput: CSSProperties = { padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", width: "100%" };

// ── Preview components ───────────────────────────────────────
function PreviewWrap({ title, surface, children }: { title: string; surface: string; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", background: "#fafafa", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>{title}</span>
        <span style={{ fontSize: 9, color: "var(--muted-fg)", flexShrink: 0 }}>{surface}</span>
      </div>
      <div style={{ padding: 12 }}>{children}</div>
    </div>
  );
}

function PreviewQuedadaCard({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title="Quedada presentada por" surface="Banner del evento">
      <div style={{ position: "relative", borderRadius: 9, overflow: "hidden", background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 90%)", padding: 14, color: "#fff", minHeight: 110 }}>
        <div aria-hidden style={{ position: "absolute", top: -20, right: -20, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 100, color: "rgba(255,255,255,0.06)", letterSpacing: "-0.06em", lineHeight: 0.8, pointerEvents: "none" }}>QUED</div>
        <div style={{ position: "relative" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.4)", fontSize: 8, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#34d399" }}>● Abierta</span>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", marginTop: 6 }}>
            Americano Sábado<span style={{ color: "#34d399" }}>.</span>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 9999, background: brand.primary, color: brand.secondary === "#fff" ? "#fff" : "#0a0a0a", width: "fit-content", maxWidth: "100%" }}>
            <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.7 }}>Presentada por</span>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: brand.secondary, color: brand.primary, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 8 }}>{brand.logo}</div>
            <span style={{ fontSize: 10, fontWeight: 800 }}>{brand.name}</span>
          </div>
        </div>
      </div>
    </PreviewWrap>
  );
}

function PreviewStatSponsor({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title="Stat sponsorship sutil" surface="Perfil del jugador">
      <div style={{ padding: 12, borderRadius: 9, background: "#fff", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>WIN RATE</div>
        <div className="font-heading tabular" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 3 }}>64%</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4 }}>últimos 30 días</div>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 7.5, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.1em", textTransform: "uppercase" }}>by</span>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: brand.primary, color: brand.secondary, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 7 }}>{brand.logo}</div>
          <span style={{ fontSize: 10, fontWeight: 800, color: brand.primary === "#fff" ? "#0a0a0a" : brand.primary }}>{brand.name}</span>
        </div>
      </div>
    </PreviewWrap>
  );
}

function PreviewCoachAI({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title='Coach AI tactic note "powered by"' surface="Coach AI">
      <div style={{ position: "relative", borderRadius: 9, padding: 12, background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)", color: "#fff", overflow: "hidden", minHeight: 110 }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%, rgba(16,185,129,0.2), transparent 55%)" }} />
        <div style={{ position: "relative" }}>
          <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#34d399" }}>● Tactic note</span>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, fontStyle: "italic", lineHeight: 1.4 }}>&quot;Tu rival tira mucho a tu revés. Sube a la red con un slice de transición.&quot;</p>
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px dashed rgba(255,255,255,0.18)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Powered by</span>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: brand.primary, color: brand.secondary, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 7 }}>{brand.logo}</div>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#fff" }}>{brand.name} Performance Lab</span>
          </div>
        </div>
      </div>
    </PreviewWrap>
  );
}

function PreviewMapPin({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title="MapPin promovido" surface="Mapa de clubes">
      <div style={{ position: "relative", height: 130, borderRadius: 9, background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)", overflow: "hidden", border: "1px solid var(--border)" }}>
        <svg viewBox="0 0 200 130" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.4 }}>
          <path d="M 0 30 Q 60 50 100 35 T 200 60" stroke="#fff" strokeWidth="3" fill="none" />
          <path d="M 0 80 Q 80 70 140 90 T 200 100" stroke="#fff" strokeWidth="3" fill="none" />
        </svg>
        <div style={{ position: "absolute", top: 30, left: 50 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#0a0a0a", border: "2px solid #fff" }} />
        </div>
        <div style={{ position: "absolute", top: 50, left: 110, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: "rgba(16,185,129,0.35)", animation: "mp-pulse 2s ease-in-out infinite" }} />
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#10b981", border: "3px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: brand.primary, color: brand.secondary, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 6 }}>{brand.logo}</div>
          </div>
          <span style={{ marginTop: 4, padding: "2px 6px", borderRadius: 4, background: "#fff", fontSize: 8, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "#047857" }}>Featured</span>
        </div>
      </div>
    </PreviewWrap>
  );
}

function PreviewFeaturedClub({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title="Featured Pro Shop card" surface="Shop">
      <div style={{ borderRadius: 9, background: "#fff", border: "2px solid " + brand.primary, padding: 10, position: "relative" }}>
        <span style={{ position: "absolute", top: -8, left: 10, padding: "2px 7px", borderRadius: 9999, background: brand.primary, color: brand.secondary, fontSize: 8, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>Featured</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 7, background: brand.primary, color: brand.secondary, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 14 }}>{brand.logo}</div>
          <div>
            <div className="font-heading" style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase" }}>
              {brand.name} Pro<span className="dot">.</span>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{brand.tag}</div>
          </div>
        </div>
        <div style={{ marginTop: 8, padding: 6, borderRadius: 6, background: "var(--muted)", fontSize: 10, fontWeight: 700, textAlign: "center" }}>25% off para socios · &quot;JUEGA&quot;</div>
      </div>
    </PreviewWrap>
  );
}

function PreviewComprobante({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title='"Cortesía de" en comprobante' surface="Recibo de quedada">
      <div style={{ padding: 12, background: "#fff", borderRadius: 9, border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Costos del evento</div>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 10.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Canchas</span>
            <span className="tabular" style={{ fontWeight: 800 }}>$162</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Premios</span>
            <span className="tabular" style={{ fontWeight: 800 }}>$53</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4, borderTop: "1px dashed var(--border)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              Hidratación
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 9999, background: brand.primary, color: brand.secondary, fontSize: 7.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                <span>by</span>
                <span>{brand.name}</span>
              </span>
            </span>
            <span style={{ fontWeight: 800, color: "#047857" }}>cortesía</span>
          </div>
        </div>
      </div>
    </PreviewWrap>
  );
}

function PreviewEmailBanner({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title="Email digest banner" surface="Email semanal">
      <div style={{ borderRadius: 9, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{ padding: 10, fontSize: 9.5, color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>● MATCHPOINT · Resumen semanal</div>
        <div style={{ background: brand.primary, color: brand.secondary === "#fff" ? "#fff" : "#0a0a0a", padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 7, background: brand.secondary, color: brand.primary, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 13 }}>{brand.logo}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-heading" style={{ fontSize: 12, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
              {brand.name}
              <span style={{ opacity: 0.6 }}>.</span>
            </div>
            <div style={{ fontSize: 9.5, opacity: 0.85 }}>{brand.tag}</div>
          </div>
          <span style={{ fontSize: 9, fontWeight: 800, padding: "3px 8px", borderRadius: 9999, background: "rgba(255,255,255,0.2)" }}>CONOCE →</span>
        </div>
        <div style={{ padding: "4px 10px", background: "#fafafa", fontSize: 7.5, color: "var(--muted-fg)", textAlign: "right", letterSpacing: "0.08em", textTransform: "uppercase" }}>Patrocinado</div>
      </div>
    </PreviewWrap>
  );
}

function PreviewJerseyPatch({ brand }: { brand: Brand }) {
  return (
    <PreviewWrap title="Player patch (top 100)" surface="Ranking nacional">
      <div style={{ borderRadius: 9, background: "#fff", border: "1px solid var(--border)", padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
        <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, color: "#10b981", minWidth: 22 }}>#7</span>
        <div style={{ position: "relative" }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#db2777)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 10 }}>MV</div>
          <div style={{ position: "absolute", bottom: -2, right: -4, width: 14, height: 14, borderRadius: 4, background: brand.primary, color: brand.secondary, border: "2px solid #fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 6 }}>{brand.logo}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Mateo Vélez</div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: 9, color: "var(--muted-fg)" }}>
            <span style={{ padding: "1px 6px", borderRadius: 9999, background: brand.primary, color: brand.secondary, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 7.5 }}>by {brand.name}</span>
            <span>· Nivel 4.5</span>
          </div>
        </div>
      </div>
    </PreviewWrap>
  );
}

function PlacementsGallery({ brand }: { brand: Brand }) {
  const [selectedBrand, setSelectedBrand] = useState(brand.id);
  const cur = SPONSOR_BRANDS.find((b) => b.id === selectedBrand) ?? brand;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 11, background: "var(--muted)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Cambia la marca:</span>
        {SPONSOR_BRANDS.filter((b) => b.status === "active").map((b) => {
          const on = selectedBrand === b.id;
          return (
            <button key={b.id} onClick={() => setSelectedBrand(b.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 5px", borderRadius: 9999, border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>
              <span style={{ width: 22, height: 22, borderRadius: 5, background: b.primary, color: b.secondary, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 10 }}>{b.logo}</span>
              {b.name}
            </button>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--muted-fg)" }}>Ves lo mismo que verán los jugadores</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <PreviewQuedadaCard brand={cur} />
        <PreviewStatSponsor brand={cur} />
        <PreviewCoachAI brand={cur} />
        <PreviewMapPin brand={cur} />
        <PreviewFeaturedClub brand={cur} />
        <PreviewComprobante brand={cur} />
        <PreviewEmailBanner brand={cur} />
        <PreviewJerseyPatch brand={cur} />
      </div>
    </div>
  );
}
