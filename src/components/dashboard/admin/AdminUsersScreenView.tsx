// Client view de AdminUsersScreen. Muestra la lista de usuarios con su plan
// (Free / MATCHPOINT+) y permite al admin activar o revocar el plan en un
// solo click sin pasar por el flujo de comprobantes.
"use client";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
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
import { suspendUser, reactivateUser, deleteUserAccount, getAdminUserDetail, updateUserProfileAdmin } from "@/server/actions/admin/users";
import type { AdminUserDetail, AdminUserEditableProfile, AdminIntegritySignal } from "@/lib/types/admin-user-detail";

export type UserStatus = "active" | "warned" | "banned";
export type UserRow = {
  id: string;
  username: string | null;
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

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtEnumLabel(value: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function reportStatusColor(status: string): string {
  if (status === "pending" || status === "reviewing") return "#dc2626";
  if (status === "actioned") return "var(--primary)";
  return "var(--muted-fg)";
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
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: "grant"; user: UserRow }
    | { kind: "revoke"; user: UserRow }
    | { kind: "suspend"; user: UserRow }
    | { kind: "reactivate"; user: UserRow }
    | { kind: "delete"; user: UserRow }
    | null
  >(null);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) setSearch(q);
    const focusId = searchParams.get("focus")?.trim();
    if (!focusId) return;
    const hit = data.rows.find((u) => u.id === focusId);
    if (hit) setDetailUser(hit);
  }, [searchParams, data.rows]);

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
          onViewInfo={() => setDetailUser(u)}
          onGrant={() => setDialog({ kind: "grant", user: u })}
          onRevoke={() => setDialog({ kind: "revoke", user: u })}
          onSuspend={() => setDialog({ kind: "suspend", user: u })}
          onReactivate={() => setDialog({ kind: "reactivate", user: u })}
          onDelete={() => setDialog({ kind: "delete", user: u })}
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
          <div className="mp-rs-toolbar">
            <div className="mp-rs-toolbar-search">
              <span className="mp-rs-toolbar-search-icon" aria-hidden>
                <Icon name="search" size={13} />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o usuario…"
                aria-label="Buscar usuarios"
                className="mp-rs-toolbar-search-input"
              />
            </div>
            <div className="mp-rs-toolbar-actions">
              <button type="button" className="btn" style={{ background: "#fff", border: RS_BORDER }}>
                <Icon name="filter" size={12} />
                Filtros
              </button>
            </div>
          </div>
        }
      />
      <RSTable cols={cols} rows={visibleRows} rowKey={(u) => u.id} />

      {detailUser && (
        <UserDetailDrawer
          user={detailUser}
          reliabilityEnabled={data.reliabilityEnabled}
          close={() => setDetailUser(null)}
          onGrant={() => setDialog({ kind: "grant", user: detailUser })}
          onRevoke={() => setDialog({ kind: "revoke", user: detailUser })}
          onSuspend={() => setDialog({ kind: "suspend", user: detailUser })}
          onReactivate={() => setDialog({ kind: "reactivate", user: detailUser })}
          onDelete={() => setDialog({ kind: "delete", user: detailUser })}
        />
      )}

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
      {dialog?.kind === "delete" && (
        <DeleteAccountDialog
          user={dialog.user}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setDialog(null);
            setDetailUser(null);
          }}
        />
      )}
    </>
  );
}

// ── Sub-componentes ─────────────────────────────────────────────────────

