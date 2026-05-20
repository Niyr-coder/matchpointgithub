"use client";

// Vista del usuario para subir/ver el comprobante de pago de una transacción.
// Estados que renderiza, en base a `status` de la transacción:
//
//   pending_proof    → uploader (image/pdf) + datos bancarios; opcional motivo
//                      de rechazo previo arriba si proof_rejection_reason != null
//   proof_submitted  → "En revisión" + preview/link al comprobante subido
//   captured         → "Pago aprobado"
//   refunded         → "Reembolsado"
//   failed/disputed  → estado terminal con mensaje
//
// El upload se hace contra el bucket `payment_proofs` desde el navegador.
// Convención de path: `{userId}/{transactionId}/proof-{timestamp}.{ext}`.
// El primer segmento del path debe ser el userId del usuario autenticado
// (RLS en storage.objects lo verifica).

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getBrowserClient } from "@/lib/db/client.browser";
import { submitPaymentProof, type UserPaymentProofView } from "@/server/actions/payment-proofs";
import { STORAGE_BUCKETS, UPLOAD_LIMITS } from "@/lib/storage/buckets";

const BUCKET = STORAGE_BUCKETS.PAYMENT_PROOFS;
const MAX_BYTES = UPLOAD_LIMITS[BUCKET].maxBytes;
const ALLOWED_PREFIXES = UPLOAD_LIMITS[BUCKET].mimePrefix;

function fmtMoney(cents: number, currency: string | null): string {
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "event":
      return "Evento";
    case "tournament":
      return "Torneo";
    case "reservation":
      return "Reserva";
    case "class":
      return "Clase";
    case "proshop_sale":
      return "Tienda";
    default:
      return "Pago";
  }
}

function isImagePath(path: string | null): boolean {
  if (!path) return false;
  return /\.(png|jpe?g|webp|gif|heic|avif)$/i.test(path.split("?")[0]);
}

