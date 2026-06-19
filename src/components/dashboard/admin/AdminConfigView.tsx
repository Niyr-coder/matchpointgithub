"use client";
// Admin · Configuración v2 — settings agrupados con audit inline, editor por
// fila, save bar y búsqueda. Migrado del prototipo
// (ui_kits/dashboard/AdminConfigScreen.jsx): data-lucide → <Icon>, draft local.
//
// MERGE backend real: las filas con `cfg` mapean a una key de platform_config y
// PERSISTEN de verdad vía updatePlatformConfig (admin-only, auditada). El server
// AdminConfigScreenServer inyecta los valores reales en `real`. Las filas sin
// `cfg` (constantes del app, integraciones, branding) se conservan como display
// read-only: no son inputs muertos, no muestran lápiz ni save bar. El save bar
// persiste solo los drafts de keys reales y refresca. Marca MATCHPOINT; pagos
// por transferencia/DeUna (no hay PSP). Ver docs/guides/03-platform-config.md.
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { updatePlatformConfig } from "@/server/actions/platform-config";

type SType = "text" | "select" | "number" | "toggle" | "color" | "file" | "multi" | "status";
// cfg = key real en platform_config + cómo se renderiza/parsea el value.
type CfgKind = "number" | "boolean" | "percent" | "cents";
type CfgRef = { key: string; kind: CfgKind; suffix?: string };
type Setting = {
  k: string; l: string; v: string; type: SType; opts?: string[]; audit: string;
  mono?: boolean; critical?: boolean; warn?: boolean; hint?: string;
  integration?: boolean; icon?: string; off?: boolean;
  cfg?: CfgRef; // si está presente → editable + persiste
};
type Section = { k: string; i: string; t: string; desc: string };

export type RealConfig = Record<string, { value: unknown; updatedAt: string | null }>;

const GROUPS: { g: string; sections: Section[] }[] = [
  { g: "Plataforma", sections: [{ k: "general", i: "sliders-horizontal", t: "General", desc: "Identidad, locale, zona horaria." }, { k: "branding", i: "palette", t: "Marca & idioma", desc: "Logo, dominios, idiomas activos." }] },
  { g: "Comercial", sections: [{ k: "pagos", i: "wallet", t: "Pagos & comisiones", desc: "Take rate, payouts, retención fiscal." }, { k: "eventos", i: "trophy", t: "Eventos & torneos", desc: "Premios, cupos, edición tardía, estelar." }, { k: "mpplus", i: "sparkles", t: "MATCHPOINT+", desc: "Trial, planes, addons." }] },
  { g: "Comunidad", sections: [{ k: "comunidad", i: "users", t: "Comunidad & ranking", desc: "Ranking, busco partido, mensajes de sistema." }] },
  { g: "Operación", sections: [{ k: "mod", i: "shield-alert", t: "Moderación", desc: "Auto-ban, SLAs, filtros de palabras." }, { k: "soporte", i: "life-buoy", t: "Soporte", desc: "Tiempos de respuesta, horarios." }] },
  { g: "Sistema", sections: [{ k: "integraciones", i: "plug", t: "Integraciones", desc: "Mapas, Push, Email, SMS." }, { k: "seguridad", i: "lock-keyhole", t: "Seguridad", desc: "MFA, sesiones, IP allowlist." }] },
];

// Audit fallback para filas sin tabla de config (constantes del app).
const APP_CONST = "constante del app · no editable aquí";

