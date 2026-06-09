"use client";
// Admin · Comunicaciones v2 — composer con preview live + segment builder + tabs
// de campañas + drawer con funnel. Migrado del prototipo
// (ui_kits/dashboard/AdminBroadcastScreen.jsx). data-lucide → <Icon>, botones →
// toast, marca MATCHPOINT / matchpoint.top.
//
// Campañas, plantillas, audiencia, banner y envío in-app están cableados.
// Aperturas reales; clicks/conversión, push y email quedan pendientes.
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { setAnnouncementBanner, clearAnnouncementBanner } from "@/server/actions/announcements";
import { createBroadcast, dispatchBroadcast, countAudience } from "@/server/actions/marketing";
import { saveBroadcastTemplate, deleteBroadcastTemplate, type BroadcastTemplate } from "@/server/actions/broadcast-templates";

type TargetFilter = { city?: string; sport?: string; plan?: string; role?: string };
type Chip = { k: string; l: string; c: string; filter: TargetFilter };
// Campaign real (de broadcasts). opened viene de broadcast_recipients.opened_at;
// clicked/converted = null porque no existe tracking de esas señales.
type Campaign = {
  id: string; kind: "push" | "email" | "banner" | "in-app"; t: string; audience: string;
  reach: number | null; sent: number | null; opened: number | null; clicked: number | null; converted: number | null;
  when: string; st: "sent" | "live" | "scheduled" | "draft";
};
export type BroadcastData = { campaigns: Campaign[]; templates: BroadcastTemplate[]; totalUsers: number };

const BCAST_HISTORY_COLS = "40px 1.6fr 1.1fr 120px 130px 120px 36px";

// Reconstruye chips de audiencia desde un target_filter guardado.
function chipsFromFilter(tf: Record<string, unknown>): Chip[] {
  const out: Chip[] = [];
  if (tf.city) out.push({ k: "city", l: `Ciudad · ${tf.city}`, c: "#0ea5e9", filter: { city: String(tf.city) } });
  if (tf.sport) out.push({ k: "sport", l: `Deporte · ${tf.sport}`, c: "#fbbf24", filter: { sport: String(tf.sport) } });
  if (tf.plan === "premium") out.push({ k: "mpplus", l: "Suscriptores MP+", c: "#10b981", filter: { plan: "premium" } });
  if (tf.role === "owner") out.push({ k: "owner", l: "Dueños de club", c: "#7c3aed", filter: { role: "owner" } });
  return out;
}
const CHANNEL_ICON: Record<string, string> = { push: "smartphone", email: "mail", inapp: "message-square", banner: "megaphone" };

// Filtros de audiencia REALES (mapean a profiles.city/preferred_sport/plan_tier +
// role_assignments). Nivel/inactividad se omiten (sin backing type-safe).
const DEFAULT_CHIPS: Chip[] = [
  { k: "city", l: "Ciudad · Pichincha", c: "#0ea5e9", filter: { city: "Pichincha" } },
  { k: "sport", l: "Deporte · Pickleball", c: "#fbbf24", filter: { sport: "pickleball" } },
];
const SUGGESTED_CHIPS: Chip[] = [
  { k: "mpplus", l: "Suscriptores MP+", c: "#10b981", filter: { plan: "premium" } },
  { k: "owner", l: "Dueños de club", c: "#7c3aed", filter: { role: "owner" } },
];

const nf = (n: number) => n.toLocaleString("en-US");

