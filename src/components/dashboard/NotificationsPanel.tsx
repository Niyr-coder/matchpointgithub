"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { useToast } from "./ToastProvider";
import { useRealtimeRefresh } from "./useRealtimeRefresh";
import { getBrowserClient } from "@/lib/db/client.browser";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/server/actions/notifications";

type Props = {
  role: RoleKey;
  onClose: () => void;
};

type RealNotif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace instantes";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-EC");
}

function groupKey(iso: string): string {
  const created = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return "Esta semana";
  return "Anteriores";
}

function iconForKind(kind: string): string {
  if (kind === "welcome_owner") return "crown";
  if (kind.startsWith("role_request")) return "shield";
  if (kind.startsWith("club_application")) return "building-2";
  if (kind.startsWith("reservation")) return "calendar-clock";
  if (kind.startsWith("ticket")) return "life-buoy";
  if (kind.startsWith("friend_request")) return "user-plus";
  return "bell";
}

function hrefForKind(role: RoleKey, kind: string, payload: Record<string, unknown>): string | null {
  // Construye URL con `?focus=<id>` cuando aplique; las vistas pueden
  // expandir/abrir el item al detectar el parámetro.
  const appId =
    typeof payload.applicationId === "string" ? payload.applicationId : null;
  const reqId =
    typeof payload.requestId === "string" ? payload.requestId : null;
  const tktId = typeof payload.ticketId === "string" ? payload.ticketId : null;
  const resId =
    typeof payload.reservationId === "string" ? payload.reservationId : null;
  const friendId = typeof payload.friendUserId === "string" ? payload.friendUserId : null;

  if (kind.startsWith("club_application")) {
    if (role === "admin") {
      return appId
        ? `/dashboard/admin/admin-clubs/${appId}`
        : "/dashboard/admin/admin-clubs";
    }
    return "/dashboard/user/solicitar-club";
  }
  if (kind.startsWith("role_request")) {
    return role === "admin"
      ? reqId
        ? `/dashboard/admin/admin-roles?focus=${reqId}`
        : "/dashboard/admin/admin-roles"
      : null;
  }
  if (kind.startsWith("ticket")) {
    return role === "admin"
      ? tktId
        ? `/dashboard/admin/admin-support?focus=${tktId}`
        : "/dashboard/admin/admin-support"
      : null;
  }
  if (kind.startsWith("reservation")) {
    return resId
      ? `/dashboard/user/team?focus=${resId}`
      : `/dashboard/${role}`;
  }
  if (kind.startsWith("friend_request")) {
    return friendId
      ? `/dashboard/user/amigos?focus=${friendId}`
      : "/dashboard/user/amigos";
  }
  if (kind === "welcome_owner") {
    return "/dashboard/owner";
  }
  return null;
}

function colorForKind(kind: string): string {
  if (kind === "welcome_owner") return "#10b981";
  if (kind.includes("rejected") || kind.includes("cancelled")) return "#dc2626";
  if (kind.includes("approved")) return "#10b981";
  if (kind.startsWith("reservation")) return "var(--primary)";
  if (kind.startsWith("ticket")) return "#fbbf24";
  if (kind.startsWith("friend")) return "#7c3aed";
  if (kind.startsWith("club_application")) return "#0ea5e9";
  return "#0a0a0a";
}

