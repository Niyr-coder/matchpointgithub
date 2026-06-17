"use client";
// MATCHPOINT+ admin screen.
//   1. Resumen        — métricas reales disponibles + aclaración de tracking pendiente.
//   2. Cola de aprob. — operational queues reales (player_subscriptions + club_featuring_subscriptions).
//
// The operational queues are built on the reusable <ApprovalQueue /> widget so
// MAT-5 (club membership approvals) can consume the same component.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { InfoTip } from "@/components/dashboard/widgets/InfoTip";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import {
  ApprovalQueue,
  type ApprovalQueueColumn,
} from "@/components/dashboard/widgets/ApprovalQueue";
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
  activePlanCount: number;
};

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);
const moneyK = (c: number) => {
  const n = c / 100;
  return n >= 1000 ? "$" + (n / 1000).toFixed(1) + "k" : "$" + n.toFixed(0);
};

function fmtMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace segundos";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtAbsolute(iso: string | null): string {
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
type TabKey = "resumen" | "cola" | "planes";

const FUNNEL: { l: string; v: number; pct: number; color: string }[] = [];

const FEATURES: { icon: string; l: string; uses: number; pct: number }[] = [];

type SubStatus = "active" | "trial" | "cancel" | "overdue";
const SUBSCRIBERS: { who: string; initials: string; plan: string; status: SubStatus; since: string; ltv: number; mrr: number; avBg: string }[] = [];
const SUB_STATUS: Record<SubStatus, { bg: string; fg: string; l: string }> = {
  active: { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Activo" },
  trial: { bg: "#fef3c7", fg: "#92400e", l: "Trial" },
  cancel: { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Canceló" },
  overdue: { bg: "#fee2e2", fg: "#dc2626", l: "Vencido" },
};

const PROMOS: { code: string; off: string; uses: string; cap: string; exp: string }[] = [];

const SUBS_COLS = "1.8fr 110px 130px 110px 110px 90px";
const RECENT_SUBS_COLS = "1.6fr 110px 110px 120px 110px";

export function AdminMatchPointPlusScreen({ data }: { data: AdminPlusData }) {
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(
    data.pending.length + data.pendingFeaturing.length > 0 ? "cola" : "resumen",
  );
  const [plans, setPlans] = useState<{ monthly: Plan; annual: Plan }>({
    monthly: { priceCents: 699, active: data.activePlanCount },
    annual: { priceCents: 0, active: 0 },
  });
  const [promoOpen, setPromoOpen] = useState(false);
  const [showSubsExpanded, setShowSubsExpanded] = useState(true);
  const [showFeaturingExpanded, setShowFeaturingExpanded] = useState(true);

  useRealtimeRefresh(
    [
      { table: "player_subscriptions" },
      { table: "club_featuring_subscriptions" },
      { table: "transactions" },
      { table: "clubs" },
    ],
    { debounceMs: 5000 },
  );

  const { pending, pendingFeaturing, activeFeaturedCount, activePlanCount } = data;

  const pendingProofCount = useMemo(
    () => pending.filter((p) => !!p.proofSignedUrl).length,
    [pending],
  );

  const totalPending = pending.length + pendingFeaturing.length;
  const recentPlanRevenueCents = data.recent.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const recentFeaturingRevenueCents = data.recentFeaturing.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);

  // ── approve/reject for plan subscriptions ────────────────────────────
  const onApprovePlan = async (p: PendingPlanSubscriptionRow) => {
    const res = await approvePlanSubscriptionAdmin({
      subscriptionId: p.subscriptionId,
    });
    if (res.ok) {
      toast({
        icon: "check",
        title: "Pago aprobado",
        sub: `${p.displayName} · suscripción activa`,
      });
      router.refresh();
    } else {
      toast({
        icon: "alert-triangle",
        title: "No pudimos aprobar el pago",
        sub: res.error.message,
      });
      throw new Error(res.error.message);
    }
  };

  const onRejectPlan = async (
    p: PendingPlanSubscriptionRow,
    reason: string,
  ) => {
    const res = await rejectPlanSubscriptionAdmin({
      subscriptionId: p.subscriptionId,
      reason,
    });
    if (res.ok) {
      toast({
        icon: "check",
        title: "Pago rechazado",
        sub: "Se notificó al usuario",
      });
      router.refresh();
    } else {
      toast({
        icon: "alert-triangle",
        title: "No pudimos rechazar el pago",
        sub: res.error.message,
      });
      throw new Error(res.error.message);
    }
  };

  // ── approve/reject for club featuring ────────────────────────────────
  const onApproveFeaturing = async (p: PendingClubFeaturingRow) => {
    const res = await approveClubFeaturingAdmin({
      subscriptionId: p.subscriptionId,
    });
    if (res.ok) {
      toast({
        icon: "check",
        title: "Featuring activado",
        sub: p.clubName,
      });
      router.refresh();
    } else {
      toast({
        icon: "alert-triangle",
        title: "No pudimos aprobar el featuring",
        sub: res.error.message,
      });
      throw new Error(res.error.message);
    }
  };

  const onRejectFeaturing = async (
    p: PendingClubFeaturingRow,
    reason: string,
  ) => {
    const res = await rejectClubFeaturingAdmin({
      subscriptionId: p.subscriptionId,
      reason,
    });
    if (res.ok) {
      toast({
        icon: "check",
        title: "Featuring rechazado",
        sub: "Se notificó al club",
      });
      router.refresh();
    } else {
      toast({
        icon: "alert-triangle",
        title: "No pudimos rechazar el featuring",
        sub: res.error.message,
      });
      throw new Error(res.error.message);
    }
  };

  const totalSubs = plans.monthly.active + plans.annual.active;
  const mrr =
    plans.monthly.active * plans.monthly.priceCents +
    Math.round((plans.annual.active * plans.annual.priceCents) / 12);
  const arpu = Math.round(mrr / totalSubs);
  const savings = plans.annual.priceCents > 0
    ? Math.round((1 - plans.annual.priceCents / 12 / plans.monthly.priceCents) * 100)
    : 0;

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ icon: "copy", title: "Código copiado", sub: code });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar" });
    }
  };

  // ── columns ──────────────────────────────────────────────────────────
  const planColumns: ApprovalQueueColumn<PendingPlanSubscriptionRow>[] = [
    {
      key: "user",
      label: "Usuario",
      render: (p) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 220,
            }}
          >
            {p.displayName}
          </span>
          {p.username && (
            <span
              style={{
                fontSize: 10.5,
                color: "var(--muted-fg)",
                textTransform: "lowercase",
              }}
            >
              @{p.username}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "plan",
      label: "Plan",
      render: (p) => (
        <span
          style={{
            padding: "2px 7px",
            borderRadius: 9999,
            background: "#0a0a0a",
            color: "#fff",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {p.tier} · {p.durationMonths}m
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "amount",
      label: "Monto",
      render: (p) => (
        <span
          className="font-heading tabular"
          style={{ fontWeight: 800, fontSize: 13 }}
        >
          {fmtMoney(p.amountCents, p.currency)}
        </span>
      ),
      align: "right",
    },
    {
      key: "submittedAt",
      label: "Solicitado",
      render: (p) => (
        <span
          title={fmtAbsolute(p.createdAt)}
          style={{ fontSize: 11.5, color: "var(--muted-fg)" }}
        >
          {fmtRelative(p.createdAt)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "proof",
      label: "Comprobante",
      render: (p) =>
        p.proofSignedUrl ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 9999,
              background: "rgba(16,185,129,0.12)",
              color: "#047857",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <Icon name="check" size={10} color="#047857" /> Sí
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 9999,
              background: "#fef3c7",
              color: "#92400e",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Falta
          </span>
        ),
      hideOnMobile: true,
    },
  ];

  const featuringColumns: ApprovalQueueColumn<PendingClubFeaturingRow>[] = [
    {
      key: "club",
      label: "Club",
      render: (p) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: 12.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 220,
            }}
          >
            {p.clubName}
          </span>
          {p.clubCity && (
            <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
              {p.clubCity}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "period",
      label: "Periodo",
      render: (p) => (
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>
          {p.durationDays} día{p.durationDays === 1 ? "" : "s"}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "amount",
      label: "Monto",
      render: (p) => (
        <span
          className="font-heading tabular"
          style={{ fontWeight: 800, fontSize: 13 }}
        >
          {fmtMoney(p.amountCents, p.currency)}
        </span>
      ),
      align: "right",
    },
    {
      key: "submittedAt",
      label: "Solicitado",
      render: (p) => (
        <span
          title={fmtAbsolute(p.createdAt)}
          style={{ fontSize: 11.5, color: "var(--muted-fg)" }}
        >
          {fmtRelative(p.createdAt)}
        </span>
      ),
      hideOnMobile: true,
    },
    {
      key: "proof",
      label: "Comprobante",
      render: (p) =>
        p.proofSignedUrl ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 9999,
              background: "rgba(16,185,129,0.12)",
              color: "#047857",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            <Icon name="check" size={10} color="#047857" /> Sí
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 7px",
              borderRadius: 9999,
              background: "#fef3c7",
              color: "#92400e",
              fontSize: 10,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Falta
          </span>
        ),
      hideOnMobile: true,
    },
  ];

  // ── render ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            className="font-heading mp-admin-page-title"
            style={{
              margin: 0,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
            }}
          >
            MATCHPOINT<span style={{ color: "var(--primary)" }}>+</span>
            <span className="dot">.</span>
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 13,
              color: "var(--muted-fg)",
            }}
          >
            {activePlanCount.toLocaleString("es-EC")} suscripciones activas ·{" "}
            {activeFeaturedCount.toLocaleString("es-EC")} clubes destacados activos ·{" "}
            {moneyK(recentPlanRevenueCents + recentFeaturingRevenueCents)} en últimos registros
          </p>
        </div>
      </div>

      <TabBar
        tab={tab}
        setTab={setTab}
        pendingCount={totalPending}
      />

      {tab === "resumen" && (
        <ResumenTab
          plans={plans}
          mrr={mrr}
          totalSubs={totalSubs}
          pending={pending.length}
          pendingFeaturing={pendingFeaturing.length}
          pendingProofCount={pendingProofCount}
          recent={data.recent}
          recentFeaturing={data.recentFeaturing}
          activePlanCount={activePlanCount}
          activeFeaturedCount={activeFeaturedCount}
        />
      )}

      {tab === "cola" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CollapsibleSection
            title={`Suscripciones MATCHPOINT+`}
            count={pending.length}
            open={showSubsExpanded}
            onToggle={() => setShowSubsExpanded((v) => !v)}
          >
            <ApprovalQueue<PendingPlanSubscriptionRow>
              items={pending}
              columns={planColumns}
              getItemId={(p) => p.subscriptionId}
              getItemSearchText={(p) =>
                `${p.displayName} ${p.username ?? ""} ${p.tier}`
              }
              renderDetail={(p) => <PlanSubscriptionDetail item={p} />}
              detailTitle={(p) => `Plan ${p.tier} · ${p.displayName}`}
              detailSubtitle={(p) =>
                `${p.durationMonths} mes${p.durationMonths === 1 ? "" : "es"} · ${fmtMoney(p.amountCents, p.currency)}`
              }
              onApprove={onApprovePlan}
              onReject={onRejectPlan}
              approveLabel="Aprobar pago"
              approveConfirmTitle={() => "Confirmar aprobación"}
              approveConfirmBody={(p) =>
                `Vas a aprobar el pago de ${p.displayName} por el plan ${p.tier} (${fmtMoney(
                  p.amountCents,
                  p.currency,
                )}). La suscripción se activará inmediatamente.`
              }
              irreversibleNotice="Esta acción no se puede deshacer."
              searchPlaceholder="Buscar por usuario, email…"
              emptyState={{
                title: "Sin pagos MP+ pendientes",
                description: "Cuando un usuario suba un comprobante, aparecerá acá.",
              }}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Featured listings de clubes"
            count={pendingFeaturing.length}
            open={showFeaturingExpanded}
            onToggle={() => setShowFeaturingExpanded((v) => !v)}
            rightChip={`${activeFeaturedCount} activo${activeFeaturedCount === 1 ? "" : "s"}`}
          >
            <ApprovalQueue<PendingClubFeaturingRow>
              items={pendingFeaturing}
              columns={featuringColumns}
              getItemId={(p) => p.subscriptionId}
              getItemSearchText={(p) =>
                `${p.clubName} ${p.clubCity ?? ""} ${p.clubSlug ?? ""}`
              }
              renderDetail={(p) => <ClubFeaturingDetail item={p} />}
              detailTitle={(p) => `Featuring · ${p.clubName}`}
              detailSubtitle={(p) =>
                `${p.durationDays} día${p.durationDays === 1 ? "" : "s"} · ${fmtMoney(p.amountCents, p.currency)}`
              }
              onApprove={onApproveFeaturing}
              onReject={onRejectFeaturing}
              approveLabel="Aprobar featuring"
              approveConfirmTitle={() => "Confirmar aprobación"}
              approveConfirmBody={(p) =>
                `Vas a aprobar el featuring del club ${p.clubName} por ${p.durationDays} día${p.durationDays === 1 ? "" : "s"} (${fmtMoney(
                  p.amountCents,
                  p.currency,
                )}). El club se mostrará destacado inmediatamente.`
              }
              irreversibleNotice="Esta acción no se puede deshacer."
              searchPlaceholder="Buscar por club, ciudad…"
              emptyState={{
                title: "Sin solicitudes de featuring",
                description:
                  "Cuando un club pague por destacarse, su solicitud aparecerá acá.",
              }}
            />
          </CollapsibleSection>
        </div>
      )}

      {tab === "planes" && (
        <PlanesTab
          plans={plans}
          setPlans={setPlans}
          savings={savings}
          promoOpen={promoOpen}
          setPromoOpen={setPromoOpen}
          copyCode={copyCode}
          toast={toast}
        />
      )}
    </div>
  );
}

