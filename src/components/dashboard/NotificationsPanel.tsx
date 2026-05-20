"use client";
import { useRouter } from "next/navigation";
import type { RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";

export type RealNotif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

type Props = {
  role: RoleKey;
  items: RealNotif[];
  onClose: () => void;
  onMarkOne: (id: string) => void;
  onMarkAll: () => void;
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
  const now = new Date();
  const diffDays = Math.floor(
    (now.setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000,
  );
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
  if (kind === "match_cancelled") return "x-circle";
  if (kind === "match_rescheduled") return "calendar-clock";
  if (kind.startsWith("match_seek")) return "swords";
  if (kind === "team_member_kicked") return "user-x";
  if (kind.startsWith("team_")) return "users";
  return "bell";
}

function hrefForKind(role: RoleKey, kind: string, payload: Record<string, unknown>): string | null {
  const appId = typeof payload.applicationId === "string" ? payload.applicationId : null;
  const reqId = typeof payload.requestId === "string" ? payload.requestId : null;
  const tktId = typeof payload.ticketId === "string" ? payload.ticketId : null;
  const resId = typeof payload.reservationId === "string" ? payload.reservationId : null;
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
  if (kind === "team_roster_cap_reached" || kind === "team_member_kicked") {
    return "/dashboard/user/team";
  }
  if (kind === "match_seek_applied") {
    const seekId = typeof payload.seek_id === "string" ? payload.seek_id : null;
    return seekId
      ? `/dashboard/user/busco-partido?focus=${seekId}`
      : "/dashboard/user/busco-partido";
  }
  if (kind === "match_seek_accepted" || kind === "match_cancelled" || kind === "match_rescheduled") {
    const convId = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
    return convId
      ? `/dashboard/user/chat?conv=${convId}`
      : "/dashboard/user/busco-partido";
  }
  return null;
}

function colorForKind(kind: string): string {
  if (kind === "welcome_owner") return "#10b981";
  if (kind.includes("rejected") || kind.includes("cancelled") || kind.includes("kicked")) return "#dc2626";
  if (kind.includes("approved")) return "#10b981";
  if (kind.startsWith("reservation")) return "var(--primary)";
  if (kind.startsWith("match")) return "var(--primary)";
  if (kind.startsWith("ticket")) return "#fbbf24";
  if (kind.startsWith("friend")) return "#7c3aed";
  if (kind.startsWith("club_application")) return "#0ea5e9";
  if (kind === "team_roster_cap_reached") return "#facc15";
  if (kind.startsWith("team_")) return "#7c3aed";
  return "#0a0a0a";
}

export function NotificationsPanel({
  role,
  items,
  onClose,
  onMarkOne,
  onMarkAll,
}: Props) {
  const router = useRouter();
  const isUnread = (n: RealNotif) => !n.readAt;
  const unreadCount = items.filter(isUnread).length;
  const groups = items.reduce<Record<string, RealNotif[]>>((acc, n) => {
    const g = groupKey(n.createdAt);
    (acc[g] = acc[g] || []).push(n);
    return acc;
  }, {});

  return (
    <>
      {/* Backdrop solo mobile: tap fuera del sheet para cerrar. */}
      <div
        className="mp-notif-backdrop md:hidden fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="mp-notif-panel"
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: 14,
          boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        role="dialog"
        aria-label="Notificaciones"
      >
        {/* Arrow solo desktop — apunta al bell trigger. */}
        <div
          className="hidden md:block"
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
          padding: "14px 16px 12px",
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
            onClick={onMarkAll}
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
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {items.length === 0 ? (
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
                      if (unread) onMarkOne(n.id);
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
    </>
  );
}
