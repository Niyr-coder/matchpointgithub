// Página del usuario para subir el comprobante de pago (transferencia/DeUna)
// de una transacción específica. La transacción ya existe en `transactions`
// y debería arrancar en estado `pending_proof` (ver TODO en docs/flujo de
// creación de transactions). La página resuelve los siguientes estados:
//
//   pending_proof     → mostrar uploader + instrucciones bancarias
//   proof_submitted   → mostrar "En revisión" + preview del comprobante
//   captured          → mostrar "Pago aprobado"
//   failed / otros    → mostrar estado terminal
//
// El motivo de rechazo previo (si lo hay) se muestra arriba del uploader.

import { notFound, redirect } from "next/navigation";
import { getPaymentProofForUser } from "@/server/actions/payment-proofs";
import { getSession } from "@/lib/auth/session";
import { PaymentProofView } from "@/components/pagos/PaymentProofView";

export const dynamic = "force-dynamic";

export default async function PaymentProofPage({
  params,
}: {
  params: Promise<{ transactionId: string }>;
}) {
  const { transactionId } = await params;
  const session = await getSession();
  if (!session.authenticated) {
    redirect(`/login?next=/pagos/${transactionId}`);
  }
  const res = await getPaymentProofForUser({ transactionId });
  if (!res.ok) notFound();
  return <PaymentProofView initial={res.data} />;
}
