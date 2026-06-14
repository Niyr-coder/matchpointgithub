"use client";
import { useEffect, useRef, useState, useCallback, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { NotificationsPanel, type RealNotif } from "./NotificationsPanel";
import { useToast } from "./ToastProvider";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/server/actions/notifications";
import { getBrowserClient } from "@/lib/db/client.browser";

type CTA = { l: string; i: string; ev: string | null };

const CTA_BY_ROLE: Record<RoleKey, CTA> = {
  user: { l: "Reservar", i: "plus", ev: "mp-open-reservar" },
  admin: { l: "Crear acción", i: "shield", ev: null },
  owner: { l: "Crear evento", i: "plus", ev: "mp-open-crear-evento" },
  manager: { l: "Nueva reserva", i: "calendar-plus", ev: "mp-open-reservar" },
  partner: { l: "Nuevo torneo", i: "trophy", ev: "mp-open-crear-evento" },
  coach: { l: "Nueva clase", i: "graduation-cap", ev: null },
  employee: { l: "Check-in rápido", i: "user-check", ev: null },
};

const SEARCH_PLACEHOLDER: Partial<Record<RoleKey, string>> = {
  admin: "Buscar usuarios, clubes, transacciones…",
  employee: "Buscar reserva, código QR…",
};

type SearchTarget = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  section: string;
};

const SEARCH_TARGETS_BY_ROLE: Partial<Record<RoleKey, SearchTarget[]>> = {
  user: [
    { id: "jugadores", label: "Jugadores", hint: "Nombre o @username", icon: "users", section: "amigos" },
    { id: "clubes", label: "Canchas y clubes", hint: "Nombre o ciudad", icon: "building-2", section: "clubes" },
    { id: "eventos", label: "Torneos y ligas", hint: "Nombre del evento", icon: "trophy", section: "eventos" },
  ],
  admin: [
    { id: "usuarios", label: "Usuarios", hint: "Nombre, email o username", icon: "users", section: "admin-users" },
    { id: "clubes", label: "Clubes", hint: "Nombre o ciudad", icon: "building-2", section: "admin-clubs" },
  ],
  employee: [
    { id: "checkin", label: "Check-in", hint: "Código de reserva o QR", icon: "user-check", section: "e-checkin" },
  ],
};

