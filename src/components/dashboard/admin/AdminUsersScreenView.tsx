// Client view de AdminUsersScreen. Muestra la lista de usuarios con su plan
// (Free / MATCHPOINT+) y permite al admin activar o revocar el plan en un
// solo click sin pasar por el flujo de comprobantes.
"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { InfoTip } from "@/components/dashboard/widgets/InfoTip";
import { MpBadge } from "../widgets/MpBadge";
import { planBadgeMeta } from "@/lib/ui/trust-badge";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import {
  grantMatchPointPlusAdmin,
  revokeMatchPointPlusAdmin,
} from "@/server/actions/player-subscriptions";
import { suspendUser, reactivateUser } from "@/server/actions/admin/users";

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
  suspended: boolean;
  suspensionReason: string | null;
  suspendedAt: string | null;
  reliabilityScore: number;
  reliabilityLabel: string;
  reliabilityColor: string;
  noShows: number;
  cancellations: number;
};
export type UsersData = { rows: UserRow[]; total: number; reliabilityEnabled: boolean };

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
  // profiles + player_stats se escriben miles de veces al día sin scope útil
  // para admin. Debounce alto evita refresh por cada edit de cualquier user.
  useRealtimeRefresh(
    [
      { table: "profiles" },
      { table: "player_stats" },
      { table: "player_reliability" },
      { table: "player_subscriptions" },
    ],
    { debounceMs: 5000 },
  );

  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<
    | { kind: "grant"; user: UserRow }
    | { kind: "revoke"; user: UserRow }
    | { kind: "suspend"; user: UserRow }
    | { kind: "reactivate"; user: UserRow }
    | null
  >(null);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) setSearch(q);
  }, [searchParams]);

  const visibleRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data.rows;
    return data.rows.filter(
      (u) =>
        u.n.toLowerCase().includes(needle) ||
        u.e.toLowerCase().includes(needle) ||
        u.city.toLowerCase().includes(needle),
    );
  }, [data.rows, search]);

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
    ...(data.reliabilityEnabled
      ? [
          {
            k: "reliability",
            l: "Fiabilidad",
            tip: "Score por inasistencias y cancelaciones. Solo visible si el flag de fiabilidad está activo.",
            align: "center" as const,
            render: (u: UserRow) => (
              <span
                title={`${u.noShows} inasistencias · ${u.cancellations} cancelaciones`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 8px",
                  borderRadius: 9999,
                  background: `${u.reliabilityColor}14`,
                  border: `1px solid ${u.reliabilityColor}55`,
                  color: u.reliabilityColor,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                <Icon name="shield-check" size={9} color={u.reliabilityColor} />
                {u.reliabilityScore} · {u.reliabilityLabel}
              </span>
            ),
          },
        ]
      : []),
    {
      k: "spend",
      l: "Gasto · mes",
      tip: "Suma de transacciones captured del mes calendario para este jugador.",
      align: "right",
      render: (u) => (
        <b style={{ color: u.spend === "$0" ? "var(--muted-fg)" : "var(--primary)" }}>{u.spend}</b>
      ),
    },
    {
      k: "plan",
      l: "Plan",
      tip: "MATCHPOINT+ activo o plan free. El grant/revoke desde el menú ⋯ escribe en player_subscriptions y audit_log.",
      render: (u) =>
        u.planTier === "premium" ? (
          <MpBadge
            {...planBadgeMeta("premium")}
            size="sm"
            title={`Vence: ${fmtExpiry(u.planExpiresAt)}`}
          />
        ) : (
          <MpBadge {...planBadgeMeta("free")} size="sm" />
        ),
    },
    {
      k: "st",
      l: "Estado",
      tip: "Cuenta activa o suspendida. Suspender bloquea acceso; reactivar restaura el acceso previo.",
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
          onSuspend={() => setDialog({ kind: "suspend", user: u })}
          onReactivate={() => setDialog({ kind: "reactivate", user: u })}
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
            <InfoTip maxWidth={260} text="Directorio global de jugadores. Desde el menú ⋯ puedes otorgar/revocar MATCHPOINT+ o suspender cuentas; cada acción queda en audit_log." />
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)" }}>
                <Icon name="search" size={13} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o usuario…"
                aria-label="Buscar usuarios"
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
      <RSTable cols={cols} rows={visibleRows} rowKey={(u) => u.id} />

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
      {dialog?.kind === "suspend" && (
        <SuspendDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "reactivate" && (
        <ReactivateDialog user={dialog.user} onClose={() => setDialog(null)} />
      )}
    </>
  );
}

