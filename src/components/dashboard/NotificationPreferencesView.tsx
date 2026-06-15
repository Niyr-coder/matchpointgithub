"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { RoleKey } from "@/lib/roles";
import { MP_ROLES } from "@/lib/roles";
import { notificationKindLabel } from "@/lib/user-facing/notification-kinds";
import { Icon } from "@/components/Icon";
import { useToast } from "./ToastProvider";

export type NotificationChannel = "inapp" | "email" | "push";

export type NotificationKindVM = {
  kind: string;
  description: string;
  allowedRoles: RoleKey[];
  defaultChannels: NotificationChannel[];
  category: string;
};

export type NotificationPreferenceVM = {
  role: RoleKey;
  kind: string;
  channel: NotificationChannel;
  enabled: boolean;
};

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } };

const KEY_SEP = "\u0001";
const NOTIF_PREFS_COLS = "minmax(220px, 1fr) repeat(3, minmax(128px, 150px))";

const CHANNELS: Array<{
  key: NotificationChannel;
  label: string;
  icon: string;
  state: "activo" | "preparado";
  hint: string;
}> = [
  {
    key: "inapp",
    label: "En la app",
    icon: "bell",
    state: "activo",
    hint: "Llega al panel de notificaciones.",
  },
  {
    key: "email",
    label: "Email",
    icon: "mail",
    state: "preparado",
    hint: "Preferencia lista; el envío real aún no está activo.",
  },
  {
    key: "push",
    label: "Push",
    icon: "smartphone",
    state: "preparado",
    hint: "Preferencia lista; las push aún no están activas.",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  clubs: "Clubes",
  events: "Eventos",
  marketing: "Comunicaciones",
  matches: "Partidos",
  moderation: "Moderación",
  pagos: "Pagos",
  payments: "Pagos",
  plans: "MATCHPOINT+",
  premium: "MATCHPOINT+",
  reservations: "Reservas",
  roles: "Roles y permisos",
  social: "Comunidad",
  support: "Soporte",
  teams: "Teams",
  tournaments: "Torneos",
};

function prefKey(kind: string, channel: NotificationChannel): string {
  return `${kind}${KEY_SEP}${channel}`;
}

function parsePrefKey(key: string): { kind: string; channel: NotificationChannel } {
  const [kind, channel] = key.split(KEY_SEP) as [string, NotificationChannel];
  return { kind, channel };
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildSaved(preferences: NotificationPreferenceVM[], role: RoleKey): Record<string, boolean> {
  return preferences
    .filter((preference) => preference.role === role)
    .reduce<Record<string, boolean>>((acc, preference) => {
      acc[prefKey(preference.kind, preference.channel)] = preference.enabled;
      return acc;
    }, {});
}

const shellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const switchBase: CSSProperties = {
  width: 38,
  height: 22,
  borderRadius: 9999,
  border: "1px solid var(--border)",
  padding: 2,
  display: "inline-flex",
  alignItems: "center",
  cursor: "pointer",
  transition: "background 150ms ease, border-color 150ms ease, opacity 150ms ease",
};

export function NotificationPreferencesView({
  role,
  kinds,
  preferences,
  initialError,
}: {
  role: RoleKey;
  kinds: NotificationKindVM[];
  preferences: NotificationPreferenceVM[];
  initialError: string | null;
}) {
  const toast = useToast();
  const [saved, setSaved] = useState<Record<string, boolean>>(() => buildSaved(preferences, role));
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const visibleKinds = useMemo(
    () =>
      kinds
        .filter((kind) => kind.allowedRoles.includes(role))
        .sort((a, b) => a.category.localeCompare(b.category) || a.kind.localeCompare(b.kind)),
    [kinds, role],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, NotificationKindVM[]>();
    for (const kind of visibleKinds) {
      const key = kind.category || "general";
      groups.set(key, [...(groups.get(key) ?? []), kind]);
    }
    return Array.from(groups.entries());
  }, [visibleKinds]);

  const dirtyCount = Object.keys(draft).length;
  const roleLabel = MP_ROLES[role].badge;
  const enabledDefaults = visibleKinds.reduce(
    (acc, kind) => acc + kind.defaultChannels.length,
    0,
  );

  const effectiveEnabled = (kind: NotificationKindVM, channel: NotificationChannel) => {
    const key = prefKey(kind.kind, channel);
    return draft[key] ?? saved[key] ?? kind.defaultChannels.includes(channel);
  };

  const baseEnabled = (kind: NotificationKindVM, channel: NotificationChannel) => {
    const key = prefKey(kind.kind, channel);
    return saved[key] ?? kind.defaultChannels.includes(channel);
  };

  const toggle = (kind: NotificationKindVM, channel: NotificationChannel) => {
    const key = prefKey(kind.kind, channel);
    const nextValue = !effectiveEnabled(kind, channel);
    setDraft((current) => {
      const next = { ...current };
      if (nextValue === baseEnabled(kind, channel)) delete next[key];
      else next[key] = nextValue;
      return next;
    });
    setError(null);
    setSavedAt(null);
  };

  const reset = () => {
    setDraft({});
    setError(null);
    setSavedAt(null);
  };

  const save = async () => {
    const entries = Object.entries(draft);
    if (entries.length === 0 || pending) return;
    setPending(true);
    setError(null);
    setSavedAt(null);
    try {
      const items = entries.map(([key, enabled]) => {
        const parsed = parsePrefKey(key);
        return { role, ...parsed, enabled };
      });
      const response = await fetch("/api/v1/me/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const payload = (await response.json()) as ApiResult<{ count: number }>;
      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "No se pudo guardar." : payload.error.message);
      }
      setSaved((current) => {
        const next = { ...current };
        for (const item of items) next[prefKey(item.kind, item.channel)] = item.enabled;
        return next;
      });
      setDraft({});
      const label = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
      setSavedAt(label);
      toast({ icon: "check", title: "Preferencias guardadas", sub: `${payload.data.count} cambios aplicados` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar.";
      setError(message);
      toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: message });
    } finally {
      setPending(false);
    }
  };

  return (
    <div style={shellStyle}>
      <section
        style={{
          background: "linear-gradient(135deg, #0a0a0a, #18181b)",
          color: "#fff",
          borderRadius: 18,
          padding: 24,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 18,
          alignItems: "end",
        }}
      >
        <div>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
            {roleLabel} · preferencias
          </div>
          <h1
            className="font-heading"
            style={{
              margin: "6px 0 0",
              fontSize: 30,
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
            }}
          >
            Notificaciones<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ maxWidth: 660, margin: "8px 0 0", color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 1.5 }}>
            Configura qué alertas quieres recibir para este rol. Email y push se muestran como canales preparados cuando el catálogo los soporte, sin activar envío real fuera de MATCHPOINT.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Stat label="Tipos" value={String(visibleKinds.length)} />
          <Stat label="Canales default" value={String(enabledDefaults)} />
        </div>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "var(--muted)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="settings-2" size={17} color="var(--muted-fg)" />
            </span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>Ajustes del rol actual</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                Los cambios se guardan por rol, tipo de notificación y canal.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={reset}
              disabled={pending || dirtyCount === 0}
              style={{ opacity: pending || dirtyCount === 0 ? 0.55 : 1 }}
            >
              <Icon name="rotate-ccw" size={13} />
              Descartar
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={save}
              disabled={pending || dirtyCount === 0}
              style={{ opacity: pending || dirtyCount === 0 ? 0.7 : 1 }}
            >
              <Icon name={pending ? "loader-2" : "save"} size={13} />
              {pending ? "Guardando..." : dirtyCount > 0 ? `Guardar ${dirtyCount}` : "Guardado"}
            </button>
          </div>
        </div>
        {(error || savedAt) && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 10,
              background: error ? "rgba(220,38,38,0.08)" : "rgba(16,185,129,0.08)",
              color: error ? "#991b1b" : "#047857",
              border: `1px solid ${error ? "rgba(220,38,38,0.18)" : "rgba(16,185,129,0.18)"}`,
              fontSize: 12,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name={error ? "alert-triangle" : "check-circle-2"} size={14} />
            {error ?? `Preferencias guardadas a las ${savedAt}.`}
          </div>
        )}
      </section>

      <section className="card" style={{ overflow: "auto" }}>
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: NOTIF_PREFS_COLS,
            gap: 10,
            color: "var(--muted-fg)",
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          <span>Tipo</span>
          {CHANNELS.map((channel) => (
            <span key={channel.key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name={channel.icon} size={12} />
              {channel.label}
            </span>
          ))}
        </div>
        {grouped.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
            No hay tipos configurables para este rol.
          </div>
        ) : (
          grouped.map(([category, rows]) => (
            <div key={category}>
              <div
                style={{
                  padding: "11px 16px",
                  background: "#fafafa",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--muted-fg)",
                }}
              >
                {categoryLabel(category)}
              </div>
              {rows.map((kind) => (
                <div
                  key={kind.kind}
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid var(--border)",
                    display: "grid",
                    gridTemplateColumns: NOTIF_PREFS_COLS,
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#0a0a0a" }}>
                      {notificationKindLabel(kind.kind, kind.description)}
                    </div>
                  </div>
                  {CHANNELS.map((channel) => {
                    const available = kind.defaultChannels.includes(channel.key);
                    const enabled = effectiveEnabled(kind, channel.key);
                    const changed = draft[prefKey(kind.kind, channel.key)] !== undefined;
                    return (
                      <ChannelToggle
                        key={channel.key}
                        channel={channel}
                        available={available}
                        enabled={enabled}
                        changed={changed}
                        disabled={pending}
                        onToggle={() => toggle(kind, channel.key)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 112, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function ChannelToggle({
  channel,
  available,
  enabled,
  changed,
  disabled,
  onToggle,
}: {
  channel: (typeof CHANNELS)[number];
  available: boolean;
  enabled: boolean;
  changed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  if (!available) {
    return (
      <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
        No disponible
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <button
        type="button"
        aria-pressed={enabled}
        aria-label={`${enabled ? "Desactivar" : "Activar"} ${channel.label}`}
        onClick={onToggle}
        disabled={disabled}
        style={{
          ...switchBase,
          background: enabled ? "var(--primary)" : "#e5e7eb",
          borderColor: enabled ? "var(--primary)" : "var(--border)",
          justifyContent: enabled ? "flex-end" : "flex-start",
          opacity: disabled ? 0.7 : 1,
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.18)" }} />
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 900, color: enabled ? "#0a0a0a" : "var(--muted-fg)" }}>
            {enabled ? "Activo" : "Pausado"}
          </span>
          {changed && (
            <span style={{ fontSize: 9, fontWeight: 900, color: "#92400e", background: "rgba(251,191,36,0.18)", borderRadius: 9999, padding: "1px 6px" }}>
              Cambio
            </span>
          )}
          {channel.state === "preparado" && (
            <span style={{ fontSize: 9, fontWeight: 900, color: "#0f766e", background: "rgba(20,184,166,0.12)", borderRadius: 9999, padding: "1px 6px" }}>
              Preparado
            </span>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1, lineHeight: 1.25 }}>
          {channel.hint}
        </div>
      </div>
    </div>
  );
}
