"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SubstitutePlayerModal } from "./SubstitutePlayerModal";
import { AddInscritoManualModal } from "./AddInscritoManualModal";
import { ReviewProofModal } from "./ReviewProofModal";
import { setRegistrationCheckIn } from "@/server/actions/tournaments";
import { useToast } from "@/components/dashboard/ToastProvider";

type PayStatus = "paid" | "free" | "onsite_pending" | "awaiting_proof" | "review" | "other";

export type RegRowInteractive = {
  id: string;
  status: string;
  paymentMode: "online" | "onsite" | "free" | null;
  payStatus: PayStatus;
  createdAt: string;
  label: string;
  avatarUrl: string | null;
  playerIds: string[];
  players: Array<{ id: string; name: string }>;
  transactionId: string | null;
  checkedInAt: string | null;
};

interface Props {
  regs: RegRowInteractive[];
  tournamentId: string;
  playerOpsEnabled: boolean;
  isClosed: boolean;
  modality: string;
  categories: Array<{ id: string; name: string }>;
  entryFeeCents: number;
  paymentPolicy: string;
}

export function TorneoInscritosInteractivo({ regs, tournamentId, playerOpsEnabled, isClosed, modality, categories, entryFeeCents, paymentPolicy }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [subModalReg, setSubModalReg] = useState<RegRowInteractive | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [reviewTransactionId, setReviewTransactionId] = useState<string | null>(null);
  const [checkinBusyId, setCheckinBusyId] = useState<string | null>(null);
  // Optimistic: override local mientras el server refresca.
  const [checkinOverride, setCheckinOverride] = useState<Record<string, boolean>>({});

  const canSubstitute = playerOpsEnabled && !isClosed;

  const isCheckedIn = (r: RegRowInteractive) =>
    checkinOverride[r.id] ?? r.checkedInAt != null;

  const activos = regs.filter((r) => r.status === "pending" || r.status === "accepted");
  const presentes = activos.filter(isCheckedIn).length;

  const toggleCheckIn = async (r: RegRowInteractive) => {
    const next = !isCheckedIn(r);
    setCheckinBusyId(r.id);
    setCheckinOverride((prev) => ({ ...prev, [r.id]: next }));
    const res = await setRegistrationCheckIn({ registrationId: r.id, checkedIn: next });
    setCheckinBusyId(null);
    if (!res.ok) {
      setCheckinOverride((prev) => ({ ...prev, [r.id]: !next }));
      toast({ icon: "alert-triangle", title: "Error", sub: res.error.message, tone: "error" });
      return;
    }
    router.refresh();
  };

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {!isClosed && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: presentes === activos.length && activos.length > 0 ? "var(--primary)" : "var(--muted-fg)", letterSpacing: "0.04em" }}>
              Check-in: {presentes}/{activos.length} presentes
            </span>
            <button
              type="button"
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
              onClick={() => setShowAddModal(true)}
            >
              Añadir inscrito
            </button>
          </div>
        )}
        {regs.length === 0 ? (
          <div className="mp-partner-torneo-inscritos-empty">
            Cuando alguien se inscriba aparecerá aquí.
          </div>
        ) : (
        <>
        <div className="mp-partner-torneo-regs-head">
          <div>Jugador</div>
          <div style={{ textAlign: "center" }}>Estado</div>
          <div style={{ textAlign: "center" }}>Modo</div>
          <div style={{ textAlign: "center" }}>Pago</div>
          <div style={{ textAlign: "right" }}>Inscrito</div>
        </div>
        {regs.slice(0, 20).map((r) => {
          const name = r.label;
          const dt = new Date(r.createdAt);
          const paymentModeLabel =
            r.paymentMode === "online"
              ? "Online"
              : r.paymentMode === "onsite"
                ? "En club"
                : r.paymentMode === "free"
                  ? "Gratis"
                  : "—";
          const hidePaymentMode =
            r.paymentMode === "free" &&
            (r.payStatus === "free" || r.payStatus === "paid");

          return (
            <div key={r.id} className="mp-partner-torneo-regs-row" style={{ position: "relative" }}>
              <div className="mp-partner-torneo-regs-player">
                <div
                  className="mp-partner-torneo-regs-avatar"
                  style={{
                    background: r.avatarUrl
                      ? `url(${r.avatarUrl}) center/cover`
                      : "linear-gradient(135deg,#10b981,#047857)",
                  }}
                >
                  {!r.avatarUrl && name.slice(0, 2).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <b className="mp-partner-torneo-regs-name">
                    {isCheckedIn(r) && (
                      <span title="Presente" style={{ color: "var(--primary)", marginRight: 4 }}>●</span>
                    )}
                    {name}
                  </b>
                  {!isClosed && (r.status === "pending" || r.status === "accepted") && (
                    <button
                      type="button"
                      onClick={() => void toggleCheckIn(r)}
                      disabled={checkinBusyId === r.id}
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: isCheckedIn(r) ? "var(--muted-fg)" : "var(--primary)",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "underline",
                        lineHeight: 1.4,
                        opacity: checkinBusyId === r.id ? 0.5 : 1,
                      }}
                    >
                      {isCheckedIn(r) ? "Quitar check-in" : "Marcar presente"}
                    </button>
                  )}
                  {canSubstitute && r.status === "accepted" && (
                    <button
                      type="button"
                      onClick={() => setSubModalReg(r)}
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: "var(--primary)",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "underline",
                        lineHeight: 1.4,
                      }}
                    >
                      Sustituir
                    </button>
                  )}
                  {r.payStatus === "review" && r.transactionId && (
                    <button
                      type="button"
                      onClick={() => setReviewTransactionId(r.transactionId!)}
                      style={{
                        display: "block",
                        fontSize: 10,
                        color: "#b45309",
                        background: "none",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        textDecoration: "underline",
                        lineHeight: 1.4,
                      }}
                    >
                      Ver comprobante
                    </button>
                  )}
                </div>
              </div>
              <div className="mp-partner-torneo-regs-badges">
                <div className="mp-partner-torneo-regs-status">
                  <RegStatus value={r.status} />
                </div>
                {!hidePaymentMode && (
                  <div className="mp-partner-torneo-regs-mode">
                    <span className="mp-partner-torneo-regs-mode-label">
                      {paymentModeLabel}
                    </span>
                  </div>
                )}
                <div className="mp-partner-torneo-regs-pay">
                  <PayStatusBadge value={r.payStatus} />
                </div>
              </div>
              <time className="mp-partner-torneo-regs-date" dateTime={r.createdAt}>
                {dt.toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}
              </time>
            </div>
          );
        })}
        {regs.length > 20 && (
          <div
            style={{
              textAlign: "center",
              padding: "10px 0 4px",
              fontSize: 11,
              color: "var(--muted-fg)",
            }}
          >
            Mostrando 20 de {regs.length} ·{" "}
            <Link
              href="/dashboard/partner/p-inscritos"
              style={{ color: "#0a0a0a", fontWeight: 800 }}
            >
              ver todos
            </Link>
          </div>
        )}
        </>
        )}
      </div>

      {subModalReg && (
        <SubstitutePlayerModal
          open
          onClose={() => setSubModalReg(null)}
          registrationId={subModalReg.id}
          registrationLabel={subModalReg.label}
          tournamentId={tournamentId}
          players={subModalReg.players}
          onSuccess={() => router.refresh()}
        />
      )}
      {showAddModal && (
        <AddInscritoManualModal
          tournamentId={tournamentId}
          modality={modality}
          categories={categories}
          entryFeeCents={entryFeeCents}
          paymentPolicy={paymentPolicy}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); router.refresh(); }}
        />
      )}
      {reviewTransactionId && (
        <ReviewProofModal
          transactionId={reviewTransactionId}
          onClose={() => setReviewTransactionId(null)}
          onSuccess={() => { setReviewTransactionId(null); router.refresh(); }}
        />
      )}
    </>
  );
}