const INITIAL: Record<string, Setting[]> = {
  general: [
    { k: "platform_name", l: "Nombre de la plataforma", v: "MATCHPOINT", type: "text", audit: APP_CONST },
    { k: "country", l: "País", v: "🇪🇨 Ecuador", type: "select", opts: ["🇪🇨 Ecuador"], audit: APP_CONST },
    { k: "currency", l: "Moneda por defecto", v: "USD ($)", type: "select", opts: ["USD ($)"], audit: APP_CONST },
    { k: "locale", l: "Locale", v: "es-EC", type: "text", audit: APP_CONST, mono: true },
    { k: "timezone", l: "Zona horaria", v: "America/Guayaquil (UTC-5)", type: "select", opts: ["America/Guayaquil (UTC-5)"], audit: APP_CONST },
    { k: "domain", l: "Dominio", v: "matchpoint.top", type: "text", audit: APP_CONST, critical: true, mono: true },
  ],
  branding: [
    { k: "logo_url", l: "Logo principal", v: "Definido en código (assets)", type: "text", audit: APP_CONST },
    { k: "primary_color", l: "Color de marca", v: "#10b981", type: "text", audit: APP_CONST, mono: true },
    { k: "langs", l: "Idiomas activos", v: "Español (es-EC)", type: "text", audit: APP_CONST },
  ],
  pagos: [
    { k: "commission_rate", l: "Take rate MATCHPOINT", v: "—", type: "number", audit: "—", critical: true, mono: true, hint: "Comisión sobre transacciones de torneo. Aplica a transacciones nuevas.", cfg: { key: "take_rate_pct", kind: "percent" } },
    { k: "processor", l: "Cobro de pagos", v: "Transferencia / DeUna / Saldo MP / Efectivo", type: "status", audit: "manual · sin PSP", mono: true },
    { k: "payout_schedule", l: "Calendario de payout", v: "Manual (humano)", type: "status", audit: "sin payouts automáticos aún" },
    { k: "retencion", l: "Retención fiscal · EC", v: "IVA 15%", type: "text", audit: APP_CONST, warn: true, hint: "Cambios requieren validación contable." },
  ],
  eventos: [
    { k: "estelar_price_cents", l: "Precio torneo estelar", v: "—", type: "number", audit: "—", mono: true, hint: "Costo de marcar un torneo como estelar (USD). Lo cobra el admin manualmente.", cfg: { key: "estelar_price_cents", kind: "cents" } },
    { k: "refund_window_days", l: "Ventana de reembolso", v: "—", type: "number", audit: "—", mono: true, hint: "Plazo máximo (días) para devolver cuotas tras cancelar un torneo.", cfg: { key: "refund_window_days", kind: "number", suffix: " días" } },
    { k: "multisport_enabled", l: "Multideporte", v: "—", type: "toggle", audit: "—", critical: true, hint: "Off = solo Pickleball en toda la plataforma. On = Pickleball + Pádel + Tenis.", cfg: { key: "multisport_enabled", kind: "boolean" } },
  ],
  mpplus: [
    { k: "monthly_price", l: "Plan mensual", v: "USD 6.99 / mes", type: "text", audit: "PREMIUM_PRICE_CENTS_PER_MONTH (código)", mono: true },
    { k: "duration", l: "Duración por compra", v: "1–12 meses", type: "text", audit: "sin recurrencia automática", mono: true },
  ],
  comunidad: [
    { k: "ranking_min_matches", l: "Mínimo de partidos para ranking", v: "—", type: "number", audit: "—", mono: true, hint: "Partidos jugados mínimos para aparecer en el ranking público.", cfg: { key: "ranking_min_matches", kind: "number", suffix: " partidos" } },
    { k: "match_seek_expiry_days", l: "Expiración de \"Busco partido\"", v: "—", type: "number", audit: "—", mono: true, hint: "Días que vive un aviso antes de expirar.", cfg: { key: "match_seek_expiry_days", kind: "number", suffix: " días" } },
    { k: "match_seek_max_open_per_user", l: "Avisos abiertos por jugador", v: "—", type: "number", audit: "—", mono: true, hint: "Máximo de avisos \"Busco partido\" simultáneos por jugador.", cfg: { key: "match_seek_max_open_per_user", kind: "number", suffix: " avisos" } },
    { k: "system_messages_enabled", l: "Mensajes de sistema", v: "—", type: "toggle", audit: "—", hint: "Master switch para los DMs de bienvenida de MATCHPOINT. Off = todos los hooks no-op.", cfg: { key: "system_messages_enabled", kind: "boolean" } },
  ],
  mod: [
    { k: "appeals", l: "Apelaciones", v: "Hasta 7 días post-acción", type: "text", audit: APP_CONST },
    { k: "sla_high", l: "SLA severidad alta", v: "30 minutos", type: "text", audit: APP_CONST, mono: true },
  ],
  soporte: [
    { k: "support_hours", l: "Horario de soporte", v: "L–V 09:00–18:00 ECT", type: "text", audit: APP_CONST },
    { k: "first_response", l: "Tiempo primera respuesta", v: "< 30 minutos", type: "text", audit: APP_CONST, mono: true },
  ],
  integraciones: [
    { k: "gmaps", l: "MapLibre / Mapas", v: "● Conectado", type: "status", audit: "feb 2024", integration: true, icon: "map" },
    { k: "push", l: "Push notifications", v: "○ Pendiente", type: "status", audit: "nunca", integration: true, icon: "bell", off: true },
    { k: "email", l: "Email", v: "● Conectado", type: "status", audit: "feb 2024", integration: true, icon: "mail" },
    { k: "sms", l: "SMS", v: "○ Desconectado", type: "status", audit: "nunca", integration: true, icon: "message-circle", off: true },
  ],
  seguridad: [
    { k: "mfa_required", l: "MFA obligatorio para staff", v: "Gestionado por Supabase Auth", type: "status", audit: APP_CONST, critical: true },
    { k: "session_ttl", l: "Duración de sesión", v: "Definida en Supabase Auth", type: "status", audit: APP_CONST, mono: true },
    { k: "ip_allowlist", l: "IP allowlist (admin panel)", v: "○ Desactivada", type: "status", audit: APP_CONST, critical: true },
  ],
};

