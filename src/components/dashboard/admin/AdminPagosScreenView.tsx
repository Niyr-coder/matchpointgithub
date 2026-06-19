// Client view de AdminPagosScreen — layout 1:1 (RoleScreens.jsx 210-261).
"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { InfoTip } from "@/components/dashboard/widgets/InfoTip";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { markPayoutPaid, processPendingPayouts } from "@/server/actions/payouts";
import { markTransactionRefundedAdmin } from "@/server/actions/admin-refunds";
import {
  approvePaymentProofAdmin,
  rejectPaymentProofAdmin,
} from "@/server/actions/payment-proofs";

export type TxKind = "payout" | "reserve" | "refund" | "event" | "shop";
export type TxStatus = "completed" | "pending" | "failed";
export type TxRow = {
  id: string;
  transactionId: string;
  who: string;
  kind: TxKind;
  amt: string;
  amountCents: number;
  currency: string | null;
  when: string;
  st: TxStatus;
  rawStatus: string;
  createdAt: string;
};
export type PendingProofView = {
  transactionId: string;
  amountCents: number;
  currency: string | null;
  customerName: string;
  kind: string;
  refLabel: string | null;
  proofSignedUrl: string | null;
  proofUrl: string | null;
  proofSubmittedAt: string | null;
};
export type PendingPayoutView = {
  id: string;
  label: string;
  amountCents: number;
  currency: string | null;
  status: string;
};

export type PagosData = {
  rows: TxRow[];
  payouts: PendingPayoutView[];
  kpis: {
    gmvTodayCents: number;
    payoutsToProcessCents: number;
    payoutsClubCount: number;
    commissionTodayCents: number;
    takeRatePct: number;
    refundsTodayCents: number;
    refundsCountToday: number;
  };
};

const KIND_ICON: Record<TxKind, string> = {
  payout: "arrow-up-right",
  reserve: "calendar-check",
  refund: "rotate-ccw",
  event: "trophy",
  shop: "shopping-bag",
};

const ST_STYLES: Record<TxStatus, { c: string; l: string }> = {
  completed: { c: "var(--primary)", l: "Listo" },
  pending: { c: "#fbbf24", l: "Pendiente" },
  failed: { c: "#dc2626", l: "Fallido" },
};

function fmtUSD(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

const PLACEHOLDER_COUNT = 4;
const TX_PLACEHOLDER_COLS = "120px 1fr 110px 120px 100px 50px";

type TxPeriod = "today" | "week" | "month" | "all";

const PERIOD_LABEL: Record<TxPeriod, string> = {
  today: "Hoy",
  week: "7 días",
  month: "30 días",
  all: "Todas",
};

function rowInPeriod(createdAt: string, period: TxPeriod): boolean {
  if (period === "all") return true;
  const at = new Date(createdAt);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "today") return at >= todayStart;
  const cutoff = new Date(todayStart);
  cutoff.setDate(cutoff.getDate() - (period === "week" ? 7 : 30));
  return at >= cutoff;
}

function TxPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: TX_PLACEHOLDER_COLS,
        alignItems: "center",
        padding: "14px 16px",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "var(--muted-fg)" }}>
        TX-—
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "var(--muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted-fg)",
          }}
        >
          <Icon name="circle" size={12} />
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted-fg)" }}>Sin transacciones</div>
          <div
            style={{
              fontSize: 9.5,
              color: "var(--muted-fg)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            —
          </div>
        </div>
      </div>
      <span
        className="font-heading"
        style={{ fontSize: 13, fontWeight: 900, color: "var(--muted-fg)", textAlign: "right" }}
      >
        $—
      </span>
      <span style={{ color: "var(--muted-fg)" }}>—</span>
      <RSPill bg="var(--muted-fg)">—</RSPill>
      <span />
    </div>
  );
}

