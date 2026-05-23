"use client";
// Pantalla del ADMIN: overview agregado de membresías de TODOS los clubes.
// Migrada 1:1 del prototipo (ui_kits/dashboard/AdminClubMembresiasScreen.jsx):
// KPIs de comisión/MRR/churn + issues + ranking de clubes + plantillas globales.
// data-lucide → <Icon>, botones sin handler → useToast.
//
// ⚠️ DEMO: datos mock (MRR/churn/comisión por club, issues, plantillas). No hay
// métricas reales de membresías agregadas todavía. Reemplaza la pantalla real
// AdminMembershipsScreen (oversight read-only con adminListClubMemberships:
// lista cross-club real), preservada y des-importada. No rompe flujos
// operativos (las membresías las aprueba el staff del club, no el admin).
// Ver docs/guides/04-placeholders.md y docs/product/07-club-memberships.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
const moneyK = (c: number) => {
  const n = c / 100;
  return n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + n.toFixed(0);
};

type Club = { name: string; city: string; mrr: number; members: number; plans: number; avgPrice: number; churn: number; color: string };
const CLUBS: Club[] = [
  { name: "Club Norte Pickleball", city: "Cumbayá", mrr: 597000, members: 142, plans: 3, avgPrice: 4200, churn: 3.2, color: "#10b981" },
  { name: "Pickle Garden", city: "Cumbayá", mrr: 312000, members: 88, plans: 2, avgPrice: 3500, churn: 5.4, color: "#0ea5e9" },
  { name: "Smash Sport", city: "Cumbayá", mrr: 248000, members: 72, plans: 3, avgPrice: 3400, churn: 2.8, color: "#7c3aed" },
  { name: "Court 21", city: "Quito Norte", mrr: 184000, members: 56, plans: 1, avgPrice: 3280, churn: 8.2, color: "#dc2626" },
  { name: "Padel Club LC", city: "La Carolina", mrr: 156000, members: 42, plans: 2, avgPrice: 3700, churn: 4.1, color: "#f59e0b" },
  { name: "Top Spin Club", city: "Samborondón", mrr: 112000, members: 38, plans: 1, avgPrice: 2940, churn: 6.8, color: "#0a0a0a" },
];

const ISSUES: { kind: "churn" | "pricing" | "support"; club: string; detail: string }[] = [
  { kind: "churn", club: "Court 21", detail: "Churn 8.2% en últimos 30d · sobre promedio (4.7%)" },
  { kind: "pricing", club: "Top Spin Club", detail: "Precio promedio bajo · $29 vs market $34-42" },
  { kind: "support", club: "Pickle Garden", detail: "12 quejas sobre la membresía VIP · revisar beneficios" },
];

const TEMPLATES = [
  { l: "Básica", sub: "Solo reserva", used: 142, color: "#737373" },
  { l: "Plus", sub: "+ invitados", used: 88, color: "#0ea5e9" },
  { l: "Platinum VIP", sub: "Todo el club", used: 56, color: "#10b981" },
  { l: "Day Pass · 10", sub: "Sin cuota mensual", used: 42, color: "#f59e0b" },
];

const TABLE_COLS = "32px 1.8fr 100px 90px 80px 90px 90px 90px";

const initials = (name: string) => name.split(" ").slice(0, 2).map((w) => w[0]).join("");

