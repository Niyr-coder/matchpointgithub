"use client";
// Pantalla del ADMIN para MATCHPOINT+ (rediseño analytics/pricing). Migrada 1:1
// del prototipo (ui_kits/dashboard/AdminMatchPointPlusScreen.jsx): KPIs
// financieros + planes editables + funnel + features + suscriptores + promos.
// data-lucide → <Icon>, window.mpToast → useToast.
//
// MERGE (sin regresión): este rediseño ahora recibe `data: AdminPlusData` del
// server AdminMatchPointPlusScreenServer y SUMA la cola de aprobación operativa
// REAL — comprobantes de plan premium (player_subscriptions) y featuring de
// clubes (club_featuring_subscriptions). Aprobar/rechazar usa las acciones
// reales (approvePlanSubscriptionAdmin / rejectPlanSubscriptionAdmin /
// approveClubFeaturingAdmin / rejectClubFeaturingAdmin). La pantalla operativa
// previa (AdminPlansScreen + AdminPlansScreenView) queda preservada/des-importada.
//
// NOTA: el bloque analytics/pricing (planes editables mensual/anual, trials,
// MRR/ARPU, funnel, features, suscriptores, promos) es la META DE PRODUCTO del
// diseño y se conserva 1:1. Hoy esos números son ilustrativos: el modelo real
// de billing es $5/mes por transferencia/DeUna sin trial/anual/promos. Cablear
// pricing editable y códigos promo reales requiere TABLAS NUEVAS (planes
// configurables + promo_codes) — pendiente, ver resumen. Ver
// docs/guides/04-placeholders.md y docs/product/00-matchpoint-plus.md.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { RS_BORDER } from "@/components/dashboard/widgets/RS";
import { approvePlanSubscriptionAdmin } from "@/server/actions/player-subscriptions";
import { rejectPlanSubscriptionAdmin } from "@/server/actions/admin-plans";
import { approveClubFeaturingAdmin } from "@/server/actions/club-featuring";
import { rejectClubFeaturingAdmin } from "@/server/actions/admin-club-featuring";
import type {
  PendingPlanSubscriptionRow,
  RecentPlanSubscriptionRow,
} from "@/server/actions/admin-plans";
import type {
  PendingClubFeaturingRow,
  RecentClubFeaturingRow,
} from "@/server/actions/admin-club-featuring";

export type AdminPlusData = {
  pending: PendingPlanSubscriptionRow[];
  recent: RecentPlanSubscriptionRow[];
  pendingFeaturing: PendingClubFeaturingRow[];
  recentFeaturing: RecentClubFeaturingRow[];
  activeFeaturedCount: number;
};

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
const moneyK = (c: number) => {
  const n = c / 100;
  return n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + n.toFixed(0);
};

// ── helpers de la cola operativa real ───────────────────────────────────
function fmtMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isImageUrl(url: string | null): boolean {
  if (!url) return false;
  const lower = url.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(lower);
}

type Plan = { priceCents: number; active: number };

const FUNNEL = [
  { l: "Visitas a la página MP+", v: 28412, pct: 100, color: "#0a0a0a" },
  { l: 'Click "Empezar prueba"', v: 6240, pct: 22, color: "#0a0a0a" },
  { l: "Inició trial 14d", v: 4180, pct: 15, color: "#10b981" },
  { l: "Convirtió a pago", v: 2820, pct: 10, color: "#047857" },
];

const FEATURES = [
  { icon: "sparkles", l: "Coach AI · análisis", uses: 18420, pct: 86 },
  { icon: "infinity", l: "Quedadas ilimitadas", uses: 14210, pct: 72 },
  { icon: "bar-chart-3", l: "Stats avanzadas", uses: 11800, pct: 58 },
  { icon: "trophy", l: "Acceso anticipado torneos", uses: 6240, pct: 31 },
  { icon: "phone", l: "Soporte prioritario · llamada", uses: 840, pct: 4 },
];