export function PaymentProofView({ initial }: { initial: UserPaymentProofView }) {
  const [tx, setTx] = useState<UserPaymentProofView>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);

    if (!ALLOWED_PREFIXES.some((p) => file.type.startsWith(p))) {
      setError("Formato no permitido. Sube una imagen (JPG/PNG/WEBP) o un PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Archivo muy grande. Máximo ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }

    setBusy(true);
    try {
      const supabase = getBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesión expirada. Vuelve a iniciar sesión.");
        return;
      }
      const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
      const path = `${user.id}/${tx.transactionId}/proof-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) {
        setError(`No se pudo subir el archivo: ${upErr.message}`);
        return;
      }

      startTransition(async () => {
        const res = await submitPaymentProof({
          transactionId: tx.transactionId,
          proofUrl: path,
        });
        if (!res.ok) {
          setError(res.error.message);
          return;
        }
        // Refrescar la vista; obtenemos signed URL a través del path.
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, 60 * 10);
        setTx({
          ...tx,
          status: res.data.status,
          proofUrl: res.data.proofUrl,
          proofSignedUrl: signed?.signedUrl ?? null,
          proofSubmittedAt: res.data.proofSubmittedAt,
          proofRejectionReason: null,
        });
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fafafa",
        display: "flex",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--muted-fg)",
            textDecoration: "none",
          }}
        >
          <Icon name="arrow-left" size={12} />
          Volver
        </Link>

        <div className="card" style={{ padding: 20 }}>
          <div className="label-mp">Pago</div>
          <h1
            className="font-heading"
            style={{
              margin: "6px 0 0",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.03em",
            }}
          >
            {kindLabel(tx.kind)}
            {tx.refLabel ? <> · {tx.refLabel}</> : null}
          </h1>
          <div
            className="font-heading tabular"
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: "var(--primary)",
              marginTop: 12,
              letterSpacing: "-0.03em",
            }}
          >
            {fmtMoney(tx.amountCents, tx.currency)}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-fg)" }}>
            ID: <span style={{ fontFamily: "ui-monospace, monospace" }}>{tx.transactionId.slice(0, 8)}</span>
          </div>
        </div>

        <StatusBlock tx={tx} onChooseFile={() => inputRef.current?.click()} busy={busy} error={error} />

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function StatusBlock({
  tx,
  onChooseFile,
  busy,
  error,
}: {
  tx: UserPaymentProofView;
  onChooseFile: () => void;
  busy: boolean;
  error: string | null;
}) {
  if (tx.status === "captured") {
    return (
      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)" }}>
          <Icon name="check-circle" size={18} />
          <strong style={{ fontSize: 14 }}>Pago aprobado</strong>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: 0 }}>
          Tu pago fue verificado por el equipo de MATCHPOINT. No tienes que hacer nada más.
        </p>
        {tx.proofSignedUrl ? (
          <a
            href={tx.proofSignedUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: "var(--primary)", marginTop: 6 }}
          >
            Ver comprobante enviado
          </a>
        ) : null}
      </div>
    );
  }

  if (tx.status === "proof_submitted") {
    return (
      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#b45309" }}>
          <Icon name="clock" size={18} />
          <strong style={{ fontSize: 14 }}>Comprobante en revisión</strong>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: 0 }}>
          Recibimos tu comprobante. Te avisaremos en cuanto el equipo lo apruebe (suele tomar
          unas horas en horario hábil).
        </p>
        {tx.proofSignedUrl ? (
          isImagePath(tx.proofUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tx.proofSignedUrl}
              alt="comprobante"
              style={{
                width: "100%",
                maxHeight: 320,
                objectFit: "contain",
                borderRadius: 12,
                background: "#000",
              }}
            />
          ) : (
            <a
              href={tx.proofSignedUrl}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ alignSelf: "flex-start" }}
            >
              <Icon name="file-text" size={13} /> Ver PDF
            </a>
          )
        ) : null}
      </div>
    );
  }

  if (tx.status === "refunded") {
    return (
      <div className="card" style={{ padding: 20 }}>
        <strong style={{ fontSize: 14 }}>Pago reembolsado</strong>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "6px 0 0" }}>
          Esta transacción fue reembolsada. Si tienes dudas contacta soporte.
        </p>
      </div>
    );
  }

  if (tx.status === "failed" || tx.status === "disputed") {
    return (
      <div className="card" style={{ padding: 20 }}>
        <strong style={{ fontSize: 14, color: "#dc2626" }}>Pago no completado</strong>
        <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "6px 0 0" }}>
          Esta transacción está en estado {tx.status}. Contacta soporte para más información.
        </p>
      </div>
    );
  }

  // pending_proof (o cualquier otro intermedio: pending/authorized)
  return (
    <>
      {tx.proofRejectionReason ? (
        <div
          className="card"
          style={{
            padding: 16,
            borderColor: "#fecaca",
            background: "#fef2f2",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#dc2626" }}>
            <Icon name="alert-triangle" size={16} />
            <strong style={{ fontSize: 13 }}>Comprobante anterior rechazado</strong>
          </div>
          <p style={{ fontSize: 12.5, color: "#991b1b", margin: "6px 0 0" }}>
            {tx.proofRejectionReason}
          </p>
          <p style={{ fontSize: 11.5, color: "#991b1b", margin: "4px 0 0" }}>
            Por favor sube un comprobante nuevo.
          </p>
        </div>
      ) : null}

      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <strong style={{ fontSize: 14 }}>Cómo pagar</strong>
          <ol style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0", paddingLeft: 18 }}>
            <li>Haz la transferencia bancaria o paga con DeUna al número de cuenta del club.</li>
            <li>Toma captura del comprobante de la transferencia o el recibo de DeUna.</li>
            <li>Súbelo aquí abajo (imagen o PDF, máximo {(MAX_BYTES / 1024 / 1024).toFixed(0)} MB).</li>
            <li>El equipo verifica el pago y tu inscripción queda confirmada.</li>
          </ol>
        </div>

        <button
          className="btn btn-primary"
          onClick={onChooseFile}
          disabled={busy}
          style={{ alignSelf: "flex-start" }}
        >
          <Icon name="upload" size={13} />
          {busy ? "Subiendo…" : "Subir comprobante"}
        </button>

        {error ? (
          <div
            style={{
              fontSize: 12,
              color: "#dc2626",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            {error}
          </div>
        ) : null}
      </div>
    </>
  );
}