export function NotificationsPanel({ role, onClose }: Props) {
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [items, setItems] = useState<RealNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

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
    setLoading(false);
  }, [role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime sobre notifications del usuario actual.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`mp-notif-${uid}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
          () => refresh(),
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
  }, [refresh]);

  // Mantener consistencia con otras pantallas — refresca al haber cambios.
  useRealtimeRefresh([], { enabled: false });

  const isUnread = (n: RealNotif) => !n.readAt;
  const list = tab === "unread" ? items.filter(isUnread) : items;
  const unreadCount = items.filter(isUnread).length;
  const groups = list.reduce<Record<string, RealNotif[]>>((acc, n) => {
    const g = groupKey(n.createdAt);
    (acc[g] = acc[g] || []).push(n);
    return acc;
  }, {});

  const markOne = (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    startTransition(async () => {
      await markNotificationRead({ id });
    });
  };

  const markAll = () => {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    startTransition(async () => {
      const res = await markAllNotificationsRead({ role });
      if (res.ok) toast({ icon: "check", title: "Notificaciones marcadas como leídas" });
    });
  };

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    startTransition(async () => {
      await dismissNotification({ id });
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 10px)",
        right: 0,
        width: 400,
        maxHeight: 560,
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        zIndex: 50,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -7,
          right: 14,
          width: 14,
          height: 14,
          background: "#fff",
          borderTop: "1px solid var(--border)",
          borderLeft: "1px solid var(--border)",
          transform: "rotate(45deg)",
        }}
      />

      <div
        style={{
          padding: "14px 16px 6px",
          borderBottom: "1px solid var(--border)",
          position: "relative",
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label-mp">Bandeja</div>
            <div
              className="font-heading"
              style={{
                fontSize: 17,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Notificaciones<span style={{ color: "var(--primary)" }}>.</span>
            </div>
          </div>
          <button
            onClick={markAll}
            disabled={unreadCount === 0}
            style={{
              background: "transparent",
              border: 0,
              fontSize: 10,
              fontWeight: 900,
              color: unreadCount === 0 ? "var(--muted-fg)" : "var(--primary)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              cursor: unreadCount === 0 ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Marcar leídas
          </button>
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 10 }}>
          <TabBtn label={`Todas · ${items.length}`} on={tab === "all"} onClick={() => setTab("all")} />
          <TabBtn
            label="Sin leer"
            badge={unreadCount > 0 ? unreadCount : undefined}
            on={tab === "unread"}
            onClick={() => setTab("unread")}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted-fg)", fontSize: 11 }}>
            Cargando…
          </div>
        ) : list.length === 0 ? (
          <div
            style={{
              margin: 16,
              padding: "32px 20px",
              textAlign: "center",
              color: "var(--muted-fg)",
              border: "1px dashed var(--border)",
              borderRadius: 12,
              background: "#fafafa",
            }}
          >
            <Icon name="bell-off" size={22} color="var(--muted-fg)" />
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800 }}>Sin notificaciones</div>
            <div style={{ fontSize: 10.5, marginTop: 2 }}>Cuando algo suceda, lo verás aquí.</div>
          </div>
        ) : (
          Object.entries(groups).map(([g, group]) => (
            <div key={g}>
              <div
                style={{
                  padding: "10px 16px 4px",
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                  background: "#fafafa",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {g}
              </div>
              {group.map((n) => {
                const unread = isUnread(n);
                return (
                  <div
                    key={n.id}
                    style={{
                      padding: "12px 16px",
                      display: "flex",
                      gap: 11,
                      borderBottom: "1px solid var(--border)",
                      position: "relative",
                      background: unread ? "rgba(16,185,129,0.04)" : "#fff",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      if (unread) markOne(n.id);
                      const href = hrefForKind(role, n.kind, n.payload);
                      if (href) {
                        onClose();
                        router.push(href);
                      }
                    }}
                  >
                    {unread && (
                      <div
                        style={{
                          position: "absolute",
                          top: 14,
                          left: 6,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--primary)",
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: colorForKind(n.kind),
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name={iconForKind(n.kind)} size={16} color="#fff" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, lineHeight: 1.35, color: "#0a0a0a", fontWeight: 700 }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{n.body}</div>
                      )}
                      <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4 }}>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss(n.id);
                      }}
                      title="Eliminar"
                      style={{
                        background: "transparent",
                        border: 0,
                        color: "var(--muted-fg)",
                        cursor: "pointer",
                        padding: 2,
                        alignSelf: "flex-start",
                      }}
                    >
                      <Icon name="x" size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--border)",
          background: "#fafafa",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          style={{
            background: "transparent",
            border: 0,
            fontSize: 10.5,
            fontWeight: 900,
            color: "var(--muted-fg)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            gap: 5,
            alignItems: "center",
          }}
        >
          <Icon name="settings-2" size={12} />
          Preferencias
        </button>
        <button
          onClick={onClose}
          style={{
            background: "#0a0a0a",
            color: "#fff",
            border: 0,
            fontSize: 10.5,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "6px 12px",
            borderRadius: 9999,
            display: "inline-flex",
            gap: 5,
            alignItems: "center",
          }}
        >
          Cerrar
          <Icon name="arrow-right" size={12} />
        </button>
      </div>
    </div>
  );
}

function TabBtn({
  label,
  on,
  onClick,
  badge,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 11px",
        borderRadius: 9999,
        fontSize: 10.5,
        fontWeight: 900,
        fontFamily: "inherit",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        background: on ? "#0a0a0a" : "transparent",
        color: on ? "#fff" : "var(--muted-fg)",
        border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"),
      }}
    >
      {label}
      {badge !== undefined && (
        <span
          style={{
            padding: "1px 5px",
            borderRadius: 9999,
            background: "var(--primary)",
            color: "#fff",
            fontSize: 9,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