type SubStatus = "active" | "trial" | "cancel" | "overdue";
const SUBSCRIBERS: { who: string; initials: string; plan: string; status: SubStatus; since: string; ltv: number; mrr: number; avBg: string }[] = [
  { who: "Camila Aguilar", initials: "CA", plan: "Anual", status: "active", since: "oct 2024", ltv: 7999, mrr: 666, avBg: "linear-gradient(135deg,#10b981,#047857)" },
  { who: "Andrés Vega", initials: "AV", plan: "Mensual", status: "trial", since: "hace 6d", ltv: 0, mrr: 999, avBg: "linear-gradient(135deg,#ca8a04,#facc15)" },
  { who: "Renata Salas", initials: "RS", plan: "Mensual", status: "cancel", since: "jul 2025", ltv: 4995, mrr: 0, avBg: "linear-gradient(135deg,#f59e0b,#ef4444)" },
  { who: "Diego Carrasco", initials: "DC", plan: "Anual", status: "active", since: "feb 2025", ltv: 7999, mrr: 666, avBg: "linear-gradient(135deg,#0a0a0a,#374151)" },
  { who: "Mateo Bravo", initials: "MB", plan: "Mensual", status: "overdue", since: "mar 2025", ltv: 12987, mrr: 0, avBg: "linear-gradient(135deg,#dc2626,#b91c1c)" },
];
const SUB_STATUS: Record<SubStatus, { bg: string; fg: string; l: string }> = {
  active: { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Activo" },
  trial: { bg: "#fef3c7", fg: "#92400e", l: "Trial 14d" },
  cancel: { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Canceló" },
  overdue: { bg: "#fee2e2", fg: "#dc2626", l: "Vencido" },
};

const PROMOS = [
  { code: "PICKLE2026", off: "50% × 3 meses", uses: "412", cap: "1000", exp: "jun 30" },
  { code: "FRIEND", off: "$5 off mensual", uses: "1840", cap: "∞", exp: "—" },
  { code: "CLUB-NORTE", off: "1 mes free", uses: "84", cap: "200", exp: "jul 15" },
];

const SUBS_COLS = "1.8fr 110px 130px 110px 110px 90px";

export function AdminMatchPointPlusScreen({ data }: { data: AdminPlusData }) {
  const toast = useToast();
  const router = useRouter();
  const { confirm, ask } = usePromptModal();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [plans, setPlans] = useState<{ monthly: Plan; annual: Plan }>({
    monthly: { priceCents: 999, active: 4280 },
    annual: { priceCents: 7999, active: 1840 },
  });
  const [promoOpen, setPromoOpen] = useState(false);

  // Refresca la cola cuando cambian las tablas operativas (otro admin aprueba,
  // un usuario sube comprobante, etc).
  useRealtimeRefresh(
    [
      { table: "player_subscriptions" },
      { table: "club_featuring_subscriptions" },
      { table: "transactions" },
      { table: "clubs" },
    ],
    { debounceMs: 5000 },
  );

  const { pending, pendingFeaturing, activeFeaturedCount } = data;

  // KPIs operativos reales (cola pendiente + clubes destacados activos).
  const pendingProofCount = useMemo(
    () => pending.filter((p) => !!p.proofSignedUrl).length,
    [pending],
  );

  const handleApprovePlan = async (p: PendingPlanSubscriptionRow) => {
    const ok = await confirm({
      title: "Aprobar plan",
      body: `¿Activar el plan ${p.tier} para ${p.displayName} por ${p.durationMonths} mes${p.durationMonths === 1 ? "" : "es"}?`,
      confirmLabel: "Aprobar plan",
    });
    if (!ok) return;
    setBusyId(p.subscriptionId);
    const res = await approvePlanSubscriptionAdmin({ subscriptionId: p.subscriptionId });
    setBusyId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Plan activado", sub: p.displayName });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleRejectPlan = async (p: PendingPlanSubscriptionRow) => {
    const reason = await ask({
      title: "Rechazar plan",
      label: "Motivo del rechazo",
      placeholder: "Ej: comprobante no válido, monto incorrecto…",
      required: true,
      multiline: true,
      confirmLabel: "Rechazar",
      destructive: true,
      validate: (v) => (v.trim().length < 2 ? "Escribe un motivo" : null),
    });
    if (reason == null) return;
    setBusyId(p.subscriptionId);
    const res = await rejectPlanSubscriptionAdmin({
      subscriptionId: p.subscriptionId,
      reason: reason.trim(),
    });
    setBusyId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Solicitud rechazada", sub: "El usuario podrá volver a solicitarlo" });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleApproveFeaturing = async (p: PendingClubFeaturingRow) => {
    const ok = await confirm({
      title: "Aprobar featuring",
      body: `¿Activar el featuring del club ${p.clubName} por ${p.durationDays} día${p.durationDays === 1 ? "" : "s"}?`,
      confirmLabel: "Aprobar featuring",
    });
    if (!ok) return;
    setBusyId(p.subscriptionId);
    const res = await approveClubFeaturingAdmin({ subscriptionId: p.subscriptionId });
    setBusyId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Featuring activado", sub: p.clubName });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleRejectFeaturing = async (p: PendingClubFeaturingRow) => {
    const reason = await ask({
      title: "Rechazar featuring",
      label: "Motivo del rechazo",
      placeholder: "Ej: comprobante no válido, monto incorrecto…",
      required: true,
      multiline: true,
      confirmLabel: "Rechazar",
      destructive: true,
      validate: (v) => (v.trim().length < 2 ? "Escribe un motivo" : null),
    });
    if (reason == null) return;
    setBusyId(p.subscriptionId);
    const res = await rejectClubFeaturingAdmin({
      subscriptionId: p.subscriptionId,
      reason: reason.trim(),
    });
    setBusyId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Solicitud rechazada", sub: "El club podrá volver a solicitarlo" });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const totalSubs = plans.monthly.active + plans.annual.active;
  const mrr = plans.monthly.active * plans.monthly.priceCents + Math.round((plans.annual.active * plans.annual.priceCents) / 12);
  const arpu = Math.round(mrr / totalSubs);
  const savings = Math.round((1 - plans.annual.priceCents / 12 / plans.monthly.priceCents) * 100);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ icon: "copy", title: "Código copiado", sub: code });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar" });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Admin · Plataforma · Premium</div>
          <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            MATCHPOINT<span style={{ color: "var(--primary)" }}>+</span>
            <span className="dot">.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {totalSubs.toLocaleString()} suscriptores activos · MRR {moneyK(mrr)} · ARPU {money(arpu)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => setPromoOpen(true)} style={{ background: "#fff", border: "1px solid var(--border)" }}>
            <Icon name="ticket" size={13} /> Crear código promo
          </button>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "download", title: "Reporte exportado (demo)" })}>
            <Icon name="download" size={13} /> Exportar
          </button>
          <button className="btn btn-primary" onClick={() => toast({ icon: "edit-3", title: "Editar landing pública (demo)" })}>
            <Icon name="edit-3" size={13} color="#fff" /> Editar landing
          </button>
        </div>
      </div>

      {/* Hero strip — MRR + 4 KPIs */}
      <div className="mp-spon-kpis" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 1fr", gap: 14 }}>
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)", color: "#fff", padding: 18 }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "#34d399" }}>● Recurrente</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399" }}>+18.2% vs mes anterior</span>
            </div>
            <div className="font-heading tabular" style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
              {moneyK(mrr)}
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginLeft: 6 }}>/mes</span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>
              {plans.monthly.active.toLocaleString()} mensual · {plans.annual.active.toLocaleString()} anual
            </div>
          </div>
        </div>
        <AdminMpKpi icon="users" label="Suscriptores" value={totalSubs.toLocaleString()} sub="+412 esta semana" />
        <AdminMpKpi icon="trending-up" label="Tasa conversión" value="10.1%" sub="trial → pago" emerald />
        <AdminMpKpi icon="user-minus" label="Churn 30d" value="3.4%" sub="146 cancelaciones" warn />
        <AdminMpKpi
          icon="inbox"
          label="Por aprobar"
          value={String(pending.length + pendingFeaturing.length)}
          sub={`${pendingProofCount} con comprobante`}
          warn={pending.length + pendingFeaturing.length > 0}
        />
      </div>

      {/* ── Cola de aprobación operativa REAL ───────────────────────────── */}
      <PendingPlansSection
        pending={pending}
        busyId={busyId}
        onApprove={handleApprovePlan}
        onReject={handleRejectPlan}
      />

      <PendingClubFeaturingSection
        pending={pendingFeaturing}
        activeFeaturedCount={activeFeaturedCount}
        busyId={busyId}
        onApprove={handleApproveFeaturing}
        onReject={handleRejectFeaturing}
      />

      {/* Planes editables */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Pricing</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Planes activos<span className="dot">.</span>
            </h3>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Los cambios aplican a nuevos suscriptores</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <PlanEditCard cycle="Mensual" plan={plans.monthly} priceLabel="/mes" onChange={(p) => setPlans({ ...plans, monthly: p })} mrrPart={plans.monthly.active * plans.monthly.priceCents} />
          <PlanEditCard cycle="Anual" plan={plans.annual} priceLabel="/año" onChange={(p) => setPlans({ ...plans, annual: p })} mrrPart={Math.round((plans.annual.active * plans.annual.priceCents) / 12)} savings={savings} />
        </div>
      </div>

      {/* Funnel + Features */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Conversión</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Funnel últimos 30 días<span className="dot">.</span>
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {FUNNEL.map((f) => (
              <div key={f.l}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{f.l}</span>
                  <span className="tabular" style={{ fontSize: 13, fontWeight: 800 }}>
                    {f.v.toLocaleString()}
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>{f.pct}%</span>
                  </span>
                </div>
                <div style={{ height: 26, borderRadius: 6, background: "var(--muted)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: f.pct + "%", background: f.color, transition: "width 320ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, padding: 12, borderRadius: 9, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="zap" size={14} color="#047857" />
            <span style={{ fontSize: 11.5, color: "#065f46" }}>
              <b>67% retention</b> después de los 14 días de trial · A/B test del CTA &quot;Empezar prueba&quot; muestra +12% vs control.
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Uso</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Features más usados<span className="dot">.</span>
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FEATURES.map((f) => (
              <div key={f.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={f.icon} size={14} color="#047857" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 4, gap: 8 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.l}</span>
                    <span className="tabular" style={{ color: "var(--muted-fg)", fontWeight: 800, flexShrink: 0 }}>{f.uses.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: f.pct + "%", background: "var(--primary)" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)", fontSize: 11.5, color: "var(--muted-fg)" }}>
            <Icon name="info" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
            &quot;Soporte llamada&quot; tiene baja adopción · considera promoverlo más en el dashboard.
          </div>
        </div>
      </div>

      {/* Suscriptores recientes */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--border)", gap: 8, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Movimiento reciente</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Suscriptores<span className="dot">.</span>
            </h3>
          </div>
          <button className="btn btn-outline" onClick={() => toast({ icon: "users", title: "Ver todos · próximamente" })}>
            Ver todos <Icon name="arrow-right" size={12} />
          </button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 720 }}>
            <div style={{ display: "grid", gridTemplateColumns: SUBS_COLS, gap: 12, padding: "10px 20px", background: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
              <span>Usuario</span>
              <span>Plan</span>
              <span>Estado</span>
              <span>Suscrito</span>
              <span>LTV</span>
              <span style={{ textAlign: "right" }}>MRR</span>
            </div>
            {SUBSCRIBERS.map((s, i, arr) => {
              const sp = SUB_STATUS[s.status];
              return (
                <div key={s.who} style={{ display: "grid", gridTemplateColumns: SUBS_COLS, gap: 12, padding: "12px 20px", alignItems: "center", borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: s.avBg, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 11.5 }}>{s.initials}</span>
                    <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.who}</div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{s.plan}</span>
                  <span style={{ padding: "3px 9px", borderRadius: 9999, background: sp.bg, color: sp.fg, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", justifySelf: "start" }}>{sp.l}</span>
                  <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{s.since}</span>
                  <span className="font-heading tabular" style={{ fontSize: 13, fontWeight: 800 }}>{money(s.ltv)}</span>
                  <span className="font-heading tabular" style={{ fontSize: 13, fontWeight: 800, textAlign: "right", color: s.mrr > 0 ? "#047857" : "var(--muted-fg)" }}>{s.mrr > 0 ? money(s.mrr) : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Promos */}
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Marketing</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Códigos promocionales<span className="dot">.</span>
            </h3>
          </div>
          <button className="btn btn-outline" onClick={() => setPromoOpen(true)}>
            <Icon name="plus" size={12} /> Nuevo código
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {PROMOS.map((p) => (
            <div key={p.code} style={{ padding: 14, borderRadius: 11, border: "1px dashed var(--border)", background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "0.02em", fontFamily: "ui-monospace, monospace" }}>{p.code}</div>
                <button onClick={() => copyCode(p.code)} aria-label="Copiar código" style={{ width: 24, height: 24, borderRadius: 6, border: 0, background: "transparent", color: "var(--muted-fg)", cursor: "pointer" }}>
                  <Icon name="copy" size={12} />
                </button>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{p.off}</div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "#0a0a0a" }}>
                <span>Usos: {p.uses}/{p.cap}</span>
                <span>Vence: {p.exp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {promoOpen && (
        <div onMouseDown={() => setPromoOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onMouseDown={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 460, width: "100%", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Promo</div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Nuevo código<span className="dot">.</span>
              </h3>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Código</span>
              <input placeholder="EJ: BLACKFRIDAY" style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 800, textTransform: "uppercase", outline: "none" }} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Tipo</span>
                <select style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }}>
                  <option>% descuento</option>
                  <option>$ descuento</option>
                  <option>Días gratis</option>
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Valor</span>
                <input type="number" placeholder="50" style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", fontVariantNumeric: "tabular-nums" }} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="btn" onClick={() => setPromoOpen(false)} style={{ background: "#fff", border: "1px solid var(--border)" }}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={() => { setPromoOpen(false); toast({ icon: "check-circle-2", title: "Código creado (demo)" }); }}>
                <Icon name="check" size={13} color="#fff" /> Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminMpKpi({ icon, label, value, sub, emerald, warn }: { icon: string; label: string; value: string; sub?: string; emerald?: boolean; warn?: boolean }) {
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

function PlanEditCard({ cycle, plan, priceLabel, onChange, mrrPart, savings }: { cycle: string; plan: Plan; priceLabel: string; onChange: (p: Plan) => void; mrrPart: number; savings?: number }) {
  return (
    <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
          {cycle}<span className="dot">.</span>
        </div>
        {savings != null && savings > 0 && (
          <span style={{ padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "#047857", fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>−{savings}% ahorro</span>
        )}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-fg)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Precio{priceLabel}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--muted-fg)" }}>$</span>
          <input type="number" step="0.01" value={plan.priceCents / 100} onChange={(e) => onChange({ ...plan, priceCents: Math.round(Number(e.target.value) * 100) })} style={{ width: 110, padding: "6px 0", border: 0, borderBottom: "2px dashed var(--border)", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 28, fontVariantNumeric: "tabular-nums", outline: "none", background: "transparent" }} />
        </div>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Suscriptores</div>
          <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900 }}>{plan.active.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>MRR</div>
          <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "#047857" }}>{money(mrrPart)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Sección operativa: comprobantes de plan premium pendientes ───────────
function PendingPlansSection({
  pending,
  busyId,
  onApprove,
  onReject,
}: {
  pending: PendingPlanSubscriptionRow[];
  busyId: string | null;
  onApprove: (p: PendingPlanSubscriptionRow) => void;
  onReject: (p: PendingPlanSubscriptionRow) => void;
}) {
  return (
    <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Aprobación · planes</div>
          <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Comprobantes por aprobar<span className="dot">.</span>
          </h3>
        </div>
        <span style={{ padding: "3px 9px", borderRadius: 9999, background: pending.length > 0 ? "#fef3c7" : "var(--muted)", color: pending.length > 0 ? "#92400e" : "var(--muted-fg)", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </span>
      </div>

      {pending.length === 0 ? (
        <div style={{ padding: "20px 16px", border: "1px dashed var(--border)", borderRadius: 12, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
          No hay comprobantes de plan por aprobar.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pending.map((p) => {
            const isBusy = busyId === p.subscriptionId;
            const hasProof = !!p.proofSignedUrl;
            const txMissing = p.transactionId == null;
            return (
              <div
                key={p.subscriptionId}
                style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 14, alignItems: "center", padding: 12, border: RS_BORDER, borderRadius: 12, background: "#fff" }}
              >
                <ProofThumb hasProof={hasProof} proofUrl={p.proofUrl} proofSignedUrl={p.proofSignedUrl} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}</div>
                    <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 9999, background: "#0a0a0a", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>{p.tier}</span>
                  </div>
                  {p.username ? (
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", textTransform: "lowercase" }}>@{p.username}</div>
                  ) : null}
                  <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "var(--primary)", letterSpacing: "-0.02em" }}>
                    {fmtMoney(p.amountCents, p.currency)}
                    <span style={{ fontSize: 10.5, color: "var(--muted-fg)", marginLeft: 8, fontWeight: 600, letterSpacing: 0 }}>
                      · {p.durationMonths} mes{p.durationMonths === 1 ? "" : "es"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    Solicitado: {fmtDate(p.createdAt)}
                    {p.proofSignedUrl ? (
                      <>
                        {" · "}
                        <a href={p.proofSignedUrl} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Ver comprobante</a>
                      </>
                    ) : null}
                  </div>
                  {txMissing ? (
                    <div style={{ marginTop: 2, fontSize: 10, color: "#dc2626", fontWeight: 700 }}>⚠ Sin transacción asociada</div>
                  ) : !hasProof ? (
                    <div style={{ marginTop: 2, fontSize: 10, color: "#b45309", fontWeight: 700 }}>Comprobante aún no subido por el usuario</div>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ background: "#fff", border: RS_BORDER }} onClick={() => onReject(p)} disabled={isBusy}>
                    <Icon name="x" size={12} /> Rechazar
                  </button>
                  <button className="btn btn-primary" onClick={() => onApprove(p)} disabled={isBusy}>
                    <Icon name="check" size={13} color="#fff" /> {isBusy ? "…" : "Aprobar plan"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sección operativa: featuring de clubes pendiente ─────────────────────
function PendingClubFeaturingSection({
  pending,
  activeFeaturedCount,
  busyId,
  onApprove,
  onReject,
}: {
  pending: PendingClubFeaturingRow[];
  activeFeaturedCount: number;
  busyId: string | null;
  onApprove: (p: PendingClubFeaturingRow) => void;
  onReject: (p: PendingClubFeaturingRow) => void;
}) {
  return (
    <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Aprobación · featuring</div>
          <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Clubes destacados por aprobar<span className="dot">.</span>
          </h3>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ padding: "3px 9px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "#047857", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {activeFeaturedCount} activo{activeFeaturedCount === 1 ? "" : "s"}
          </span>
          <span style={{ padding: "3px 9px", borderRadius: 9999, background: pending.length > 0 ? "#fef3c7" : "var(--muted)", color: pending.length > 0 ? "#92400e" : "var(--muted-fg)", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {pending.length} pendiente{pending.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {pending.length === 0 ? (
        <div style={{ padding: "20px 16px", border: "1px dashed var(--border)", borderRadius: 12, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
          No hay solicitudes de featuring pendientes.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pending.map((p) => {
            const isBusy = busyId === p.subscriptionId;
            const hasProof = !!p.proofSignedUrl;
            const txMissing = p.transactionId == null;
            return (
              <div
                key={p.subscriptionId}
                style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 14, alignItems: "center", padding: 12, border: RS_BORDER, borderRadius: 12, background: "#fff" }}
              >
                <ProofThumb hasProof={hasProof} proofUrl={p.proofUrl} proofSignedUrl={p.proofSignedUrl} />
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.clubName}</div>
                    <span style={{ flexShrink: 0, padding: "2px 7px", borderRadius: 9999, background: "#0a0a0a", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>Featuring</span>
                  </div>
                  {p.clubCity ? (
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{p.clubCity}</div>
                  ) : null}
                  <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "var(--primary)", letterSpacing: "-0.02em" }}>
                    {fmtMoney(p.amountCents, p.currency)}
                    <span style={{ fontSize: 10.5, color: "var(--muted-fg)", marginLeft: 8, fontWeight: 600, letterSpacing: 0 }}>
                      · {p.durationDays} día{p.durationDays === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    Solicitado: {fmtDate(p.createdAt)}
                    {p.proofSignedUrl ? (
                      <>
                        {" · "}
                        <a href={p.proofSignedUrl} target="_blank" rel="noreferrer" style={{ color: "var(--primary)" }}>Ver comprobante</a>
                      </>
                    ) : null}
                  </div>
                  {txMissing ? (
                    <div style={{ marginTop: 2, fontSize: 10, color: "#dc2626", fontWeight: 700 }}>⚠ Sin transacción asociada</div>
                  ) : !hasProof ? (
                    <div style={{ marginTop: 2, fontSize: 10, color: "#b45309", fontWeight: 700 }}>Comprobante aún no subido por el club</div>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" style={{ background: "#fff", border: RS_BORDER }} onClick={() => onReject(p)} disabled={isBusy}>
                    <Icon name="x" size={12} /> Rechazar
                  </button>
                  <button className="btn btn-primary" onClick={() => onApprove(p)} disabled={isBusy}>
                    <Icon name="check" size={13} color="#fff" /> {isBusy ? "…" : "Aprobar featuring"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── thumbnail del comprobante (imagen / PDF / sin comprobante) ───────────
function ProofThumb({
  hasProof,
  proofUrl,
  proofSignedUrl,
}: {
  hasProof: boolean;
  proofUrl: string | null;
  proofSignedUrl: string | null;
}) {
  return (
    <div style={{ width: 96, height: 96, borderRadius: 10, background: "var(--muted)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {hasProof ? (
        isImageUrl(proofUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={proofSignedUrl as string} alt="comprobante" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <a href={proofSignedUrl as string} target="_blank" rel="noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "var(--muted-fg)", fontSize: 10, textDecoration: "none" }}>
            <Icon name="file-text" size={20} />
            <span>Abrir PDF</span>
          </a>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: "var(--muted-fg)", fontSize: 9.5, textAlign: "center", padding: 4 }}>
          <Icon name="image-off" size={18} />
          <span>Sin comprobante</span>
        </div>
      )}
    </div>
  );
}
