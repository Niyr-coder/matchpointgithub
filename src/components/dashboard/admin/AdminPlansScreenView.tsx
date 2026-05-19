// Client view de AdminPlansScreen — "Planes y promociones".
//
// Decisión de scope (Agente W): se eligió la opción A — una sola pantalla
// agrupa planes premium de jugador y featuring de clubes, ambos comparten
// estética (cards de pendiente + tabla de historial). Mantener un solo
// punto de gestión evita boilerplate y reduce la fricción del admin que
// hoy ya entra a /dashboard/admin/admin-plans para revisar comprobantes.
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
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

// ── helpers ─────────────────────────────────────────────────────────────
function fmtMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isImageUrl(url: string | null): boolean {
  if (!url) return false;
  const lower = url.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(lower);
}

const STATUS_STYLE: Record<string, { bg: string; label: string }> = {
  pending: { bg: "#fbbf24", label: "Pendiente" },
  active: { bg: "var(--primary)", label: "Activo" },
  expired: { bg: "var(--muted-fg)", label: "Vencido" },
  cancelled: { bg: "#6b7280", label: "Cancelado" },
  rejected: { bg: "#dc2626", label: "Rechazado" },
};

// ── KPIs ────────────────────────────────────────────────────────────────
function computeKpis(
  pending: PendingPlanSubscriptionRow[],
  recent: RecentPlanSubscriptionRow[],
): { pendingCount: number; activeToday: number; expiredThisMonth: number } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // active "hoy" = subs activas cuya starts_at cae hoy (aprobadas hoy).
  const activeToday = recent.filter((s) => {
    if (s.status !== "active") return false;
    if (!s.startsAt) return false;
    const d = new Date(s.startsAt);
    return d >= todayStart;
  }).length;

  // expired este mes = subs cuyo expires_at cae en el mes en curso y
  // status no es active (ya pasaron a expired/cancelled). Como fallback
  // contamos cualquier sub con expires_at en este mes y now > expires_at.
  const expiredThisMonth = recent.filter((s) => {
    if (!s.expiresAt) return false;
    const exp = new Date(s.expiresAt);
    return exp >= monthStart && exp <= now;
  }).length;

  return { pendingCount: pending.length, activeToday, expiredThisMonth };
}