function TopBarSearch({ role }: { role: RoleKey }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const targets = SEARCH_TARGETS_BY_ROLE[role] ?? [];

  const navigate = useCallback(
    (target: SearchTarget) => {
      const q = query.trim();
      const path = `/dashboard/${role}/${target.section}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
      router.push(path);
      setOpen(false);
    },
    [query, role, router],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (targets.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ flex: 1, position: "relative", maxWidth: 320 }}>
      <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)", pointerEvents: "none" }}>
        <Icon name="search" size={14} />
      </span>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            navigate(targets[0]!);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={SEARCH_PLACEHOLDER[role] || "Buscar jugadores, canchas, torneos…"}
        aria-label="Buscar en MATCHPOINT"
        aria-expanded={open}
        aria-controls="topbar-search-menu"
        style={{
          width: "100%",
          padding: "9px 12px 9px 34px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontFamily: "inherit",
          fontSize: 13,
          outline: "none",
        }}
      />
      {open && (
        <div
          id="topbar-search-menu"
          role="listbox"
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            padding: 6,
            zIndex: 30,
            boxShadow: "0 12px 28px rgba(0,0,0,0.1)",
          }}
        >
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              role="option"
              onClick={() => navigate(target)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                border: 0,
                borderRadius: 8,
                background: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <Icon name={target.icon} size={14} color="var(--primary)" style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: "#0a0a0a" }}>
                  {target.label}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                  {query.trim()
                    ? `Buscar “${query.trim()}” en ${target.label.toLowerCase()}`
                    : target.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const NOTIFICATION_RING_MS = 560;

const USER_QUICK_ACTIONS = [
  {
    icon: "calendar-plus",
    label: "Reservar cancha",
    hint: "Elige club, cancha y horario",
    event: "mp-open-reservar",
  },
  {
    icon: "users",
    label: "Crear partido",
    hint: "Arma un match con rivales",
    event: "mp-open-crear-match",
  },
  {
    icon: "swords",
    label: "Buscar rival",
    hint: "Publica o postúlate en el tablón",
    href: "/dashboard/user/busco-partido",
  },
  {
    icon: "user-plus",
    label: "Invitar amigo",
    hint: "Comparte tu link de invitación",
    href: "/dashboard/user/amigos",
  },
] as const;

const ADMIN_QUICK_ACTIONS = [
  {
    icon: "shield",
    label: "Revisar moderación",
    hint: "Reportes y sanciones pendientes",
    href: "/dashboard/admin/admin-mod",
  },
  {
    icon: "users",
    label: "Gestionar usuarios",
    hint: "Directorio global y perfiles",
    href: "/dashboard/admin/admin-users",
  },
  {
    icon: "credit-card",
    label: "Pagos y payouts",
    hint: "Comprobantes y transferencias",
    href: "/dashboard/admin/admin-pagos",
  },
  {
    icon: "megaphone",
    label: "Broadcast",
    hint: "Mensajes masivos a la plataforma",
    href: "/dashboard/admin/admin-broadcast",
  },
  {
    icon: "scroll-text",
    label: "Auditoría",
    hint: "Log de cambios del sistema",
    href: "/dashboard/admin/admin-audit",
  },
] as const;

function QuickActionSheet({
  open,
  onClose,
  title,
  actions,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  actions: readonly {
    icon: string;
    label: string;
    hint: string;
    href?: string;
    event?: string;
  }[];
  className?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: "0 16px 16px",
      }}
      className={`md:items-center md:p-6${className ? ` ${className}` : ""}`}
      onClick={onClose}
    >
      <div
        className="card md:max-w-md"
        style={{
          width: "100%",
          borderRadius: "18px 18px 0 0",
          padding: 0,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h3
            className="font-heading"
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
            }}
          >
            {title}<span className="dot">.</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              border: "1px solid var(--border)",
              background: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "10px 12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                if (action.event) {
                  window.dispatchEvent(new Event(action.event));
                } else if (action.href) {
                  router.push(action.href);
                }
                onClose();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 14px",
                border: "1px solid var(--border)",
                borderRadius: 12,
                background: "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "rgba(16,185,129,0.1)",
                  color: "var(--primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={action.icon} size={16} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: "#0a0a0a" }}>
                  {action.label}
                </span>
                <span style={{ display: "block", fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                  {action.hint}
                </span>
              </span>
              <Icon name="chevron-right" size={14} color="var(--muted-fg)" style={{ marginLeft: "auto", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function UserQuickActionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <QuickActionSheet
      open={open}
      onClose={onClose}
      title="¿Qué quieres hacer?"
      actions={USER_QUICK_ACTIONS}
      className="md:hidden"
    />
  );
}

function AdminQuickActionSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <QuickActionSheet
      open={open}
      onClose={onClose}
      title="Crear acción"
      actions={ADMIN_QUICK_ACTIONS}
    />
  );
}

export function TopBar({
  role,
  contextLabel,
}: {
  role: RoleKey;
  contextLabel?: string | null;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  // Notifs viven en TopBar para que el panel se renderice instantáneamente
  // (sin "Cargando…") al abrir. El listener realtime las refresca aquí.
  const [items, setItems] = useState<RealNotif[]>([]);
  const [ringing, setRinging] = useState(false);
  const [badgePulseKey, setBadgePulseKey] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cta = CTA_BY_ROLE[role];
  const showUserQuickMenu = role === "user";
  const showAdminQuickMenu = role === "admin";
  const toast = useToast();
  const [, startTransition] = useTransition();

  const unreadN = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  const triggerRing = useCallback(() => {
    setRinging(true);
    setTimeout(() => setRinging(false), NOTIFICATION_RING_MS);
  }, []);

  const refresh = useCallback(async () => {
    const res = await listMyNotifications({ role, limit: 30 });
    if (res.ok) {
      setItems(
        (res.data as RealNotif[]).map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body ?? null,
          payload: n.payload ?? {},
          readAt: n.readAt ?? null,
          createdAt: n.createdAt,
        })),
      );
    }
  }, [role]);

  // Fetch inicial — corre apenas se monta el TopBar, así el panel ya tiene
  // datos al primer click.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  useEffect(() => {
    prevUnreadRef.current = null;
  }, [role]);

  // Realtime — un canal por rol activo. Supabase solo permite un filtro simple
  // aquí, así que filtramos recipient_role en el handler antes de refetchear.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`mp:user:${uid}:role:${role}:notifications`)
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
          (payload: { new?: { recipient_role?: string } }) => {
            if (payload.new?.recipient_role === role) {
              refresh();
            }
          },
        )
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    })();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [refresh, role]);

  // Dispara bell wiggle + badge pop cuando el unread crece via realtime.
  // No dispara en el primer set (prev === null) para no sonar al entrar.
  useEffect(() => {
    const prev = prevUnreadRef.current;
    if (prev != null && unreadN > prev) {
      triggerRing();
      setBadgePulseKey((k) => k + 1);
    }
    prevUnreadRef.current = unreadN;
  }, [unreadN, triggerRing]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  const onMarkAll = useCallback((opts?: { silent?: boolean }) => {
    setItems((prev) => {
      const hasUnread = prev.some((n) => !n.readAt);
      if (!hasUnread) return prev;
      return prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() }));
    });
    const myRole = role;
    startTransition(async () => {
      const res = await markAllNotificationsRead({ role: myRole });
      if (res.ok && !opts?.silent) {
        toast({ icon: "check", title: "Notificaciones marcadas como leídas" });
      }
    });
  }, [role, toast]);

  const onMarkOne = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    startTransition(async () => {
      await markNotificationRead({ id });
    });
  }, []);

  const handleBellClick = () => {
    const willOpen = !notifOpen;
    setNotifOpen(willOpen);
    if (willOpen) {
      triggerRing();
      onMarkAll({ silent: true });
    }
  };

  const handleCta = () => {
    if (showAdminQuickMenu) {
      setQuickActionOpen(true);
      return;
    }
    if (cta.ev) window.dispatchEvent(new Event(cta.ev));
    else toast({ icon: cta.i, title: cta.l + " — próximamente" });
  };

  const handleMobilePrimary = () => {
    if (showUserQuickMenu || showAdminQuickMenu) setQuickActionOpen(true);
    else handleCta();
  };

  return (
    <div
      className="px-4 md:px-7"
      style={{
        height: 60,
        borderBottom: "1px solid var(--border)",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Logo solo en mobile (en desktop ya vive en el sidebar sticky). */}
      <Link
        href={`/dashboard/${role}`}
        className="md:hidden flex items-center gap-1.5"
        aria-label="Ir al inicio de MATCHPOINT"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <span className="dot" style={{ fontSize: 16 }}>●</span>
        <span
          className="font-heading"
          style={{ fontWeight: 900, letterSpacing: "-0.02em", fontSize: 15 }}
        >
          MATCHPOINT
        </span>
      </Link>
      {/* Search + admin context: solo desktop. */}
      <div className="hidden md:flex items-center" style={{ gap: 12, flex: 1, maxWidth: 640 }}>
        <TopBarSearch role={role} />
        {contextLabel ? (
          <span
            title={contextLabel}
            style={{
              maxWidth: 180,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "5px 10px",
              borderRadius: 9999,
              background: "var(--muted)",
              color: "var(--muted-fg)",
              fontSize: 10.5,
              fontWeight: 800,
            }}
          >
            {contextLabel.split(" · ")[0]}
          </span>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* Desktop: CTA con label. Mobile: solo ícono compacto.
           El !important en hidden/inline-flex es necesario porque .btn de
           globals.css define display:inline-flex y se carga después de las
           utilities de Tailwind — sin "!" gana .btn y se ven los dos. */}
        <button
          className="btn btn-primary !hidden md:!inline-flex"
          style={{ padding: "8px 16px" }}
          onClick={handleCta}
        >
          <Icon name={cta.i} size={13} />
          {cta.l}
        </button>
        <button
          className="md:hidden inline-flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: "var(--primary)",
            color: "#fff",
            border: 0,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          onClick={handleMobilePrimary}
          aria-label={showUserQuickMenu || showAdminQuickMenu ? "Acciones rápidas" : cta.l}
          aria-expanded={showUserQuickMenu || showAdminQuickMenu ? quickActionOpen : undefined}
        >
          <Icon name={cta.i} size={15} />
        </button>
        {showUserQuickMenu && (
          <UserQuickActionSheet open={quickActionOpen} onClose={() => setQuickActionOpen(false)} />
        )}
        {showAdminQuickMenu && (
          <AdminQuickActionSheet open={quickActionOpen} onClose={() => setQuickActionOpen(false)} />
        )}
        <div ref={ref} style={{ position: "relative" }}>
          <button
            className="mp-bell-btn"
            onClick={handleBellClick}
            style={{
              width: 36,
              height: 36,
              border: "1px solid " + (notifOpen ? "#0a0a0a" : "var(--border)"),
              borderRadius: 9999,
              background: notifOpen ? "#0a0a0a" : "#fff",
              color: notifOpen ? "#fff" : "#0a0a0a",
              cursor: "pointer",
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              className="mp-bell-icon"
              data-ringing={ringing ? "true" : "false"}
            >
              <Icon name="bell" size={15} />
            </span>
            {unreadN > 0 && (
            <span
              key={badgePulseKey}
              className="mp-notif-badge"
              style={{
                position: "absolute",
                top: 5,
                right: 7,
                minWidth: 14,
                height: 14,
                padding: "0 3px",
                borderRadius: 9999,
                background: "var(--primary)",
                color: "#fff",
                border: "1.5px solid " + (notifOpen ? "#0a0a0a" : "#fff"),
                fontFamily: "Plus Jakarta Sans",
                fontWeight: 900,
                fontSize: 8.5,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {unreadN > 99 ? "+99" : unreadN}
            </span>
            )}
          </button>
          {notifOpen && (
            <NotificationsPanel
              role={role}
              items={items}
              onClose={() => setNotifOpen(false)}
              onMarkOne={onMarkOne}
            />
          )}
        </div>
      </div>
    </div>
  );
}
