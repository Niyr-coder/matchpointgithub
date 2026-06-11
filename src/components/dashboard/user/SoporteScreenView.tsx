"use client";
// Pantalla "Soporte" del jugador: canales + tickets reales (tabla tickets).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { createTicket, getTicket, replyToTicket } from "@/server/actions/support";
import {
  mapPlayerTicketRow,
  ticketCategoryLabel,
  ticketStatusPalette,
  UI_CATEGORY_LABELS,
  UI_TO_TICKET_CATEGORY,
  type PlayerTicketRow,
} from "@/lib/support/ticket-display";
import type { TicketDetail } from "@/lib/schemas/ops";

const SUPPORT_EMAIL = "soporte@matchpoint.top";

export function SoporteScreenView({
  email,
  userId,
  planLabel,
  isPremium,
  tickets: initialTickets,
  maintenanceActive,
}: {
  email: string | null;
  userId: string | null;
  planLabel: string;
  isPremium: boolean;
  tickets: PlayerTicketRow[];
  maintenanceActive: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tickets, setTickets] = useState(initialTickets);
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState("reservas");
  const [detail, setDetail] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reply, setReply] = useState("");

  useEffect(() => {
    setTickets(initialTickets);
  }, [initialTickets]);

  useRealtimeRefresh(
    userId ? [{ table: "tickets" }, { table: "ticket_messages" }] : [],
    { enabled: !!userId, debounceMs: 2500 },
  );

  useEffect(() => {
    if (!selectedId) {
      setDetailData(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void getTicket({ id: selectedId }).then((res) => {
      if (cancelled) return;
      setDetailLoading(false);
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cargar la solicitud", sub: res.error.message });
        setSelectedId(null);
        return;
      }
      setDetailData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, toast]);

  const scrollToForm = () => {
    document.getElementById("nuevo-caso")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const send = () => {
    if (!userId) {
      toast({ icon: "alert-triangle", title: "Inicia sesión", sub: "Necesitas una cuenta para reportar un problema" });
      return;
    }
    if (topic.trim().length < 5) {
      toast({ icon: "alert-triangle", title: "Cuéntanos un poco más", sub: "El asunto necesita al menos 5 caracteres" });
      return;
    }
    if (detail.trim().length < 10) {
      toast({ icon: "alert-triangle", title: "Agrega más detalle", sub: "Describe el problema con al menos 10 caracteres" });
      return;
    }
    startTransition(async () => {
      const catLabel = UI_CATEGORY_LABELS[category] ?? category;
      const res = await createTicket({
        subject: topic.trim(),
        body: `[${catLabel}]\n\n${detail.trim()}`,
        category: UI_TO_TICKET_CATEGORY[category] ?? "other",
        severity: "medium",
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo enviar", sub: res.error.message });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: "Solicitud enviada",
        sub: `Recibimos tu caso ${res.data.code}. Te respondemos por aquí y al mail registrado.`,
      });
      setTopic("");
      setDetail("");
      setTickets((prev) => [mapPlayerTicketRow(res.data), ...prev]);
      setSelectedId(res.data.id);
      router.refresh();
    });
  };

  const sendReply = () => {
    if (!selectedId || reply.trim().length < 1) return;
    startTransition(async () => {
      const res = await replyToTicket({ id: selectedId, body: { body: reply.trim(), internal: false } });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo enviar", sub: res.error.message });
        return;
      }
      setReply("");
      const refreshed = await getTicket({ id: selectedId });
      if (refreshed.ok) setDetailData(refreshed.data);
      router.refresh();
    });
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

  const servicesOk = !maintenanceActive;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)", color: "#fff", padding: "26px 30px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 30%, rgba(16,185,129,0.18), transparent 55%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "#34d399" }}>● Soporte · Estamos cerca</div>
            <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
              ¿En qué te ayudamos?<span style={{ color: "#34d399" }}>.</span>
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderRadius: 9999, background: servicesOk ? "rgba(16,185,129,0.14)" : "rgba(251,191,36,0.14)", border: `1px solid ${servicesOk ? "rgba(16,185,129,0.35)" : "rgba(251,191,36,0.35)"}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: servicesOk ? "#10b981" : "#fbbf24", boxShadow: servicesOk ? "0 0 8px #10b981" : "0 0 8px #fbbf24" }} />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", color: servicesOk ? "#34d399" : "#fcd34d" }}>
              {servicesOk ? "Servicios operativos" : "Mantenimiento activo"}
            </span>
          </div>
        </div>
      </div>

      <div className="mp-soporte-channels-grid" style={{ display: "grid", gap: 12 }}>
        <ChannelCard icon="message-square" bg="#0a0a0a" l="Chat en vivo" sub="Reporta un problema y conversa aquí" hint="Tu hilo con el equipo MATCHPOINT" cta="Reportar" onClick={scrollToForm} />
        <ChannelCard icon="mail" bg="#0ea5e9" l="Email" sub={SUPPORT_EMAIL} hint="Para temas complejos" cta="Escribirnos" href={`mailto:${SUPPORT_EMAIL}?subject=Soporte%20MATCHPOINT`} external />
        <ChannelCard icon="message-circle" bg="#25d366" l="WhatsApp" sub="Pronto disponible" hint="Estamos habilitando este canal" cta="Avísame" onClick={() => toast({ icon: "message-circle", title: "WhatsApp · próximamente", sub: "Por ahora envía una solicitud o escríbenos al email" })} />
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
              ? toast({ icon: "phone", title: "Agendar llamada · próximamente", sub: "Por ahora envía una solicitud y te contactamos" })
              : undefined
          }
          href={isPremium ? undefined : "/dashboard/user/mi-plan"}
        />
      </div>

      <div className="mp-soporte-body-grid" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16, alignItems: "start" }}>
        <div id="nuevo-caso" className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, scrollMarginTop: 16 }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Nueva solicitud</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Reportar un problema<span className="dot">.</span>
            </h3>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Cuéntanos qué pasó y te respondemos aquí y al mail registrado{email ? ` (${email})` : ""}.</p>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Asunto</span>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ej: No puedo cancelar mi reserva" disabled={pending} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} disabled={pending} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, background: "#fff", outline: "none" }}>
              {Object.entries(UI_CATEGORY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>Detalle</span>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={4} disabled={pending} placeholder="Cuéntanos qué pasó. Si puedes, incluye fechas, club o torneo." style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13, outline: "none", resize: "vertical", minHeight: 90 }} />
          </label>
          <div className="mp-soporte-form-actions">
            <button type="button" className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => toast({ icon: "paperclip", title: "Adjuntar archivo · próximamente", sub: "Por ahora describe el problema en el detalle" })}>
              <Icon name="paperclip" size={13} /> Adjuntar archivo
            </button>
            <button type="button" onClick={send} disabled={pending} className="btn btn-primary">
              <Icon name="send" size={13} color="#fff" /> {pending ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Historial</div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Mis solicitudes<span className="dot">.</span>
              </h3>
            </div>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{tickets.length} en total</span>
          </div>
          {tickets.length === 0 ? (
            <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
              Aún no has reportado problemas. Cuando envíes una solicitud, aparece aquí con su estado.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {tickets.map((t, i) => {
                const sp = ticketStatusPalette(t.status);
                const urgentDot = t.priority === "high" || t.priority === "critical";
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: i < tickets.length - 1 ? "1px solid var(--border)" : 0, background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                  >
                    <span style={{ flexShrink: 0, padding: "4px 9px", borderRadius: 9999, background: sp.bg, color: sp.fg, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {urgentDot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#dc2626" }} />}
                      {sp.l}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.topic}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "ui-monospace, monospace" }}>{t.code}</span>
                        <span>·</span>
                        <span>{t.cat}</span>
                        <span>·</span>
                        <span>{t.lastAt}</span>
                      </div>
                    </div>
                    <Icon name="arrow-right" size={14} color="var(--muted-fg)" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mp-soporte-status-grid" style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ marginBottom: 14 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>● Status</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Estado del sistema<span className="dot">.</span>
            </h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { l: "App & reservas", ok: !maintenanceActive },
              { l: "Pagos & comprobantes", ok: true },
              { l: "Quedadas & torneos", ok: true },
              { l: "Notificaciones", ok: true },
              { l: "Mensajes", ok: true },
            ].map((s) => (
              <div key={s.l} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 9, background: "var(--muted)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.ok ? "#10b981" : "#fbbf24", boxShadow: s.ok ? "0 0 8px #10b981" : "0 0 8px #fbbf24" }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>{s.l}</span>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{s.ok ? "Operativo" : "Degradado"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>● Identificación</div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Datos para soporte<span className="dot">.</span>
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>Si te piden estos datos, ya los tienes a mano.</p>
            </div>
            <button
              type="button"
              className="btn"
              aria-label="Copiar datos para soporte"
              title="Copiar datos"
              onClick={copyAccount}
              style={{ flexShrink: 0, background: "#fff", border: "1px solid var(--border)", padding: "8px 10px" }}
            >
              <Icon name="copy" size={15} />
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <DataRow label="Email" value={email ?? "—"} />
            <DataRow label="User ID" value={userId ?? "—"} mono />
            <DataRow label="Plan" value={planLabel} />
            <DataRow label="App" value="MATCHPOINT · Web" mono />
          </div>
        </div>
      </div>

      {selectedId ? (
        <div role="dialog" aria-modal="true" data-mp-overlay style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setSelectedId(null)}>
          <div className="card" style={{ width: "min(560px, 100%)", maxHeight: "min(80vh, 720px)", overflow: "hidden", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div className="label-mp" style={{ color: "var(--primary)" }}>{detailData?.ticket.code ?? "Solicitud"}</div>
                <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
                  {detailData?.ticket.subject ?? "Cargando…"}
                </h3>
                {detailData ? (
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted-fg)" }}>
                    {ticketStatusPalette(detailData.ticket.status).l} · {ticketCategoryLabel(detailData.ticket.category)}
                  </div>
                ) : null}
              </div>
              <button type="button" className="btn" style={{ background: "#fff", border: "1px solid var(--border)", padding: "6px 10px" }} onClick={() => setSelectedId(null)} aria-label="Cerrar">
                <Icon name="x" size={16} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {detailLoading ? (
                <p style={{ color: "var(--muted-fg)", fontSize: 13 }}>Cargando conversación…</p>
              ) : (
                (detailData?.messages ?? []).map((m) => {
                  const mine = m.authorId === userId;
                  return (
                    <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%", padding: "10px 12px", borderRadius: 10, background: mine ? "var(--color-mp-primary-light)" : "var(--muted)", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>
                      {m.body}
                    </div>
                  );
                })
              )}
            </div>
            {detailData && !["resolved", "closed"].includes(detailData.ticket.status) ? (
              <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 8 }}>
                <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Escribe una respuesta…" disabled={pending} style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "inherit", fontSize: 13 }} />
                <button type="button" className="btn btn-primary" disabled={pending || !reply.trim()} onClick={sendReply}>
                  Enviar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .mp-soporte-channels-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (min-width: 960px) {
          .mp-soporte-channels-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (max-width: 959px) {
          .mp-soporte-channel-card {
            padding: 14px !important;
            gap: 8px !important;
          }
          .mp-soporte-channel-card .font-heading {
            font-size: 12px !important;
          }
          .mp-soporte-channel-card .btn {
            font-size: 10px !important;
            padding: 7px 10px !important;
          }
        }
        @media (max-width: 768px) {
          .mp-soporte-body-grid,
          .mp-soporte-status-grid {
            grid-template-columns: 1fr !important;
          }
        }
        .mp-soporte-form-actions {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: stretch;
          gap: 10px;
        }
        .mp-soporte-form-actions .btn {
          flex: 1 1 0;
          min-width: 0;
        }
        @media (max-width: 480px) {
          .mp-soporte-form-actions .btn {
            font-size: 10px;
            padding: 9px 10px;
            gap: 5px;
          }
        }
      `}</style>
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
    <div className="mp-soporte-channel-card" style={{ position: "relative", padding: 18, borderRadius: 14.4, border: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
      {locked ? (
        <span style={{ position: "absolute", top: 12, right: 12, padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "#047857", fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Icon name="sparkles" size={9} color="#047857" /> MP+
        </span>
      ) : null}
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
        <a href={href} className="btn" style={ctaStyle} onClick={onClick}>
          {ctaInner}
        </a>
      ) : href && external ? (
        <a href={href} className="btn" style={ctaStyle}>
          {ctaInner}
        </a>
      ) : (
        <button type="button" className="btn" style={ctaStyle} onClick={onClick}>
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
