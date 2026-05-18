// Client view de AdminUsersScreen. Muestra la lista de usuarios con su plan
// (Free / MatchPoint+) y permite al admin activar o revocar el plan en un
// solo click sin pasar por el flujo de comprobantes.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import {
  grantMatchPointPlusAdmin,
  revokeMatchPointPlusAdmin,
} from "@/server/actions/player-subscriptions";

export type UserStatus = "active" | "warned" | "banned";
export type UserRow = {
  id: string;
  n: string;
  e: string;
  l: number;
  city: string;
  m: number;
  st: UserStatus;
  av: string;
  avBg: string;
  spend: string;
  avatarUrl: string | null;
  planTier: "free" | "premium";
  planExpiresAt: string | null;
};
export type UsersData = { rows: UserRow[]; total: number };

const ST_STYLES: Record<UserStatus, { c: string; l: string }> = {
  active: { c: "var(--primary)", l: "● Activo" },
  warned: { c: "#fbbf24", l: "⚠ Advertido" },
  banned: { c: "#dc2626", l: "⊘ Suspendido" },
};

function fmtExpiry(iso: string | null): string {
  if (!iso) return "Sin vencimiento";
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function AdminUsersScreenView({ data }: { data: UsersData }) {
  useRealtimeRefresh([
    { table: "profiles" },
    { table: "player_stats" },
    { table: "player_subscriptions" },
  ]);

  const [dialog, setDialog] = useState<
    | { kind: "grant"; user: UserRow }
    | { kind: "revoke"; user: UserRow }
    | null
  >(null);

  const cols: RSColumn<UserRow>[] = [
    {
      k: "n",
      l: "Usuario",
      render: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: u.avatarUrl ? `url(${u.avatarUrl}) center/cover` : u.avBg,
              color: "#fff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 10.5,
              flexShrink: 0,
            }}
          >
            {u.avatarUrl ? "" : u.av}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{u.n}</div>
            <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{u.e}</div>
          </div>
        </div>
      ),
    },
    {
      k: "l",
      l: "Nivel",
      align: "center",
      render: (u) => (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 7px",
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 9999,
            fontSize: 10,
            fontWeight: 800,
          }}
        >
          <Icon name="zap" size={9} color="#fbbf24" />
          {u.l}
        </span>
      ),
    },
    { k: "city", l: "Ciudad" },
    { k: "m", l: "Matches", align: "center", render: (u) => <b className="font-heading">{u.m}</b> },
    {
      k: "spend",
      l: "Gasto · mes",
      align: "right",
      render: (u) => (
        <b style={{ color: u.spend === "$0" ? "var(--muted-fg)" : "var(--primary)" }}>{u.spend}</b>
      ),
    },
    {
      k: "plan",
      l: "Plan",
      render: (u) =>
        u.planTier === "premium" ? (
          <span
            title={`Vence: ${fmtExpiry(u.planExpiresAt)}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 9999,
              background: "#ecfdf5",
              border: "1px solid #10b981",
              color: "#047857",
              fontSize: 10,
              fontWeight: 900,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            <Icon name="crown" size={9} color="#047857" />
            MatchPoint+
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              padding: "3px 8px",
              borderRadius: 9999,
              background: "var(--muted)",
              color: "var(--muted-fg)",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Free
          </span>
        ),
    },
    {
      k: "st",
      l: "Estado",
      render: (u) => <RSPill bg={ST_STYLES[u.st].c}>{ST_STYLES[u.st].l}</RSPill>,
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (u) => (
        <RowMenu
          user={u}
          onGrant={() => setDialog({ kind: "grant", user: u })}
          onRevoke={() => setDialog({ kind: "revoke", user: u })}
        />
      ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Plataforma · Usuarios"
        title={
          <>
            Usuarios <span className="dot">●</span> {data.total.toLocaleString("en-US")}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)" }}>
                <Icon name="search" size={13} />
              </span>
              <input
                placeholder="Buscar por nombre o usuario…"
                style={{
                  padding: "8px 14px 8px 32px",
                  border: RS_BORDER,
                  borderRadius: 9999,
                  fontSize: 12,
                  fontFamily: "inherit",
                  minWidth: 280,
                }}
              />
            </div>
            <button className="btn" style={{ background: "#fff", border: RS_BORDER }}>
              <Icon name="filter" size={12} />
              Filtros
            </button>
          </div>
        }
      />
      <RSTable cols={cols} rows={data.rows} rowKey={(u) => u.id} />

      {dialog?.kind === "grant" && (
        <GrantPlusDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "revoke" && (
        <RevokePlusDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

// ── Sub-componentes ─────────────────────────────────────────────────────

function RowMenu({
  user,
  onGrant,
  onRevoke,
}: {
  user: UserRow;
  onGrant: () => void;
  onRevoke: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--muted)",
          border: 0,
          cursor: "pointer",
        }}
      >
        <Icon name="more-horizontal" size={13} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: 32,
              right: 0,
              zIndex: 41,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              padding: 4,
              minWidth: 220,
            }}
          >
            {user.planTier === "free" ? (
              <MenuItem
                icon="crown"
                label="Activar MatchPoint+"
                onClick={() => {
                  setOpen(false);
                  onGrant();
                }}
              />
            ) : (
              <>
                <MenuItem
                  icon="rotate-cw"
                  label="Extender MatchPoint+"
                  onClick={() => {
                    setOpen(false);
                    onGrant();
                  }}
                />
                <MenuItem
                  icon="x-circle"
                  danger
                  label="Revocar MatchPoint+"
                  onClick={() => {
                    setOpen(false);
                    onRevoke();
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
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
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "9px 12px",
        background: "transparent",
        border: 0,
        borderRadius: 8,
        cursor: "pointer",
        fontSize: 12.5,
        fontWeight: 700,
        color: danger ? "#b91c1c" : "#0a0a0a",
        textAlign: "left",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={icon} size={13} color={danger ? "#b91c1c" : undefined} />
      {label}
    </button>
  );
}

function GrantPlusDialog({
  user,
  onClose,
}: {
  user: UserRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [months, setMonths] = useState<number>(1);
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await grantMatchPointPlusAdmin({
        userId: user.id,
        durationMonths: months,
        reason: reason.trim() || undefined,
      });
      if (res.ok) {
        toast({
          icon: "check-circle-2",
          title: "MatchPoint+ activado",
          sub: `Vence: ${fmtExpiry(res.data.expiresAt)}`,
        });
        onClose();
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const extending = user.planTier === "premium";

  return (
    <ModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        {extending ? "Extender" : "Activar"} MatchPoint+ para {user.n}
      </h3>
      <p
        style={{ margin: "8px 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        Esto activa el plan inmediatamente, sin pasar por el flujo de
        comprobantes. {extending && `Plan vigente vence el ${fmtExpiry(user.planExpiresAt)}; los meses se suman desde esa fecha.`}
      </p>

      <FieldLabel>Duración</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 14 }}>
        {[1, 3, 6, 12].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMonths(m)}
            style={{
              padding: "10px 6px",
              borderRadius: 8,
              border: months === m ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: months === m ? "#ecfdf5" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 900,
            }}
          >
            {m} {m === 1 ? "mes" : "meses"}
          </button>
        ))}
      </div>

      <FieldLabel>Motivo (opcional)</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Ej: beta tester, gift, soporte"
        style={textareaStyle}
      />

      <DialogFooter>
        <SecondaryBtn onClick={onClose} disabled={pending}>
          Cancelar
        </SecondaryBtn>
        <button
          onClick={handleConfirm}
          disabled={pending}
          className="btn btn-primary"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          <Icon name="crown" size={13} color="#fff" />
          {pending ? "Activando…" : `Confirmar ${months} ${months === 1 ? "mes" : "meses"}`}
        </button>
      </DialogFooter>
    </ModalShell>
  );
}

function RevokePlusDialog({
  user,
  onClose,
}: {
  user: UserRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const canSubmit = reason.trim().length >= 2;

  const handleConfirm = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await revokeMatchPointPlusAdmin({
        userId: user.id,
        reason: reason.trim(),
      });
      if (res.ok) {
        toast({ icon: "check", title: "MatchPoint+ revocado" });
        onClose();
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <ModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        Revocar MatchPoint+ de {user.n}
      </h3>
      <p
        style={{ margin: "8px 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        El usuario perderá el acceso premium de forma inmediata. Las suscripciones
        activas quedan canceladas con el motivo en el audit log.
      </p>

      <FieldLabel>Motivo (obligatorio)</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Ej: incumplimiento de términos, prueba terminada"
        style={textareaStyle}
      />

      <DialogFooter>
        <SecondaryBtn onClick={onClose} disabled={pending}>
          Cancelar
        </SecondaryBtn>
        <button
          onClick={handleConfirm}
          disabled={pending || !canSubmit}
          className="btn"
          style={{
            background: "#dc2626",
            color: "#fff",
            opacity: pending || !canSubmit ? 0.6 : 1,
          }}
        >
          <Icon name="x-circle" size={13} color="#fff" />
          {pending ? "Revocando…" : "Revocar plan"}
        </button>
      </DialogFooter>
    </ModalShell>
  );
}

// ── Helpers visuales ────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
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
