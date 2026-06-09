"use client";
// Pantalla "Membresías" del club (owner/manager) — rediseño v2 CABLEADO A REAL.
// Migrada 1:1 del prototipo (ui_kits/dashboard/ClubMembresiasScreen.jsx): KPIs +
// planes con editor inline + wizard de crear plan + tabla de socios con filtros +
// reglas globales. data-lucide → <Icon>, window.mpToast → useToast.
//
// MERGE: este rediseño ahora recibe los tiers + miembros REALES del club como
// prop `data` (cargados por ClubMembresiasScreen, server) y muta vía las server
// actions reales de club-memberships:
//   - Planes = tiers reales (saveClubMembershipTier / deleteClubMembershipTier).
//   - Cola "Por aprobar" = miembros pending (approve/reject).
//   - Tabla de socios = miembros reales (revokeClubMembership en activos).
// Lo que se cablea a columnas reales: nombre, subtítulo→description, precio,
// ciclo→duration_months, descuento, publicado→is_active, beneficios (lista),
// color/plantilla→card_design. Los perks estructurados del editor (visitas,
// invitados, café, vestuario, etc.) se serializan a benefits[] (no hay columnas
// dedicadas — requiere migración; ver "qué necesita migración" en el reporte).
// Los KPIs de MRR/churn/ARPU y las "Reglas globales" son estimaciones/UI sin
// backend dedicado (necesitan migración + cron); se conservan del diseño.
import { useEffect, useMemo, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import {
  ApprovalQueue,
  type ApprovalQueueColumn,
} from "@/components/dashboard/widgets/ApprovalQueue";
import {
  saveClubMembershipTier,
  deleteClubMembershipTier,
  approveClubMembershipPayment,
  rejectClubMembership,
  revokeClubMembership,
  type PendingClubMembershipPaymentRow,
} from "@/server/actions/club-memberships";
import {
  MEMBERSHIP_CARD_TEMPLATES,
  membershipTemplate,
  DEFAULT_MEMBERSHIP_TEMPLATE_KEY,
  type MembershipCardDesign,
} from "@/lib/clubs/membership";

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
const moneyK = (c: number) => {
  const n = c / 100;
  if (n >= 1000) return "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return "$" + (Number.isInteger(n) ? n : n.toFixed(2));
};
const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ── Datos reales (prop del server) ───────────────────────────────────────────
export type RealTier = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_months: number;
  discount_pct: number;
  benefits: string[];
  card_design: MembershipCardDesign;
  sort_order: number;
  is_active: boolean;
};
export type RealMember = {
  id: string;
  user_id: string;
  status: string;
  member_no: number | null;
  starts_at: string | null;
  expires_at: string | null;
  profiles: { display_name: string | null; username: string | null } | null;
  club_membership_tiers: { name: string | null } | null;
};
export type ClubMembresiasData = {
  clubId: string;
  tiers: RealTier[];
  members: RealMember[];
  // Cola real de pagos pendientes (transaction.proof_submitted) — W2 (MAT-5).
  pendingPayments: PendingClubMembershipPaymentRow[];
};

// ── Modelo del rediseño (Plan) derivado de un tier real ───────────────────────
type Plan = {
  k: string; // tier.id (o "" si nuevo)
  l: string;
  sub: string;
  priceCents: number;
  cycle: string; // mensual/trimestral/anual derivado de duration_months
  durationMonths: number;
  discountPct: number;
  templateKey: string;
  color: string; // accent guardado en card_design.accent
  published: boolean;
  benefits: string[];
  active: number; // socios activos en este tier (real)
};

const cycleFromMonths = (m: number) => (m === 12 ? "anual" : m === 3 ? "trimestral" : "mensual");
const monthsFromCycle = (c: string) => (c === "anual" ? 12 : c === "trimestral" ? 3 : 1);

function planFromTier(t: RealTier, activeCount: number): Plan {
  const cd = t.card_design ?? {};
  return {
    k: t.id,
    l: t.name,
    sub: t.description ?? "",
    priceCents: t.price_cents,
    cycle: cycleFromMonths(t.duration_months),
    durationMonths: t.duration_months,
    discountPct: t.discount_pct ?? 0,
    templateKey: cd.templateKey ?? DEFAULT_MEMBERSHIP_TEMPLATE_KEY,
    color: cd.accent ?? membershipTemplate(cd.templateKey).accent,
    published: t.is_active,
    benefits: Array.isArray(t.benefits) ? t.benefits : [],
    active: activeCount,
  };
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "#b45309" },
  active: { label: "Activa", tone: "#047857" },
  expired: { label: "Vencida", tone: "var(--muted-fg)" },
  cancelled: { label: "Cancelada", tone: "#dc2626" },
  rejected: { label: "Rechazada", tone: "#dc2626" },
};
const nameOf = (p: RealMember["profiles"]) => p?.display_name || (p?.username ? `@${p.username}` : "Jugador");
const initialsOf = (name: string) =>
  name.replace(/^@/, "").split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "•";

// Socios cuya membresía vence en los próximos 7 días (helper para mantener
// Date.now() fuera del render del componente — regla react-hooks/purity).
function countRenewingSoon(members: RealMember[]): number {
  const now = Date.now();
  return members.filter((m) => {
    if (m.status !== "active" || !m.expires_at) return false;
    const t = new Date(m.expires_at).getTime();
    return t > now && t - now < 7 * 86400000;
  }).length;
}

const inputStyle: CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 500, background: "#fff", color: "#0a0a0a", outline: "none" };