function RegStatus({ value }: { value: string }) {
  const MAP: Record<string, { label: string; color: string; bg: string }> = {
    pending: { label: "Pendiente", color: "#92400e", bg: "#fef3c7" },
    accepted: { label: "Aceptada", color: "#065f46", bg: "#d1fae5" },
    rejected: { label: "Rechazada", color: "#991b1b", bg: "#fee2e2" },
    withdrawn: { label: "Retirada", color: "#4b5563", bg: "#f3f4f6" },
    cancelled: { label: "Cancelada", color: "#6b7280", bg: "#f3f4f6" },
  };
  const s = MAP[value] ?? { label: value, color: "#6b7280", bg: "#f3f4f6" };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 4,
        background: s.bg,
        color: s.color,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function PayStatusBadge({ value }: { value: PayStatus }) {
  const MAP: Record<PayStatus, { label: string; color: string }> = {
    paid: { label: "Pagado", color: "#065f46" },
    free: { label: "Gratis", color: "#6b7280" },
    onsite_pending: { label: "Pendiente", color: "#92400e" },
    awaiting_proof: { label: "Esperando", color: "#7c3aed" },
    review: { label: "En revisión", color: "#1d4ed8" },
    other: { label: "Otro", color: "#6b7280" },
  };
  const s = MAP[value];
  return (
    <span style={{ fontSize: 11, color: s.color, fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}