// ── Sub-componentes ─────────────────────────────────────────────────────

function RowMenu({
  user,
  onGrant,
  onRevoke,
  onSuspend,
  onReactivate,
}: {
  user: UserRow;
  onGrant: () => void;
  onRevoke: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Recalcular posición del dropdown al abrir (también ante scroll/resize).
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return (
    <div style={{ display: "inline-block" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--muted)",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          lineHeight: 1,
        }}
      >
        <Icon name="more-horizontal" size={13} />
      </button>
      {open && mounted && pos &&
        createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            />
            <div
              style={{
                position: "fixed",
                top: pos.top,
                right: pos.right,
                zIndex: 9999,
                background: "#fff",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
                overflow: "hidden",
                width: 240,
                fontSize: 12,
              }}
            >
            {user.planTier === "free" ? (
              <MenuItem
                icon="crown"
                label="Activar MATCHPOINT+"
                onClick={() => {
                  setOpen(false);
                  onGrant();
                }}
              />
            ) : (
              <>
                <MenuItem
                  icon="rotate-cw"
                  label="Extender MATCHPOINT+"
                  onClick={() => {
                    setOpen(false);
                    onGrant();
                  }}
                />
                <MenuItem
                  icon="x-circle"
                  danger
                  label="Revocar MATCHPOINT+"
                  onClick={() => {
                    setOpen(false);
                    onRevoke();
                  }}
                />
              </>
            )}
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            {user.suspended ? (
              <MenuItem
                icon="rotate-ccw"
                label="Reactivar cuenta"
                onClick={() => {
                  setOpen(false);
                  onReactivate();
                }}
              />
            ) : (
              <MenuItem
                icon="ban"
                danger
                label="Suspender cuenta"
                onClick={() => {
                  setOpen(false);
                  onSuspend();
                }}
              />
            )}
            </div>
          </>,
          document.body,
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
        gap: 10,
        width: "100%",
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
          title: "MATCHPOINT+ activado",
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
        {extending ? "Extender" : "Activar"} MATCHPOINT+ para {user.n}
      </h3>
      <p
        style={{ margin: "8px 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        Esto activa el plan inmediatamente, sin pasar por el flujo de
        comprobantes. {extending && `Plan vigente vence el ${fmtExpiry(user.planExpiresAt)}; los meses se suman desde esa fecha.`}
      </p>

      <FieldLabel>Duración</FieldLabel>
      <div className="mp-admin-duration-pick" style={{ marginBottom: 14 }}>
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
        toast({ icon: "check", title: "MATCHPOINT+ revocado" });
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
        Revocar MATCHPOINT+ de {user.n}
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

function SuspendDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const canSubmit = reason.trim().length >= 3;

  const handleConfirm = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await suspendUser({ userId: user.id, reason: reason.trim() });
      if (res.ok) {
        toast({ icon: "check", title: "Cuenta suspendida", sub: user.n });
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
        Suspender cuenta de {user.n}
      </h3>
      <p
        style={{ margin: "8px 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        El usuario no podrá iniciar sesión ni operar (reservar, inscribirse a torneos
        o eventos). Su sesión activa se cierra en el próximo request. El perfil
        público se mantiene visible con badge de suspensión.
      </p>

      <FieldLabel>Motivo (obligatorio)</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Ej: violación de términos, fraude, abuso reportado"
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
          <Icon name="ban" size={13} color="#fff" />
          {pending ? "Suspendiendo…" : "Suspender cuenta"}
        </button>
      </DialogFooter>
    </ModalShell>
  );
}

function ReactivateDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await reactivateUser({
        userId: user.id,
        reason: reason.trim() || undefined,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Cuenta reactivada", sub: user.n });
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
        Reactivar cuenta de {user.n}
      </h3>
      <p
        style={{ margin: "8px 0 12px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        El usuario podrá iniciar sesión y operar normalmente. La suspensión queda
        en historial (motivo original: <i>{user.suspensionReason ?? "sin motivo registrado"}</i>).
      </p>

      <FieldLabel>Motivo de la reactivación (opcional)</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Ej: revisión completada, error administrativo, periodo cumplido"
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
          <Icon name="rotate-ccw" size={13} color="#fff" />
          {pending ? "Reactivando…" : "Reactivar cuenta"}
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
