"use client";
// Pantalla "Soporte" del jugador. Migrada del prototipo
// (ui_kits/dashboard/SoporteScreen.jsx): hero + canales + crear ticket +
// mis tickets + estado del sistema + datos de cuenta.
//
// Wiring honesto:
// - Chat en vivo → Mensajes (canal de soporte REAL, conversación kind=support).
// - Email → mailto al dominio real.
// - WhatsApp / Llamada MP+ → pendientes (toast), sin números fabricados.
// - Tickets (form + historial) → DEMO: no hay backend de tickets todavía.
// - Estado del sistema → ilustrativo (todo operativo); no hay status page real.
// - Datos para soporte → email, user id y plan REALES (de la sesión/perfil).
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

const SUPPORT_EMAIL = "soporte@matchpoint.top";
const CHAT_HREF = "/dashboard/user/chat";

type TicketStatus = "open" | "waiting" | "resolved";
const TICKETS: { id: string; topic: string; cat: string; status: TicketStatus; lastReply: string; priority: string }[] = [
  { id: "T-2841", topic: "No me llegó la factura del torneo", cat: "Pagos", status: "open", lastReply: "agente · hace 12 min", priority: "normal" },
  { id: "T-2799", topic: "Quiero cambiar mi nivel de Suma", cat: "Ranking", status: "waiting", lastReply: "tú · hace 1 día", priority: "low" },
  { id: "T-2702", topic: "Reserva cobrada dos veces", cat: "Pagos", status: "resolved", lastReply: "agente · hace 3 días", priority: "urgent" },
];

