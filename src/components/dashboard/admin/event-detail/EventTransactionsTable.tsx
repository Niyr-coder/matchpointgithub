"use client";

// Tabla de transactions del detalle admin de evento.
// Refunds manuales (Agente C): cada fila con status 'captured' muestra un
// botón "Marcar reembolsada" que abre un modal con motivo (obligatorio),
// referencia de transferencia (opcional) y checkbox para cancelar también
// la inscripción ligada (default true).
//
// MATCHPOINT NO usa PSP: el reembolso real lo hace un humano fuera de la
// app por transferencia bancaria o DeUna. Esta acción solo marca el estado.

import { useState, useTransition } from "react";
import { txStatusMeta } from "@/lib/ui/transaction-status";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { AdminEventDetail } from "@/server/actions/events";
import { markTransactionRefundedAdmin } from "@/server/actions/admin-refunds";
import { useToast } from "../../ToastProvider";
import { SectionTitle, fmtDate, fmtMoney } from "./primitives";

const EVENT_TXN_COLS = "1fr 100px 80px 110px 140px 150px";

type Tx = AdminEventDetail["transactions"][number];

export function EventTransactionsTable({
  transactions,
}: {
  transactions: AdminEventDetail["transactions"];
}) {
  const [openTx, setOpenTx] = useState<Tx | null>(null);

  if (transactions.length === 0) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <SectionTitle>Transacciones</SectionTitle>
      <div className="card mp-table-scroll" style={{ padding: 0, overflow: "hidden" }}>
        <div className="mp-admin-event-txn-scroll">
        {transactions.map((t, i) => (
          <div
            key={t.id}
            className="mp-admin-event-txn-row"
            style={{
              display: "grid",
              gridTemplateColumns: EVENT_TXN_COLS,
              gap: 10,
              padding: "12px 16px",
              alignItems: "center",
              borderTop: i === 0 ? 0 : "1px solid var(--border)",
              fontSize: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 800 }}>{t.customerName ?? "—"}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{fmtDate(t.createdAt)}</div>
            </div>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 10.5, fontWeight: 800 }}>{t.method}</span>
            {(() => {
              const m = txStatusMeta(t.status);
              return (
                <span
                  title={m.tooltip}
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    color: m.color,
                    background: m.background,
                    padding: "3px 8px",
                    borderRadius: 6,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                    justifySelf: "start",
                  }}
                >
                  {m.label}
                </span>
              );
            })()}
            <span style={{ fontWeight: 900, textAlign: "right" }}>{fmtMoney(t.amountCents, t.currency)}</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted-fg)", textAlign: "right" }}>
              {t.id.slice(0, 8)}
            </span>
            <div style={{ textAlign: "right" }}>
              {t.status === "captured" ? (
                <button
                  onClick={() => setOpenTx(t)}
                  className="btn"
                  style={{
                    background: "#fff",
                    border: "1.5px solid #fca5a5",
                    color: "#b91c1c",
                    padding: "6px 10px",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  <Icon name="rotate-ccw" size={11} color="#b91c1c" />
                  Marcar reembolsada
                </button>
              ) : null}
            </div>
          </div>
        ))}
        </div>
      </div>

      {openTx && (
        <RefundDialog
          tx={openTx}
          showCancelRegistration
          onClose={() => setOpenTx(null)}
        />
      )}
    </div>
  );
}

function RefundDialog({
  tx,
  showCancelRegistration,
  onClose,
}: {
  tx: Tx;
  showCancelRegistration: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [cancelReg, setCancelReg] = useState(true);

  const canSubmit = reason.trim().length >= 2 && !pending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await markTransactionRefundedAdmin({
        transactionId: tx.id,
        reason: reason.trim(),
        refundReference: reference.trim() || undefined,
        cancelRegistration: cancelReg,
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: "Transacción marcada como reembolsada",
          sub: res.data.cancelledRegistration
            ? "Inscripción cancelada también."
            : "Recuerda hacer la transferencia manual al cliente.",
        });
        onClose();
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 460 }}
      >
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Marcar transacción como reembolsada
        </h3>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          {fmtMoney(tx.amountCents, tx.currency)} · {tx.customerName ?? "—"}.
          Esta acción NO transfiere dinero automáticamente. La transferencia real
          la haces tú por banco o DeUna y luego anotas la referencia aquí.
        </p>

        <label style={fieldLabel}>Motivo (obligatorio)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Ej: el evento se canceló por lluvia."
          style={fieldInput}
        />

        <label style={fieldLabel}>Referencia de transferencia (opcional)</label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          maxLength={120}
          placeholder="Ej: TRF-DEUNA-9281 o # de comprobante."
          style={{ ...fieldInput, fontFamily: "monospace" }}
        />

        {showCancelRegistration && (
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 14,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={cancelReg}
              onChange={(e) => setCancelReg(e.target.checked)}
            />
            Cancelar también la inscripción ligada
          </label>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={pending}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Volver
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className="btn"
            style={{ background: "#dc2626", color: "#fff", opacity: canSubmit ? 1 : 0.6 }}
          >
            <Icon name="rotate-ccw" size={13} color="#fff" />
            {pending ? "Marcando…" : "Confirmar reembolso"}
          </button>
        </div>
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginTop: 14,
  marginBottom: 6,
};

const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13,
  resize: "vertical",
};