// ── view ────────────────────────────────────────────────────────────────
export function AdminPlansScreenView({
  pending,
  recent,
  pendingFeaturing,
  recentFeaturing,
  activeFeaturedCount,
}: {
  pending: PendingPlanSubscriptionRow[];
  recent: RecentPlanSubscriptionRow[];
  pendingFeaturing: PendingClubFeaturingRow[];
  recentFeaturing: RecentClubFeaturingRow[];
  activeFeaturedCount: number;
}) {
  useRealtimeRefresh(
    [
      { table: "player_subscriptions" },
      { table: "club_featuring_subscriptions" },
      { table: "transactions" },
      { table: "clubs" },
    ],
    { debounceMs: 5000 },
  );
  const router = useRouter();
  const toast = useToast();
  const { confirm, ask } = usePromptModal();
  const [busyId, setBusyId] = useState<string | null>(null);

  const kpis = useMemo(() => computeKpis(pending, recent), [pending, recent]);

  const handleApprove = async (p: PendingPlanSubscriptionRow) => {
    const ok = await confirm({
      title: "Aprobar plan",
      body: `¿Activar el plan ${p.tier} para ${p.displayName} por ${p.durationMonths} mes${p.durationMonths === 1 ? "" : "es"}?`,
      confirmLabel: "Aprobar plan",
    });
    if (!ok) return;
    setBusyId(p.subscriptionId);
    const res = await approvePlanSubscriptionAdmin({
      subscriptionId: p.subscriptionId,
    });
    setBusyId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Plan activado", sub: p.displayName });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleReject = async (p: PendingPlanSubscriptionRow) => {
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
      toast({
        icon: "check",
        title: "Solicitud rechazada",
        sub: "El usuario podrá volver a solicitarlo",
      });
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
    const res = await approveClubFeaturingAdmin({
      subscriptionId: p.subscriptionId,
    });
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
      toast({
        icon: "check",
        title: "Solicitud rechazada",
        sub: "El club podrá volver a solicitarlo",
      });
      router.refresh();
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const KPIS: [string, string | number, string, string][] = [
    [
      "Pendientes",
      kpis.pendingCount,
      kpis.pendingCount > 0 ? "#fbbf24" : "var(--muted-fg)",
      kpis.pendingCount === 1 ? "1 solicitud" : `${kpis.pendingCount} solicitudes`,
    ],
    [
      "Activados hoy",
      kpis.activeToday,
      "var(--primary)",
      "planes premium",
    ],
    [
      "Vencidos · este mes",
      kpis.expiredThisMonth,
      "#0a0a0a",
      "del mes en curso",
    ],
    [
      "Clubes destacados",
      activeFeaturedCount,
      activeFeaturedCount > 0 ? "var(--primary)" : "var(--muted-fg)",
      activeFeaturedCount === 1 ? "1 activo ahora" : `${activeFeaturedCount} activos ahora`,
    ],
  ];

  const recentFeaturingCols: RSColumn<RecentClubFeaturingRow>[] = [
    {
      k: "club",
      l: "Club",
      render: (r) => (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800 }}>{r.clubName}</div>
          {r.clubCity ? (
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
              {r.clubCity}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      k: "amount",
      l: "Monto",
      render: (r) => (
        <span className="tabular" style={{ fontSize: 11.5, fontWeight: 700 }}>
          {fmtMoney(r.amountCents, r.currency)}
        </span>
      ),
    },
    {
      k: "status",
      l: "Estado",
      render: (r) => {
        const st = STATUS_STYLE[r.status] ?? {
          bg: "var(--muted-fg)",
          label: r.status,
        };
        return <RSPill bg={st.bg}>{st.label}</RSPill>;
      },
    },
    {
      k: "starts",
      l: "Inicio",
      render: (r) => (
        <span style={{ color: "var(--muted-fg)" }}>{fmtDateShort(r.startsAt)}</span>
      ),
    },
    {
      k: "expires",
      l: "Vence",
      render: (r) => (
        <span style={{ color: "var(--muted-fg)" }}>{fmtDateShort(r.expiresAt)}</span>
      ),
    },
    {
      k: "proof",
      l: "Comprobante",
      align: "right",
      render: (r) =>
        r.proofSignedUrl ? (
          <a
            href={r.proofSignedUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--primary)",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name="external-link" size={11} />
            Ver
          </a>
        ) : (
          <span style={{ color: "var(--muted-fg)", fontSize: 11 }}>—</span>
        ),
    },
  ];

  const recentCols: RSColumn<RecentPlanSubscriptionRow>[] = [
    {
      k: "user",
      l: "Usuario",
      render: (r) => (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800 }}>{r.displayName}</div>
          {r.username ? (
            <div
              style={{
                fontSize: 9.5,
                color: "var(--muted-fg)",
                textTransform: "lowercase",
              }}
            >
              @{r.username}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      k: "tier",
      l: "Tier",
      render: (r) => (
        <span
          className="font-heading"
          style={{
            fontSize: 11,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {r.tier}
        </span>
      ),
    },
    {
      k: "status",
      l: "Estado",
      render: (r) => {
        const st = STATUS_STYLE[r.status] ?? {
          bg: "var(--muted-fg)",
          label: r.status,
        };
        return <RSPill bg={st.bg}>{st.label}</RSPill>;
      },
    },
    {
      k: "starts",
      l: "Inicio",
      render: (r) => (
        <span style={{ color: "var(--muted-fg)" }}>{fmtDateShort(r.startsAt)}</span>
      ),
    },
    {
      k: "expires",
      l: "Vence",
      render: (r) => (
        <span style={{ color: "var(--muted-fg)" }}>{fmtDateShort(r.expiresAt)}</span>
      ),
    },
    {
      k: "proof",
      l: "Comprobante",
      align: "right",
      render: (r) =>
        r.proofSignedUrl ? (
          <a
            href={r.proofSignedUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              color: "var(--primary)",
              fontSize: 11,
              fontWeight: 700,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name="external-link" size={11} />
            Ver
          </a>
        ) : (
          <span style={{ color: "var(--muted-fg)", fontSize: 11 }}>—</span>
        ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Planes y promociones"
        title={
          <>
            Suscripciones <span className="dot">●</span> premium y featuring
          </>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KPIS.map(([l, v, c, sub]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 24,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                marginTop: 6,
                color: c,
              }}
            >
              {v}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
              {sub}
            </div>
          </div>
        ))}
      </div>

      <PendingPlansSection
        pending={pending}
        busyId={busyId}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      <PendingClubFeaturingSection
        pending={pendingFeaturing}
        busyId={busyId}
        onApprove={handleApproveFeaturing}
        onReject={handleRejectFeaturing}
      />

      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="label-mp">Historial reciente · planes</div>
          <div
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Últimas 30 suscripciones
          </div>
        </div>
        {recent.length === 0 ? (
          <div
            style={{
              padding: "20px 16px",
              border: "1px dashed var(--border)",
              borderRadius: 12,
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 12,
            }}
          >
            Aún no hay suscripciones registradas.
          </div>
        ) : (
          <RSTable
            cols={recentCols}
            rows={recent}
            rowKey={(r) => r.subscriptionId}
          />
        )}
      </div>

      <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="label-mp">Historial reciente · featuring</div>
          <div
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Últimas 30 promociones de clubes
          </div>
        </div>
        {recentFeaturing.length === 0 ? (
          <div
            style={{
              padding: "20px 16px",
              border: "1px dashed var(--border)",
              borderRadius: 12,
              textAlign: "center",
              color: "var(--muted-fg)",
              fontSize: 12,
            }}
          >
            Aún no hay promociones de clubes registradas.
          </div>
        ) : (
          <RSTable
            cols={recentFeaturingCols}
            rows={recentFeaturing}
            rowKey={(r) => r.subscriptionId}
          />
        )}
      </div>
    </>
  );
}

// ── Sección: pending plan subscriptions ─────────────────────────────────
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
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="label-mp">Solicitudes pendientes</div>
          <div
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Upgrades a premium por aprobar
          </div>
        </div>
        <RSPill bg={pending.length > 0 ? "#fbbf24" : "var(--muted-fg)"}>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </RSPill>
      </div>

      {pending.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 12,
          }}
        >
          No hay solicitudes pendientes.
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
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: 12,
                  border: RS_BORDER,
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 10,
                    background: "var(--muted)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {hasProof ? (
                    isImageUrl(p.proofUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.proofSignedUrl as string}
                        alt="comprobante"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <a
                        href={p.proofSignedUrl as string}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          color: "var(--muted-fg)",
                          fontSize: 10,
                          textDecoration: "none",
                        }}
                      >
                        <Icon name="file-text" size={20} />
                        <span>Abrir PDF</span>
                      </a>
                    )
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--muted-fg)",
                        fontSize: 9.5,
                        textAlign: "center",
                        padding: 4,
                      }}
                    >
                      <Icon name="image-off" size={18} />
                      <span>Sin comprobante</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{p.displayName}</div>
                    <RSPill bg="#0a0a0a">{p.tier}</RSPill>
                  </div>
                  {p.username ? (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                        textTransform: "lowercase",
                      }}
                    >
                      @{p.username}
                    </div>
                  ) : null}
                  <div
                    className="font-heading tabular"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      color: "var(--primary)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {fmtMoney(p.amountCents, p.currency)}
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                        marginLeft: 8,
                        fontWeight: 600,
                        letterSpacing: 0,
                      }}
                    >
                      · {p.durationMonths} mes{p.durationMonths === 1 ? "" : "es"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    Solicitado: {fmtDate(p.createdAt)}
                    {p.proofSignedUrl ? (
                      <>
                        {" · "}
                        <a
                          href={p.proofSignedUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--primary)" }}
                        >
                          Ver comprobante
                        </a>
                      </>
                    ) : null}
                  </div>
                  {txMissing ? (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10,
                        color: "#dc2626",
                        fontWeight: 700,
                      }}
                    >
                      ⚠ Sin transacción asociada
                    </div>
                  ) : !hasProof ? (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10,
                        color: "#fbbf24",
                        fontWeight: 700,
                      }}
                    >
                      Comprobante aún no subido por el usuario
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    style={{ background: "#fff", border: RS_BORDER }}
                    onClick={() => onReject(p)}
                    disabled={isBusy}
                  >
                    <Icon name="x" size={12} />
                    Rechazar
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => onApprove(p)}
                    disabled={isBusy}
                  >
                    <Icon name="check" size={13} />
                    {isBusy ? "…" : "Aprobar plan"}
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

