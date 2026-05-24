"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import type { SectionToast } from "./_shared";
import { applyNotifTemplate, updateNotifPref } from "@/server/actions/club-config-notif";

export type NotifChannel = "push" | "email" | "sms" | "wa";
export type NotifTarget = "all" | "staff" | "off";
export type NotifEvent = {
  key: string;
  label: string;
  sub: string;
  critical: boolean;
};
export type NotificacionesData = {
  clubId?: string;
  events: NotifEvent[];
  matrix: Record<string, Record<NotifChannel, NotifTarget>>;
};

const DEFAULT_EVENTS: NotifEvent[] = [
  { key: "res_new", label: "Reserva confirmada", sub: "Cuando se completa el pago", critical: true },
  { key: "res_rem", label: "Recordatorio 24h", sub: "24 horas antes del juego", critical: false },
  { key: "res_rem1", label: "Recordatorio 1h", sub: "1 hora antes del juego", critical: false },
  { key: "res_cancel", label: "Reserva cancelada", sub: "Por el jugador o por el club", critical: true },
  { key: "pay_ok", label: "Pago recibido", sub: "Confirmación a la caja", critical: false },
  { key: "rain", label: "Cierre por lluvia", sub: "Cuando el sensor activa", critical: true },
  { key: "event_new", label: "Inscripción a evento", sub: "Nuevo participante", critical: false },
  { key: "membership", label: "Renovación de membresía", sub: "7 días antes de vencer", critical: false },
];

const CHANNELS: { k: NotifChannel; l: string; icon: string }[] = [
  { k: "push", l: "Push", icon: "bell" },
  { k: "email", l: "Email", icon: "mail" },
  { k: "sms", l: "SMS", icon: "message-square" },
  { k: "wa", l: "WhatsApp", icon: "message-circle" },
];

const EMPTY_ROW: Record<NotifChannel, NotifTarget> = { push: "off", email: "off", sms: "off", wa: "off" };

const TARGET_STYLE: Record<NotifTarget, { l: string; bg: string; fg: string }> = {
  all: { l: "Todos", bg: "var(--primary)", fg: "#fff" },
  staff: { l: "Staff", bg: "#0a0a0a", fg: "#fff" },
  off: { l: "○", bg: "var(--muted)", fg: "var(--muted-fg)" },
};

function nextTarget(t: NotifTarget): NotifTarget {
  return t === "off" ? "all" : t === "all" ? "staff" : "off";
}

