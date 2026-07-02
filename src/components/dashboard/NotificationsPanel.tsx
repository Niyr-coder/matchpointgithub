"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { formatNotificationDisplay } from "@/lib/notifications/display";
import { acceptMatchChallenge, declineMatchChallenge } from "@/server/actions/matches";
import { useToast } from "./ToastProvider";

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
  if (kind === "mp_plus_activated" || kind === "mp_plus_revoked") return "crown";
  if (kind === "payment_captured" || kind === "refund_completed") return "wallet";
  if (kind === "refund_requested") return "rotate-ccw";
  if (kind === "broadcast") return "megaphone";
  if (kind === "report_resolved") return "shield-check";
  if (kind.startsWith("role_request")) return "shield";
  if (kind.startsWith("club_application")) return "building-2";
  if (kind.startsWith("reservation")) return "calendar-clock";
  if (kind.startsWith("ticket")) return "life-buoy";
  if (kind.startsWith("friend_request")) return "user-plus";
  if (kind === "match_cancelled") return "x-circle";
  if (kind === "tournament_match_ready") return "swords";
  if (kind === "match_challenge_received" || kind === "match_challenge_accepted") return "swords";
  if (kind === "match_rescheduled") return "calendar-clock";
  if (kind.startsWith("match_seek")) return "swords";
  if (kind === "team_member_kicked") return "user-x";
  if (kind.startsWith("team_")) return "users";
  if (kind.startsWith("quedada")) return "party-popper";
  if (kind.startsWith("club_membership")) return "star";
  if (kind.startsWith("club_staff")) return "user-cog";
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
  if (kind === "ticket_status_changed") {
    return "/dashboard/user/soporte";
  }
  if (kind.startsWith("ticket")) {
    return role === "admin"
      ? tktId
        ? `/dashboard/admin/admin-support?focus=${tktId}`
        : "/dashboard/admin/admin-support"
      : null;
  }
  if (kind.startsWith("reservation")) {
    if (kind === "club_reservation_new") {
      return role === "manager"
        ? "/dashboard/manager/club-reservas"
        : "/dashboard/owner/club-reservas";
    }
    return resId
      ? `/dashboard/user/mis-reservas?focus=${resId}`
      : "/dashboard/user/mis-reservas";
  }
  if (kind.startsWith("tournament") || kind.startsWith("registration")) {
    const tId = typeof payload.tournament_id === "string" ? payload.tournament_id : null;
    const tSlug = typeof payload.tournament_slug === "string" ? payload.tournament_slug : null;
    if (kind === "tournament_match_ready") {
      // Directo a la vista del jugador dentro del torneo (llave + sus partidos).
      return tId ? `/dashboard/${role}/torneo/${tId}` : `/dashboard/${role}`;
    }
    if (kind === "tournament_published" || kind === "tournament_registration_new") {
      const base = role === "partner" ? "/dashboard/partner" : `/dashboard/${role}`;
      const section = kind === "tournament_registration_new" ? "p-inscritos" : "p-torneos";
      return tId ? `${base}/${section}?focus=${tId}` : `${base}/${section}`;
    }
    if (tSlug || tId) return `/eventos/${tSlug ?? tId}`;
    return `/dashboard/${role}`;
  }
  if (kind === "payout_paid") {
    return role === "partner" ? "/dashboard/partner/p-finanzas" : "/dashboard/owner/club-finanzas";
  }
  if (kind === "refund_requested") {
    const tId = typeof payload.tournament_id === "string" ? payload.tournament_id : null;
    if (role === "partner" && tId) return `/dashboard/partner/torneo/${tId}`;
    return `/dashboard/${role}`;
  }
  if (kind === "club_featuring_activated" || kind === "club_featuring_expiring_soon") {
    return "/dashboard/owner/club-marketing";
  }
  if (kind === "payment_proof_rejected") {
    const txId = typeof payload.transaction_id === "string" ? payload.transaction_id : null;
    return txId ? `/pagos/${txId}` : "/dashboard/user/mi-plan";
  }
  if (kind === "plan_expiring_soon") {
    return "/dashboard/user/mi-plan";
  }
  if (kind.startsWith("event_")) {
    const eventId = typeof payload.event_id === "string" ? payload.event_id : null;
    const eventSlug = typeof payload.event_slug === "string" ? payload.event_slug : null;
    return eventId ? `/dashboard/eventos/${eventSlug ?? eventId}` : "/dashboard/user";
  }
  if (kind.startsWith("role_assigned") || kind.startsWith("role_revoked")) {
    const assignedRole = typeof payload.role === "string" ? payload.role : null;
    return assignedRole ? `/dashboard/${assignedRole}` : `/dashboard/${role}`;
  }
  if (kind === "match_no_show_reported" || kind === "match_result_reported") {
    const convId = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
    if (convId) return `/dashboard/user/chat?conv=${convId}`;
    const matchId = typeof payload.match_id === "string" ? payload.match_id : null;
    return matchId ? `/dashboard/user/partidos?focus=${matchId}` : "/dashboard/user/partidos";
  }
  if (kind.startsWith("friend_request")) {
    return friendId
      ? `/dashboard/user/amigos?focus=${friendId}`
      : "/dashboard/user/amigos";
  }
  if (kind === "welcome_owner") {
    return "/dashboard/owner";
  }
  if (kind === "mp_plus_activated" || kind === "mp_plus_revoked") {
    return "/dashboard/user/mi-plan";
  }
  if (kind === "payment_captured" || kind === "refund_completed") {
    const txId = typeof payload.transaction_id === "string" ? payload.transaction_id : null;
    return txId ? `/pagos/${txId}` : "/dashboard/user/mi-plan";
  }
  if (kind === "report_resolved") {
    return "/dashboard/user/soporte";
  }
  if (kind === "broadcast") {
    const link = typeof payload.link === "string" ? payload.link : null;
    return link;
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
  if (kind === "match_seek_partner_invited") {
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
  if (kind.startsWith("quedada")) {
    const qId = typeof payload.quedadaId === "string" ? payload.quedadaId : typeof payload.quedada_id === "string" ? payload.quedada_id : null;
    return qId ? `/dashboard/${role}/quedada/${qId}` : `/dashboard/${role}/quedadas`;
  }
  if (kind === "club_membership_requested") {
    // Lo recibe owner/manager → su gestión de membresías (link según rol activo).
    return `/dashboard/${role}/club-membresias`;
  }
  if (kind.startsWith("club_membership")) {
    const convId = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
    if (convId) return `/dashboard/user/chat?conv=${convId}`;
    return "/dashboard/user/membresias";
  }
  if (kind === "giveaway_started" || kind === "giveaway_drawn" || kind === "giveaway_won") {
    const giveawayId = typeof payload.giveaway_id === "string" ? payload.giveaway_id : null;
    if (giveawayId) return `/dashboard/clubes/giveaways/${giveawayId}`;
  }
  if (kind === "club_announcement_new" || kind === "club_membership_chat_welcome") {
    const convId = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
    return convId ? `/dashboard/user/chat?conv=${convId}` : "/dashboard/user/chat";
  }
  if (kind.startsWith("club_staff")) {
    // Lo recibe el staff (manager/coach/employee) → su dashboard del club.
    return `/dashboard/${role}`;
  }
  return null;
}

function colorForKind(kind: string): string {
  if (kind === "welcome_owner") return "#10b981";
  if (kind === "broadcast") return "var(--primary)";
  if (kind === "payment_captured" || kind === "mp_plus_activated") return "#10b981";
  if (kind === "refund_completed") return "#0ea5e9";
  if (kind === "refund_requested") return "#f59e0b";
  if (kind === "mp_plus_revoked") return "#dc2626";
  if (kind === "report_resolved") return "#7c3aed";
  if (kind.includes("rejected") || kind.includes("cancelled") || kind.includes("kicked")) return "#dc2626";
  if (kind.includes("approved")) return "#10b981";
  if (kind.startsWith("reservation")) return "var(--primary)";
  if (kind === "tournament_match_ready") return "#10b981";
  if (kind.startsWith("match")) return "var(--primary)";
  if (kind.startsWith("ticket")) return "#fbbf24";
  if (kind.startsWith("friend")) return "#7c3aed";
  if (kind.startsWith("club_application")) return "#0ea5e9";
  if (kind === "team_roster_cap_reached") return "#facc15";
  if (kind.startsWith("team_")) return "#7c3aed";
  if (kind.startsWith("quedada")) return "#f97316";
  if (kind.startsWith("club_membership")) return "#d4af37";
  if (kind === "club_staff_removed") return "#dc2626";
  if (kind.startsWith("club_staff")) return "#0891b2";
  return "#0a0a0a";
}

export function NotificationsPanel({
  role,
  items,
  onClose,
  onMarkOne,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [challengePendingId, setChallengePendingId] = useState<string | null>(null);
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
          {unreadCount > 0 ? (
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "var(--muted-fg)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              {unreadCount} sin leer
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted-fg)" }}>Al día</span>
          )}
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
                const display = formatNotificationDisplay(n);
                const href = hrefForKind(role, n.kind, n.payload);
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
                      cursor: href ? "pointer" : "default",
                    }}
                    onClick={() => {
                      if (unread) onMarkOne(n.id);
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
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {display.kindLabel ? (
                            <div
                              style={{
                                fontSize: 8.5,
                                fontWeight: 900,
                                letterSpacing: "0.12em",
                                textTransform: "uppercase",
                                color: colorForKind(n.kind),
                                marginBottom: 3,
                              }}
                            >
                              {display.kindLabel}
                            </div>
                          ) : null}
                          <div style={{ fontSize: 12, lineHeight: 1.35, color: "#0a0a0a", fontWeight: 800 }}>
                            {display.title}
                          </div>
                        </div>
                        {href ? (
                          <Icon name="chevron-right" size={14} color="var(--muted-fg)" style={{ flexShrink: 0, marginTop: 2 }} />
                        ) : null}
                      </div>
                      {display.subtitle ? (
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--fg)",
                            marginTop: 4,
                            fontWeight: 600,
                            lineHeight: 1.35,
                          }}
                        >
                          {display.subtitle}
                        </div>
                      ) : null}
                      {display.detail ? (
                        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3, lineHeight: 1.4 }}>
                          {display.detail}
                        </div>
                      ) : null}
                      {display.chips.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                          {display.chips.map((chip) => (
                            <span
                              key={chip}
                              style={{
                                fontSize: 9,
                                fontWeight: 700,
                                padding: "2px 7px",
                                borderRadius: 9999,
                                background: "var(--muted)",
                                color: "var(--muted-fg)",
                                maxWidth: "100%",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {n.kind === "match_challenge_received" &&
                      typeof n.payload.match_id === "string" ? (
                        <MatchChallengeNotifActions
                          matchId={n.payload.match_id}
                          busy={challengePendingId === n.id}
                          onBusy={(v) => setChallengePendingId(v ? n.id : null)}
                          onAccepted={(convId) => {
                            onMarkOne(n.id);
                            onClose();
                            if (convId) router.push(`/dashboard/user/chat?conv=${convId}`);
                            else router.refresh();
                          }}
                          onDeclined={() => {
                            onMarkOne(n.id);
                            toast({ icon: "info", title: "Reto rechazado" });
                            router.refresh();
                          }}
                        />
                      ) : null}
                      <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 5 }}>
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
          onClick={() => {
            onClose();
            router.push(`/dashboard/${role}/notificaciones`);
          }}
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

function MatchChallengeNotifActions({
  matchId,
  busy,
  onBusy,
  onAccepted,
  onDeclined,
}: {
  matchId: string;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onAccepted: (convId: string | null) => void;
  onDeclined: () => void;
}) {
  const toast = useToast();

  const accept = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBusy(true);
    void acceptMatchChallenge({ matchId }).then((res) => {
      onBusy(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo aceptar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Reto aceptado", sub: "Ya puedes escribir en el chat del duelo." });
      onAccepted(res.data.conversationId);
    });
  };

  const decline = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBusy(true);
    void declineMatchChallenge({ matchId }).then((res) => {
      onBusy(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo rechazar", sub: res.error.message });
        return;
      }
      onDeclined();
    });
  };

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy}
        onClick={accept}
        style={{ flex: 1, padding: "6px 10px", fontSize: 10, justifyContent: "center" }}
      >
        Aceptar reto
      </button>
      <button
        type="button"
        className="btn btn-outline"
        disabled={busy}
        onClick={decline}
        style={{ flex: 1, padding: "6px 10px", fontSize: 10, justifyContent: "center" }}
      >
        Rechazar
      </button>
    </div>
  );
}
