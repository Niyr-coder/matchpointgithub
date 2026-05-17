"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { NotificationsPanel } from "./NotificationsPanel";
import { useToast } from "./ToastProvider";
import { getUnreadCount } from "@/server/actions/notifications";
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

export function TopBar({
  role,
  contextLabel,
}: {
  role: RoleKey;
  contextLabel?: string | null;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadN, setUnreadN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = MP_ROLES[role];
  const cta = CTA_BY_ROLE[role];
  const toast = useToast();

  const refreshUnread = useCallback(async () => {
    const res = await getUnreadCount({ role });
    if (res.ok) setUnreadN(res.data.count);
  }, [role]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread]);

  // Realtime: actualizar badge cuando llegue/cambie cualquier notificación del usuario.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`mp-notif-badge-${uid}`)
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
          () => refreshUnread(),
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
  }, [refreshUnread]);

  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  // Refresh count when panel closes (user may have marked as read).
  useEffect(() => {
    if (!notifOpen) refreshUnread();
  }, [notifOpen, refreshUnread]);

  const handleCta = () => {
    if (cta.ev) window.dispatchEvent(new Event(cta.ev));
    else toast({ icon: cta.i, title: cta.l + " — próximamente" });
  };

  return (
    <div
      style={{
        height: 60,
        padding: "0 28px",
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
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, maxWidth: 640 }}>
        <div style={{ flex: 1, position: "relative", maxWidth: 320 }}>
          <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)" }}>
            <Icon name="search" size={14} />
          </span>
          <input
            placeholder={
              SEARCH_PLACEHOLDER[role] || "Buscar jugadores, canchas, torneos…"
            }
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
        </div>
        {role === "admin" && contextLabel && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "4px 10px 4px 5px",
              borderRadius: 9999,
              background: cfg.color,
              color: "#fff",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.18)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={cfg.icon} size={11} color="#fff" />
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
              }}
            >
              ● {cfg.badge}
            </span>
            <span style={{ width: 1, height: 12, background: "rgba(255,255,255,0.3)" }} />
            <span style={{ fontSize: 10.5, fontWeight: 800, whiteSpace: "nowrap" }}>
              {contextLabel.split(" · ")[0]}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-primary" style={{ padding: "8px 16px" }} onClick={handleCta}>
          <Icon name={cta.i} size={13} />
          {cta.l}
        </button>
        <div ref={ref} style={{ position: "relative" }}>
          <button
            onClick={() => setNotifOpen((o) => !o)}
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
            <Icon name="bell" size={15} />
            {unreadN > 0 && (
            <span
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
              {unreadN}
            </span>
            )}
          </button>
          {notifOpen && <NotificationsPanel role={role} onClose={() => setNotifOpen(false)} />}
        </div>
      </div>
    </div>
  );
}