export function AdminPagosScreenView({
  data,
  pendingProofs = [],
}: {
  data: PagosData;
  pendingProofs?: PendingProofView[];
}) {
  useRealtimeRefresh(
    [{ table: "transactions" }, { table: "refunds" }, { table: "payouts" }],
    { debounceMs: 5000 },
  );
  const toast = useToast();
  const { confirm, ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [busyProofId, setBusyProofId] = useState<string | null>(null);
  const [busyPayoutId, setBusyPayoutId] = useState<string | null>(null);
  const [busyRefundId, setBusyRefundId] = useState<string | null>(null);
  const [period, setPeriod] = useState<TxPeriod>("today");
  const [periodOpen, setPeriodOpen] = useState(false);
  const periodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!periodOpen) return;
    const onDown = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [periodOpen]);

  const filteredRows = useMemo(
    () => data.rows.filter((t) => rowInPeriod(t.createdAt, period)),
    [data.rows, period],
  );

  const handleApproveProof = async (p: PendingProofView) => {
    const ok = await confirm({
      title: "Aprobar comprobante",
      body: `¿Marcar el pago de ${p.customerName} ($${(p.amountCents / 100).toFixed(2)}) como cobrado?`,
      confirmLabel: "Aprobar",
    });
    if (!ok) return;
    setBusyProofId(p.transactionId);
    const res = await approvePaymentProofAdmin({ transactionId: p.transactionId });
    setBusyProofId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Comprobante aprobado", sub: p.customerName });
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleRejectProof = async (p: PendingProofView) => {
    const reason = await ask({
      title: "Rechazar comprobante",
      label: "Motivo del rechazo",
      placeholder: "Ej: el monto no coincide, comprobante ilegible…",
      required: true,
      multiline: true,
      confirmLabel: "Rechazar",
      destructive: true,
      validate: (v) => (v.trim().length < 2 ? "Escribe un motivo" : null),
    });
    if (reason == null) return;
    setBusyProofId(p.transactionId);
    const res = await rejectPaymentProofAdmin({
      transactionId: p.transactionId,
      reason: reason.trim(),
    });
    setBusyProofId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Comprobante rechazado", sub: "El usuario podrá re-subir" });
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleProcessPayouts = async () => {
    const ok = await confirm({
      title: "Preparar payouts",
      body: "¿Generar filas de payout para los clubes con transacciones del mes en curso? Esto NO transfiere dinero automáticamente; solo deja el seguimiento listo para marcar la transferencia manual.",
      confirmLabel: "Preparar",
    });
    if (!ok) return;
    startTransition(async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const end = now.toISOString().slice(0, 10);
      const res = await processPendingPayouts({ periodStart: start, periodEnd: end });
      if (res.ok)
        toast({
          icon: "check",
          title: `Payouts preparados: ${res.data.created}`,
          sub: `Neto: $${Math.round(res.data.totalNetCents / 100).toLocaleString("en-US")}`,
        });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleMarkPayoutPaid = async (p: PendingPayoutView) => {
    const providerPayoutId = await ask({
      title: "Marcar payout pagado",
      label: "Referencia de transferencia",
      placeholder: "Ej: transferencia Banco Pichincha #12345",
      required: false,
      confirmLabel: "Marcar pagado",
    });
    if (providerPayoutId == null) return;
    setBusyPayoutId(p.id);
    const res = await markPayoutPaid({
      id: p.id,
      providerPayoutId: providerPayoutId.trim() || undefined,
    });
    setBusyPayoutId(null);
    if (res.ok) {
      toast({ icon: "check", title: "Payout marcado como pagado", sub: p.label });
    } else {
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    }
  };

  const handleMarkRefunded = async (t: TxRow) => {
    const ok = await confirm({
      title: "Marcar reembolsada",
      body: `Registrar un reembolso manual para ${t.who} por ${fmtMoney(t.amountCents, t.currency)}. Esto NO transfiere dinero automáticamente ni cancela inscripciones ligadas; para eso usa el detalle del evento o torneo.`,
      confirmLabel: "Continuar",
      destructive: true,
    });
    if (!ok) return;
    const reason = await ask({
      title: "Motivo del reembolso",
      label: "Motivo",
      placeholder: "Ej: devolución aprobada por soporte.",
      multiline: true,
      required: true,
      confirmLabel: "Continuar",
      validate: (v) => (v.trim().length < 2 ? "Escribe un motivo." : null),
    });
    if (reason == null) return;
    const reference = await ask({
      title: "Referencia de devolución",
      label: "Referencia bancaria o DeUna",
      placeholder: "Opcional",
      required: false,
      confirmLabel: "Registrar reembolso",
    });
    if (reference == null) return;
    setBusyRefundId(t.transactionId);
    const res = await markTransactionRefundedAdmin({
      transactionId: t.transactionId,
      reason: reason.trim(),
      refundReference: reference.trim() || undefined,
      cancelRegistration: false,
    });
    setBusyRefundId(null);
    if (res.ok) {
      toast({
        icon: "rotate-ccw",
        title: "Reembolso registrado",
        sub: "Recuerda completar la devolución fuera de la app.",
      });
    } else {
      toast({ icon: "alert-triangle", title: "No se pudo reembolsar", sub: res.error.message });
    }
  };

  const hasRows = filteredRows.length > 0;

  const KPIS: [string, string, string, string, string][] = [
    ["GMV · hoy", fmtUSD(data.kpis.gmvTodayCents), "var(--primary)", "captured", "Volumen bruto capturado hoy (inscripciones, shop, eventos). Solo transacciones en estado captured."],
    [
      "Payouts a procesar",
      fmtUSD(data.kpis.payoutsToProcessCents),
      "#fbbf24",
      data.kpis.payoutsClubCount > 0 ? `${data.kpis.payoutsClubCount} clubes` : "sin payouts modelados",
      "Dinero pendiente de transferir a clubes según el modelo de payouts. Marca como pagado cuando ejecutes la transferencia real.",
    ],
    ["Comisión MP", fmtUSD(data.kpis.commissionTodayCents), "#0a0a0a", fmtPct(data.kpis.takeRatePct), "Comisión de MATCHPOINT sobre GMV captured hoy. El take rate efectivo viene de platform_config."],
    [
      "Reembolsos",
      fmtUSD(data.kpis.refundsTodayCents),
      "#dc2626",
      `${data.kpis.refundsCountToday} caso${data.kpis.refundsCountToday === 1 ? "" : "s"}`,
      "Reembolsos registrados hoy. Cada caso debe tener trazabilidad en audit_log y transacción vinculada.",
    ],
  ];

  const cols: RSColumn<TxRow>[] = [
    {
      k: "id",
      l: "ID",
      render: (t) => (
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10.5,
            color: "var(--muted-fg)",
          }}
        >
          {t.id}
        </span>
      ),
    },
    {
      k: "who",
      l: "Cliente / club",
      render: (t) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background:
                t.kind === "payout"
                  ? "#ecfdf5"
                  : t.kind === "refund"
                  ? "#fee2e2"
                  : "var(--muted)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color:
                t.kind === "payout"
                  ? "var(--primary)"
                  : t.kind === "refund"
                  ? "#dc2626"
                  : "#0a0a0a",
            }}
          >
            <Icon name={KIND_ICON[t.kind]} size={12} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800 }}>{t.who}</div>
            <div
              style={{
                fontSize: 9.5,
                color: "var(--muted-fg)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              {t.kind}
            </div>
          </div>
        </div>
      ),
    },
    {
      k: "amt",
      l: "Monto",
      align: "right",
      render: (t) => (
        <span
          className="font-heading"
          style={{
            fontSize: 13,
            fontWeight: 900,
            color: t.amt.startsWith("-") ? "#dc2626" : "var(--primary)",
          }}
        >
          {t.amt}
        </span>
      ),
    },
    {
      k: "when",
      l: "Cuándo",
      render: (t) => <span style={{ color: "var(--muted-fg)" }}>{t.when}</span>,
    },
    {
      k: "st",
      l: "Estado",
      render: (t) => <RSPill bg={ST_STYLES[t.st].c}>{ST_STYLES[t.st].l}</RSPill>,
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (t) =>
        t.rawStatus === "captured" ? (
          <button
            className="btn"
            onClick={() => handleMarkRefunded(t)}
            disabled={busyRefundId === t.transactionId}
            style={{
              background: "#fff",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              padding: "6px 10px",
              fontSize: 10.5,
              whiteSpace: "nowrap",
            }}
          >
            <Icon name="rotate-ccw" size={11} color="#b91c1c" />
            {busyRefundId === t.transactionId ? "Marcando…" : "Reembolsar"}
          </button>
        ) : (
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--muted)",
              border: 0,
              cursor: "not-allowed",
              opacity: 0.55,
            }}
            title="Solo las transacciones capturadas se pueden marcar como reembolsadas"
            disabled
          >
            <Icon name="external-link" size={12} />
          </button>
        ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Pagos & Payouts"
        title={
          <>
            Transacciones <span className="dot">●</span> {PERIOD_LABEL[period].toLowerCase()}
            <InfoTip maxWidth={260} text="Cola operativa de comprobantes, payouts y transacciones captured. Aprobar comprobantes activa suscripciones o inscripciones según el tipo." />
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <div ref={periodRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="btn"
                style={{ background: "#fff", border: RS_BORDER }}
                onClick={() => setPeriodOpen((v) => !v)}
                aria-expanded={periodOpen}
                aria-haspopup="listbox"
              >
                <Icon name="filter" size={12} />
                {PERIOD_LABEL[period]}
              </button>
              {periodOpen && (
                <div
                  role="listbox"
                  className="card"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    minWidth: 140,
                    padding: 6,
                    zIndex: 20,
                    boxShadow: "0 12px 28px rgba(0,0,0,0.1)",
                  }}
                >
                  {(Object.keys(PERIOD_LABEL) as TxPeriod[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={period === key}
                      onClick={() => {
                        setPeriod(key);
                        setPeriodOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "9px 12px",
                        border: 0,
                        borderRadius: 8,
                        background: period === key ? "var(--muted)" : "transparent",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 12,
                        fontWeight: period === key ? 800 : 600,
                        textAlign: "left",
                      }}
                    >
                      {PERIOD_LABEL[key]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-primary" onClick={handleProcessPayouts} disabled={isPending}>
              <Icon name="play" size={13} />
              {isPending ? "Preparando…" : "Preparar payouts"}
            </button>
          </div>
        }
      />
      <PendingProofsSection
        proofs={pendingProofs}
        busyId={busyProofId}
        onApprove={handleApproveProof}
        onReject={handleRejectProof}
      />
      <PendingPayoutsSection
        payouts={data.payouts}
        busyId={busyPayoutId}
        onMarkPaid={handleMarkPayoutPaid}
      />
      <div className="mp-partner-torneo-kpis">
        {KPIS.map(([l, v, c, sub, tip]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {l}
              <InfoTip text={tip} maxWidth={220} />
            </div>
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
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>
      {hasRows ? (
        <RSTable cols={cols} rows={filteredRows} rowKey={(t) => t.id} />
      ) : data.rows.length > 0 ? (
        <div
          className="card"
          style={{ padding: "20px 18px", fontSize: 13, color: "var(--muted-fg)", fontWeight: 600 }}
        >
          No hay transacciones en {PERIOD_LABEL[period].toLowerCase()}. Prueba otro periodo en el filtro.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => (
            <TxPlaceholderRow key={k} />
          ))}
        </div>
      )}
    </>
  );
}

// ── Sección: comprobantes pendientes de revisión ────────────────────────
function isImageUrl(url: string | null): boolean {
  if (!url) return false;
  const lower = url.split("?")[0].toLowerCase();
  return /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(lower);
}

function fmtMoney(cents: number, currency: string | null): string {
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function fmtSubmittedAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PendingProofsSection({
  proofs,
  busyId,
  onApprove,
  onReject,
}: {
  proofs: PendingProofView[];
  busyId: string | null;
  onApprove: (p: PendingProofView) => void;
  onReject: (p: PendingProofView) => void;
}) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="label-mp">Comprobantes pendientes</div>
          <div
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Transferencia / DeUna por revisar
          </div>
        </div>
        <RSPill bg={proofs.length > 0 ? "#fbbf24" : "var(--muted-fg)"}>
          {proofs.length} pendiente{proofs.length === 1 ? "" : "s"}
        </RSPill>
      </div>

      {proofs.length === 0 ? (
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
          Sin comprobantes esperando revisión.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {proofs.map((p) => {
            const isBusy = busyId === p.transactionId;
            return (
              <div
                key={p.transactionId}
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
                  {p.proofSignedUrl ? (
                    isImageUrl(p.proofUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.proofSignedUrl}
                        alt="comprobante"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <a
                        href={p.proofSignedUrl}
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
                    <Icon name="image" size={20} />
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>{p.customerName}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                    {p.kind === "event"
                      ? "Evento"
                      : p.kind === "tournament"
                        ? "Torneo"
                        : p.kind === "reservation"
                          ? "Reserva"
                          : p.kind}
                    {p.refLabel ? ` · ${p.refLabel}` : ""}
                  </div>
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
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    Subido: {fmtSubmittedAt(p.proofSubmittedAt)}
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
                    {isBusy ? "…" : "Aprobar"}
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

function PendingPayoutsSection({
  payouts,
  busyId,
  onMarkPaid,
}: {
  payouts: PendingPayoutView[];
  busyId: string | null;
  onMarkPaid: (p: PendingPayoutView) => void;
}) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div className="label-mp">Payouts pendientes</div>
          <div
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", marginTop: 4 }}
          >
            Transferencias manuales a clubes / partners
          </div>
        </div>
        <RSPill bg={payouts.length > 0 ? "#fbbf24" : "var(--muted-fg)"}>
          {payouts.length} pendiente{payouts.length === 1 ? "" : "s"}
        </RSPill>
      </div>

      {payouts.length === 0 ? (
        <div
          style={{
            padding: "18px 16px",
            border: "1px dashed var(--border)",
            borderRadius: 12,
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 12,
          }}
        >
          Sin payouts pendientes de marcar como pagados.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {payouts.map((p) => {
            const busy = busyId === p.id;
            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  border: RS_BORDER,
                  borderRadius: 12,
                  background: "#fff",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 850 }}>{p.label}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                    {p.status} · {p.id.slice(0, 8)}
                  </div>
                </div>
                <div
                  className="font-heading tabular"
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "var(--primary)",
                    letterSpacing: "-0.02em",
                  }}
                >
                  {fmtMoney(p.amountCents, p.currency)}
                </div>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => onMarkPaid(p)}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {busy ? "Guardando…" : "Marcar pagado"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