export function AdminBroadcastView({ data }: { data: BroadcastData }) {
  const toast = useToast();
  const router = useRouter();
  const { ask } = usePromptModal();
  const soon = (title: string) => toast({ icon: "sparkles", title });
  const [pending, startTransition] = useTransition();
  const [bannerLevel, setBannerLevel] = useState<"info" | "warn" | "critical">("info");
  const [ctaHref, setCtaHref] = useState("");

  // Canal Banner = anuncio global REAL (mig 162). El resto sigue demo.
  const publishBanner = () =>
    startTransition(async () => {
      const message = [title, body].filter(Boolean).join(" — ").slice(0, 280);
      const res = await setAnnouncementBanner({ message, level: bannerLevel, ctaLabel: cta || undefined, ctaHref: ctaHref || undefined });
      if (res.ok) { toast({ icon: "megaphone", title: "Banner publicado · visible para todos" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  const removeBanner = () =>
    startTransition(async () => {
      const res = await clearAnnouncementBanner();
      if (res.ok) { toast({ icon: "check", title: "Banner quitado" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  const [channel, setChannel] = useState<"push" | "email" | "banner" | "in-app">("in-app");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cta, setCta] = useState("Ver más");
  const [chips, setChips] = useState<Chip[]>(DEFAULT_CHIPS);
  const [scheduleMode, setScheduleMode] = useState<"now" | "best" | "time">("now");
  const [schedAt, setSchedAt] = useState("");
  const [previewMode, setPreviewMode] = useState<"mobile" | "desktop">("mobile");
  const [tab, setTab] = useState<"all" | "sent" | "scheduled" | "draft">("all");
  const [openCampaign, setOpenCampaign] = useState<string | null>(null);
  const [reach, setReach] = useState<number | null>(null);

  const targetFilter = chips.reduce((acc, c) => ({ ...acc, ...c.filter }), {} as TargetFilter);
  const tfKey = JSON.stringify(targetFilter);
  // Alcance REAL (countAudience) — debounced ante cambios de segmento.
  useEffect(() => {
    const id = setTimeout(() => {
      countAudience({ targetFilter: JSON.parse(tfKey) }).then((res) => {
        if (res.ok) setReach(res.data.count);
      });
    }, 300);
    return () => clearTimeout(id);
  }, [tfKey]);

  const removeChip = (k: string) => setChips((c) => c.filter((x) => x.k !== k));
  const addChip = (chip: Chip) => setChips((cur) => (cur.some((x) => x.k === chip.k) ? cur : [...cur, chip]));

  const campaigns = data.campaigns;
  const totalUsersLabel = nf(data.totalUsers);
  const counts = {
    all: campaigns.length,
    sent: campaigns.filter((c) => c.st === "sent").length,
    scheduled: campaigns.filter((c) => c.st === "scheduled").length,
    draft: campaigns.filter((c) => c.st === "draft").length,
  };
  const visible = tab === "all" ? campaigns : campaigns.filter((c) => c.st === tab);
  const totalRecipients = campaigns.reduce((s, c) => s + (c.sent ?? 0), 0);
  const kpis = [
    { i: "send", l: "Campañas enviadas", v: nf(counts.sent), sub: `${nf(campaigns.length)} en total`, color: "#0a0a0a", up: false },
    { i: "users", l: "Destinatarios", v: nf(totalRecipients), sub: "suma de envíos", color: "var(--primary)", up: false },
    { i: "clock", l: "Programadas", v: nf(counts.scheduled), sub: "sin worker automático", color: "#fbbf24", up: false },
    { i: "save", l: "Borradores", v: nf(counts.draft), sub: "sin enviar", color: "#dc2626", up: false },
  ];

  // Envío REAL in-app (banner va por otro flujo). Push/email todavía no tienen
  // dispatcher externo; se mantienen visibles como próximos canales.
  // Programar solo
  // deja la campaña registrada; falta worker/cron que despache automáticamente.
  const CHANNEL_MAP: Record<string, string[]> = { "in-app": ["inapp"] };
  const sendCampaign = (mode: "now" | "time" | "draft") =>
    startTransition(async () => {
      if (!title && !body) return toast({ icon: "alert-triangle", title: "Escribe un título o mensaje" });
      const scheduledFor = mode === "time" ? (schedAt ? new Date(schedAt).toISOString() : undefined) : undefined;
      if (mode === "time" && !scheduledFor) return toast({ icon: "alert-triangle", title: "Elige fecha y hora" });
      const res = await createBroadcast({ scope: "platform", title: title || body.slice(0, 60), body, channels: CHANNEL_MAP[channel] ?? ["inapp"], targetFilter, scheduledFor });
      if (!res.ok) return toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      if (mode === "now") {
        const d = await dispatchBroadcast({ id: res.data.id });
        toast(d.ok ? { icon: "send", title: "Campaña enviada" } : { icon: "alert-triangle", title: "Creada pero falló el envío", sub: d.error.message });
      } else {
        toast({
          icon: mode === "time" ? "calendar" : "save",
          title: mode === "time" ? "Campaña guardada como programada" : "Borrador guardado",
          sub: mode === "time" ? "Falta activar el worker de despacho automático." : undefined,
        });
      }
      router.refresh();
    });

  // Plantillas reales (mig 163): cargar en el composer / guardar / borrar.
  const channelFromTemplate = (ch: string): "push" | "email" | "banner" | "in-app" => (ch === "banner" ? "banner" : "in-app");
  const loadTemplate = (t: BroadcastTemplate) => {
    setChannel(channelFromTemplate(t.channel));
    setTitle(t.title);
    setBody(t.body);
    if (t.ctaLabel) setCta(t.ctaLabel);
    setChips(chipsFromFilter(t.targetFilter));
    toast({ icon: "bookmark", title: `Plantilla "${t.name}" cargada` });
  };
  const saveAsTemplate = async () => {
    if (!title && !body) return toast({ icon: "alert-triangle", title: "Escribe algo antes de guardar la plantilla" });
    const name = await ask({ title: "Guardar plantilla", label: "Nombre de la plantilla", placeholder: "Ej. Recordatorio de torneo", required: true, confirmLabel: "Guardar" });
    if (name == null) return;
    startTransition(async () => {
      const res = await saveBroadcastTemplate({ name: name.trim(), channel: CHANNEL_MAP[channel]?.[0] ?? channel, title, body, ctaLabel: cta || undefined, targetFilter });
      if (res.ok) { toast({ icon: "check", title: "Plantilla guardada" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };
  const removeTemplate = (t: BroadcastTemplate) =>
    startTransition(async () => {
      const res = await deleteBroadcastTemplate({ id: t.id });
      if (res.ok) { toast({ icon: "check", title: "Plantilla borrada" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp" style={{ color: "#fbbf24" }}>● Mensajería masiva</div>
          <h1 className="font-heading mp-admin-page-title" style={{ fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "8px 0 0" }}>
            Comunicaciones<span className="dot">.</span>
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
            In-app y banner reales · base de <b style={{ color: "#0a0a0a" }}>{totalUsersLabel} usuarios</b> · push/email pendientes de dispatcher externo
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} disabled={pending} onClick={saveAsTemplate}>
            <Icon name="bookmark" size={13} />Guardar plantilla
          </button>
          <button className="btn btn-primary" onClick={() => { setTitle(""); setBody(""); setCta("Ver más"); setChips([]); toast({ icon: "plus", title: "Composer limpio · nueva campaña" }); }}>
            <Icon name="plus" size={13} color="#fff" />Nueva campaña
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mp-bcast-kpis mp-grid-form-5 gap-3">
        {kpis.map((k) => (
          <div key={k.l} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="label-mp">{k.l}</span>
              <span style={{ width: 24, height: 24, borderRadius: 6, background: "var(--muted)", color: k.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={k.i} size={12} color={k.color} />
              </span>
            </div>
            <div className="font-heading tabular" style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em", color: k.color }}>{k.v}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 5, display: "flex", alignItems: "center", gap: 4 }}>
              {k.up && <Icon name="trending-up" size={11} color="var(--primary)" />}
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      {/* COMPOSER */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="label-mp" style={{ color: "var(--primary)" }}>● Composer en vivo</span>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>cambios reflejados al instante en el preview →</span>
          </div>
          <button onClick={() => soon("A/B test · requiere variantes y tracking")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9999, background: "#fff", color: "var(--muted-fg)", border: "1px dashed var(--border)", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <Icon name="split-square-horizontal" size={11} />A/B test pendiente
          </button>
        </div>

        <div className="mp-bcast-composer mp-grid-split gap-0">
          {/* LEFT: form */}
          <div className="mp-bcast-form" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18, borderRight: "1px solid var(--border)" }}>
            {/* Channel */}
            <div>
              <div className="label-mp" style={{ marginBottom: 8 }}>Canal</div>
              <div className="mp-bcast-channels mp-grid-form-4 gap-2">
                {([
                  { k: "push", l: "Push", i: "smartphone", sub: "pendiente", disabled: true },
                  { k: "email", l: "Email", i: "mail", sub: "pendiente", disabled: true },
                  { k: "banner", l: "Banner", i: "megaphone", sub: "Top de la web", disabled: false },
                  { k: "in-app", l: "In-app", i: "message-square", sub: "Sesión activa", disabled: false },
                ] as const).map((c) => {
                  const on = channel === c.k;
                  return (
                    <button key={c.k} disabled={c.disabled} onClick={() => (c.disabled ? soon(`${c.l} · requiere dispatcher externo`) : setChannel(c.k))} style={{ padding: 12, borderRadius: 10, border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "#ecfdf5" : "#fff", cursor: c.disabled ? "not-allowed" : "pointer", opacity: c.disabled ? 0.55 : 1, fontFamily: "inherit", textAlign: "left", display: "flex", flexDirection: "column", gap: 4 }}>
                      <Icon name={c.i} size={16} color={on ? "var(--primary)" : "#0a0a0a"} />
                      <span style={{ fontSize: 12, fontWeight: 900, marginTop: 4 }}>{c.l}</span>
                      <span style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{c.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Content */}
            <div>
              <div className="label-mp" style={{ marginBottom: 8 }}>Contenido</div>
              {channel === "email" && (
                <input placeholder="Asunto del email" defaultValue="Open Verano · últimos 6 cupos te esperan" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12.5, fontFamily: "inherit", outline: "none", marginBottom: 8 }} />
              )}
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título · 60 caracteres" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13, fontWeight: 700, fontFamily: "inherit", outline: "none", marginBottom: 8 }} />
              <div style={{ position: "relative" }}>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Mensaje…" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, fontFamily: "inherit", minHeight: 72, resize: "none", outline: "none" }} />
                <span style={{ position: "absolute", bottom: 8, right: 10, fontSize: 9.5, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace" }}>{body.length} / 280</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>CTA:</span>
                <input value={cta} onChange={(e) => setCta(e.target.value)} style={{ flex: 1, padding: "7px 12px", borderRadius: 9999, border: "1px solid var(--border)", fontSize: 11, fontFamily: "inherit", outline: "none", maxWidth: 200 }} />
                <span style={{ flex: 1 }} />
                <button onClick={() => soon("Generar con IA · próximamente")} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", fontSize: 10.5, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}>
                  <Icon name="sparkles" size={11} />Generar con IA
                </button>
              </div>
              {channel === "banner" && (
                <div style={{ marginTop: 10, padding: 12, borderRadius: 9, background: "#fffbeb", border: "1px solid #fde68a", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: "#78350f", letterSpacing: "0.06em", textTransform: "uppercase" }}>Banner global · lo verán todos los usuarios</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {([
                      { k: "info", l: "Info", c: "#1e3a8a" },
                      { k: "warn", l: "Aviso", c: "#78350f" },
                      { k: "critical", l: "Crítico", c: "#7f1d1d" },
                    ] as const).map((o) => {
                      const on = bannerLevel === o.k;
                      return (
                        <button key={o.k} onClick={() => setBannerLevel(o.k)} style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid " + (on ? o.c : "var(--border)"), background: on ? o.c : "#fff", color: on ? "#fff" : "#0a0a0a", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800 }}>{o.l}</button>
                      );
                    })}
                  </div>
                  <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="Enlace del CTA (opcional) · ej. /dashboard/user/eventos" style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 11.5, fontFamily: "inherit", outline: "none" }} />
                </div>
              )}
            </div>

            {/* Audience */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <span className="label-mp">Audiencia</span>
                <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
                  Alcance real: <b className="font-heading tabular" style={{ color: "var(--primary)", fontSize: 16, marginLeft: 4 }}>{reach === null ? "…" : nf(reach)}</b> personas
                </span>
              </div>
              <div style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "#fafafa", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minHeight: 50 }}>
                {chips.length === 0 && <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Todos los usuarios · {totalUsersLabel} personas</span>}
                {chips.map((c, i) => (
                  <span key={c.k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && <span style={{ fontSize: 9.5, fontWeight: 900, color: "var(--muted-fg)", letterSpacing: "0.14em", padding: "0 2px" }}>Y</span>}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 9999, background: "#fff", border: "1px solid " + c.c + "55", color: "#0a0a0a", fontSize: 11, fontWeight: 800 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.c }} />
                      {c.l}
                      <button onClick={() => removeChip(c.k)} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", padding: 0, display: "inline-flex", marginLeft: 2 }}>
                        <Icon name="x" size={11} />
                      </button>
                    </span>
                  </span>
                ))}
                <button onClick={() => soon("Añadir condición · próximamente")} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 9999, background: "transparent", border: "1px dashed var(--border)", color: "var(--muted-fg)", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <Icon name="plus" size={11} />Añadir condición
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700, alignSelf: "center", marginRight: 4 }}>Sugeridos:</span>
                {SUGGESTED_CHIPS.filter((s) => !chips.some((x) => x.k === s.k)).map((s) => (
                  <button key={s.k} onClick={() => addChip(s)} style={{ padding: "3px 8px", borderRadius: 9999, background: "#fff", border: "1px solid var(--border)", fontSize: 10, fontWeight: 700, color: "var(--muted-fg)", cursor: "pointer", fontFamily: "inherit" }}>
                    + {s.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <div className="label-mp" style={{ marginBottom: 8 }}>Cuándo enviar</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {([
                  { k: "now", l: "Ahora", i: "send" },
                  { k: "best", l: "Sin recomendación", i: "sparkles" },
                  { k: "time", l: "Programar", i: "calendar" },
                ] as const).map((o) => {
                  const on = scheduleMode === o.k;
                  return (
                    <button key={o.k} onClick={() => setScheduleMode(o.k)} style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: on ? "2px solid var(--primary)" : "1px solid var(--border)", background: on ? "#ecfdf5" : "#fff", cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11, fontWeight: 800 }}>
                      <Icon name={o.i} size={12} color={on ? "var(--primary)" : "#0a0a0a"} />
                      {o.l}
                    </button>
                  );
                })}
              </div>
              {scheduleMode === "best" && <BestTimeHint />}
              {scheduleMode === "time" && (
                <input type="datetime-local" value={schedAt} onChange={(e) => setSchedAt(e.target.value)} style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              )}
            </div>

            {/* Send */}
            {channel === "banner" ? (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", flex: 1 }} disabled={pending} onClick={removeBanner}>
                  <Icon name="x" size={13} />Quitar banner activo
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={pending || (!title && !body)} onClick={publishBanner}>
                  <Icon name="megaphone" size={13} color="#fff" />Publicar banner
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", flex: 1 }} disabled={pending} onClick={() => sendCampaign("draft")}>
                  <Icon name="save" size={13} />Guardar borrador
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} disabled={pending} onClick={() => sendCampaign(scheduleMode === "time" ? "time" : "now")}>
                  <Icon name="send" size={13} color="#fff" />
                  {scheduleMode === "now" ? `Enviar ahora${reach !== null ? ` · ${nf(reach)} personas` : ""}` : scheduleMode === "best" ? "Enviar ahora" : "Guardar programada"}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: Preview */}
          <div style={{ padding: 22, background: "linear-gradient(180deg, #fafafa, #f5f5f5)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
              <span className="label-mp">Preview live</span>
              <div style={{ display: "inline-flex", gap: 4, background: "#fff", borderRadius: 9999, padding: 2, border: "1px solid var(--border)" }}>
                {(["mobile", "desktop"] as const).map((o) => {
                  const on = previewMode === o;
                  return (
                    <button key={o} onClick={() => setPreviewMode(o)} style={{ padding: "4px 9px", borderRadius: 9999, border: 0, background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)", fontFamily: "inherit", fontSize: 10, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, textTransform: "capitalize" }}>
                      <Icon name={o === "mobile" ? "smartphone" : "monitor"} size={11} color={on ? "#fff" : undefined} />{o}
                    </button>
                  );
                })}
              </div>
            </div>
            <ChannelPreview channel={channel} title={title} body={body} cta={cta} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "var(--muted-fg)", textAlign: "center", lineHeight: 1.5 }}>
              <Icon name="info" size={11} />
              <span>Vista aproximada · puede variar según el dispositivo del usuario</span>
            </div>
          </div>
        </div>
      </div>

      {/* TEMPLATES */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 10 }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>Plantillas guardadas<span className="dot">.</span></h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{nf(data.templates.length)} {data.templates.length === 1 ? "plantilla" : "plantillas"}</span>
        </div>
        {data.templates.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)", fontSize: 12.5 }}>
            Aún no hay plantillas. Arma una campaña y dale <b style={{ color: "#0a0a0a" }}>“Guardar plantilla”</b> para reusarla.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {data.templates.map((t) => (
              <div key={t.id} className="card mp-bcast-tpl" style={{ padding: 14, position: "relative", border: "1px solid var(--border)", background: "#fff", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
                <button onClick={() => removeTemplate(t)} disabled={pending} aria-label="Borrar plantilla" style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: 6, background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="trash-2" size={12} />
                </button>
                <button onClick={() => loadTemplate(t)} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", width: "100%" }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: "var(--muted)", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={CHANNEL_ICON[t.channel] ?? "message-square"} size={13} />
                  </span>
                  <div style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: "-0.01em", paddingRight: 18 }}>{t.name}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)", textTransform: "capitalize" }}>{t.channel}{t.title ? ` · ${t.title.slice(0, 30)}` : ""}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace", marginTop: "auto" }}>usar plantilla →</div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CAMPAIGNS */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 22px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>Campañas<span className="dot">.</span></h2>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {([
              { k: "all", l: "Todas", n: counts.all },
              { k: "sent", l: "Enviadas", n: counts.sent },
              { k: "scheduled", l: "Programadas", n: counts.scheduled },
              { k: "draft", l: "Borradores", n: counts.draft },
            ] as const).map((t) => {
              const on = tab === t.k;
              return (
                <button key={t.k} onClick={() => setTab(t.k)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 9999, background: on ? "#0a0a0a" : "#fff", color: on ? "#fff" : "#0a0a0a", border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"), fontFamily: "inherit", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                  {t.l}
                  <span style={{ padding: "1px 6px", borderRadius: 9999, background: on ? "rgba(255,255,255,0.18)" : "var(--muted)", color: on ? "#fff" : "var(--muted-fg)", fontSize: 9.5, fontWeight: 900 }}>{t.n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mp-table-scroll">
          <div style={{ minWidth: 760 }}>
            <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: BCAST_HISTORY_COLS, gap: 12, padding: "10px 22px", background: "#fafafa", borderBottom: "1px solid var(--border)", alignItems: "center", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
              <div />
              <div>Mensaje</div>
              <div>Audiencia</div>
              <div>Cuándo</div>
              <div>Performance</div>
              <div>Estado</div>
              <div />
            </div>
            {visible.map((c, i) => (
              <CampaignRow key={c.id} c={c} last={i === visible.length - 1} onOpen={() => setOpenCampaign(c.id)} />
            ))}
            {visible.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>Ninguna campaña en este estado.</div>}
          </div>
        </div>
      </div>

      {openCampaign && <CampaignDrawer c={campaigns.find((x) => x.id === openCampaign)!} close={() => setOpenCampaign(null)} onAction={soon} />}
    </div>
  );
}

function ChannelPreview({ channel, title, body, cta }: { channel: string; title: string; body: string; cta: string }) {
  if (channel === "push") return <PushPreview title={title} body={body} />;
  if (channel === "email") return <EmailPreview title={title} body={body} cta={cta} />;
  if (channel === "banner") return <BannerPreview title={title} body={body} cta={cta} />;
  return <InAppPreview title={title} body={body} cta={cta} />;
}

function PushPreview({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ width: 280, padding: 14, background: "#1c1c1e", borderRadius: 22, color: "#fff", position: "relative", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9.5, color: "rgba(255,255,255,0.5)", marginBottom: 12, fontFamily: "ui-monospace, monospace" }}>
        <span>10:30</span><span>● ahora</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: "#10b981", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#fff", fontWeight: 900 }}>●</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.1em" }}>MATCHPOINT</span>
          <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 4, lineHeight: 1.25 }}>{title || "Tu título aquí"}</div>
          <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.75)", marginTop: 4, lineHeight: 1.4 }}>{body || "Tu mensaje aparecerá aquí…"}</div>
        </div>
      </div>
      <div style={{ position: "absolute", top: 6, left: "50%", transform: "translateX(-50%)", width: 60, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 9999 }} />
    </div>
  );
}

function EmailPreview({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div style={{ width: 320, background: "#fff", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", overflow: "hidden", border: "1px solid var(--border)" }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "#fafafa" }}>
        <div className="font-heading" style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#047857)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 900 }}>MP</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800 }}>MATCHPOINT</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>hola@matchpoint.top · ahora</div>
        </div>
        <Icon name="star" size={12} color="var(--muted-fg)" />
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{title || "Asunto del email"}</div>
        <div style={{ fontSize: 11.5, color: "#404040", marginTop: 10, lineHeight: 1.55 }}>{body || "Cuerpo del email…"}</div>
        <button style={{ marginTop: 14, padding: "8px 16px", borderRadius: 8, background: "var(--primary)", color: "#fff", border: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "default" }}>{cta || "Acción"}</button>
      </div>
    </div>
  );
}

function BannerPreview({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div style={{ width: 320, background: "#fff", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", overflow: "hidden", border: "1px solid var(--border)" }}>
      <div style={{ height: 22, background: "#fafafa", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", padding: "0 10px", gap: 5 }}>
        {["#ef4444", "#fbbf24", "#10b981"].map((c) => <span key={c} style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />)}
        <div style={{ flex: 1, margin: "0 8px", height: 11, background: "#fff", borderRadius: 4, border: "1px solid var(--border)" }} />
      </div>
      <div style={{ padding: "12px 14px", background: "#0a0a0a", color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="megaphone" size={14} color="#fbbf24" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, lineHeight: 1.2 }}>{title || "Tu anuncio aquí"}</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{body?.slice(0, 60) || "Texto secundario…"}</div>
        </div>
        <button style={{ padding: "5px 10px", borderRadius: 9999, background: "#fbbf24", color: "#0a0a0a", border: 0, fontFamily: "inherit", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", cursor: "default", flexShrink: 0 }}>{cta || "Ver"}</button>
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ height: 8, background: "var(--muted)", borderRadius: 4, marginBottom: 8 }} />
        <div style={{ height: 8, background: "var(--muted)", borderRadius: 4, width: "70%", marginBottom: 14 }} />
        <div className="mp-grid-form-2 gap-2">
          <div style={{ height: 50, background: "var(--muted)", borderRadius: 6 }} />
          <div style={{ height: 50, background: "var(--muted)", borderRadius: 6 }} />
        </div>
      </div>
    </div>
  );
}

function InAppPreview({ title, body, cta }: { title: string; body: string; cta: string }) {
  return (
    <div style={{ width: 280, background: "rgba(10,10,10,0.65)", borderRadius: 22, padding: 14, position: "relative", boxShadow: "0 8px 24px rgba(0,0,0,0.3)", minHeight: 240, display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", background: "#fff", borderRadius: 16, padding: 18, boxShadow: "0 -4px 16px rgba(0,0,0,0.15)" }}>
        <div style={{ width: 36, height: 4, background: "var(--border)", borderRadius: 9999, margin: "0 auto 12px" }} />
        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.12)", color: "var(--primary)", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>● MATCHPOINT</div>
        <div style={{ fontSize: 13, fontWeight: 900, marginTop: 8, lineHeight: 1.3, letterSpacing: "-0.01em" }}>{title || "Tu título"}</div>
        <div style={{ fontSize: 11, color: "#525252", marginTop: 6, lineHeight: 1.5 }}>{body || "Tu mensaje…"}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button style={{ flex: 1, padding: "8px 12px", borderRadius: 9999, background: "#fafafa", color: "#0a0a0a", border: "1px solid var(--border)", fontSize: 10, fontWeight: 800, fontFamily: "inherit", cursor: "default" }}>Cerrar</button>
          <button style={{ flex: 1, padding: "8px 12px", borderRadius: 9999, background: "var(--primary)", color: "#fff", border: 0, fontSize: 10, fontWeight: 900, fontFamily: "inherit", cursor: "default", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cta || "Acción"}</button>
        </div>
      </div>
    </div>
  );
}

function BestTimeHint() {
  return (
    <div style={{ padding: 12, borderRadius: 9, background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="zap" size={12} color="var(--primary)" />
          <span style={{ fontSize: 11.5, fontWeight: 800, color: "#065f46" }}>Recomendación automática no disponible</span>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: "#065f46", lineHeight: 1.4 }}>
        MATCHPOINT registra aperturas, pero todavía no calcula una recomendación por hora. Usa “Programar” para escoger una hora manualmente.
      </div>
    </div>
  );
}

const KIND_META: Record<string, { i: string; c: string; l: string }> = {
  push: { i: "smartphone", c: "#7c3aed", l: "Push" },
  email: { i: "mail", c: "#0ea5e9", l: "Email" },
  banner: { i: "megaphone", c: "#fbbf24", l: "Banner" },
  "in-app": { i: "message-square", c: "var(--primary)", l: "In-app" },
};

function CampaignRow({ c, last, onOpen }: { c: Campaign; last: boolean; onOpen: () => void }) {
  const km = KIND_META[c.kind];
  const stMeta = {
    sent: { bg: "rgba(16,185,129,0.12)", fg: "#047857", l: "Enviada" },
    live: { bg: "rgba(124,58,237,0.12)", fg: "#6d28d9", l: "● Live trigger" },
    scheduled: { bg: "#fef3c7", fg: "#92400e", l: "⏱ Programada" },
    draft: { bg: "var(--muted)", fg: "var(--muted-fg)", l: "Borrador" },
  }[c.st];
  const openRate = c.opened !== null && c.sent ? (c.opened / c.sent) * 100 : null;
  const clickRate = c.clicked && c.sent ? (c.clicked / c.sent) * 100 : null;
  return (
    <button onClick={onOpen} className="mp-bcast-row mp-table-row" style={{ display: "grid", gridTemplateColumns: BCAST_HISTORY_COLS, gap: 12, padding: "14px 22px", borderBottom: last ? 0 : "1px solid var(--border)", alignItems: "center", cursor: "pointer", background: "#fff", width: "100%", border: 0, borderRadius: 0, fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ width: 32, height: 32, borderRadius: 8, background: km.c + "18", color: km.c, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={km.i} size={14} color={km.c} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.t}</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700, marginTop: 2 }}>{c.kind}</div>
      </div>
      <div style={{ fontSize: 11.5, color: "#404040", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.audience}</div>
      <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{c.when}</div>
      <div>
        {openRate !== null ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span className="font-heading tabular" style={{ fontSize: 14, fontWeight: 900, color: "var(--primary)" }}>{openRate.toFixed(0)}%</span>
              <span style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700 }}>{clickRate !== null ? `abiertos · ${clickRate.toFixed(0)}% click` : "abiertos"}</span>
            </div>
            <div style={{ height: 3, marginTop: 4, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: openRate + "%", background: "var(--primary)" }} />
            </div>
          </>
        ) : c.reach ? (
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{nf(c.reach)} alcance</span>
        ) : (
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>—</span>
        )}
      </div>
      <span style={{ padding: "3px 9px", borderRadius: 9999, background: stMeta.bg, color: stMeta.fg, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", justifySelf: "start" }}>{stMeta.l}</span>
      <Icon name="chevron-right" size={14} color="var(--muted-fg)" style={{ justifySelf: "end" }} />
    </button>
  );
}

function CampaignDrawer({ c, close, onAction }: { c: Campaign; close: () => void; onAction: (t: string) => void }) {
  const km = KIND_META[c.kind];
  // Funnel real hasta "Abiertos" (tracking de aperturas). No hay acuse real de
  // entrega, clicks ni conversión; no se inventan porcentajes.
  const funnel = c.sent
    ? [
        { l: "Destinatarios", v: c.sent, pct: 100, color: "#0a0a0a" },
        { l: "Abiertos", v: c.opened || 0, pct: c.opened ? (c.opened / c.sent) * 100 : 0, color: "var(--primary)" },
      ]
    : null;
  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, background: "#fff", height: "100%", overflow: "auto", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)", animation: "mpSlideIn 220ms cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ background: "#0a0a0a", color: "#fff", padding: 22, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 85% 20%, ${km.c}33, transparent 60%)` }} />
          <button onClick={close} style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div style={{ position: "relative" }}>
            <div className="label-mp" style={{ color: km.c }}>● Campaña · {km.l}</div>
            <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "10px 0 0", lineHeight: 1.15 }}>{c.t}<span style={{ color: "var(--primary)" }}>.</span></h2>
            <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.7)", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="users" size={11} color="rgba(255,255,255,0.7)" />{c.audience}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="clock" size={11} color="rgba(255,255,255,0.7)" />{c.when}</span>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 11, color: "rgba(255,255,255,0.68)", lineHeight: 1.5 }}>
              Clicks, conversión y acuse de entrega quedan pendientes de instrumentación.
            </p>
          </div>
        </div>

        {funnel ? (
          <div style={{ padding: 22, borderBottom: "1px solid var(--border)" }}>
            <div className="label-mp" style={{ marginBottom: 14 }}>Funnel de la campaña</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {funnel.map((f, i) => (
                <div key={f.l}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{f.l}</span>
                    <span className="tabular" style={{ fontSize: 12, fontWeight: 800 }}>
                      {nf(f.v)}<span style={{ fontSize: 10.5, color: "var(--muted-fg)", marginLeft: 6, fontWeight: 700 }}>{f.pct.toFixed(1)}%</span>
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: "var(--muted)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: f.pct + "%", background: f.color }} />
                  </div>
                  {i < funnel.length - 1 && funnel[i + 1].pct > 0 && (
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 3, textAlign: "right", fontFamily: "ui-monospace, monospace" }}>↓ {((funnel[i + 1].v / f.v) * 100).toFixed(0)}% pasa al siguiente paso</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: 22, textAlign: "center", color: "var(--muted-fg)", fontSize: 12.5 }}>Campaña sin datos de envío todavía.</div>
        )}

        <div className="mp-grid-form-2 gap-2" style={{ padding: 22, borderBottom: "1px solid var(--border)" }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => onAction("Duplicar campaña · próximamente")}><Icon name="copy" size={12} />Duplicar</button>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => onAction("Ver audiencia · próximamente")}><Icon name="users" size={12} />Ver audiencia</button>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={() => onAction("Exportar CSV · próximamente")}><Icon name="download" size={12} />Exportar CSV</button>
          <button className="btn btn-primary" onClick={() => onAction("Re-enviar a no-abridores · próximamente")}><Icon name="repeat" size={12} color="#fff" />Re-enviar</button>
        </div>

        <div style={{ padding: 22 }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>Contenido enviado</div>
          <div style={{ padding: 14, borderRadius: 8, background: "#fafafa", border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 900 }}>{c.t}</div>
            <div style={{ fontSize: 11.5, color: "#525252", marginTop: 6, lineHeight: 1.5 }}>Contenido del mensaje original tal como lo recibió la audiencia.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
