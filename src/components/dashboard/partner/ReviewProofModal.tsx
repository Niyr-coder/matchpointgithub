"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getRegistrationProofForPartner, approveRegistrationProofByPartner, rejectRegistrationProofByPartner } from "@/server/actions/partner-tournament-registrations";
import type { RegistrationProofForPartner } from "@/server/actions/partner-tournament-registrations";

const ANIM_OUT_MS = 160;

const styleSheet = `
@keyframes aim-backdrop-in  { from { opacity: 0 } to { opacity: 1 } }
@keyframes aim-backdrop-out { from { opacity: 1 } to { opacity: 0 } }
@keyframes aim-panel-in     { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
@keyframes aim-panel-out    { from { opacity: 1; transform: translateY(0) }     to { opacity: 0; transform: translateY(16px) } }
@media (prefers-reduced-motion: reduce) {
  .aim-backdrop, .aim-panel { animation-duration: 1ms !important; }
}
`;

interface Props {
  transactionId: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Phase = "idle" | "rejecting";

export function ReviewProofModal({ transactionId, onClose, onSuccess }: Props) {
  const [visible, setVisible] = useState(true);
  const [proof, setProof] = useState<RegistrationProofForPartner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getRegistrationProofForPartner({ transactionId }).then((res) => {
      if (res.ok) setProof(res.data);
      else setLoadError(res.error?.message ?? "No se pudo cargar el comprobante");
    });
  }, [transactionId]);

  function close() {
    setVisible(false);
    setTimeout(onClose, ANIM_OUT_MS);
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === backdropRef.current) close();
  }

  function handleApprove() {
    setActionError(null);
    startTransition(async () => {
      const res = await approveRegistrationProofByPartner({ transactionId });
      if (res.ok) { onSuccess(); }
      else setActionError(res.error?.message ?? "Error al aprobar");
    });
  }

  function handleReject() {
    if (!rejectReason.trim()) return;
    setActionError(null);
    startTransition(async () => {
      const res = await rejectRegistrationProofByPartner({ transactionId, reason: rejectReason.trim() });
      if (res.ok) { onSuccess(); }
      else setActionError(res.error?.message ?? "Error al rechazar");
    });
  }

  const animDir = visible ? "in" : "out";
  const amountLabel = proof
    ? `${proof.currency ?? "USD"} ${(proof.amountCents / 100).toFixed(2)}`
    : null;

  return (
    <>
      <style>{styleSheet}</style>
      <div
        ref={backdropRef}
        className="aim-backdrop"
        onClick={handleBackdrop}
        style={{
          position: "fixed", inset: 0, zIndex: 9000,
          background: "rgba(0,0,0,0.45)",
          animation: `aim-backdrop-${animDir} ${animDir === "in" ? 180 : ANIM_OUT_MS}ms ease-out both`,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "16px",
        }}
      >
        <div
          className="aim-panel"
          style={{
            background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            animation: `aim-panel-${animDir} ${animDir === "in" ? 220 : ANIM_OUT_MS}ms ease-out both`,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Comprobante de pago</div>
              {amountLabel && (
                <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>
                  {proof!.customerName ? `${proof!.customerName} · ` : ""}{amountLabel}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={close}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--muted-fg)", padding: 4 }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {/* Contenido */}
          <div style={{ padding: "18px 20px" }}>
            {loadError ? (
              <div style={{ color: "#dc2626", fontSize: 13 }}>{loadError}</div>
            ) : !proof ? (
              <div style={{ color: "var(--muted-fg)", fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                Cargando comprobante…
              </div>
            ) : !proof.proofSignedUrl ? (
              <div style={{ color: "var(--muted-fg)", fontSize: 13 }}>Sin imagen de comprobante.</div>
            ) : (
              <a href={proof.proofSignedUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={proof.proofSignedUrl}
                  alt="Comprobante de pago"
                  style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", maxHeight: 320, objectFit: "contain" }}
                />
              </a>
            )}

            {proof?.proofSubmittedAt && (
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 10 }}>
                Enviado {new Date(proof.proofSubmittedAt).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })}
              </div>
            )}

            {/* Motivo de rechazo */}
            {phase === "rejecting" && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>
                  Motivo del rechazo
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="Ej: El comprobante no corresponde al monto indicado."
                  style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", padding: "8px 10px", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                  autoFocus
                />
              </div>
            )}

            {actionError && (
              <div style={{ color: "#dc2626", fontSize: 12, marginTop: 10 }}>{actionError}</div>
            )}
          </div>

          {/* Acciones */}
          {proof && (
            <div style={{ padding: "0 20px 18px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {phase === "idle" ? (
                <>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setPhase("rejecting")}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Rechazar
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleApprove}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: isPending ? 0.6 : 1 }}
                  >
                    {isPending ? "Aprobando…" : "Aprobar"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => { setPhase("idle"); setRejectReason(""); setActionError(null); }}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "#fff", color: "#0a0a0a", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isPending || rejectReason.trim().length < 2}
                    onClick={handleReject}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (isPending || rejectReason.trim().length < 2) ? 0.5 : 1 }}
                  >
                    {isPending ? "Rechazando…" : "Confirmar rechazo"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