// ── Sección: pending club featuring subscriptions ───────────────────────
function PendingClubFeaturingSection({
  pending,
  busyId,
  onApprove,
  onReject,
}: {
  pending: PendingClubFeaturingRow[];
  busyId: string | null;
  onApprove: (p: PendingClubFeaturingRow) => void;
  onReject: (p: PendingClubFeaturingRow) => void;
}) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="label-mp">Featuring de clubes pendientes</div>
          <div
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Promociones de clubes por aprobar
          </div>
        </div>
        <RSPill bg={pending.length > 0 ? "#fbbf24" : "var(--muted-fg)"}>
          {pending.length} pendiente{pending.length === 1 ? "" : "s"}
        </RSPill>
      </div>

      {pending.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 12,
          }}
        >
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
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  padding: 12,
                  border: RS_BORDER,
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 10,
                    background: "var(--muted)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {hasProof ? (
                    isImageUrl(p.proofUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.proofSignedUrl as string}
                        alt="comprobante"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <a
                        href={p.proofSignedUrl as string}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          color: "var(--muted-fg)",
                          fontSize: 10,
                          textDecoration: "none",
                        }}
                      >
                        <Icon name="file-text" size={20} />
                        <span>Abrir PDF</span>
                      </a>
                    )
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--muted-fg)",
                        fontSize: 9.5,
                        textAlign: "center",
                        padding: 4,
                      }}
                    >
                      <Icon name="image-off" size={18} />
                      <span>Sin comprobante</span>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{p.clubName}</div>
                    <RSPill bg="#0a0a0a">FEATURING</RSPill>
                  </div>
                  {p.clubCity ? (
                    <div
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                      }}
                    >
                      {p.clubCity}
                    </div>
                  ) : null}
                  <div
                    className="font-heading tabular"
                    style={{
                      fontSize: 18,
                      fontWeight: 900,
                      color: "var(--primary)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {fmtMoney(p.amountCents, p.currency)}
                    <span
                      style={{
                        fontSize: 10.5,
                        color: "var(--muted-fg)",
                        marginLeft: 8,
                        fontWeight: 600,
                        letterSpacing: 0,
                      }}
                    >
                      · {p.durationDays} día{p.durationDays === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    Solicitado: {fmtDate(p.createdAt)}
                    {p.proofSignedUrl ? (
                      <>
                        {" · "}
                        <a
                          href={p.proofSignedUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--primary)" }}
                        >
                          Ver comprobante
                        </a>
                      </>
                    ) : null}
                  </div>
                  {txMissing ? (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10,
                        color: "#dc2626",
                        fontWeight: 700,
                      }}
                    >
                      ⚠ Sin transacción asociada
                    </div>
                  ) : !hasProof ? (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 10,
                        color: "#fbbf24",
                        fontWeight: 700,
                      }}
                    >
                      Comprobante aún no subido por el club
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    style={{ background: "#fff", border: RS_BORDER }}
                    onClick={() => onReject(p)}
                    disabled={isBusy}
                  >
                    <Icon name="x" size={12} />
                    Rechazar
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => onApprove(p)}
                    disabled={isBusy}
                  >
                    <Icon name="check" size={13} />
                    {isBusy ? "…" : "Aprobar featuring"}
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
