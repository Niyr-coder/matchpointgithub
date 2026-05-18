// Mapeo único de transactions.status → label + color + tooltip.
// Cubre TODOS los valores del enum mp_payment_status (002_enums.sql) más los
// agregados después (pending_proof, proof_submitted). Si aparece un status
// fuera del set, el fallback evita renderizar "undefined".
export type TxStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "disputed"
  | "pending_proof"
  | "proof_submitted";

export type TxStatusMeta = {
  label: string;
  color: string;
  background: string;
  tooltip: string;
};

const META: Record<TxStatus, TxStatusMeta> = {
  pending: {
    label: "Pendiente",
    color: "#92400e",
    background: "rgba(251, 191, 36, 0.18)",
    tooltip: "Esperando confirmación o cobro en mostrador.",
  },
  authorized: {
    label: "Autorizada",
    color: "#0c4a6e",
    background: "rgba(14, 165, 233, 0.15)",
    tooltip: "Pre-aprobada; aún no capturada.",
  },
  captured: {
    label: "Pagada",
    color: "#065f46",
    background: "rgba(16, 185, 129, 0.18)",
    tooltip: "Pago confirmado y registrado.",
  },
  refunded: {
    label: "Reembolsada",
    color: "#b91c1c",
    background: "rgba(220, 38, 38, 0.15)",
    tooltip: "El dinero fue devuelto al cliente.",
  },
  failed: {
    label: "Falló",
    color: "#b91c1c",
    background: "rgba(220, 38, 38, 0.18)",
    tooltip: "La transacción falló durante el procesamiento.",
  },
  disputed: {
    label: "En disputa",
    color: "#9a3412",
    background: "rgba(249, 115, 22, 0.18)",
    tooltip: "El cliente disputó el cobro (chargeback).",
  },
  pending_proof: {
    label: "Esperando comprobante",
    color: "#7c3aed",
    background: "rgba(124, 58, 237, 0.14)",
    tooltip: "Esperando que el cliente suba el comprobante de transferencia.",
  },
  proof_submitted: {
    label: "En revisión",
    color: "#7c3aed",
    background: "rgba(124, 58, 237, 0.18)",
    tooltip: "Comprobante recibido, esperando aprobación del admin.",
  },
};

const FALLBACK: TxStatusMeta = {
  label: "—",
  color: "#737373",
  background: "rgba(115, 115, 115, 0.12)",
  tooltip: "Estado desconocido.",
};

export function txStatusMeta(status: string | null | undefined): TxStatusMeta {
  if (!status) return FALLBACK;
  return META[status as TxStatus] ?? { ...FALLBACK, label: status.toUpperCase() };
}
