"use client";

// Tabla de inscritos en el detalle admin de evento. Cada fila expone un
// kebab menu con acciones: marcar asistencia, transferir cupo y remover.
// Las acciones llaman server actions en `admin-event-registrations.ts`
// y refrescan vía router.refresh() (useRealtimeRefresh también dispara).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { AdminEventDetail } from "@/server/actions/events";
import {
  markEventAttendanceAdmin,
  markEventNoShowAdmin,
  removeEventRegistrationAdmin,
  transferEventSlotAdmin,
} from "@/server/actions/admin-event-registrations";
import { useToast } from "../../ToastProvider";
import { EmptyState, SectionTitle, fmtDate } from "./primitives";

const EVENT_REG_COLS = "1fr 110px 100px 110px 40px";

type Reg = AdminEventDetail["registrations"][number];

type DialogState =
  | { kind: "none" }
  | { kind: "remove"; reg: Reg }
  | { kind: "transfer"; reg: Reg }
  | { kind: "noShow"; reg: Reg };

export function EventRegistrationsTable({
  regs,
  eventId,
}: {
  regs: AdminEventDetail["registrations"];
  eventId: string;
}) {
  void eventId;
  const router = useRouter();
  const toast = useToast();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [pending, startTransition] = useTransition();

  const closeMenu = () => setOpenMenuId(null);

  const handleAttendance = (reg: Reg, attended: boolean) => {
    closeMenu();
    startTransition(async () => {
      const res = await markEventAttendanceAdmin({
        registrationId: reg.id,
        attended,
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: attended ? "Asistencia marcada" : "Asistencia revertida",
        });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <div style={{ marginTop: 16 }}>
      <SectionTitle>Inscritos</SectionTitle>
      {regs.length === 0 ? (
        <EmptyState label="Sin inscritos todavía." />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "visible" }}>
          {regs.map((r, i) => {
            const isCancelled = r.status === "cancelled";
            const isAttended = r.status === "attended";
            return (
              <div
                key={r.id}
                className="mp-admin-event-reg-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: EVENT_REG_COLS,
                  gap: 10,
                  padding: "12px 16px",
                  alignItems: "center",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  position: "relative",
                }}
              >
                <div className="mp-admin-event-reg-primary mp-admin-event-reg-cell" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg,#10b981,#047857)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}
                  >
                    {r.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatarUrl} alt={r.displayName} width={32} height={32} style={{ objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 900 }}>
                        {r.displayName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{r.displayName}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                      {fmtDate(r.createdAt)}
                    </div>
                  </div>
                </div>
                <span
                  className="mp-admin-event-reg-cell"
                  data-label="Estado"
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: isCancelled
                      ? "#b91c1c"
                      : isAttended
                        ? "#047857"
                        : "var(--primary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  {r.status}
                </span>
                <span className="mp-admin-event-reg-cell" data-label="Pago" style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                  {r.paidTransactionId ? "Pagado" : "—"}
                </span>
                <Link
                  className="mp-admin-event-reg-cell"
                  data-label="Perfil"
                  href={`/dashboard/admin/admin-users?focus=${r.userId}`}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--primary)",
                    textDecoration: "none",
                    justifySelf: "end",
                  }}
                >
                  Ver usuario →
                </Link>
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
                      onAttendance={(attended) => handleAttendance(r, attended)}
                      onTransfer={() => {
                        closeMenu();
                        setDialog({ kind: "transfer", reg: r });
                      }}
                      onNoShow={() => {
                        closeMenu();
                        setDialog({ kind: "noShow", reg: r });
                      }}
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
              const res = await removeEventRegistrationAdmin({
                registrationId: dialog.reg.id,
                reason: reason || undefined,
              });
              if (res.ok) {
                toast({ icon: "check", title: "Inscripción removida" });
                setDialog({ kind: "none" });
                router.refresh();
              } else {
                toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
              }
            });
          }}
        />
      )}

      {dialog.kind === "noShow" && (
        <NoShowDialog
          reg={dialog.reg}
          pending={pending}
          onClose={() => setDialog({ kind: "none" })}
          onConfirm={(reason) => {
            startTransition(async () => {
              const res = await markEventNoShowAdmin({
                registrationId: dialog.reg.id,
                reason: reason || undefined,
              });
              if (res.ok) {
                toast({ icon: "check", title: "Marcado como no-show" });
                setDialog({ kind: "none" });
                router.refresh();
              } else {
                toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
              }
            });
          }}
        />
      )}

      {dialog.kind === "transfer" && (
        <TransferDialog
          reg={dialog.reg}
          pending={pending}
          onClose={() => setDialog({ kind: "none" })}
          onConfirm={(toUserId) => {
            startTransition(async () => {
              const res = await transferEventSlotAdmin({
                registrationId: dialog.reg.id,
                toUserId,
              });
              if (res.ok) {
                toast({ icon: "check", title: "Cupo transferido" });
                setDialog({ kind: "none" });
                router.refresh();
              } else {
                toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
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
  onAttendance,
  onTransfer,
  onNoShow,
  onRemove,
}: {
  reg: Reg;
  onClose: () => void;
  onAttendance: (attended: boolean) => void;
  onTransfer: () => void;
  onNoShow: () => void;
  onRemove: () => void;
}) {
  const isCancelled = reg.status === "cancelled";
  const isAttended = reg.status === "attended";
  const isNoShow = reg.status === "no_show";
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 40 }}
      />
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
        {!isCancelled && (
          <MenuItem
            icon={isAttended ? "rotate-ccw" : "check-circle-2"}
            label={isAttended ? "Revertir asistencia" : "Marcar asistencia"}
            onClick={() => onAttendance(!isAttended)}
          />
        )}
        {!isCancelled && (
          <MenuItem
            icon="user-cog"
            label="Transferir cupo"
            onClick={onTransfer}
          />
        )}
        {!isCancelled && !isNoShow && (
          <MenuItem
            icon="user-x"
            label="Marcar no-show"
            onClick={onNoShow}
          />
        )}
        {!isCancelled && (
          <MenuItem
            icon="x-octagon"
            label="Remover"
            danger
            onClick={onRemove}
          />
        )}
        {isCancelled && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted-fg)" }}>
            Esta inscripción ya está cancelada.
          </div>
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
  return (
    <ModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        Remover a {reg.displayName}
      </h3>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Se marcará la inscripción como <strong>cancelada</strong> y se libera el cupo.
        {reg.paidTransactionId
          ? " La inscripción tiene un pago asociado; el refund no se emite automáticamente, queda nota en el audit log."
          : " No tiene pago asociado."}
      </p>
      <FieldLabel>Motivo (opcional)</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Queda en el audit log."
        style={textareaStyle}
      />
      <DialogFooter>
        <SecondaryBtn onClick={onClose} disabled={pending}>Volver</SecondaryBtn>
        <button
          onClick={() => onConfirm(reason.trim())}
          disabled={pending}
          className="btn"
          style={{ background: "#dc2626", color: "#fff", opacity: pending ? 0.6 : 1 }}
        >
          <Icon name="x-octagon" size={13} color="#fff" />
          {pending ? "Removiendo…" : "Confirmar"}
        </button>
      </DialogFooter>
    </ModalShell>
  );
}

function NoShowDialog({
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
  const hasUncapturedTx = reg.paidTransactionId != null;
  return (
    <ModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        Marcar no-show: {reg.displayName}
      </h3>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        La inscripción queda con estado <strong>no_show</strong>.
        {hasUncapturedTx
          ? " Si la transacción ligada no está cobrada, se marca como failed automáticamente. Si ya estaba captured, el dinero no se toca."
          : " No tiene pago asociado."}
      </p>
      <FieldLabel>Motivo (opcional)</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Queda en el audit log."
        style={textareaStyle}
      />
      <DialogFooter>
        <SecondaryBtn onClick={onClose} disabled={pending}>Volver</SecondaryBtn>
        <button
          onClick={() => onConfirm(reason.trim())}
          disabled={pending}
          className="btn"
          style={{ background: "#0a0a0a", color: "#fff", opacity: pending ? 0.6 : 1 }}
        >
          <Icon name="user-x" size={13} color="#fff" />
          {pending ? "Marcando…" : "Confirmar no-show"}
        </button>
      </DialogFooter>
    </ModalShell>
  );
}

function TransferDialog({
  reg,
  pending,
  onClose,
  onConfirm,
}: {
  reg: Reg;
  pending: boolean;
  onClose: () => void;
  onConfirm: (toUserId: string) => void;
}) {
  const [toUserId, setToUserId] = useState("");
  const isUuid = /^[0-9a-f-]{36}$/i.test(toUserId.trim());
  return (
    <ModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        Transferir cupo de {reg.displayName}
      </h3>
      <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        El usuario destino debe existir en la plataforma y no estar ya inscrito a este evento.
        Pega su UUID (lo puedes copiar desde Admin · Usuarios).
      </p>
      <FieldLabel>UUID del usuario destino</FieldLabel>
      <input
        value={toUserId}
        onChange={(e) => setToUserId(e.target.value)}
        placeholder="00000000-0000-0000-0000-000000000000"
        style={{
          width: "100%",
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontFamily: "inherit",
          fontSize: 13,
        }}
      />
      <DialogFooter>
        <SecondaryBtn onClick={onClose} disabled={pending}>Volver</SecondaryBtn>
        <button
          onClick={() => onConfirm(toUserId.trim())}
          disabled={pending || !isUuid}
          className="btn"
          style={{
            background: "var(--primary)",
            color: "#fff",
            opacity: pending || !isUuid ? 0.5 : 1,
          }}
        >
          <Icon name="user-cog" size={13} color="#fff" />
          {pending ? "Transfiriendo…" : "Confirmar"}
        </button>
      </DialogFooter>
    </ModalShell>
  );
}

// ── helpers visuales locales ───────────────────────────────────────────

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
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
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </label>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
      {children}
    </div>
  );
}

function SecondaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn"
      style={{ background: "#fff", border: "1px solid var(--border)" }}
    >
      {children}
    </button>
  );
}

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13,
  resize: "vertical",
};
