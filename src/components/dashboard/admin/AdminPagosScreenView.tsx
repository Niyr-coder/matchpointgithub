// Client view de AdminPagosScreen — layout 1:1 (RoleScreens.jsx 210-261).
"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { processPendingPayouts } from "@/server/actions/payouts";
import {
  approvePaymentProofAdmin,
  rejectPaymentProofAdmin,
} from "@/server/actions/payment-proofs";

export type TxKind = "payout" | "reserve" | "refund" | "event" | "shop";
export type TxStatus = "completed" | "pending" | "failed";
export type TxRow = {
  id: string;
  who: string;
  kind: TxKind;
  amt: string;
  when: string;
  st: TxStatus;
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

export type PagosData = {
  rows: TxRow[];
  kpis: {
    gmvTodayCents: number;
    payoutsToProcessCents: number;
    payoutsClubCount: number;
    commissionTodayCents: number;
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

const PLACEHOLDER_COUNT = 4;

function TxPlaceholderRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr 110px 120px 100px 50px",
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
      title: "Procesar payouts",
      body: "¿Procesar payouts pendientes para todos los clubes con transacciones del mes en curso?",
      confirmLabel: "Procesar",
    });
    if (!ok) return;
    startTransition(async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const end = now.toISOString();
      const res = await processPendingPayouts({ periodStart: start, periodEnd: end });
      if (res.ok)
        toast({
          icon: "check",
          title: `Payouts procesados: ${res.data.created}`,
          sub: `Neto: $${Math.round(res.data.totalNetCents / 100).toLocaleString("en-US")}`,
        });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const hasRows = data.rows.length > 0;

  const KPIS: [string, string, string, string][] = [
    ["GMV · hoy", fmtUSD(data.kpis.gmvTodayCents), "var(--primary)", "captured"],
    [
      "Payouts a procesar",
      fmtUSD(data.kpis.payoutsToProcessCents),
      "#fbbf24",
      data.kpis.payoutsClubCount > 0 ? `${data.kpis.payoutsClubCount} clubes` : "sin payouts modelados",
    ],
    ["Comisión MP", fmtUSD(data.kpis.commissionTodayCents), "#0a0a0a", "10%"],
    [
      "Reembolsos",
      fmtUSD(data.kpis.refundsTodayCents),
      "#dc2626",
      `${data.kpis.refundsCountToday} caso${data.kpis.refundsCountToday === 1 ? "" : "s"}`,
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
      render: () => (
        <button
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--muted)",
            border: 0,
            cursor: "pointer",
          }}
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
            Transacciones <span className="dot">●</span> hoy
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" style={{ background: "#fff", border: RS_BORDER }}>
              <Icon name="filter" size={12} />
              Hoy
            </button>
            <button className="btn btn-primary" onClick={handleProcessPayouts} disabled={isPending}>
              <Icon name="play" size={13} />
              {isPending ? "Procesando…" : "Procesar payouts"}
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
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>
      {hasRows ? (
        <RSTable cols={cols} rows={data.rows} rowKey={(t) => t.id} />
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