export function AdminClubMembresiasScreen() {
  const toast = useToast();
  const [sort, setSort] = useState<"mrr" | "members" | "churn">("mrr");
  const [city, setCity] = useState("all");

  const totalMRR = CLUBS.reduce((s, c) => s + c.mrr, 0);
  const totalMembers = CLUBS.reduce((s, c) => s + c.members, 0);
  const platformFee = Math.round(totalMRR * 0.08);
  const avgChurn = (CLUBS.reduce((s, c) => s + c.churn, 0) / CLUBS.length).toFixed(1);

  const filtered = CLUBS.filter((c) => city === "all" || c.city === city);
  const sorted = [...filtered].sort((a, b) => (sort === "mrr" ? b.mrr - a.mrr : sort === "members" ? b.members - a.members : a.churn - b.churn));

  const soon = (title: string) => toast({ icon: "sparkles", title });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Admin · Plataforma</div>
          <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            Membresías de club<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {CLUBS.length} clubes vendiendo membresías · {totalMembers.toLocaleString()} socios totales · MRR agregado {moneyK(totalMRR)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => soon("Política global · próximamente")}>
            <Icon name="settings-2" size={13} /> Política global
          </button>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "download", title: "Reporte exportado (demo)" })}>
            <Icon name="download" size={13} /> Exportar
          </button>
        </div>
      </div>

      {/* Hero + KPIs */}
      <div className="mp-spon-kpis" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", gap: 14 }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)", color: "#fff", padding: 18 }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "#34d399" }}>● Comisión MP (8%)</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399" }}>8% del GMV</span>
            </div>
            <div className="font-heading tabular" style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
              {moneyK(platformFee)}
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginLeft: 6 }}>/mes</span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>Sobre {moneyK(totalMRR)} de GMV agregado de membresías</div>
          </div>
        </div>
        <AdminMembKpi icon="users" label="Socios totales" value={totalMembers.toLocaleString()} sub="+82 esta semana" />
        <AdminMembKpi icon="building-2" label="Clubes activos" value={String(CLUBS.length)} sub="6 con membresías" />
        <AdminMembKpi icon="bar-chart-3" label="MRR agregado" value={moneyK(totalMRR)} sub="Suma de todos los clubes" emerald />
        <AdminMembKpi icon="user-minus" label="Churn promedio" value={avgChurn + "%"} sub="últimos 30 días" warn={Number(avgChurn) > 5} />
      </div>

      {/* Issues */}
      {ISSUES.length > 0 && (
        <div className="card" style={{ padding: 18, background: "#fffbeb", border: "1px solid #fde68a" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Icon name="alert-triangle" size={16} color="#b45309" />
            <h3 className="font-heading" style={{ margin: 0, fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase", color: "#78350f" }}>
              Atención · {ISSUES.length} clubes para revisar<span style={{ color: "#b45309" }}>.</span>
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ISSUES.map((iss) => (
              <div key={iss.club} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: "#fff", border: "1px solid #fde68a", flexWrap: "wrap" }}>
                <span style={{ width: 22, height: 22, borderRadius: 7, background: iss.kind === "churn" ? "#fee2e2" : iss.kind === "pricing" ? "#dbeafe" : "#fef3c7", color: iss.kind === "churn" ? "#dc2626" : iss.kind === "pricing" ? "#0369a1" : "#92400e", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={iss.kind === "churn" ? "user-minus" : iss.kind === "pricing" ? "dollar-sign" : "message-circle"} size={12} color={iss.kind === "churn" ? "#dc2626" : iss.kind === "pricing" ? "#0369a1" : "#92400e"} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, minWidth: 160 }}>{iss.club}</span>
                <span style={{ flex: 1, fontSize: 12, color: "#0a0a0a", minWidth: 180 }}>{iss.detail}</span>
                <button className="btn" style={{ padding: "5px 11px", fontSize: 10.5, background: "#fff", border: "1px solid #fed7aa", color: "#92400e" }} onClick={() => soon("Revisar " + iss.club + " · próximamente")}>
                  Revisar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ranking de clubes */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Ranking</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Clubes por MRR<span className="dot">.</span>
            </h3>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={city} onChange={(e) => setCity(e.target.value)} style={{ padding: "7px 11px", border: "1px solid var(--border)", borderRadius: 9999, fontSize: 11.5, background: "#fff", outline: "none" }}>
              <option value="all">Todas las ciudades</option>
              <option>Cumbayá</option>
              <option>Quito Norte</option>
              <option>La Carolina</option>
              <option>Samborondón</option>
            </select>
            <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)" }}>
              {([{ k: "mrr", l: "MRR" }, { k: "members", l: "Socios" }, { k: "churn", l: "Churn" }] as const).map((s) => {
                const on = sort === s.k;
                return (
                  <button key={s.k} onClick={() => setSort(s.k)} style={{ padding: "5px 11px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)" }}>
                    {s.l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 720 }}>
            <div style={{ display: "grid", gridTemplateColumns: TABLE_COLS, gap: 12, padding: "10px 18px", background: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
              <span>#</span>
              <span>Club</span>
              <span>Ciudad</span>
              <span>Socios</span>
              <span>Planes</span>
              <span>Avg/socio</span>
              <span>Churn</span>
              <span style={{ textAlign: "right" }}>MRR</span>
            </div>
            {sorted.map((c, i) => (
              <div key={c.name} style={{ display: "grid", gridTemplateColumns: TABLE_COLS, gap: 12, padding: "14px 18px", alignItems: "center", borderBottom: i < sorted.length - 1 ? "1px solid var(--border)" : 0 }}>
                <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, color: i < 3 ? c.color : "var(--muted-fg)" }}>{i + 1}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 7, background: c.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 11 }}>{initials(c.name)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{c.plans} plan{c.plans > 1 ? "es" : ""}</div>
                  </div>
                </div>
                <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{c.city}</span>
                <span className="tabular" style={{ fontSize: 13, fontWeight: 700 }}>{c.members}</span>
                <span className="tabular" style={{ fontSize: 13, color: "var(--muted-fg)" }}>{c.plans}</span>
                <span className="tabular" style={{ fontSize: 12, fontWeight: 700 }}>{money(c.avgPrice)}</span>
                <span className="tabular" style={{ fontSize: 12, fontWeight: 700, color: c.churn >= 7 ? "#dc2626" : c.churn >= 5 ? "#b45309" : "#047857" }}>{c.churn}%</span>
                <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, textAlign: "right" }}>{moneyK(c.mrr)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plantillas globales */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Templates</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Plantillas sugeridas a los clubes<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Las usan cuando crean un plan nuevo. Tu fuente de verdad.</p>
          </div>
          <button className="btn btn-outline" onClick={() => soon("Nueva plantilla · próximamente")}>
            <Icon name="plus" size={12} /> Nueva plantilla
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {TEMPLATES.map((t) => (
            <div key={t.l} style={{ padding: 14, borderRadius: 11, border: "1px solid var(--border)", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />
                <span className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>
                  {t.l}<span className="dot">.</span>
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{t.sub}</div>
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--border)", fontSize: 11 }}>
                Usada por <b>{t.used} clubes</b>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminMembKpi({ icon, label, value, sub, emerald, warn }: { icon: string; label: string; value: string; sub?: string; emerald?: boolean; warn?: boolean }) {
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