export function NotificacionesSection({
  onAction,
  data,
}: {
  onAction: SectionToast;
  data?: NotificacionesData;
}) {
  const events = data?.events ?? DEFAULT_EVENTS;
  const clubId = data?.clubId;

  const [matrix, setMatrix] = useState<Record<string, Record<NotifChannel, NotifTarget>>>(() => {
    const base: Record<string, Record<NotifChannel, NotifTarget>> = {};
    for (const e of events) base[e.key] = { ...EMPTY_ROW };
    if (data?.matrix) {
      for (const [k, row] of Object.entries(data.matrix)) {
        base[k] = { ...EMPTY_ROW, ...row };
      }
    }
    return base;
  });
  const [, startTransition] = useTransition();

  function onCellClick(eventKey: string, channel: NotifChannel) {
    if (!clubId) {
      onAction("No hay club activo");
      return;
    }
    const prev = matrix[eventKey]?.[channel] ?? "off";
    const next = nextTarget(prev);
    setMatrix((m) => ({
      ...m,
      [eventKey]: { ...(m[eventKey] ?? EMPTY_ROW), [channel]: next },
    }));
    startTransition(async () => {
      const res = await updateNotifPref({ clubId, eventKey, channel, target: next });
      if (res.ok === false) {
        setMatrix((m) => ({
          ...m,
          [eventKey]: { ...(m[eventKey] ?? EMPTY_ROW), [channel]: prev },
        }));
        onAction("No se pudo actualizar la preferencia");
      }
    });
  }

  function onApplyTemplate(template: "minimal" | "complete") {
    if (!clubId) {
      onAction("No hay club activo");
      return;
    }
    startTransition(async () => {
      const res = await applyNotifTemplate({ clubId, template });
      if (res.ok === false) {
        onAction("No se pudo aplicar la plantilla");
        return;
      }
      // Refresh local optimistically: full overwrite from template.
      const tpl = template === "minimal" ? TEMPLATE_MINIMAL : TEMPLATE_COMPLETE;
      setMatrix(() => {
        const out: Record<string, Record<NotifChannel, NotifTarget>> = {};
        for (const e of events) out[e.key] = { ...EMPTY_ROW, ...(tpl[e.key] ?? {}) };
        return out;
      });
      onAction(template === "minimal" ? "Plantilla mínima aplicada" : "Plantilla completa aplicada");
    });
  }

  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp">Matriz · evento × canal</div>
          <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Cuándo escribimos a quién<span className="dot">.</span></h3>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>Toca una celda para alternar entre <b>Todos / Staff / Off</b>.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onApplyTemplate("minimal")}>Plantilla mínima</button>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onApplyTemplate("complete")}>Plantilla completa</button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr) 80px", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div className="label-mp">Evento</div>
            {CHANNELS.map((c) => (
              <div key={c.k} style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <Icon name={c.icon} size={13} color="var(--muted-fg)" />
                <span className="label-mp" style={{ fontSize: 9 }}>{c.l}</span>
              </div>
            ))}
            <div className="label-mp" style={{ textAlign: "center", fontSize: 9 }}>Crítico</div>
          </div>

          {events.map((e) => (
            <div key={e.key} style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr) 80px", gap: 6, alignItems: "center", padding: "12px 0", borderTop: "1px dashed var(--border)" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{e.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{e.sub}</div>
              </div>
              {CHANNELS.map((c) => {
                const target = matrix[e.key]?.[c.k] ?? "off";
                const s = TARGET_STYLE[target];
                return (
                  <div key={c.k} style={{ textAlign: "center" }}>
                    <button onClick={() => onCellClick(e.key, c.k)} style={{ padding: "6px 10px", borderRadius: 8, background: s.bg, color: s.fg, border: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", minWidth: 56, fontFamily: "inherit" }}>{s.l}</button>
                  </div>
                );
              })}
              <div style={{ textAlign: "center" }}>
                {e.critical && <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 9999, background: "rgba(220,38,38,0.1)", color: "#dc2626", letterSpacing: "0.1em" }}>● ALWAYS</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "var(--muted)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="info" size={14} color="var(--muted-fg)" />
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
          Los SMS tienen un costo de <b style={{ color: "#0a0a0a" }}>$0.04/mensaje</b>. WhatsApp Business es gratis para confirmaciones e ilimitado para socios Plus/Pro.
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_MINIMAL: Record<string, Record<NotifChannel, NotifTarget>> = {
  res_new: { push: "all", email: "all", sms: "off", wa: "off" },
  res_rem: { push: "all", email: "off", sms: "off", wa: "off" },
  res_rem1: { push: "all", email: "off", sms: "off", wa: "off" },
  res_cancel: { push: "all", email: "all", sms: "off", wa: "off" },
  pay_ok: { push: "staff", email: "off", sms: "off", wa: "off" },
  rain: { push: "all", email: "off", sms: "off", wa: "off" },
  event_new: { push: "staff", email: "off", sms: "off", wa: "off" },
  membership: { push: "all", email: "off", sms: "off", wa: "off" },
};

const TEMPLATE_COMPLETE: Record<string, Record<NotifChannel, NotifTarget>> = {
  res_new: { push: "staff", email: "all", sms: "off", wa: "all" },
  res_rem: { push: "all", email: "all", sms: "off", wa: "all" },
  res_rem1: { push: "all", email: "off", sms: "all", wa: "off" },
  res_cancel: { push: "all", email: "all", sms: "all", wa: "all" },
  pay_ok: { push: "staff", email: "staff", sms: "off", wa: "off" },
  rain: { push: "all", email: "all", sms: "all", wa: "all" },
  event_new: { push: "staff", email: "staff", sms: "off", wa: "off" },
  membership: { push: "all", email: "all", sms: "off", wa: "all" },
};