function RowMenu({
  user,
  onViewInfo,
  onGrant,
  onRevoke,
  onSuspend,
  onReactivate,
  onDelete,
}: {
  user: UserRow;
  onViewInfo: () => void;
  onGrant: () => void;
  onRevoke: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<
    | { top: number; bottom?: never; right: number }
    | { bottom: number; top?: never; right: number }
    | null
  >(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Recalcular posición del dropdown al abrir (también ante scroll/resize).
  // Si no hay espacio suficiente abajo, se abre hacia arriba.
  useEffect(() => {
    if (!open) return;
    const MENU_H = 260;
    const update = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const right = window.innerWidth - r.right;
      if (window.innerHeight - r.bottom >= MENU_H) {
        setPos({ top: r.bottom + 6, right });
      } else {
        setPos({ bottom: window.innerHeight - r.top + 6, right });
      }
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
        type="button"
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
                ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
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
            <MenuItem
              icon="user"
              label="Ver información"
              onClick={() => {
                setOpen(false);
                onViewInfo();
              }}
            />
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
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
            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <MenuItem
              icon="trash-2"
              danger
              label="Eliminar cuenta"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            />
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
      type="button"
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

function UserDetailDrawer({
  user,
  reliabilityEnabled,
  close,
  onGrant,
  onRevoke,
  onSuspend,
  onReactivate,
  onDelete,
}: {
  user: UserRow;
  reliabilityEnabled: boolean;
  close: () => void;
  onGrant: () => void;
  onRevoke: () => void;
  onSuspend: () => void;
  onReactivate: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    void getAdminUserDetail({ userId: user.id }).then((res) => {
      if (cancelled) return;
      if (res.ok) setDetail(res.data);
      else setLoadError(res.error.message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user.id, reloadTick]);

  const profileHref = user.username
    ? `/dashboard/admin/players/${user.username}`
    : null;

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ icon: "copy", title: `${label} copiado` });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar" });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Información de ${user.n}`}
      className="mp-slide-drawer-overlay"
      onClick={close}
    >
      <div className="mp-slide-drawer-panel" onClick={(evt) => evt.stopPropagation()}>
        <div className="mp-slide-drawer-head" style={{ background: "#0a0a0a", color: "#fff", padding: 22 }}>
          <div
            aria-hidden
            className="mp-slide-drawer-head-fx"
            style={{
              background: "radial-gradient(ellipse at 85% 20%, rgba(16,185,129,0.2), transparent 60%)",
            }}
          />
          <button
            type="button"
            className="mp-slide-drawer-close mp-slide-drawer-close--dark"
            onClick={(evt) => {
              evt.stopPropagation();
              close();
            }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div className="mp-slide-drawer-head-body">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span className="label-mp" style={{ color: "#6ee7b7" }}>● Usuario</span>
              {user.planTier === "premium" ? (
                <span style={{ padding: "3px 9px", borderRadius: 9999, background: "rgba(16,185,129,0.2)", color: "#6ee7b7", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  MATCHPOINT+
                </span>
              ) : null}
              {user.suspended && (
                <span style={{ padding: "3px 9px", borderRadius: 9999, background: "#fee2e2", color: "#b91c1c", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Suspendido
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  background: user.avatarUrl ? `url(${user.avatarUrl}) center/cover` : user.avBg,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "Plus Jakarta Sans",
                  fontWeight: 900,
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {user.avatarUrl ? "" : user.av}
              </div>
              <div style={{ minWidth: 0, paddingRight: 24 }}>
                <div className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                  {user.n}
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{user.e}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", fontSize: 11 }}>
              <DrawerDStat l="Ciudad" v={user.city} />
              <DrawerDStat l="Nivel" v={`⚡ ${user.l}`} />
              <DrawerDStat l="Partidos" v={String(user.m)} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {user.suspended && (
            <div style={{ padding: "14px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca" }}>
              <div className="label-mp" style={{ color: "#b91c1c", marginBottom: 4 }}>Suspensión activa</div>
              <p style={{ margin: 0, fontSize: 12, color: "#7f1d1d", lineHeight: 1.45 }}>
                {user.suspensionReason ?? "Sin motivo registrado"}
                {user.suspendedAt ? ` · ${fmtExpiry(user.suspendedAt)}` : ""}
              </p>
            </div>
          )}

          {loading && (
            <div className="mp-user-detail-skeleton" style={{ padding: 16 }} aria-busy="true" aria-label="Cargando detalle">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="mp-user-detail-skeleton-row" />
              ))}
            </div>
          )}

          {!loading && loadError && (
            <div style={{ padding: 16 }}>
              <p style={{ margin: 0, fontSize: 12, color: "#b91c1c", lineHeight: 1.45 }}>{loadError}</p>
            </div>
          )}

          {!loading && detail && (
            <>
              {detail.bio && (
                <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
                  <div className="label-mp" style={{ marginBottom: 8 }}>Bio</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "#374151" }}>{detail.bio}</p>
                </div>
              )}

              <DrawerBlock title="Cuenta">
                <DrawerKV k="Email" v={detail.email ?? "—"} />
                <DrawerKV k="Último acceso" v={fmtDateTime(detail.lastSignInAt)} />
                <DrawerKV k="Registrado" v={fmtDateTime(detail.createdAt)} />
                <DrawerKV k="Onboarding" v={detail.onboardedAt ? fmtDateTime(detail.onboardedAt) : "Pendiente"} />
                <DrawerKV
                  k="Teléfono"
                  v={detail.phone ? `${detail.phone}${detail.phoneVerified ? " · verificado" : ""}` : "—"}
                />
                <DrawerKV k="País" v={detail.country ?? "—"} />
                <DrawerKV k="Idioma" v={detail.locale.toUpperCase()} />
                <DrawerKV k="ID" v={user.id} mono onCopy={() => void copyText(user.id, "ID")} />
                {detail.isSystem && <DrawerKV k="Tipo" v="Cuenta oficial" />}
                <AdminProfileEditForm
                  userId={user.id}
                  initial={detail.editable}
                  onSaved={() => {
                    setReloadTick((n) => n + 1);
                    router.refresh();
                  }}
                />
              </DrawerBlock>

              <DrawerBlock title="Integridad">
                {detail.integritySignals.map((s) => (
                  <IntegritySignalRow key={s.code + s.detail} signal={s} />
                ))}
              </DrawerBlock>

              {detail.profileChanges.length > 0 && (
                <DrawerBlock title="Historial de cambios">
                  {detail.profileChanges.slice(0, 8).map((c, i) => (
                    <div
                      key={`${c.at}-${i}`}
                      style={{
                        padding: "10px 0",
                        borderTop: i === 0 ? 0 : "1px dashed var(--border)",
                      }}
                    >
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", marginBottom: 6 }}>
                        {fmtDateTime(c.at)}
                      </div>
                      {c.fields.map((f) => (
                        <div key={f.key} style={{ fontSize: 11.5, lineHeight: 1.45, marginBottom: 4 }}>
                          <b>{f.label}:</b>{" "}
                          <span style={{ color: "#b91c1c", textDecoration: "line-through" }}>{f.before}</span>
                          {" → "}
                          <span style={{ color: "#047857", fontWeight: 800 }}>{f.after}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </DrawerBlock>
              )}

              {detail.eloHistory.length > 0 && (
                <DrawerBlock title="Evolución ELO">
                  {detail.eloHistory.slice(0, 10).map((p, i) => (
                    <DrawerKV
                      key={`${p.at}-${p.mode}-${i}`}
                      k={`${fmtDateTime(p.at)} · ${p.mode}`}
                      v={
                        p.delta != null && p.delta !== 0
                          ? `${Math.round((p.rating / 1000) * 10) / 10} (${p.delta > 0 ? "+" : ""}${p.delta})`
                          : String(Math.round((p.rating / 1000) * 10) / 10)
                      }
                      mono
                    />
                  ))}
                </DrawerBlock>
              )}

              <DrawerBlock title={`Reportes (${detail.reports.length})`}>
                {detail.reports.length === 0 ? (
                  <DrawerKV k="Estado" v="Sin reportes contra este perfil" />
                ) : (
                  detail.reports.map((r, i) => (
                    <div
                      key={r.id}
                      style={{
                        padding: "10px 0",
                        borderTop: i === 0 ? "1px dashed var(--border)" : "1px dashed var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 4 }}>
                        <RSPill bg={reportStatusColor(r.status)}>{fmtEnumLabel(r.status)}</RSPill>
                        <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>{fmtDateTime(r.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.35 }}>{r.reason}</div>
                      {r.details && (
                        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.4 }}>{r.details}</div>
                      )}
                      <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 4 }}>Por {r.reporterName}</div>
                    </div>
                  ))
                )}
                {detail.openReportsCount > 0 && (
                  <Link
                    href="/dashboard/admin/admin-mod"
                    className="btn"
                    style={{ width: "100%", justifyContent: "center", marginTop: 10, background: "#fff", border: "1px solid var(--border)", fontSize: 11 }}
                  >
                    Ir a cola de moderación
                  </Link>
                )}
              </DrawerBlock>

              <DrawerBlock title="Deporte">
                <DrawerKV k="Deporte preferido" v={fmtEnumLabel(detail.preferredSport)} />
                <DrawerKV k="Nivel declarado" v={fmtEnumLabel(detail.skillLevel)} />
                {detail.sportStats.length === 0 ? (
                  <DrawerKV k="Historial" v="Sin partidos registrados" />
                ) : (
                  detail.sportStats.map((s) => (
                    <DrawerKV
                      key={s.mode}
                      k={s.mode === "singles" ? "Singles" : "Dobles"}
                      v={`${Math.round((s.rating / 1000) * 10) / 10} · ${s.wins}W-${s.losses}L (${s.matches} pj.)`}
                    />
                  ))
                )}
                {detail.ranks.map((r) => (
                  <DrawerKV key={r.mode} k={`Ranking ${r.mode}`} v={`#${r.rank.toLocaleString("en-US")}`} />
                ))}
              </DrawerBlock>

              <DrawerBlock title="Actividad">
                <DrawerKV k="Último partido" v={fmtDateTime(detail.lastMatchAt)} />
                <DrawerKV k="Amigos" v={String(detail.friendsCount)} />
                {detail.clubMemberships.length === 0 ? (
                  <DrawerKV k="Membresías club" v="Ninguna activa" />
                ) : (
                  detail.clubMemberships.map((m, i) => (
                    <DrawerKV key={`${m.clubName}-${i}`} k={i === 0 ? "Membresías club" : " "} v={`${m.clubName} · ${fmtEnumLabel(m.status)}`} />
                  ))
                )}
              </DrawerBlock>

              <DrawerBlock title="Finanzas">
                <DrawerKV k="Gasto total" v={fmtCents(detail.spendLifetimeCents)} />
                <DrawerKV k="Pagos · mes" v={String(detail.txnCountMonth)} />
                <DrawerKV k="Gasto · mes (lista)" v={user.spend} />
                <DrawerKV k="Último pago" v={fmtDateTime(detail.lastTxnAt)} />
              </DrawerBlock>

              {detail.mpSubscription && (
                <DrawerBlock title="MATCHPOINT+">
                  <DrawerKV k="Estado sub" v={fmtEnumLabel(detail.mpSubscription.status)} />
                  <DrawerKV
                    k="Origen"
                    v={detail.mpSubscription.source === "comprobante" ? "Comprobante aprobado" : "Grant admin"}
                  />
                  <DrawerKV k="Último registro" v={fmtDateTime(detail.mpSubscription.createdAt)} />
                  {detail.mpSubscription.expiresAt && (
                    <DrawerKV k="Vence (sub)" v={fmtExpiry(detail.mpSubscription.expiresAt)} />
                  )}
                  {user.planExpiresAt && (
                    <DrawerKV k="Vence (plan)" v={fmtExpiry(user.planExpiresAt)} />
                  )}
                </DrawerBlock>
              )}

              {detail.roles.length > 0 && (
                <DrawerBlock title="Roles">
                  {detail.roles.map((r, i) => (
                    <DrawerKV
                      key={`${r.role}-${r.grantedAt}-${i}`}
                      k={fmtEnumLabel(r.role)}
                      v={`${r.clubName ?? "Global"} · ${fmtDateTime(r.grantedAt)}`}
                    />
                  ))}
                </DrawerBlock>
              )}

              <DrawerBlock title="Moderación">
                <DrawerKV k="Reportes abiertos" v={String(detail.openReportsCount)} />
                <DrawerKV k="Suspensiones hist." v={String(detail.suspensionCount)} />
                {reliabilityEnabled && (
                  <DrawerKV k="Fiabilidad" v={`${user.reliabilityScore} · ${user.reliabilityLabel}`} />
                )}
                {reliabilityEnabled && (
                  <DrawerKV k="Inasist. / cancel." v={`${user.noShows} · ${user.cancellations}`} />
                )}
              </DrawerBlock>

              {detail.recentAudit.length > 0 && (
                <DrawerBlock title="Auditoría reciente">
                  {detail.recentAudit.map((a, i) => (
                    <DrawerKV
                      key={`${a.at}-${i}`}
                      k={fmtDateTime(a.at)}
                      v={`${fmtEnumLabel(a.action)} · ${fmtEnumLabel(a.entity)}`}
                      mono
                    />
                  ))}
                </DrawerBlock>
              )}

              {profileHref && (
                <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
                  <Link
                    href={profileHref}
                    className="btn"
                    style={{ width: "100%", justifyContent: "center", background: "#fff", border: "1px solid var(--border)" }}
                  >
                    <Icon name="external-link" size={13} />
                    Ver perfil público
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "#fafafa", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {user.planTier === "free" ? (
            <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onGrant}>
              <Icon name="crown" size={13} color="#fff" />
              Activar MATCHPOINT+
            </button>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button type="button" className="btn btn-primary" style={{ justifyContent: "center" }} onClick={onGrant}>
                Extender MP+
              </button>
              <button type="button" className="btn" style={{ justifyContent: "center", background: "#fff", border: "1px solid var(--border)" }} onClick={onRevoke}>
                Revocar MP+
              </button>
            </div>
          )}
          {user.suspended ? (
            <button type="button" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={onReactivate}>
              Reactivar cuenta
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              style={{ width: "100%", justifyContent: "center", background: "#fff", border: "1px solid var(--border)", color: "#dc2626" }}
              onClick={onSuspend}
            >
              Suspender cuenta
            </button>
          )}
          <button
            type="button"
            className="btn"
            style={{ width: "100%", justifyContent: "center", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c" }}
            onClick={onDelete}
          >
            <Icon name="trash-2" size={13} color="#b91c1c" />
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerDStat({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
        {l}
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: "#fff", marginTop: 3 }}>{v}</div>
    </div>
  );
}

function DrawerBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
      <div className="label-mp" style={{ marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function DrawerKV({
  k,
  v,
  mono,
  onCopy,
}: {
  k: string;
  v: string;
  mono?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        padding: "7px 0",
        borderTop: "1px dashed var(--border)",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700, flexShrink: 0 }}>{k}</span>
      <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 6, minWidth: 0, textAlign: "right" }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            fontFamily: mono ? "ui-monospace, monospace" : "inherit",
            wordBreak: "break-all",
          }}
        >
          {v}
        </span>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copiar"
            style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", padding: 0, display: "inline-flex", flexShrink: 0 }}
          >
            <Icon name="copy" size={10} />
          </button>
        )}
      </span>
    </div>
  );
}

function IntegritySignalRow({ signal }: { signal: AdminIntegritySignal }) {
  const palette = {
    info: { bg: "#f4f4f5", border: "#e4e4e7", color: "#52525b", icon: "info" },
    warn: { bg: "#fffbeb", border: "#fde68a", color: "#92400e", icon: "alert-triangle" },
    critical: { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c", icon: "shield-alert" },
  }[signal.severity];
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: 10,
        borderRadius: 10,
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        marginBottom: 8,
      }}
    >
      <Icon name={palette.icon} size={14} color={palette.color} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: palette.color }}>{signal.label}</div>
        <div style={{ fontSize: 11, color: "#374151", marginTop: 3, lineHeight: 1.45 }}>{signal.detail}</div>
      </div>
    </div>
  );
}

function AdminProfileEditForm({
  userId,
  initial,
  onSaved,
}: {
  userId: string;
  initial: AdminUserEditableProfile;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const set = <K extends keyof AdminUserEditableProfile>(key: K, value: AdminUserEditableProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateUserProfileAdmin({
        userId,
        displayName: form.displayName.trim(),
        username: form.username.trim(),
        city: form.city.trim(),
        bio: form.bio?.trim() || null,
        phone: form.phone?.trim() || null,
        country: form.country?.trim() || null,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Perfil actualizado", sub: "Los cambios quedaron en audit_log." });
        setOpen(false);
        onSaved();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
      }
    });
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
      <button
        type="button"
        className="btn"
        style={{ width: "100%", justifyContent: "center", background: "#fff", border: "1px solid var(--border)", fontSize: 11 }}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="edit-3" size={12} />
        {open ? "Ocultar editor" : "Corregir datos del usuario"}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          <EditField label="Nombre" value={form.displayName} onChange={(v) => set("displayName", v)} />
          <EditField label="Usuario" value={form.username} onChange={(v) => set("username", v)} mono />
          <EditField label="Ciudad" value={form.city} onChange={(v) => set("city", v)} />
          <EditField label="Teléfono" value={form.phone ?? ""} onChange={(v) => set("phone", v || null)} />
          <EditField label="País" value={form.country ?? ""} onChange={(v) => set("country", v || null)} />
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="label-mp">Bio</span>
            <textarea
              value={form.bio ?? ""}
              onChange={(e) => set("bio", e.target.value || null)}
              rows={3}
              style={{ fontFamily: "inherit", fontSize: 12, padding: 8, borderRadius: 8, border: "1px solid var(--border)", resize: "vertical" }}
            />
          </label>
          <button
            type="button"
            className="btn btn-primary"
            style={{ justifyContent: "center" }}
            disabled={pending}
            onClick={handleSave}
          >
            {pending ? "Guardando…" : "Guardar correcciones"}
          </button>
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="label-mp">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
          fontSize: 12,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}
      />
    </label>
  );
}

function DeleteAccountDialog({
  user,
  onClose,
  onDeleted,
}: {
  user: UserRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const canSubmit = reason.trim().length >= 10;

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await deleteUserAccount({ userId: user.id, reason: reason.trim() });
      if (res.ok) {
        toast({ icon: "check", title: "Cuenta eliminada", sub: user.n });
        onDeleted();
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo eliminar", sub: res.error.message });
      }
    });
  };

  return (
    <ModalShell onClose={onClose}>
      <h3 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
        Eliminar cuenta de {user.n}
      </h3>
      <p style={{ margin: "8px 0 12px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}>
        Esta acción es irreversible: borra el acceso de autenticación y el perfil en cascada. Los registros
        financieros pueden conservarse por compliance. Usa suspensión si solo quieres bloquear el acceso.
      </p>
      <FieldLabel>Motivo de la eliminación *</FieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Explica por qué se elimina esta cuenta (mínimo 10 caracteres)"
        style={textareaStyle}
      />
      <DialogFooter>
        <SecondaryBtn onClick={onClose} disabled={pending}>
          Cancelar
        </SecondaryBtn>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || !canSubmit}
          className="btn"
          style={{ background: "#dc2626", color: "#fff", opacity: pending || !canSubmit ? 0.6 : 1 }}
        >
          <Icon name="trash-2" size={13} color="#fff" />
          {pending ? "Eliminando…" : "Eliminar cuenta"}
        </button>
      </DialogFooter>
    </ModalShell>
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
