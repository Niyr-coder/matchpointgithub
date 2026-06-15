"use client";

// Tabla de registraciones del detalle admin de torneo. Cada fila expone
// un kebab menu con: aceptar, marcar pendiente, rechazar y retirar.
//
// Nota: la transferencia de cupo NO está disponible en torneos porque las
// registraciones manejan teams/multi-player (ver TODO en
// `admin-tournament-registrations.ts`).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { AdminTournamentDetail } from "@/server/actions/tournaments";
import {
  markTournamentRegistrationStatusAdmin,
  removeTournamentRegistrationAdmin,
} from "@/server/actions/admin-tournament-registrations";
import { useToast } from "../../ToastProvider";
import { EmptyState, SectionTitle, fmtDate } from "../event-detail/primitives";

const TOURNAMENT_REG_COLS = "1fr 110px 110px 90px 40px";

type Reg = AdminTournamentDetail["registrations"][number];

type DialogState = { kind: "none" } | { kind: "remove"; reg: Reg };

export function TournamentRegistrationsTable({
  regs,
}: {
  regs: AdminTournamentDetail["registrations"];
}) {
  const router = useRouter();
  const toast = useToast();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [pending, startTransition] = useTransition();

  const closeMenu = () => setOpenMenuId(null);

  const handleStatus = (reg: Reg, status: "accepted" | "pending" | "rejected") => {
    closeMenu();
    startTransition(async () => {
      const res = await markTournamentRegistrationStatusAdmin({
        registrationId: reg.id,
        status,
      });
      if (res.ok) {
        toast({ icon: "check", title: `Estado: ${status}` });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <div style={{ marginTop: 16 }}>
      <SectionTitle>Registraciones</SectionTitle>
      {regs.length === 0 ? (
        <EmptyState label="Sin registraciones todavía." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "visible" }}>
          {regs.map((r, i) => {
            return (
              <div
                key={r.id}
                className="mp-admin-event-reg-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: TOURNAMENT_REG_COLS,
                  gap: 10,
                  padding: "12px 16px",
                  alignItems: "center",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  fontSize: 12,
                  position: "relative",
                }}
              >
                <div className="mp-admin-event-reg-primary">
                  <div style={{ fontWeight: 800 }}>
                    {r.teamId ? `Team` : r.playerNames.join(" + ") || "Inscripción"}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                    {fmtDate(r.createdAt)}
                  </div>
                </div>
                <span className="mp-admin-event-reg-cell" data-label="Jugadores" style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                  {r.playerIds.length} jugador{r.playerIds.length === 1 ? "" : "es"}
                </span>
                <span
                  className="mp-admin-event-reg-cell"
                  data-label="Estado"
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color:
                      r.status === "accepted"
                        ? "var(--primary)"
                        : r.status === "rejected" || r.status === "withdrawn"
                          ? "#b91c1c"
                          : "#fbbf24",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {r.status}
                </span>
                <span className="mp-admin-event-reg-cell" data-label="Pago" style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                  {r.paidTransactionId ? "Pagada" : "—"}
                </span>
                <div className="mp-admin-event-reg-actions" style={{ position: "relative", justifySelf: "end" }}>
                  <button
                    type="button"
                    aria-label="Acciones"
                    onClick={() => setOpenMenuId(openMenuId === r.id ? null : r.id)}
                    disabled={pending}
                    style={{
                      width: 28,
                      height: 28,
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="more-vertical" size={14} />
                  </button>
                  {openMenuId === r.id && (
                    <RowMenu
                      reg={r}
                      onClose={closeMenu}
                      onStatus={(s) => handleStatus(r, s)}
                      onRemove={() => {
                        closeMenu();
                        setDialog({ kind: "remove", reg: r });
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog.kind === "remove" && (
        <RemoveDialog
          reg={dialog.reg}
          pending={pending}
          onClose={() => setDialog({ kind: "none" })}
          onConfirm={(reason) => {
            startTransition(async () => {
              const res = await removeTournamentRegistrationAdmin({
                registrationId: dialog.reg.id,
                reason: reason || undefined,
              });
              if (res.ok) {
                toast({ icon: "check", title: "Registración retirada" });
                setDialog({ kind: "none" });
                router.refresh();
              } else {
                toast({
                  icon: "alert-triangle",
                  title: "Error",
                  sub: res.error.message,
                });
              }
            });
          }}
        />
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────

function RowMenu({
  reg,
  onClose,
  onStatus,
  onRemove,
}: {
  reg: Reg;
  onClose: () => void;
  onStatus: (s: "accepted" | "pending" | "rejected") => void;
  onRemove: () => void;
}) {
  const isWithdrawn = reg.status === "withdrawn";
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div
        style={{
          position: "absolute",
          top: 32,
          right: 0,
          zIndex: 41,
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
          overflow: "hidden",
          width: 240,
          fontSize: 12,
        }}
      >
        {isWithdrawn ? (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
            Esta registración ya fue retirada.
          </div>
        ) : (
          <>
            {reg.status !== "accepted" && (
              <MenuItem
                icon="check-circle-2"
                label="Aceptar"
                onClick={() => onStatus("accepted")}
              />
            )}
            {reg.status !== "pending" && (
              <MenuItem
                icon="clock"
                label="Marcar pendiente"
                onClick={() => onStatus("pending")}
              />
            )}
            {reg.status !== "rejected" && (
              <MenuItem
                icon="x"
                label="Rechazar"
                onClick={() => onStatus("rejected")}
              />
            )}
            <MenuItem
              icon="x-octagon"
              label="Retirar"
              danger
              onClick={onRemove}
            />
          </>
        )}
      </div>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        background: "transparent",
        border: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 12,
        color: danger ? "#dc2626" : "#0a0a0a",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--muted)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={icon} size={13} color={danger ? "#dc2626" : undefined} />
      {label}
    </button>
  );
}

function RemoveDialog({
  reg,
  pending,
  onClose,
  onConfirm,
}: {
  reg: Reg;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const label = reg.teamId ? "este team" : reg.playerNames.join(" + ") || "esta registración";
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
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 440,
        }}
      >
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Retirar a {label}
        </h3>
        <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Se marcará la registración como <strong>withdrawn</strong>.
          {reg.paidTransactionId
            ? " Tiene un pago asociado; el refund no se emite automáticamente, queda nota en el audit log."
            : " No tiene pago asociado."}
        </p>
        <label
          style={{
            display: "block",
            fontSize: 11,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginTop: 14,
            marginBottom: 6,
          }}
        >
          Motivo (opcional)
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Queda en el audit log."
          style={{
            width: "100%",
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={onClose}
            disabled={pending}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Volver
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={pending}
            className="btn"
            style={{ background: "#dc2626", color: "#fff", opacity: pending ? 0.6 : 1 }}
          >
            <Icon name="x-octagon" size={13} color="#fff" />
            {pending ? "Retirando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
