"use client";

// Cola de reembolsos pendientes del torneo (organizador: partner o club staff).
// Fuente: refund_requests (mig 20260712000000). Se auto-oculta si no hay
// requests. MATCHPOINT no usa PSP: marcar reembolsada solo registra el estado;
// la transferencia real la hace el organizador por banco o DeUna.
//
// Nota: este panel funciona también con el torneo cancelado/finalizado —
// justamente ahí es cuando hay que devolver dinero.

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  listTournamentRefundRequests,
  markTournamentTransactionRefunded,
  type TournamentRefundRequest,
} from "@/server/actions/tournament-refunds";

function fmtMoney(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  return `${currency ?? "USD"} ${(cents / 100).toFixed(2)}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}

export function TournamentRefundsPanel({ tournamentId }: { tournamentId: string }) {
  const [requests, setRequests] = useState<TournamentRefundRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openReq, setOpenReq] = useState<TournamentRefundRequest | null>(null);

  const reload = useCallback(async () => {
    const res = await listTournamentRefundRequests({ tournamentId });
    if (res.ok) setRequests(res.data.requests);
    setLoaded(true);
  }, [tournamentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const pending = requests.filter((r) => r.status === "pending");
  const done = requests.filter((r) => r.status === "done");

  if (!loaded || requests.length === 0) return null;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <Icon name="rotate-ccw" size={14} color={pending.length > 0 ? "#dc2626" : "var(--muted-fg)"} />
        <span
          style={{
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: pending.length > 0 ? "#dc2626" : "var(--muted-fg)",
          }}
        >
          Reembolsos pendientes{pending.length > 0 ? ` · ${pending.length}` : ""}
        </span>
      </div>
      <p style={{ margin: "4px 0 12px", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        La transferencia la haces tú por banco o DeUna; aquí solo registras que
        ya la hiciste. Cada reembolso muestra su fecha límite.
      </p>

      {pending.length === 0 && (
        <div style={{ fontSize: 12.5, color: "var(--muted-fg)", padding: "6px 0" }}>
          No hay reembolsos pendientes. ✓
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column" }}>
        {pending.map((r, i) => {
          const overdue = r.dueAt != null && new Date(r.dueAt).getTime() < Date.now();
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "10px 0",
                borderTop: i === 0 ? 0 : "1px solid var(--border)",
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.customerName ?? "Jugador"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.reason}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
                {fmtMoney(r.amountCents, r.currency)}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: overdue ? "#fff" : "#b45309",
                  background: overdue ? "#dc2626" : "#fef3c7",
                  padding: "3px 8px",
                  borderRadius: 100,
                  whiteSpace: "nowrap",
                }}
              >
                {overdue ? "Vencido" : `Límite ${fmtDate(r.dueAt)}`}
              </span>
              <button
                onClick={() => setOpenReq(r)}
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
            </div>
          );
        })}
      </div>

      {done.length > 0 && (
        <div style={{ marginTop: pending.length > 0 ? 10 : 0, fontSize: 11.5, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="check" size={12} color="#059669" />
          {done.length === 1 ? "1 reembolso completado" : `${done.length} reembolsos completados`}
        </div>
      )}

      {openReq && (
        <RefundRequestDialog
          tournamentId={tournamentId}
          request={openReq}
          onClose={() => setOpenReq(null)}
          onDone={reload}
        />
      )}
    </div>
  );
}

function RefundRequestDialog({
  tournamentId,
  request,
  onClose,
  onDone,
}: {
  tournamentId: string;
  request: TournamentRefundRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState(request.reason);
  const [reference, setReference] = useState("");

  const canSubmit = reason.trim().length >= 2 && !pending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await markTournamentTransactionRefunded({
        tournamentId,
        transactionId: request.transactionId,
        reason: reason.trim(),
        refundReference: reference.trim() || undefined,
        cancelRegistration: false,
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: "Reembolso registrado",
          sub: "El jugador recibió la confirmación.",
        });
        onClose();
        onDone();
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
          Marcar reembolso como hecho
        </h3>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          {fmtMoney(request.amountCents, request.currency)} · {request.customerName ?? "Jugador"}.
          Esta acción NO transfiere dinero automáticamente: primero haz la
          transferencia por banco o DeUna y luego anota la referencia aquí.
        </p>

        <label style={fieldLabel}>Motivo (obligatorio)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
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
            {pending ? "Registrando…" : "Confirmar reembolso"}
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