export function ClubMembresiasScreenView({ data }: { data: ClubMembresiasData }) {
  const { clubId, tiers, members, pendingPayments } = data;
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();

  // Conteo de socios activos por tier (real) para los KPIs del plan.
  const activeByTierName = useMemo(() => {
    const m = new Map<string, number>();
    for (const mem of members) {
      if (mem.status !== "active") continue;
      const tn = mem.club_membership_tiers?.name ?? "";
      m.set(tn, (m.get(tn) ?? 0) + 1);
    }
    return m;
  }, [members]);

  const plans = useMemo(
    () => tiers.map((t) => planFromTier(t, activeByTierName.get(t.name) ?? 0)),
    [tiers, activeByTierName],
  );

  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const editedPlan = plans.find((p) => p.k === editing) ?? null;

  // KPIs reales (estimados a partir de tiers + miembros activos).
  const totalActive = members.filter((m) => m.status === "active").length;
  const estMrrCents = plans.reduce((s, p) => s + p.priceCents * p.active, 0);
  const arpuCents = totalActive > 0 ? Math.round(estMrrCents / totalActive) : 0;
  const renewNext7 = useMemo(() => countRenewingSoon(members), [members]);

  // Cola de aprobación (pending + proof submitted) + tabla de socios.
  // W2 (MAT-5): la cola REAL son los pagos con comprobante subido — no toda
  // membresía pending. Si el usuario todavía no subió el comprobante, no hay
  // nada que el owner pueda aprobar todavía.
  const others = members.filter((m) => m.status !== "pending");

  const refresh = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  const act = (fn: () => Promise<{ ok: boolean; error?: { message?: string } }>, okMsg: string) => {
    startTx(async () => {
      const res = await fn();
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: res.error?.message });
        return;
      }
      toast({ icon: "check-circle-2", title: okMsg });
      refresh();
    });
  };

  const togglePublish = (p: Plan) =>
    act(
      () =>
        saveClubMembershipTier({
          clubId,
          tierId: p.k,
          name: p.l,
          description: p.sub || null,
          priceCents: p.priceCents,
          durationMonths: p.durationMonths,
          discountPct: p.discountPct,
          benefits: p.benefits,
          cardTemplateKey: p.templateKey,
          cardAccent: p.color,
          isActive: !p.published,
        }),
      p.published ? "Plan ocultado" : "Plan publicado",
    );

  const removePlan = async (p: Plan) => {
    const ok = await confirm({ title: "Borrar plan", body: `¿Borrar la membresía "${p.l}"? Los socios actuales no se eliminan.`, confirmLabel: "Borrar", cancelLabel: "Cancelar", destructive: true });
    if (!ok) return;
    act(() => deleteClubMembershipTier({ tierId: p.k }), "Plan borrado");
  };

  const publishedCount = plans.filter((p) => p.published).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Tu club · Negocio</div>
          <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
            Membresías<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            {publishedCount} {publishedCount === 1 ? "plan publicado" : "planes publicados"} · {totalActive} socios activos · MRR estimado {moneyK(estMrrCents)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "info", title: "Exportar reporte", sub: "Disponible pronto" })}>
            <Icon name="download" size={13} /> Exportar
          </button>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} color="#fff" /> Crear plan
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mp-spon-kpis">
        <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 90%)", color: "#fff", padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.22), transparent 55%)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
            <span className="label-mp" style={{ color: "#34d399" }}>● Recurrente</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, color: "#34d399" }}>
              <Icon name="trending-up" size={11} color="#34d399" /> estimado
            </span>
          </div>
          <div className="font-heading tabular" style={{ fontSize: 42, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, position: "relative" }}>
            {moneyK(estMrrCents)}
            <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", fontWeight: 700, marginLeft: 6 }}>/mes</span>
          </div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.7)", position: "relative" }}>
            MRR estimado · {plans.length > 0 ? plans.map((p) => `${p.active} ${p.l}`).join(" · ") : "sin planes todavía"}
          </div>
        </div>
        <KpiTile icon="users" label="Socios activos" value={String(totalActive)} sub={`${members.length} en total (todos los estados)`} />
        <KpiTile icon="user-minus" label="Por aprobar" value={String(pendingPayments.length)} sub="Comprobantes en cola" warn={pendingPayments.length > 0} />
        <KpiTile icon="bar-chart-3" label="ARPU" value={money(arpuCents)} sub="Revenue por socio activo" />
        <KpiTile icon="calendar-check" label="Renuevan 7d" value={String(renewNext7)} sub="Vencen en los próximos 7 días" emerald />
      </div>

      {/* PLANES */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Planes del club<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{plans.length} {plans.length === 1 ? "plan" : "planes"}</span>
        </div>
        {plans.length === 0 ? (
          <div className="card" style={{ padding: 22, fontSize: 12.5, color: "var(--muted-fg)" }}>
            Aún no creas niveles de membresía. Crea el primero para que tus socios compren.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            {plans.map((p) => (
              <PlanOverviewCard key={p.k} plan={p} isEditing={editing === p.k} onEdit={() => setEditing((e) => (e === p.k ? null : p.k))} onTogglePublish={() => togglePublish(p)} onDelete={() => removePlan(p)} />
            ))}
          </div>
        )}
        {editedPlan && <PlanEditor clubId={clubId} plan={editedPlan} onClose={() => setEditing(null)} onSaved={refresh} />}
      </div>

      {creating && <CreatePlanModal clubId={clubId} onClose={() => setCreating(false)} onCreated={refresh} />}

      {/* POR APROBAR — cola real de pagos de membresía (W2 / MAT-5).
          Reusa <ApprovalQueue /> de W1 (MAT-4): drawer con detalle, confirm
          irreversible, reject con razón obligatoria + plantillas. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Por aprobar<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {pendingPayments.length}{" "}
            {pendingPayments.length === 1 ? "solicitud" : "solicitudes"} de pago
          </span>
        </div>
        <ClubMembershipPaymentsQueue
          items={pendingPayments}
          onApprove={async (p) => {
            const res = await approveClubMembershipPayment({ membershipId: p.membershipId });
            if (!res.ok) {
              toast({ icon: "alert-triangle", title: "No pudimos aprobar el pago", sub: res.error.message });
              throw new Error(res.error.message);
            }
            toast({ icon: "check-circle-2", title: "Membresía activada", sub: `${p.displayName} · ${p.tierName}` });
            refresh();
          }}
          onReject={async (p, reason) => {
            const res = await rejectClubMembership({ membershipId: p.membershipId, reason });
            if (!res.ok) {
              toast({ icon: "alert-triangle", title: "No pudimos rechazar el comprobante", sub: res.error.message });
              throw new Error(res.error.message);
            }
            toast({ icon: "check-circle-2", title: "Comprobante rechazado", sub: "Se notificó al socio" });
            refresh();
          }}
        />
      </div>

      {/* SOCIOS (tabla real con filtros del diseño) */}
      <SociosSection plans={plans} members={others} onRevoke={(id) => act(() => revokeClubMembership({ membershipId: id }), "Membresía cancelada")} />

      {/* REGLAS GLOBALES (solo lectura hasta que exista backend dedicado) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            Reglas globales<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Referencia no editable · falta modelo persistente</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 14 }}>
          <GlobalRuleCard icon="pause-circle" title="Pausas" desc="Cualquier socio puede pausar su membresía sin perder beneficios acumulados." controls={[{ k: "max-pauses", l: "Máx pausas/año", type: "num", val: 2, suffix: "pausas" }, { k: "pause-len", l: "Duración máx", type: "num", val: 30, suffix: "días" }]} />
          <GlobalRuleCard icon="x-circle" title="Cancelación" desc="Política cuando un socio decide darse de baja." controls={[{ k: "notice", l: "Aviso requerido", type: "num", val: 7, suffix: "días antes" }, { k: "refund", l: "Reembolso", type: "toggle", val: false }]} />
          <GlobalRuleCard icon="user-plus" title="Invitados" desc="Reglas para los invitados que llevan tus socios al club." controls={[{ k: "guest-fee", l: "Cuota extra invitado", type: "money", val: 800 }, { k: "kid-free", l: "Niños <12 gratis", type: "toggle", val: true }]} />
          <GlobalRuleCard icon="megaphone" title="Visibilidad pública" desc="Si los planes aparecen en la app o solo se ofrecen en el club." controls={[{ k: "public", l: "Mostrar en app público", type: "toggle", val: true }, { k: "manual-renew", l: "Recordatorio de renovación", type: "toggle", val: true }]} />
        </div>
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, sub, emerald, warn }: { icon: string; label: string; value: string; sub?: string; emerald?: boolean; warn?: boolean }) {
  const c = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: emerald ? "rgba(16,185,129,0.12)" : warn ? "#fef3c7" : "var(--muted)", color: c, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1, color: c }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{sub}</div>}
    </div>
  );
}

function PlanOverviewCard({ plan, isEditing, onEdit, onTogglePublish, onDelete }: { plan: Plan; isEditing: boolean; onEdit: () => void; onTogglePublish: () => void; onDelete: () => void }) {
  const chips = plan.benefits;
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, borderColor: isEditing ? "#0a0a0a" : "var(--border)", borderWidth: isEditing ? 2 : 1, borderStyle: "solid", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: plan.color }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: plan.color }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: plan.color }} /> Plan
          </div>
          <div className="font-heading" style={{ marginTop: 4, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
            {plan.l}<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          {plan.sub && <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4 }}>{plan.sub}</div>}
        </div>
        <button onClick={onTogglePublish} title={plan.published ? "Ocultar plan" : "Publicar plan"} style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 9999, border: 0, cursor: "pointer", background: plan.published ? "var(--muted)" : "#fef3c7", color: plan.published ? "#0a0a0a" : "#b45309", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={plan.published ? "eye" : "eye-off"} size={13} color={plan.published ? "#0a0a0a" : "#b45309"} />
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="font-heading tabular" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1 }}>{money(plan.priceCents)}</span>
        <span style={{ fontSize: 12, color: "var(--muted-fg)", fontWeight: 700 }}>/{plan.cycle}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "10px 0", borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)" }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Activos</div>
          <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900 }}>{plan.active}</div>
        </div>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted-fg)" }}>MRR est.</div>
          <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "#047857" }}>{moneyK(plan.priceCents * plan.active)}</div>
        </div>
      </div>

      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {chips.slice(0, 5).map((b, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 9999, background: "var(--muted)", fontSize: 10.5, fontWeight: 700, color: "#0a0a0a" }}>
              <Icon name="check" size={10} color="var(--primary)" /> {b}
            </span>
          ))}
          {chips.length > 5 && <span style={{ padding: "3px 8px", borderRadius: 9999, fontSize: 10.5, fontWeight: 700, color: "var(--muted-fg)" }}>+{chips.length - 5} más</span>}
        </div>
      )}
      {plan.discountPct > 0 && (
        <span style={{ fontSize: 11.5, fontWeight: 800, color: "#047857" }}>{plan.discountPct}% de descuento en torneos y eventos del club</span>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
        <button onClick={onEdit} className="btn" style={{ flex: 1, background: isEditing ? "#0a0a0a" : "#fff", color: isEditing ? "#fff" : "#0a0a0a", border: "1px solid " + (isEditing ? "#0a0a0a" : "var(--border)") }}>
          <Icon name={isEditing ? "check" : "pencil"} size={13} color={isEditing ? "#fff" : undefined} />
          {isEditing ? "Editando" : "Editar plan"}
        </button>
        <button className="btn" style={{ background: "#fff", border: "1px solid #fecaca", color: "#dc2626" }} onClick={onDelete} aria-label="Borrar plan">
          <Icon name="trash-2" size={13} color="#dc2626" />
        </button>
      </div>

      {!plan.published && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(1px)", pointerEvents: "none", display: "flex", alignItems: "flex-end", justifyContent: "center", padding: 14 }}>
          <span style={{ pointerEvents: "auto", padding: "4px 10px", background: "#fef3c7", color: "#92400e", borderRadius: 9999, fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>● Oculto · no recibe nuevos socios</span>
        </div>
      )}
    </div>
  );
}

// Editor inline de un plan EXISTENTE → saveClubMembershipTier real.
function PlanEditor({ clubId, plan, onClose, onSaved }: { clubId: string; plan: Plan; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [l, setL] = useState(plan.l);
  const [sub, setSub] = useState(plan.sub);
  const [priceCents, setPriceCents] = useState(plan.priceCents);
  const [cycle, setCycle] = useState(plan.cycle);
  const [discountPct, setDiscountPct] = useState(plan.discountPct);
  const [templateKey, setTemplateKey] = useState(plan.templateKey);
  const [color, setColor] = useState(plan.color);
  const [benefitsText, setBenefitsText] = useState(plan.benefits.join("\n"));

  const tpl = membershipTemplate(templateKey);

  const save = () => {
    if (pending) return;
    if (l.trim().length < 2) { toast({ icon: "alert-triangle", title: "Ponle un nombre al plan" }); return; }
    start(async () => {
      const res = await saveClubMembershipTier({
        clubId,
        tierId: plan.k,
        name: l.trim(),
        description: sub.trim() || null,
        priceCents,
        durationMonths: monthsFromCycle(cycle),
        discountPct,
        benefits: benefitsText.split("\n").map((b) => b.trim()).filter(Boolean),
        cardTemplateKey: templateKey,
        cardAccent: color,
        isActive: plan.published,
      });
      if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message }); return; }
      toast({ icon: "check-circle-2", title: "Plan guardado", sub: l + " actualizado" });
      onClose();
      onSaved();
    });
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "#0a0a0a", borderWidth: 2 }}>
      <div style={{ padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)", color: "#fff", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ width: 36, height: 36, borderRadius: 9, background: color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="settings-2" size={17} color="#fff" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>Editando plan</div>
            <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
              {l || "Plan"}<span style={{ color: "#34d399" }}>.</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
            <Icon name="x" size={13} color="#fff" />Cerrar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={pending} style={{ opacity: pending ? 0.6 : 1 }}>
            <Icon name="save" size={13} color="#fff" />{pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>

      <div className="mp-plan-editor-body" style={{ padding: 22, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <EditorSection num="01" label="Datos básicos">
            <EditField label="Nombre del plan">
              <input value={l} onChange={(e) => setL(e.target.value)} maxLength={60} style={inputStyle} />
            </EditField>
            <EditField label="Subtítulo (descripción corta)">
              <input value={sub} onChange={(e) => setSub(e.target.value)} style={inputStyle} maxLength={280} />
            </EditField>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <EditField label="Precio (USD)">
                <input type="number" min={0} step="0.01" value={priceCents / 100} onChange={(e) => setPriceCents(Math.round(Number(e.target.value) * 100))} style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }} />
              </EditField>
              <EditField label="Ciclo de cobro">
                <select value={cycle} onChange={(e) => setCycle(e.target.value)} style={inputStyle}>
                  <option value="mensual">Mensual</option>
                  <option value="trimestral">Trimestral (3 meses)</option>
                  <option value="anual">Anual (12 meses)</option>
                </select>
              </EditField>
            </div>
            <EditField label="Descuento en torneos y eventos (%)">
              <input type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(parseInt(e.target.value) || 0)} style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }} />
            </EditField>
            <EditField label="Color del plan">
              <ColorPicker value={color} onChange={setColor} />
            </EditField>
            <EditField label="Plantilla de tarjeta">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {MEMBERSHIP_CARD_TEMPLATES.map((t) => (
                  <button key={t.key} type="button" onClick={() => { setTemplateKey(t.key); setColor(t.accent); }} title={t.label} style={{ width: 30, height: 30, borderRadius: 8, background: t.bg, border: templateKey === t.key ? "2px solid var(--fg)" : "1px solid var(--border)", cursor: "pointer" }} />
                ))}
              </div>
            </EditField>
          </EditorSection>

          <EditorSection num="02" label="Beneficios">
            <EditField label="Un beneficio por línea">
              <textarea value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} rows={6} placeholder={"Acceso ilimitado\n25 visitas/mes\nCafé incluido"} style={{ ...inputStyle, resize: "vertical" }} />
            </EditField>
          </EditorSection>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <EditorSection num="03" label="Vista previa de tarjeta">
            <div style={{ background: tpl.bg, color: tpl.fg, borderRadius: 12, padding: 18, minHeight: 110, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>{l || "Nombre del plan"}</span>
                <span style={{ fontSize: 10, fontWeight: 900, color: tpl.accent, letterSpacing: "0.1em" }}>VIP</span>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: tpl.accent }}>{money(priceCents)} <span style={{ color: tpl.muted, fontWeight: 600, fontSize: 12 }}>/ {cycle}</span></div>
                {sub && <div style={{ fontSize: 11, color: tpl.muted, marginTop: 4 }}>{sub}</div>}
              </div>
            </div>
          </EditorSection>
          <EditorSection num="04" label="Vista pública">
            <PreviewCard l={l} sub={sub} priceCents={priceCents} cycle={cycle} color={color} benefits={benefitsText.split("\n").map((b) => b.trim()).filter(Boolean)} />
          </EditorSection>
        </div>
      </div>

      <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", background: "#fafafa", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          <Icon name="info" size={11} style={{ verticalAlign: "text-top" }} /> Los cambios aplican a nuevas suscripciones. Los socios actuales mantienen su plan hasta su próxima renovación.
        </span>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
      {["#737373", "#0ea5e9", "#10b981", "#7c3aed", "#dc2626", "#f59e0b", "#0a0a0a", "#34d399", "#c7d2fe", "#d4af37"].map((c) => (
        <button key={c} onClick={() => onChange(c)} style={{ width: 30, height: 30, borderRadius: 7, background: c, border: "2px solid " + (value === c ? "#0a0a0a" : "transparent"), cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {value === c && <Icon name="check" size={13} color="#fff" />}
        </button>
      ))}
    </div>
  );
}

function EditorSection({ num, label, children }: { num: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
        <span className="font-heading tabular" style={{ fontSize: 12, fontWeight: 900, color: "var(--muted-fg)" }}>{num}</span>
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-fg)" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>{label}</span>
      {children}
    </label>
  );
}

function PreviewCard({ l, sub, priceCents, cycle, color, benefits }: { l: string; sub: string; priceCents: number; cycle: string; color: string; benefits: string[] }) {
  return (
    <div style={{ padding: 18, borderRadius: 12, border: "1px solid var(--border)", background: "linear-gradient(135deg, #fafafa, #fff)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color }}>{l || "Plan"}</span>
      </div>
      <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase", lineHeight: 1.1 }}>
        {sub || "Descripción del plan"}<span style={{ color: "var(--primary)" }}>.</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span className="font-heading tabular" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" }}>{money(priceCents)}</span>
        <span style={{ fontSize: 12, color: "var(--muted-fg)", fontWeight: 700 }}>/{cycle}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {benefits.map((b, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}>
            <Icon name="check" size={12} color="var(--primary)" style={{ marginTop: 3 }} />
            <span>{b}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", borderTop: "1px dashed var(--border)", paddingTop: 8, marginTop: 4 }}>Así lo ven los jugadores en la app pública del club.</div>
    </div>
  );
}

// ── Sección Socios (tabla real con filtros del diseño) ────────────────────────
function SociosSection({ plans, members, onRevoke }: { plans: Plan[]; members: RealMember[]; onRevoke: (id: string) => void }) {
  const SUBS_COLS = "1.8fr 120px 120px 130px 120px 80px";
  const [filterTier, setFilterTier] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [query, setQuery] = useState("");
  const term = query.trim().toLowerCase();

  const tierNames = Array.from(new Set(plans.map((p) => p.l)));

  const filtered = members.filter((m) => {
    const tn = m.club_membership_tiers?.name ?? "";
    if (filterTier !== "all" && tn !== filterTier) return false;
    if (filterStatus !== "all" && m.status !== filterStatus) return false;
    if (term && !nameOf(m.profiles).toLowerCase().includes(term)) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          Socios<span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{filtered.length} de {members.length} mostrados</span>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 12, top: 9, display: "inline-flex" }}>
            <Icon name="search" size={13} color="var(--muted-fg)" />
          </span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar socio…" style={{ width: "100%", padding: "8px 12px 8px 32px", border: "1px solid var(--border)", borderRadius: 9999, fontFamily: "inherit", fontSize: 12.5, outline: "none", background: "#fff" }} />
        </div>
        <SegmentFilter label="Plan" value={filterTier} onChange={setFilterTier} options={[{ k: "all", l: "Todos" }, ...tierNames.map((n) => ({ k: n, l: n }))]} />
        <SegmentFilter label="Estado" value={filterStatus} onChange={setFilterStatus} options={[{ k: "all", l: "Todos" }, { k: "active", l: "Activos" }, { k: "expired", l: "Vencidos" }, { k: "cancelled", l: "Cancelados" }, { k: "rejected", l: "Rechazados" }]} />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 700 }}>
            <div style={{ display: "grid", gridTemplateColumns: SUBS_COLS, gap: 12, padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--muted)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
              <span>Socio</span>
              <span>Plan</span>
              <span>Estado</span>
              <span>N° socio</span>
              <span>Vence</span>
              <span style={{ textAlign: "right" }}>Acción</span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 36, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>No hay socios que coincidan con los filtros.</div>
            ) : (
              filtered.map((m, i) => {
                const sm = STATUS_META[m.status] ?? { label: m.status, tone: "var(--muted-fg)" };
                const tier = plans.find((p) => p.l === (m.club_membership_tiers?.name ?? ""));
                return (
                  <div key={m.id} style={{ display: "grid", gridTemplateColumns: SUBS_COLS, gap: 12, padding: "12px 18px", borderBottom: i === filtered.length - 1 ? 0 : "1px solid var(--border)", alignItems: "center", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#0a0a0a,#374151)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 11.5 }}>{initialsOf(nameOf(m.profiles))}</span>
                      <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m.profiles)}</div>
                    </div>
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 9999, background: "var(--muted)", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: tier?.color ?? "#737373" }} /> {m.club_membership_tiers?.name ?? "—"}
                      </span>
                    </div>
                    <div>
                      <span style={{ padding: "3px 9px", borderRadius: 9999, background: "var(--muted)", color: sm.tone, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase" }}>{sm.label}</span>
                    </div>
                    <span className="tabular" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-fg)" }}>{m.member_no != null ? `#${String(m.member_no).padStart(3, "0")}` : "—"}</span>
                    <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{dateLabel(m.expires_at)}</span>
                    <div style={{ textAlign: "right" }}>
                      {m.status === "active" ? (
                        <button className="btn" onClick={() => onRevoke(m.id)} aria-label="Revocar membresía" style={{ padding: "5px 9px", background: "#fff", border: "1px solid #fecaca", color: "#dc2626" }}>
                          <Icon name="x" size={12} color="#dc2626" />
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>—</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SegmentFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { k: string; l: string }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}:</span>
      <div style={{ display: "inline-flex", gap: 2, padding: 2, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", flexWrap: "wrap" }}>
        {options.map((o) => {
          const on = value === o.k;
          return (
            <button key={o.k} onClick={() => onChange(o.k)} style={{ padding: "5px 11px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)" }}>
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type RuleControl = { k: string; l: string; type: "num" | "toggle" | "money"; val: number | boolean; suffix?: string };

function GlobalRuleCard({ icon, title, desc, controls }: { icon: string; title: string; desc: string; controls: RuleControl[] }) {
  const labelFor = (c: RuleControl) => {
    if (c.type === "toggle") return c.val ? "Activado" : "Desactivado";
    if (c.type === "money") return money(Number(c.val));
    return `${c.val}${c.suffix ? ` ${c.suffix}` : ""}`;
  };
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={16} />
        </span>
        <div className="font-heading" style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
          {title}<span className="dot">.</span>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.45 }}>{desc}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {controls.map((c) => (
          <div key={c.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "7px 0", borderTop: "1px dashed var(--border)" }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0a0a0a" }}>{c.l}</span>
            <span style={{ flexShrink: 0, padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 7, background: "#fafafa", fontSize: 11, color: "var(--muted-fg)", fontWeight: 800 }}>
              {labelFor(c)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modal crear plan (wizard 3 pasos) → saveClubMembershipTier real ───────────
type Draft = { l: string; sub: string; priceCents: number; cycle: string; color: string; templateKey: string; published: boolean; benefits: string[] };
type Template = { id: string; icon: string; color: string; templateKey: string; l: string; sub: string; priceCents: number; cycle: string; benefits: string[] };

function CreatePlanModal({ clubId, onClose, onCreated }: { clubId: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({ l: "", sub: "", priceCents: 0, cycle: "mensual", color: "#10b981", templateKey: "court", published: true, benefits: [] });
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  const templates: Template[] = [
    { id: "basic", icon: "square", color: "#737373", templateKey: "onyx", l: "Básica", sub: "Solo reserva", priceCents: 2500, cycle: "mensual", benefits: ["12 visitas/mes", "Reserva con 7 días de anticipación"] },
    { id: "plus", icon: "sparkles", color: "#0ea5e9", templateKey: "royal", l: "Plus", sub: "Para regulares", priceCents: 5500, cycle: "mensual", benefits: ["25 visitas/mes", "2 invitados/mes", "15% off pro shop", "Eventos miembros"] },
    { id: "vip", icon: "crown", color: "#10b981", templateKey: "court", l: "Platinum VIP", sub: "Todo el club", priceCents: 8900, cycle: "mensual", benefits: ["Acceso ilimitado", "4 invitados/mes", "1 clase con coach/mes", "25% off pro shop", "Café incluido", "Vestuario VIP", "Eventos miembros"] },
    { id: "daypass", icon: "calendar-clock", color: "#f59e0b", templateKey: "gold", l: "Day Pass · 10", sub: "10 visitas, sin cuota mensual", priceCents: 9000, cycle: "anual", benefits: ["10 visitas", "10% off pro shop"] },
    { id: "blank", icon: "plus", color: "#0a0a0a", templateKey: "onyx", l: "", sub: "Empezar desde cero", priceCents: 0, cycle: "mensual", benefits: [] },
  ];

  const [benefitsText, setBenefitsText] = useState("");

  const pickTemplate = (t: Template) => {
    patch({ l: t.l, sub: t.sub, priceCents: t.priceCents, cycle: t.cycle, color: t.color, templateKey: t.templateKey, benefits: t.benefits, published: true });
    setBenefitsText(t.benefits.join("\n"));
    setStep(2);
  };

  const canFinish = draft.l.trim().length >= 2 && draft.priceCents >= 0;

  const create = () => {
    if (pending || !canFinish) return;
    start(async () => {
      const res = await saveClubMembershipTier({
        clubId,
        name: draft.l.trim(),
        description: draft.sub.trim() || null,
        priceCents: draft.priceCents,
        durationMonths: monthsFromCycle(draft.cycle),
        discountPct: 0,
        benefits: benefitsText.split("\n").map((b) => b.trim()).filter(Boolean),
        cardTemplateKey: draft.templateKey,
        cardAccent: draft.color,
        isActive: draft.published,
      });
      if (!res.ok) { toast({ icon: "alert-triangle", title: "No se pudo crear", sub: res.error.message }); return; }
      toast({ icon: "check-circle-2", title: "Plan creado", sub: draft.l + " · ya disponible" });
      onClose();
      onCreated();
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div onMouseDown={onClose} className="mp-modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "mpFade 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} className="card mp-modal-panel" style={{ width: "100%", maxWidth: 760, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", animation: "mpPop 220ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%, rgba(16,185,129,0.22), transparent 55%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div className="label-mp" style={{ color: "#34d399" }}>● Nuevo plan · Paso {step} de 3</div>
            <h2 className="font-heading" style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1 }}>
              Crear plan de membresía<span style={{ color: "#34d399" }}>.</span>
            </h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{ position: "relative", width: 32, height: 32, borderRadius: 9999, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={14} color="#fff" />
          </button>
        </div>

        {/* Stepper */}
        <div style={{ display: "flex", gap: 4, padding: "12px 24px", borderBottom: "1px solid var(--border)", background: "#fafafa" }}>
          {[{ n: 1, l: "Elegir plantilla" }, { n: 2, l: "Datos & precio" }, { n: 3, l: "Beneficios" }].map((s) => {
            const on = step === s.n;
            const past = step > s.n;
            return (
              <button key={s.n} onClick={() => past && setStep(s.n)} disabled={!past && !on} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, cursor: past ? "pointer" : "default", fontFamily: "inherit", textAlign: "left", background: on ? "#0a0a0a" : past ? "rgba(16,185,129,0.10)" : "#fff", color: on ? "#fff" : past ? "#047857" : "var(--muted-fg)", border: "1px solid " + (on ? "#0a0a0a" : past ? "rgba(16,185,129,0.3)" : "var(--border)") }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "rgba(255,255,255,0.18)" : past ? "var(--primary)" : "var(--muted)", color: on ? "#fff" : past ? "#fff" : "var(--muted-fg)", fontSize: 10, fontWeight: 900 }}>
                    {past ? <Icon name="check" size={10} color="#fff" /> : s.n}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{s.l}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {step === 1 && (
            <div>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--muted-fg)" }}>Empieza desde una plantilla común o desde cero. Después puedes ajustar todo.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                {templates.map((t) => (
                  <button key={t.id} onClick={() => pickTemplate(t)} className="mp-help-cat" style={{ textAlign: "left", padding: 16, borderRadius: 12, background: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ width: 36, height: 36, borderRadius: 9, background: t.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name={t.icon} size={16} color="#fff" />
                      </span>
                      {t.priceCents > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)" }}>{money(t.priceCents)}</span>}
                    </div>
                    <div>
                      <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                        {t.l || "Desde cero"}{t.id !== "blank" && <span className="dot">.</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>{t.sub}</div>
                    </div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--primary)", letterSpacing: "0.04em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4, marginTop: "auto" }}>
                      Usar esta plantilla <Icon name="arrow-right" size={11} color="var(--primary)" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mp-create-step2" style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <EditField label="Nombre del plan">
                  <input autoFocus value={draft.l} onChange={(e) => patch({ l: e.target.value })} placeholder="Ej: Verano sin límites" maxLength={60} style={inputStyle} />
                </EditField>
                <EditField label="Descripción corta (subtítulo)">
                  <input value={draft.sub} onChange={(e) => patch({ sub: e.target.value })} placeholder="Ej: Para los que vienen 3+ veces por semana" maxLength={280} style={inputStyle} />
                </EditField>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <EditField label="Precio (USD)">
                    <input type="number" min={0} step="0.01" value={draft.priceCents / 100} onChange={(e) => patch({ priceCents: Math.round(Number(e.target.value) * 100) })} style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }} />
                  </EditField>
                  <EditField label="Ciclo de cobro">
                    <select value={draft.cycle} onChange={(e) => patch({ cycle: e.target.value })} style={inputStyle}>
                      <option value="mensual">Mensual</option>
                      <option value="trimestral">Trimestral</option>
                      <option value="anual">Anual</option>
                    </select>
                  </EditField>
                </div>
                <EditField label="Color del plan">
                  <ColorPicker value={draft.color} onChange={(c) => patch({ color: c })} />
                </EditField>
                <EditField label="Plantilla de tarjeta">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {MEMBERSHIP_CARD_TEMPLATES.map((t) => (
                      <button key={t.key} type="button" onClick={() => patch({ templateKey: t.key, color: t.accent })} title={t.label} style={{ width: 30, height: 30, borderRadius: 8, background: t.bg, border: draft.templateKey === t.key ? "2px solid var(--fg)" : "1px solid var(--border)", cursor: "pointer" }} />
                    ))}
                  </div>
                </EditField>
              </div>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)", marginBottom: 8 }}>Preview</div>
                <PreviewCard l={draft.l} sub={draft.sub} priceCents={draft.priceCents} cycle={draft.cycle} color={draft.color} benefits={benefitsText.split("\n").map((b) => b.trim()).filter(Boolean)} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <EditField label="Beneficios del plan (uno por línea)">
                <textarea value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} rows={7} placeholder={"Acceso ilimitado\n25 visitas/mes\n2 invitados/mes\nCafé & snacks incluidos\nVestuario VIP 24/7\nAcceso a eventos miembros"} style={{ ...inputStyle, resize: "vertical" }} />
              </EditField>
              <div style={{ padding: 14, borderRadius: 11, background: "#fafafa", border: "1px solid var(--border)", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <span style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, background: draft.published ? "rgba(16,185,129,0.12)" : "var(--muted)", color: draft.published ? "#047857" : "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="eye" size={15} color={draft.published ? "#047857" : undefined} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{draft.published ? "Publicado · visible para comprar" : "Borrador · solo tú lo ves"}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.4 }}>Si lo publicas, los jugadores podrán suscribirse desde la página del club.</div>
                </div>
                <button type="button" role="switch" aria-checked={draft.published} onClick={() => patch({ published: !draft.published })} style={{ flexShrink: 0, width: 42, height: 24, borderRadius: 9999, background: draft.published ? "var(--primary)" : "#e5e5e5", position: "relative", cursor: "pointer", border: 0, padding: 0, transition: "background 150ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
                  <span style={{ position: "absolute", top: 2, left: draft.published ? 20 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 150ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <button onClick={onClose} className="btn" style={{ background: "transparent", color: "var(--muted-fg)", border: 0 }}>Cancelar</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 1 && (
              <button className="btn" onClick={() => setStep(step - 1)} style={{ background: "#fff", border: "1px solid var(--border)" }}>
                <Icon name="arrow-left" size={13} /> Atrás
              </button>
            )}
            {step < 3 ? (
              <button className="btn btn-primary" onClick={() => setStep(step + 1)} disabled={step === 2 && draft.l.trim().length < 2} style={{ opacity: step === 2 && draft.l.trim().length < 2 ? 0.55 : 1 }}>
                Siguiente <Icon name="arrow-right" size={13} color="#fff" />
              </button>
            ) : (
              <button className="btn btn-primary" onClick={create} disabled={!canFinish || pending} style={{ opacity: canFinish && !pending ? 1 : 0.55 }}>
                <Icon name="check" size={13} color="#fff" /> {pending ? "Creando…" : "Crear plan"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cola de aprobación de pagos de membresía (W2 / MAT-5) ────────────────────
// Envuelve <ApprovalQueue /> con columnas, drawer y handlers específicos.

function fmtMoneyCurrency(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtRelativeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace segundos";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAbsoluteDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function isImageProof(url: string | null): boolean {
  if (!url) return false;
  return /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(url.split("?")[0].toLowerCase());
}

function ClubMembershipPaymentsQueue({
  items,
  onApprove,
  onReject,
}: {
  items: PendingClubMembershipPaymentRow[];
  onApprove: (p: PendingClubMembershipPaymentRow) => Promise<void>;
  onReject: (p: PendingClubMembershipPaymentRow, reason: string) => Promise<void>;
}) {
  const columns: ApprovalQueueColumn<PendingClubMembershipPaymentRow>[] = [
    {
      key: "user",
      label: "Socio",
      render: (p) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
            {p.displayName}
          </span>
          {p.username && (
            <span style={{ fontSize: 10.5, color: "var(--muted-fg)", textTransform: "lowercase" }}>
              @{p.username}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "tier",
      label: "Membresía",
      render: (p) => (
        <span style={{ padding: "2px 7px", borderRadius: 9999, background: "#0a0a0a", color: "#fff", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {p.tierName} · {p.durationMonths}m
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "amount",
      label: "Monto",
      render: (p) => (
        <span className="font-heading tabular" style={{ fontWeight: 800, fontSize: 13 }}>
          {fmtMoneyCurrency(p.amountCents, p.currency)}
        </span>
      ),
      align: "right",
    },
    {
      key: "submittedAt",
      label: "Comprobante",
      render: (p) => (
        <span title={fmtAbsoluteDate(p.proofSubmittedAt ?? p.createdAt)} style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>
          {fmtRelativeAgo(p.proofSubmittedAt ?? p.createdAt)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "proof",
      label: "Adjunto",
      render: (p) =>
        p.proofSignedUrl ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "#047857", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <Icon name="check" size={10} color="#047857" /> Sí
          </span>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 9999, background: "#fef3c7", color: "#92400e", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <Icon name="alert-triangle" size={10} color="#92400e" /> No
          </span>
        ),
      hideOnMobile: true,
      align: "center",
    },
  ];

  return (
    <ApprovalQueue<PendingClubMembershipPaymentRow>
      items={items}
      columns={columns}
      getItemId={(p) => p.membershipId}
      getItemSearchText={(p) => `${p.displayName} ${p.username ?? ""} ${p.tierName}`}
      renderDetail={(p) => <ClubMembershipPaymentDetail item={p} />}
      detailTitle={(p) => `${p.tierName} · ${p.displayName}`}
      detailSubtitle={(p) =>
        `${p.durationMonths} mes${p.durationMonths === 1 ? "" : "es"} · ${fmtMoneyCurrency(p.amountCents, p.currency)}`
      }
      onApprove={onApprove}
      onReject={onReject}
      approveLabel="Aprobar pago"
      approveConfirmTitle={() => "Confirmar aprobación"}
      approveConfirmBody={(p) =>
        `Vas a aprobar el pago de ${p.displayName} por la membresía ${p.tierName} (${fmtMoneyCurrency(p.amountCents, p.currency)}). La membresía se activa inmediatamente.`
      }
      irreversibleNotice="Esta acción no se puede deshacer."
      searchPlaceholder="Buscar por socio, plan…"
      emptyState={{
        title: "Sin pagos pendientes",
        description: "Cuando un socio suba un comprobante de membresía, aparecerá acá.",
      }}
    />
  );
}

function ClubMembershipPaymentDetail({ item }: { item: PendingClubMembershipPaymentRow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <DetailGroup label="Socio">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{item.displayName}</span>
          {item.username && (
            <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>@{item.username}</span>
          )}
        </div>
      </DetailGroup>

      <DetailGroup label="Membresía solicitada">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ padding: "3px 9px", borderRadius: 9999, background: "#0a0a0a", color: "#fff", fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {item.tierName}
          </span>
          <span style={{ fontSize: 13 }}>
            {item.durationMonths} mes{item.durationMonths === 1 ? "" : "es"}
          </span>
          <span className="font-heading tabular" style={{ marginLeft: "auto", fontSize: 22, fontWeight: 900 }}>
            {fmtMoneyCurrency(item.amountCents, item.currency)}
          </span>
        </div>
      </DetailGroup>

      <DetailGroup label="Comprobante de pago">
        {item.proofSignedUrl ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            {isImageProof(item.proofUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.proofSignedUrl}
                alt="Comprobante"
                style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 8, border: "1px solid var(--border)", objectFit: "contain", background: "var(--muted)" }}
              />
            ) : (
              <a href={item.proofSignedUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
                <Icon name="file-text" size={13} /> Abrir comprobante (PDF)
              </a>
            )}
            <a href={item.proofSignedUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: "var(--primary)", textDecoration: "underline" }}>
              Abrir en nueva pestaña ↗
            </a>
            {item.proofSubmittedAt && (
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                Subido: {fmtAbsoluteDate(item.proofSubmittedAt)}
              </span>
            )}
          </div>
        ) : (
          <div style={{ padding: "10px 12px", border: "1px dashed var(--border)", borderRadius: 8, fontSize: 12, color: "#92400e", background: "#fffbeb" }}>
            <Icon name="alert-triangle" size={12} color="#b45309" /> Comprobante aún no subido. No deberías aprobar este pago hasta verificarlo.
          </div>
        )}
      </DetailGroup>

      {item.transactionId == null && (
        <div style={{ padding: "10px 12px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 12, color: "#991b1b" }}>
          <Icon name="alert-triangle" size={12} color="#991b1b" /> Sin transacción asociada.
        </div>
      )}

      <DetailGroup label="Historial">
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
          <li>
            <span style={{ color: "var(--muted-fg)" }}>Solicitud creada: </span>
            <span>{fmtAbsoluteDate(item.createdAt)}</span>
          </li>
          {item.proofSubmittedAt && (
            <li>
              <span style={{ color: "var(--muted-fg)" }}>Comprobante subido: </span>
              <span>{fmtAbsoluteDate(item.proofSubmittedAt)}</span>
            </li>
          )}
        </ul>
      </DetailGroup>
    </div>
  );
}

function DetailGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
        {label}
      </div>
      {children}
    </div>
  );
}
