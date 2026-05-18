"use client";
import { useEffect, useRef, useState, useCallback, useMemo, useTransition } from "react";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
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

export function TopBar({
  role,
  contextLabel,
}: {
  role: RoleKey;
  contextLabel?: string | null;
}) {
  const [notifOpen, setNotifOpen] = useState(false);
  // Notifs viven en TopBar para que el panel se renderice instantáneamente
  // (sin "Cargando…") al abrir. El listener realtime las refresca aquí.
  const [items, setItems] = useState<RealNotif[]>([]);
  const [ringing, setRinging] = useState(false);
  const [badgePulseKey, setBadgePulseKey] = useState(0);
  const prevUnreadRef = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const cfg = MP_ROLES[role];
  const cta = CTA_BY_ROLE[role];
  const toast = useToast();
  const [, startTransition] = useTransition();

  const unreadN = useMemo(() => items.filter((n) => !n.readAt).length, [items]);

  const triggerRing = useCallback(() => {
    setRinging(true);
    setTimeout(() => setRinging(false), 700);
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
    refresh();
  }, [refresh]);

  // Realtime — un solo canal para badge + panel. Al llegar cualquier
  // cambio en notifications del usuario, refetch la lista.
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const supabase = getBrowserClient();
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      const channel = supabase
        .channel(`mp-notif-${uid}`)
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
          () => {
            refresh();
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
  }, [refresh]);

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

  const handleBellClick = () => {
    const willOpen = !notifOpen;
    setNotifOpen(willOpen);
    if (willOpen) triggerRing();
  };

  const onMarkOne = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    startTransition(async () => {
      await markNotificationRead({ id });
    });
  }, []);

  const onMarkAll = useCallback(() => {
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    const myRole = role;
    startTransition(async () => {
      const res = await markAllNotificationsRead({ role: myRole });
      if (res.ok) toast({ icon: "check", title: "Notificaciones marcadas como leídas" });
    });
  }, [role, toast]);

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
            className="mp-bell-btn"
            onClick={handleBellClick}
            style={{
              width: 36,
              height: 36,
              border: "1px solid " + (ringing ? "red" : notifOpen ? "#0a0a0a" : "var(--border)"),
              borderRadius: 9999,
              background: ringing ? "red" : notifOpen ? "#0a0a0a" : "#fff",
              color: ringing || notifOpen ? "#fff" : "#0a0a0a",
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
              onMarkAll={onMarkAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