const STATUS_PALETTE: Record<TicketStatus, { bg: string; fg: string; l: string }> = {
  open: { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Abierto" },
  waiting: { bg: "#fef3c7", fg: "#92400e", l: "Esperando" },
  resolved: { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Resuelto" },
};

export function SoporteScreenView({
  email,
  userId,
  planLabel,
  isPremium,
}: {
  email: string | null;
  userId: string | null;
  planLabel: string;
  isPremium: boolean;
}) {
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("reservas");
  const [priority, setPriority] = useState("normal");
  const [detail, setDetail] = useState("");

  const send = () => {
    if (topic.trim().length < 5) {
      toast({ icon: "alert-triangle", title: "Cuéntanos un poco más", sub: "El asunto necesita al menos 5 caracteres" });
      return;
    }
    toast({ icon: "check-circle-2", title: "Ticket recibido (demo)", sub: "Por ahora te atendemos por el chat de soporte" });
    setTopic("");
    setDetail("");
  };

  const copyAccount = async () => {
    const text = [`Email: ${email ?? "—"}`, `User ID: ${userId ?? "—"}`, `Plan: ${planLabel}`, "App: MATCHPOINT · Web"].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ icon: "copy", title: "Datos copiados", sub: "Pégalos cuando soporte te los pida" });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", sub: "Cópialos a mano" });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* HERO */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)", color: "#fff", padding: "26px 30px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%, rgba(16,185,129,0.18), transparent 55%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "#34d399" }}>● Soporte · Estamos cerca</div>
            <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
              ¿En qué te ayudamos?<span style={{ color: "#34d399" }}>.</span>
            </h1>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "rgba(255,255,255,0.72)" }}>
              Lun a vie · 8:00–20:00 · Sáb 9:00–14:00 · SLA respuesta &lt;24h
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 9999, background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.35)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: "#34d399" }}>Servicios operativos</span>
          </div>
        </div>
      </div>

      {/* CANALES */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <ChannelCard icon="message-square" bg="#0a0a0a" l="Chat en vivo" sub="Soporte por el chat de la app" hint="Tu canal directo con MATCHPOINT" cta="Iniciar chat" href={CHAT_HREF} />
        <ChannelCard icon="mail" bg="#0ea5e9" l="Email" sub={SUPPORT_EMAIL} hint="Para temas complejos" cta="Escribirnos" href={`mailto:${SUPPORT_EMAIL}?subject=Soporte%20MATCHPOINT`} external />
        <ChannelCard icon="message-circle" bg="#25d366" l="WhatsApp" sub="Pronto disponible" hint="Estamos habilitando este canal" cta="Avísame" onClick={() => toast({ icon: "message-circle", title: "WhatsApp · próximamente", sub: "Por ahora usa el chat o el email" })} />
        <ChannelCard
          icon="phone"
          bg="#7c3aed"
          l="Llamada"
          sub={isPremium ? "Incluida en tu plan" : "Solo MATCHPOINT+"}
          hint="Agenda la hora que quieras"
          cta={isPremium ? "Agendar" : "Ver MP+"}
          locked={!isPremium}
          onClick={() =>
            isPremium
              ? toast({ icon: "phone", title: "Agendar llamada · próximamente" })
              : toast({ icon: "sparkles", title: "Llamada es MATCHPOINT+", sub: "Actívalo desde Mi plan" })
          }
          href={isPremium ? undefined : "/dashboard/user/mi-plan"}
        />
      </div>

      {/* Body: crear ticket + mis tickets */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, alignItems: "start" }}>
        {/* CREAR TICKET */}
        <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Nuevo caso</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Abrir un ticket<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Te respondemos al mail registrado{email ? ` (${email})` : ""}.</p>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Asunto</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ej: No puedo cancelar mi reserva" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none" }} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Categoría</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, background: "#fff", outline: "none" }}>
                <option value="reservas">Reservas</option>
                <option value="pagos">Pagos & facturación</option>
                <option value="quedadas">Quedadas</option>
                <option value="torneos">Torneos</option>
                <option value="coaching">Coaching</option>
                <option value="cuenta">Cuenta</option>
                <option value="bug">Reporte de error</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Prioridad</span>
              <div style={{ display: "flex", gap: 4 }}>
                {[{ k: "low", l: "Baja" }, { k: "normal", l: "Normal" }, { k: "urgent", l: "Urgente" }].map((pr) => {
                  const on = priority === pr.k;
                  return (
                    <button key={pr.k} type="button" onClick={() => setPriority(pr.k)} style={{ flex: 1, padding: "9px 8px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "var(--muted-fg)", border: "1px solid " + (on ? "#0a0a0a" : "var(--border)") }}>
                      {pr.l}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Detalle</span>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} placeholder="Cuéntanos qué pasó. Si puedes, adjunta capturas." style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", resize: "vertical", minHeight: 90 }} />
          </label>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "paperclip", title: "Adjuntar archivo · próximamente" })}>
              <Icon name="paperclip" size={13} /> Adjuntar archivo
            </button>
            <button onClick={send} className="btn btn-primary">
              <Icon name="send" size={13} color="#fff" /> Enviar ticket
            </button>
          </div>
        </div>

        {/* MIS TICKETS */}
        <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Historial</div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Mis tickets<span className="dot">.</span>
              </h3>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{TICKETS.length} en total</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {TICKETS.map((t, i) => {
              const sp = STATUS_PALETTE[t.status];
              const urgentDot = t.priority === "urgent";
              return (
                <button
                  key={t.id}
                  onClick={() => toast({ icon: "life-buoy", title: t.id, sub: "Detalle de ticket · próximamente" })}
                  style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: i < TICKETS.length - 1 ? "1px solid var(--border)" : 0, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                >
                  <span style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 9999, background: sp.bg, color: sp.fg, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {urgentDot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#dc2626" }} />}
                    {sp.l}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.topic}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2, display: "flex", gap: 8 }}>
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>{t.id}</span>
                      <span>·</span>
                      <span>{t.cat}</span>
                      <span>·</span>
                      <span>{t.lastReply}</span>
                    </div>
                  </div>
                  <Icon name="arrow-right" size={14} color="var(--muted-fg)" />
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>Ejemplos de muestra · el ticketing real llega pronto.</div>
        </div>
      </div>

      {/* ESTADO DEL SISTEMA + datos de cuenta */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Status</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Estado del sistema<span className="dot">.</span>
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { l: "App & reservas", v: "Operativo" },
              { l: "Pagos & comprobantes", v: "Operativo" },
              { l: "Quedadas & torneos", v: "Operativo" },
              { l: "Notificaciones", v: "Operativo" },
              { l: "Mensajes", v: "Operativo" },
            ].map((s) => (
              <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, background: "var(--muted)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>{s.l}</span>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Identificación</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Datos para soporte<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Si te piden estos datos, ya los tienes a mano.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <DataRow label="Email" value={email ?? "—"} />
            <DataRow label="User ID" value={userId ?? "—"} mono />
            <DataRow label="Plan" value={planLabel} />
            <DataRow label="App" value="MATCHPOINT · Web" mono />
          </div>
          <button className="btn" style={{ alignSelf: "flex-start", background: "#fff", border: "1px solid var(--border)" }} onClick={copyAccount}>
            <Icon name="copy" size={13} /> Copiar todo
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelCard({
  icon,
  bg,
  l,
  sub,
  hint,
  cta,
  href,
  external,
  onClick,
  locked,
}: {
  icon: string;
  bg: string;
  l: string;
  sub: string;
  hint: string;
  cta: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  locked?: boolean;
}) {
  const ctaStyle: React.CSSProperties = {
    marginTop: "auto",
    background: locked ? "#fff" : "#0a0a0a",
    color: locked ? "#0a0a0a" : "#fff",
    border: "1px solid " + (locked ? "var(--border)" : "#0a0a0a"),
    alignSelf: "flex-start",
  };
  const ctaInner = (
    <>
      {cta} <Icon name="arrow-right" size={12} color={locked ? undefined : "#fff"} />
    </>
  );
  return (
    <div style={{ position: "relative", padding: 18, borderRadius: 14.4, border: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
      {locked && (
        <span style={{ position: "absolute", top: 12, right: 12, padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "#047857", fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="sparkles" size={9} color="#047857" /> MP+
        </span>
      )}
      <span style={{ width: 38, height: 38, borderRadius: 9, background: bg, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={18} color="#fff" />
      </span>
      <div>
        <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
          {l}
          <span className="dot">.</span>
        </div>
        <div style={{ fontSize: 12, color: "#0a0a0a", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{hint}</div>
      </div>
      {href && !external ? (
        <Link href={href} className="btn" style={ctaStyle} onClick={onClick}>
          {ctaInner}
        </Link>
      ) : href && external ? (
        <a href={href} className="btn" style={ctaStyle}>
          {ctaInner}
        </a>
      ) : (
        <button className="btn" style={ctaStyle} onClick={onClick}>
          {ctaInner}
        </button>
      )}
    </div>
  );
}

function DataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "6px 0", borderBottom: "1px dashed var(--border)" }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: mono ? "ui-monospace, monospace" : "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