// ── tab bar ───────────────────────────────────────────────────────────
function TabBar({
  tab,
  setTab,
  pendingCount,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
  pendingCount: number;
}) {
  const tabs: { k: TabKey; l: string; badge?: number }[] = [
    { k: "resumen", l: "Resumen" },
    { k: "cola", l: "Cola de aprobación", badge: pendingCount },
  ];
  return (
    <div
      role="tablist"
      aria-label="Secciones MATCHPOINT+ admin"
      style={{
        display: "flex",
        gap: 6,
        borderBottom: "1px solid var(--border)",
        flexWrap: "wrap",
      }}
    >
      {tabs.map((t) => {
        const on = tab === t.k;
        return (
          <button
            key={t.k}
            role="tab"
            aria-selected={on}
            onClick={() => setTab(t.k)}
            style={{
              border: 0,
              borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
              background: "transparent",
              padding: "10px 4px",
              marginBottom: -1,
              fontSize: 12.5,
              fontWeight: 800,
              fontFamily: "inherit",
              color: on ? "#0a0a0a" : "var(--muted-fg)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {t.l}
            {t.badge != null && t.badge > 0 && (
              <span
                style={{
                  padding: "2px 7px",
                  borderRadius: 9999,
                  background: on ? "#0a0a0a" : "#fef3c7",
                  color: on ? "#fff" : "#92400e",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  minWidth: 18,
                  textAlign: "center",
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── collapsible section ───────────────────────────────────────────────
function CollapsibleSection({
  title,
  count,
  open,
  onToggle,
  rightChip,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  rightChip?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          background: "transparent",
          border: 0,
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          flexWrap: "wrap",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
          <h3
            className="font-heading"
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
            }}
          >
            {title}
            <span className="dot">.</span>
          </h3>
          <span
            style={{
              padding: "2px 9px",
              borderRadius: 9999,
              background: count > 0 ? "#fef3c7" : "var(--muted)",
              color: count > 0 ? "#92400e" : "var(--muted-fg)",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {count} pendiente{count === 1 ? "" : "s"}
          </span>
        </div>
        {rightChip && (
          <span
            style={{
              padding: "2px 9px",
              borderRadius: 9999,
              background: "rgba(16,185,129,0.12)",
              color: "#047857",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {rightChip}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ── detail renderers ─────────────────────────────────────────────────
function PlanSubscriptionDetail({ item }: { item: PendingPlanSubscriptionRow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <DetailGroup label="Usuario">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>
            {item.displayName}
          </span>
          {item.username && (
            <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              @{item.username}
            </span>
          )}
        </div>
      </DetailGroup>

      <DetailGroup label="Plan solicitado">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 9999,
              background: "#0a0a0a",
              color: "#fff",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            {item.tier}
          </span>
          <span style={{ fontSize: 13 }}>
            {item.durationMonths} mes{item.durationMonths === 1 ? "" : "es"}
          </span>
          <span
            className="font-heading tabular"
            style={{ marginLeft: "auto", fontSize: 22, fontWeight: 900 }}
          >
            {fmtMoney(item.amountCents, item.currency)}
          </span>
        </div>
      </DetailGroup>

      <DetailGroup label="Comprobante de pago">
        {item.proofSignedUrl ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            {isImageUrl(item.proofUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.proofSignedUrl}
                alt="Comprobante"
                style={{
                  maxWidth: "100%",
                  maxHeight: 280,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  objectFit: "contain",
                  background: "var(--muted)",
                }}
              />
            ) : (
              <a
                href={item.proofSignedUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
              >
                <Icon name="file-text" size={13} /> Abrir comprobante (PDF)
              </a>
            )}
            <a
              href={item.proofSignedUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11.5,
                color: "var(--primary)",
                textDecoration: "underline",
              }}
            >
              Abrir en nueva pestaña ↗
            </a>
            {item.proofSubmittedAt && (
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                Subido: {fmtAbsolute(item.proofSubmittedAt)}
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: "10px 12px",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "#92400e",
              background: "#fffbeb",
            }}
          >
            <Icon name="alert-triangle" size={12} color="#b45309" /> Comprobante
            aún no subido por el usuario. No deberías aprobar este pago hasta
            verificar el comprobante.
          </div>
        )}
      </DetailGroup>

      {item.transactionId == null && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            fontSize: 12,
            color: "#991b1b",
          }}
        >
          <Icon name="alert-triangle" size={12} color="#991b1b" /> Sin
          transacción asociada.
        </div>
      )}

      <DetailGroup label="Historial">
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}
        >
          <li>
            <span style={{ color: "var(--muted-fg)" }}>
              Solicitud creada:{" "}
            </span>
            <span>{fmtAbsolute(item.createdAt)}</span>
          </li>
        </ul>
      </DetailGroup>
    </div>
  );
}

function ClubFeaturingDetail({ item }: { item: PendingClubFeaturingRow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <DetailGroup label="Club">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 14 }}>{item.clubName}</span>
          {item.clubCity && (
            <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
              {item.clubCity}
            </span>
          )}
          {item.clubSlug && (
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              /clubes/{item.clubSlug}
            </span>
          )}
        </div>
      </DetailGroup>

      <DetailGroup label="Featuring solicitado">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13 }}>
            {item.durationDays} día{item.durationDays === 1 ? "" : "s"}
          </span>
          <span
            className="font-heading tabular"
            style={{ marginLeft: "auto", fontSize: 22, fontWeight: 900 }}
          >
            {fmtMoney(item.amountCents, item.currency)}
          </span>
        </div>
      </DetailGroup>

      <DetailGroup label="Comprobante de pago">
        {item.proofSignedUrl ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            {isImageUrl(item.proofUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.proofSignedUrl}
                alt="Comprobante"
                style={{
                  maxWidth: "100%",
                  maxHeight: 280,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  objectFit: "contain",
                  background: "var(--muted)",
                }}
              />
            ) : (
              <a
                href={item.proofSignedUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline"
              >
                <Icon name="file-text" size={13} /> Abrir comprobante (PDF)
              </a>
            )}
            <a
              href={item.proofSignedUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 11.5,
                color: "var(--primary)",
                textDecoration: "underline",
              }}
            >
              Abrir en nueva pestaña ↗
            </a>
            {item.proofSubmittedAt && (
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                Subido: {fmtAbsolute(item.proofSubmittedAt)}
              </span>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: "10px 12px",
              border: "1px dashed var(--border)",
              borderRadius: 8,
              fontSize: 12,
              color: "#92400e",
              background: "#fffbeb",
            }}
          >
            <Icon name="alert-triangle" size={12} color="#b45309" /> Comprobante
            aún no subido por el club.
          </div>
        )}
      </DetailGroup>

      {item.transactionId == null && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fee2e2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            fontSize: 12,
            color: "#991b1b",
          }}
        >
          <Icon name="alert-triangle" size={12} color="#991b1b" /> Sin
          transacción asociada.
        </div>
      )}

      <DetailGroup label="Historial">
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            fontSize: 12,
          }}
        >
          <li>
            <span style={{ color: "var(--muted-fg)" }}>
              Solicitud creada:{" "}
            </span>
            <span>{fmtAbsolute(item.createdAt)}</span>
          </li>
        </ul>
      </DetailGroup>
    </div>
  );
}

function DetailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: 10,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Resumen tab (KPIs + funnel + features + subscribers — preserves aspirational design)
function ResumenTab({
  plans,
  mrr,
  totalSubs,
  pending,
  pendingFeaturing,
  pendingProofCount,
  recent,
  recentFeaturing,
  activePlanCount,
  activeFeaturedCount,
}: {
  plans: { monthly: Plan; annual: Plan };
  mrr: number;
  totalSubs: number;
  pending: number;
  pendingFeaturing: number;
  pendingProofCount: number;
  recent: RecentPlanSubscriptionRow[];
  recentFeaturing: RecentClubFeaturingRow[];
  activePlanCount: number;
  activeFeaturedCount: number;
}) {
  const recentPlanRevenueCents = recent.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const recentFeaturingRevenueCents = recentFeaturing.reduce((sum, row) => sum + (row.amountCents ?? 0), 0);
  const recentRows = recent.slice(0, 8);

  if (Array.isArray(recent)) return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="mp-spon-kpis gap-3.5">
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 14.4,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
            color: "#fff",
            padding: 18,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "#34d399" }}>
                ● Suscripciones activas
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399" }}>
                dato real
              </span>
            </div>
            <div className="font-heading tabular mp-admin-hero-value" style={{ fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
              {activePlanCount.toLocaleString("es-EC")}
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>
              Planes MATCHPOINT+ activos y vigentes.
            </div>
          </div>
        </div>
        <AdminMpKpi icon="clock" label="Pendientes MP+" value={String(pending)} sub={`${pendingProofCount} con comprobante`} warn={pending > 0} tip="Suscripciones en pending o pending_proof esperando aprobación manual." />
        <AdminMpKpi icon="badge-check" label="Clubes destacados" value={String(activeFeaturedCount)} sub="featured activo" emerald tip="Clubes con featuring comercial activo ahora (distinto de Club Pro operativo)." />
        <AdminMpKpi icon="wallet" label="MP+ reciente" value={moneyK(recentPlanRevenueCents)} sub={`${recent.length} registros recientes`} tip="Suma de montos de las últimas suscripciones premium registradas." />
        <AdminMpKpi icon="star" label="Featuring reciente" value={moneyK(recentFeaturingRevenueCents)} sub={`${recentFeaturing.length} registros recientes`} tip="Ingresos recientes por featuring de clubes en el historial visible." />
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>
            ● Historial real
          </div>
          <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>
            Últimas suscripciones MATCHPOINT+<span className="dot">.</span>
          </h3>
        </div>
        {recentRows.length === 0 ? (
          <div style={{ padding: 18, color: "var(--muted-fg)", fontSize: 13 }}>
            Sin suscripciones recientes.
          </div>
        ) : (
          <div className="mp-table-scroll">
            <div className="mp-admin-subs-inner">
              <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: RECENT_SUBS_COLS, gap: 12, padding: "10px 18px", background: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
                <span>Usuario</span>
                <span>Estado</span>
                <span>Duración</span>
                <span>Monto</span>
                <span>Creada</span>
              </div>
              {recentRows.map((row, index) => (
                <div key={row.subscriptionId} style={{ display: "grid", gridTemplateColumns: RECENT_SUBS_COLS, gap: 12, padding: "12px 18px", alignItems: "center", borderBottom: index < recentRows.length - 1 ? "1px solid var(--border)" : undefined, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.displayName}</span>
                  <span style={{ color: row.status === "active" ? "#047857" : "var(--muted-fg)", fontWeight: 900 }}>{row.status}</span>
                  <span style={{ color: "var(--muted-fg)" }}>{row.durationMonths} mes{row.durationMonths === 1 ? "" : "es"}</span>
                  <span className="font-heading tabular" style={{ fontWeight: 900 }}>{fmtMoney(row.amountCents, row.currency)}</span>
                  <span title={fmtAbsolute(row.createdAt)} style={{ color: "var(--muted-fg)" }}>{fmtRelative(row.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="mp-spon-kpis gap-3.5">
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 14.4,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
            color: "#fff",
            padding: 18,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)",
            }}
          />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="label-mp" style={{ color: "#34d399" }}>
                ● Recurrente
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: "#34d399",
                }}
              >
                +18.2% vs mes anterior
              </span>
            </div>
            <div
              className="font-heading tabular mp-admin-hero-value"
              style={{
                fontWeight: 900,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                marginTop: 6,
              }}
            >
              {moneyK(mrr)}
              <span
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 700,
                  marginLeft: 6,
                }}
              >
                /mes
              </span>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: "rgba(255,255,255,0.72)",
                marginTop: 6,
              }}
            >
              {plans.monthly.active.toLocaleString()} mensual ·{" "}
              {plans.annual.active.toLocaleString()} anual
            </div>
          </div>
        </div>
        <AdminMpKpi
          icon="users"
          label="Suscriptores"
          value={totalSubs.toLocaleString()}
          sub="+412 esta semana"
        />
        <AdminMpKpi
          icon="trending-up"
          label="Tasa conversión"
          value="10.1%"
          sub="trial → pago"
          emerald
        />
        <AdminMpKpi
          icon="user-minus"
          label="Churn 30d"
          value="3.4%"
          sub="146 cancelaciones"
          warn
        />
        <AdminMpKpi
          icon="inbox"
          label="Por aprobar"
          value={String(pending + pendingFeaturing)}
          sub={`${pendingProofCount} con comprobante`}
          warn={pending + pendingFeaturing > 0}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Conversión
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Funnel últimos 30 días<span className="dot">.</span>
            </h3>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            {FUNNEL.map((f) => (
              <div key={f.l}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 700 }}>{f.l}</span>
                  <span
                    className="tabular"
                    style={{ fontSize: 13, fontWeight: 800 }}
                  >
                    {f.v.toLocaleString()}
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 11,
                        color: "var(--muted-fg)",
                        fontWeight: 700,
                      }}
                    >
                      {f.pct}%
                    </span>
                  </span>
                </div>
                <div
                  style={{
                    height: 26,
                    borderRadius: 6,
                    background: "var(--muted)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: f.pct + "%",
                      background: f.color,
                      transition:
                        "width 320ms cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Uso
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Features más usados<span className="dot">.</span>
            </h3>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 10 }}
          >
            {FEATURES.map((f) => (
              <div
                key={f.l}
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "rgba(16,185,129,0.12)",
                    color: "#047857",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={f.icon} size={14} color="#047857" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      fontWeight: 700,
                      marginBottom: 4,
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.l}
                    </span>
                    <span
                      className="tabular"
                      style={{
                        color: "var(--muted-fg)",
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {f.uses.toLocaleString()}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 5,
                      borderRadius: 9999,
                      background: "var(--muted)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: f.pct + "%",
                        background: "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div
          style={{
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--border)",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Movimiento reciente
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Suscriptores<span className="dot">.</span>
            </h3>
          </div>
        </div>
        <div className="mp-table-scroll">
          <div className="mp-admin-subs-inner">
            <div
              className="mp-table-row"
              style={{
                display: "grid",
                gridTemplateColumns: SUBS_COLS,
                gap: 12,
                padding: "10px 20px",
                background: "var(--muted)",
                borderBottom: "1px solid var(--border)",
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--muted-fg)",
              }}
            >
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
                <div
                  key={s.who}
                  className="mp-table-row"
                  style={{
                    display: "grid",
                    gridTemplateColumns: SUBS_COLS,
                    gap: 12,
                    padding: "12px 20px",
                    alignItems: "center",
                    borderBottom:
                      i < arr.length - 1 ? "1px solid var(--border)" : 0,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: s.avBg,
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-heading)",
                        fontWeight: 900,
                        fontSize: 11.5,
                      }}
                    >
                      {s.initials}
                    </span>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.who}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    {s.plan}
                  </span>
                  <span
                    style={{
                      padding: "3px 9px",
                      borderRadius: 9999,
                      background: sp.bg,
                      color: sp.fg,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      justifySelf: "start",
                    }}
                  >
                    {sp.l}
                  </span>
                  <span
                    style={{ fontSize: 12, color: "var(--muted-fg)" }}
                  >
                    {s.since}
                  </span>
                  <span
                    className="font-heading tabular"
                    style={{ fontSize: 13, fontWeight: 800 }}
                  >
                    {money(s.ltv)}
                  </span>
                  <span
                    className="font-heading tabular"
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      textAlign: "right",
                      color: s.mrr > 0 ? "#047857" : "var(--muted-fg)",
                    }}
                  >
                    {s.mrr > 0 ? money(s.mrr) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Planes & precios tab ─────────────────────────────────────────────
type ToastFn = ReturnType<typeof useToast>;
function PlanesTab({
  plans,
  setPlans,
  savings,
  promoOpen,
  setPromoOpen,
  copyCode,
  toast,
}: {
  plans: { monthly: Plan; annual: Plan };
  setPlans: (p: { monthly: Plan; annual: Plan }) => void;
  savings: number;
  promoOpen: boolean;
  setPromoOpen: (b: boolean) => void;
  copyCode: (c: string) => void;
  toast: ToastFn;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 14,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Pricing
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Planes activos<span className="dot">.</span>
            </h3>
          </div>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            Referencia operativa; la activación sigue con comprobante manual
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 14,
          }}
        >
          <PlanEditCard
            cycle="Mensual"
            plan={plans.monthly}
            priceLabel="/mes"
            onChange={(p) => setPlans({ ...plans, monthly: p })}
            mrrPart={plans.monthly.active * plans.monthly.priceCents}
          />
          <PlanEditCard
            cycle="Anual no activo"
            plan={plans.annual}
            priceLabel=""
            onChange={(p) => setPlans({ ...plans, annual: p })}
            mrrPart={Math.round(
              (plans.annual.active * plans.annual.priceCents) / 12,
            )}
            savings={savings}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 12,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>
              ● Marketing
            </div>
            <h3
              className="font-heading"
              style={{
                margin: "4px 0 0",
                fontSize: 18,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
              }}
            >
              Códigos promocionales<span className="dot">.</span>
            </h3>
          </div>
          <button
            className="btn btn-outline"
            onClick={() => setPromoOpen(true)}
          >
            <Icon name="plus" size={12} /> Nuevo código
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {PROMOS.map((p) => (
            <div
              key={p.code}
              style={{
                padding: 14,
                borderRadius: 11,
                border: "1px dashed var(--border)",
                background: "#fafafa",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div
                  className="font-heading tabular"
                  style={{
                    fontSize: 14,
                    fontWeight: 900,
                    letterSpacing: "0.02em",
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {p.code}
                </div>
                <button
                  onClick={() => copyCode(p.code)}
                  aria-label="Copiar código"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    border: 0,
                    background: "transparent",
                    color: "var(--muted-fg)",
                    cursor: "pointer",
                  }}
                >
                  <Icon name="copy" size={12} />
                </button>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  marginTop: 4,
                }}
              >
                {p.off}
              </div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10.5,
                  color: "#0a0a0a",
                }}
              >
                <span>
                  Usos: {p.uses}/{p.cap}
                </span>
                <span>Vence: {p.exp}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {promoOpen && (
        <div
          onMouseDown={() => setPromoOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(10,10,10,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="card"
            style={{
              maxWidth: 460,
              width: "100%",
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>
                ● Promo
              </div>
              <h3
                className="font-heading"
                style={{
                  margin: "4px 0 0",
                  fontSize: 20,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                }}
              >
                Nuevo código<span className="dot">.</span>
              </h3>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--muted-fg)",
                }}
              >
                Código
              </span>
              <input
                placeholder="EJ: BLACKFRIDAY"
                style={{
                  padding: "10px 12px",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 13,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  outline: "none",
                }}
              />
            </label>
            <div
              className="mp-tournament-form-grid-2"
              style={{ marginTop: 12 }}
            >
              <label
                style={{ display: "flex", flexDirection: "column", gap: 5 }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--muted-fg)",
                  }}
                >
                  Tipo
                </span>
                <select
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 13,
                    outline: "none",
                    background: "#fff",
                  }}
                >
                  <option>% descuento</option>
                  <option>$ descuento</option>
                  <option>Días gratis</option>
                </select>
              </label>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 5 }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--muted-fg)",
                  }}
                >
                  Valor
                </span>
                <input
                  type="number"
                  placeholder="50"
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 13,
                    outline: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
              </label>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                className="btn"
                onClick={() => setPromoOpen(false)}
                style={{
                  background: "#fff",
                  border: "1px solid var(--border)",
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setPromoOpen(false);
                  toast({
                    icon: "check-circle-2",
                    title: "Promos pendientes de backend",
                  });
                }}
              >
                <Icon name="check" size={13} color="#fff" /> Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminMpKpi({
  icon,
  label,
  value,
  sub,
  emerald,
  warn,
  tip,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  emerald?: boolean;
  warn?: boolean;
  tip?: string;
}) {
  const c = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {label}
          {tip ? <InfoTip text={tip} maxWidth={220} /> : null}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: emerald
              ? "rgba(16,185,129,0.12)"
              : warn
                ? "#fef3c7"
                : "var(--muted)",
            color: c,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 26,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: c,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function PlanEditCard({
  cycle,
  plan,
  priceLabel,
  onChange,
  mrrPart,
  savings,
}: {
  cycle: string;
  plan: Plan;
  priceLabel: string;
  onChange: (p: Plan) => void;
  mrrPart: number;
  savings?: number;
}) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
          }}
        >
          {cycle}
          <span className="dot">.</span>
        </div>
        {savings != null && savings > 0 && (
          <span
            style={{
              padding: "3px 8px",
              borderRadius: 9999,
              background: "rgba(16,185,129,0.12)",
              color: "#047857",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            −{savings}% ahorro
          </span>
        )}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: "var(--muted-fg)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Precio{priceLabel}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--muted-fg)" }}>$</span>
          <input
            type="number"
            step="0.01"
            value={plan.priceCents / 100}
            onChange={(e) =>
              onChange({
                ...plan,
                priceCents: Math.round(Number(e.target.value) * 100),
              })
            }
            style={{
              width: 110,
              padding: "6px 0",
              border: 0,
              borderBottom: "2px dashed var(--border)",
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: 28,
              fontVariantNumeric: "tabular-nums",
              outline: "none",
              background: "transparent",
            }}
          />
        </div>
      </label>
      <div
        className="mp-tournament-form-grid-2"
        style={{
          gap: 8,
          paddingTop: 10,
          borderTop: "1px dashed var(--border)",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 900,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            Suscriptores
          </div>
          <div
            className="font-heading tabular"
            style={{ fontSize: 18, fontWeight: 900 }}
          >
            {plan.active.toLocaleString()}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 900,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            MRR
          </div>
          <div
            className="font-heading tabular"
            style={{ fontSize: 18, fontWeight: 900, color: "#047857" }}
          >
            {money(mrrPart)}
          </div>
        </div>
      </div>
    </div>
  );
}