const ALL_SECTIONS = GROUPS.flatMap((g) => g.sections);

// ── Formato value real → texto legible para la fila ─────────────────────────
function fmtReal(cfg: CfgRef, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (cfg.kind === "boolean") return value === true ? "Sí · activado" : "○ No · desactivado";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (cfg.kind === "percent") return `${n.toFixed(1)}%`;
  if (cfg.kind === "cents") return `$${(n / 100).toFixed(2)}`;
  return `${n}${cfg.suffix ?? ""}`;
}

// El value crudo (lo que el editor manipula como string) a partir del real.
function rawValueStr(cfg: CfgRef, value: unknown): string {
  if (value === null || value === undefined) return cfg.kind === "boolean" ? "false" : "0";
  if (cfg.kind === "boolean") return value === true ? "true" : "false";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "0";
  if (cfg.kind === "cents") return (n / 100).toFixed(2); // se edita en dólares
  return String(n);
}

// El value crudo (string del editor) → número/boolean que espera la action.
function toActionValue(cfg: CfgRef, raw: string): number | boolean {
  if (cfg.kind === "boolean") return raw === "true";
  const n = Number(raw.replace(",", "."));
  if (cfg.kind === "cents") return Math.round(n * 100);
  return n;
}

function fmtUpdatedAt(iso: string | null): string {
  if (!iso) return "sin registro";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sin registro";
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

export function AdminConfigView({ real }: { real: RealConfig }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState("general");
  // draft: rawValue string por design-key (k). Solo para filas con cfg.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");

  // Resuelve el value mostrado + audit a partir de `real` para filas cfg.
  const resolve = (s: Setting): { display: string; rawCurrent: string; audit: string } => {
    if (!s.cfg) return { display: s.v, rawCurrent: "", audit: s.audit };
    const rc = real[s.cfg.key];
    return {
      display: fmtReal(s.cfg, rc?.value ?? null),
      rawCurrent: rawValueStr(s.cfg, rc?.value ?? null),
      audit: `actualizado ${fmtUpdatedAt(rc?.updatedAt ?? null)}`,
    };
  };

  const current = ALL_SECTIONS.find((s) => s.k === active)!;
  const settings = INITIAL[active] || [];
  const groupOf = GROUPS.find((g) => g.sections.some((s) => s.k === active))!.g;

  const searchResults = search
    ? ALL_SECTIONS.flatMap((sec) => (INITIAL[sec.k] || []).filter((s) => (s.l + " " + s.k + " " + (s.cfg?.key ?? "")).toLowerCase().includes(search.toLowerCase())).map((s) => ({ ...s, section: sec })))
    : null;

  const draftKeys = Object.keys(draft);
  const hasChanges = draftKeys.length > 0;

  const findSetting = (designKey: string): Setting | undefined =>
    ALL_SECTIONS.flatMap((sec) => INITIAL[sec.k] || []).find((s) => s.k === designKey);

  const stage = (s: Setting, rawValue: string) => {
    const { rawCurrent } = resolve(s);
    setDraft((d) => {
      const next = { ...d };
      if (rawValue === rawCurrent) delete next[s.k];
      else next[s.k] = rawValue;
      return next;
    });
  };
  const reset = (designKey: string) => setDraft((d) => { const n = { ...d }; delete n[designKey]; return n; });
  const cancel = () => setDraft({});

  const save = () => {
    startTransition(async () => {
      let okCount = 0;
      for (const designKey of draftKeys) {
        const s = findSetting(designKey);
        if (!s?.cfg) continue;
        const res = await updatePlatformConfig({ key: s.cfg.key, value: toActionValue(s.cfg, draft[designKey]) });
        if (res.ok) okCount++;
        else {
          toast({ icon: "alert-triangle", title: "Error guardando", sub: `${s.l}: ${res.error.message}` });
          return;
        }
      }
      if (okCount > 0) {
        toast({ icon: "check", title: `${okCount} cambio${okCount === 1 ? "" : "s"} guardado${okCount === 1 ? "" : "s"}` });
        setDraft({});
        router.refresh();
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "#dc2626" }}>● Settings · pisa con cuidado</div>
            <h1 className="font-heading mp-admin-page-title" style={{ fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "8px 0 0" }}>
              Configuración<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>Valores que afectan a toda la plataforma en producción · todos los cambios quedan en audit</p>
          </div>
          <div style={{ position: "relative", minWidth: 260 }}>
            <span style={{ position: "absolute", left: 12, top: 11, display: "inline-flex" }}>
              <Icon name="search" size={13} color="var(--muted-fg)" />
            </span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar setting · take rate, estelar, ranking…" style={{ width: "100%", padding: "11px 14px 11px 34px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12.5, fontFamily: "inherit", outline: "none", background: "#fff" }} />
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="mp-config-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "flex-start" }}>
        {/* SIDEBAR */}
        <div className="mp-config-side" style={{ position: "sticky", top: 88, display: "flex", flexDirection: "column", gap: 14 }}>
          {GROUPS.map((g) => (
            <div key={g.g} className="card" style={{ padding: 8 }}>
              <div style={{ padding: "8px 10px" }} className="label-mp">{g.g}</div>
              {g.sections.map((s) => {
                const on = active === s.k;
                const sectionDraft = Object.keys(draft).filter((k) => INITIAL[s.k]?.some((x) => x.k === k)).length;
                return (
                  <button key={s.k} onClick={() => { setActive(s.k); setSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "#0a0a0a", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 2 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: on ? "var(--primary)" : "var(--muted)", color: on ? "#fff" : "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon name={s.i} size={12} color={on ? "#fff" : undefined} />
                    </span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: on ? 800 : 600 }}>{s.t}</span>
                    {sectionDraft > 0 && <span style={{ padding: "1px 6px", borderRadius: 9999, background: "#fbbf24", color: "#0a0a0a", fontSize: 9, fontWeight: 900 }}>{sectionDraft}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* CONTENT */}
        {searchResults ? (
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: 0 }}>
                Resultados<span className="dot">.</span>
              </h2>
              <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>{searchResults.length} settings encontrados</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {searchResults.map((r) => (
                <button key={r.section.k + "-" + r.k} onClick={() => { setActive(r.section.k); setSearch(""); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: 8, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <Icon name={r.section.i} size={14} color="var(--muted-fg)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800 }}>{r.l}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                      {r.section.t} · <code style={{ fontFamily: "ui-monospace, monospace" }}>{r.cfg?.key ?? r.k}</code>
                    </div>
                  </div>
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#0a0a0a" }}>{resolve(r).display}</span>
                  <Icon name="arrow-right" size={12} color="var(--muted-fg)" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 44, height: 44, borderRadius: 11, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={current.i} size={18} color="#fff" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="label-mp">{groupOf}</div>
                <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: "2px 0 0" }}>
                  {current.t}<span className="dot">.</span>
                </h2>
                <p style={{ fontSize: 11.5, color: "var(--muted-fg)", margin: "4px 0 0" }}>{current.desc}</p>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace" }}>{settings.length} settings</span>
            </div>

            {active === "integraciones" ? (
              <IntegrationsGrid settings={settings} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {settings.map((s, i) => {
                  const r = resolve(s);
                  return (
                    <SettingRow
                      key={s.k}
                      s={s}
                      last={i === settings.length - 1}
                      display={draft[s.k] !== undefined && s.cfg ? fmtReal(s.cfg, toActionValue(s.cfg, draft[s.k])) : r.display}
                      rawCurrent={r.rawCurrent}
                      auditText={r.audit}
                      dirty={draft[s.k] !== undefined}
                      originalDisplay={r.display}
                      onChange={(raw) => stage(s, raw)}
                      onReset={() => reset(s.k)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* SAVE BAR */}
      {hasChanges && (
        <div style={{ position: "sticky", bottom: 16, zIndex: 100 }}>
          <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: 14, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.25)", border: "1px solid #fbbf24", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#fbbf24", color: "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="alert-triangle" size={15} color="#0a0a0a" />
              </span>
              <div>
                <div className="font-heading" style={{ fontWeight: 900, fontSize: 14, letterSpacing: "-0.01em" }}>
                  {draftKeys.length} cambio{draftKeys.length === 1 ? "" : "s"} sin guardar
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>Se persisten en platform_config y quedan en el audit log.</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancel} disabled={pending} style={{ padding: "8px 16px", borderRadius: 9999, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: pending ? "default" : "pointer", opacity: pending ? 0.5 : 1 }}>Descartar</button>
              <button onClick={save} disabled={pending} style={{ padding: "8px 16px", borderRadius: 9999, background: "var(--primary)", color: "#fff", border: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Icon name={pending ? "loader" : "check"} size={11} color="#fff" />{pending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({ s, last, display, rawCurrent, auditText, dirty, originalDisplay, onChange, onReset }: {
  s: Setting; last: boolean; display: string; rawCurrent: string; auditText: string;
  dirty: boolean; originalDisplay: string; onChange: (raw: string) => void; onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const editable = Boolean(s.cfg);
  return (
    <div className="mp-config-row" style={{ padding: "16px 24px", borderBottom: last ? 0 : "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr 280px", gap: 18, alignItems: "flex-start", background: dirty ? "rgba(251,191,36,0.04)" : "transparent", position: "relative" }}>
      {dirty && <span style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, background: "#fbbf24" }} />}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 800, color: "#0a0a0a" }}>{s.l}</span>
          {s.critical && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#dc2626", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <Icon name="alert-triangle" size={8} color="#dc2626" />Crítico
            </span>
          )}
          {s.warn && <span style={{ padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>Fiscal</span>}
          {!editable && <span style={{ padding: "1px 6px", borderRadius: 4, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>Solo lectura</span>}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace", marginTop: 4 }}>{s.cfg?.key ?? s.k}</div>
        {s.hint && (
          <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 7, background: s.critical ? "#fee2e2" : "#fef3c7", color: s.critical ? "#7f1d1d" : "#78350f", fontSize: 11, lineHeight: 1.4, display: "flex", gap: 7, alignItems: "flex-start" }}>
            <Icon name="info" size={11} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{s.hint}</span>
          </div>
        )}
        <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 10, display: "flex", alignItems: "center", gap: 5 }}>
          <Icon name="history" size={10} />
          {auditText}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
        {!editable ? (
          <div style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--muted)", textAlign: "left" }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: s.mono ? "ui-monospace, monospace" : "inherit", color: "#0a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{display}</span>
          </div>
        ) : editing ? (
          <SettingEditor cfg={s.cfg!} mono={s.mono} initialRaw={rawCurrent} onChange={onChange} onDone={() => setEditing(false)} />
        ) : (
          <button onClick={() => setEditing(true)} style={{ width: "100%", padding: "10px 14px", borderRadius: 9, border: "1px solid " + (dirty ? "#fbbf24" : "var(--border)"), background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: s.mono ? "ui-monospace, monospace" : "inherit", color: "#0a0a0a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{display}</span>
            <Icon name="pencil" size={12} color="var(--muted-fg)" />
          </button>
        )}
        {dirty && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5, color: "#92400e", fontWeight: 700 }}>
            <span>
              Cambio: <s style={{ color: "var(--muted-fg)" }}>{originalDisplay}</s> → <b>{display}</b>
            </span>
            <button onClick={onReset} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", textDecoration: "underline", fontSize: 10.5, fontFamily: "inherit" }}>deshacer</button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingEditor({ cfg, mono, initialRaw, onChange, onDone }: {
  cfg: CfgRef; mono?: boolean; initialRaw: string; onChange: (raw: string) => void; onDone: () => void;
}) {
  const [local, setLocal] = useState(initialRaw);
  const inputStyle: CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "#fff", fontFamily: mono ? "ui-monospace, monospace" : "inherit", fontSize: 13, fontWeight: 700, outline: "none" };
  const commit = (v: string) => { setLocal(v); onChange(v); };

  if (cfg.kind === "boolean") {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }}>
        <button onClick={() => commit(local === "true" ? "false" : "true")} style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, textAlign: "left" }}>
          {local === "true" ? "Sí · activado" : "○ No · desactivado"}
        </button>
        <button onClick={onDone} className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 11 }}>OK</button>
      </div>
    );
  }
  const prefix = cfg.kind === "cents" ? "$" : "";
  const suffix = cfg.kind === "percent" ? "%" : cfg.suffix ?? "";
  return (
    <div style={{ display: "flex", gap: 6, width: "100%", alignItems: "center" }}>
      {prefix && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted-fg)" }}>{prefix}</span>}
      <input
        autoFocus
        type="number"
        inputMode="decimal"
        step={cfg.kind === "cents" || cfg.kind === "percent" ? "0.01" : "1"}
        value={local}
        onChange={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onDone()}
        style={{ ...inputStyle, flex: 1 }}
      />
      {suffix && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-fg)" }}>{suffix}</span>}
      <button onClick={onDone} className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 11 }}>OK</button>
    </div>
  );
}

function IntegrationsGrid({ settings }: { settings: Setting[] }) {
  return (
    <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
      {settings.map((s) => (
        <div key={s.k} className="card" style={{ padding: 16, opacity: s.off ? 0.6 : 1 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: s.off ? "var(--muted)" : "rgba(16,185,129,0.12)", color: s.off ? "var(--muted-fg)" : "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={s.icon || "plug"} size={14} color={s.off ? undefined : "#047857"} />
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 9999, background: s.off ? "var(--muted)" : "rgba(16,185,129,0.12)", color: s.off ? "var(--muted-fg)" : "#047857", fontSize: 9, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>{s.off ? "○ Off" : "● On"}</span>
          </div>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em" }}>{s.l}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3, fontFamily: "ui-monospace, monospace" }}>{s.audit}</div>
        </div>
      ))}
    </div>
  );
}
