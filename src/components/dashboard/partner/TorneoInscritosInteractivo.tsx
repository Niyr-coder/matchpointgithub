"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SubstitutePlayerModal } from "./SubstitutePlayerModal";
import { AddInscritoManualModal } from "./AddInscritoManualModal";

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
  const [subModalReg, setSubModalReg] = useState<RegRowInteractive | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const canSubstitute = playerOpsEnabled && !isClosed;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {!isClosed && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
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
                  <b className="mp-partner-torneo-regs-name">{name}</b>
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
