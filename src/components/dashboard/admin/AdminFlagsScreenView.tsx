// Client view de AdminFlagsScreen — toggle, slider, modal de creación, assignments.
"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  upsertFlag,
  deleteFlag,
  upsertFlagAssignment,
  deleteFlagAssignment,
} from "@/server/actions/featureFlags";
import { searchUsers } from "@/server/actions/roles";

export type FlagState = "on" | "off" | "rollout";
export type FlagAssignment = {
  flagKey: string;
  scope: "user" | "club" | "role";
  scopeId: string;
  enabled: boolean;
  reason: string | null;
};
export type FlagRow = {
  k: string;
  t: string;
  desc: string;
  state: FlagState;
  enabled: boolean;
  rollout: number;
  assignments: FlagAssignment[];
};
export type ClubLite = { id: string; name: string };
export type FlagsData = {
  rows: FlagRow[];
  clubs: ClubLite[];
  kpis: {
    activeCount: number;
    rolloutCount: number;
    totalCount: number;
    offCount: number;
  };
};

const STATE_COLOR: Record<FlagState, string> = {
  on: "var(--primary)",
  off: "var(--muted-fg)",
  rollout: "#fbbf24",
};
const STATE_LABEL: Record<FlagState, string> = {
  on: "● ACTIVO",
  off: "○ INACTIVO",
  rollout: "◐ GRADUAL",
};

// Plantillas intuitivas para crear flags nuevos.
const FLAG_TEMPLATES: { id: string; label: string; key: string; description: string; default: boolean; rollout: number }[] = [
  {
    id: "blank",
    label: "En blanco",
    key: "",
    description: "",
    default: false,
    rollout: 0,
  },
  {
    id: "killswitch",
    label: "Apagado de emergencia",
    key: "disable_",
    description: "Para cortar una funcionalidad ya en producción. Empieza encendido; al apagarlo, la funcionalidad deja de servirse a todos.",
    default: true,
    rollout: 100,
  },
  {
    id: "rollout_25",
    label: "Despliegue gradual 25%",
    key: "rollout_",
    description: "Activa la nueva funcionalidad poco a poco. Empieza en el 25% de los usuarios y se sube cuando todo va bien.",
    default: true,
    rollout: 25,
  },
  {
    id: "beta",
    label: "Beta cerrada (por invitación)",
    key: "beta_",
    description: "Funcionalidad en beta. Apagada por defecto; solo se enciende para usuarios, clubes o roles específicos vía excepciones.",
    default: false,
    rollout: 0,
  },
  {
    id: "ab_test",
    label: "Prueba A/B 50/50",
    key: "experiment_",
    description: "Experimento A/B con división 50/50. La mitad de usuarios ve la versión nueva, la otra mitad la actual.",
    default: true,
    rollout: 50,
  },
];

const PLACEHOLDER_COUNT = 3;

function FlagPlaceholder() {
  return (
    <div
      style={{
        padding: 18,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10.5,
            color: "var(--muted-fg)",
            background: "var(--muted)",
            padding: "2px 7px",
            borderRadius: 4,
          }}
        >
          flag_—
        </span>
        <div style={{ flex: 1 }}>
          <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)" }}>
            Sin feature flags
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
            Crea tu primer flag para empezar a controlar features por rollout.
          </div>
        </div>
        <RSPill bg="var(--muted-fg)">—</RSPill>
      </div>
    </div>
  );
}

export function AdminFlagsScreenView({ data }: { data: FlagsData }) {
  useRealtimeRefresh([{ table: "feature_flags" }, { table: "feature_flag_assignments" }], { debounceMs: 4000 });
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [assignFor, setAssignFor] = useState<FlagRow | null>(null);

  const hasRows = data.rows.length > 0;

  const toggleFlag = (f: FlagRow) => {
    const newEnabled = !f.enabled;
    startTransition(async () => {
      const res = await upsertFlag({
        key: f.k,
        description: f.desc,
        enabledDefault: newEnabled,
        rolloutPct: f.rollout,
      });
      if (res.ok) toast({ icon: "check", title: newEnabled ? "Flag activado" : "Flag desactivado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const updateRollout = (f: FlagRow, pct: number) => {
    startTransition(async () => {
      const res = await upsertFlag({
        key: f.k,
        description: f.desc,
        enabledDefault: f.enabled,
        rolloutPct: pct,
      });
      if (res.ok) toast({ icon: "check", title: `Despliegue: ${pct}%` });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const removeFlag = async (f: FlagRow) => {
    const ok = await confirm({
      title: `Eliminar flag "${f.k}"`,
      body: "Esta acción es permanente y borra todas las asignaciones.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteFlag({ key: f.k });
      if (res.ok) toast({ icon: "check", title: "Flag eliminado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const KPIS: [string, string, string][] = [
    ["Flags activos", String(data.kpis.activeCount), "var(--primary)"],
    ["En rollout", String(data.kpis.rolloutCount), "#fbbf24"],
    ["Total flags", String(data.kpis.totalCount), "#0a0a0a"],
    ["Inactivos", String(data.kpis.offCount), "var(--muted-fg)"],
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="FLAGS"
        accent="#7c3aed"
        label="Plataforma · Feature flags"
        title="Control de features"
        sub="Activa, desactiva o despliega funcionalidades de forma gradual. Aplica excepciones por usuario, club o rol."
        right={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" size={13} />
            Nuevo flag
          </button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="card" style={{ padding: 14 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 28,
                fontWeight: 900,
                marginTop: 6,
                color: c,
                letterSpacing: "-0.03em",
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {hasRows
          ? data.rows.map((f) => (
              <div key={f.k} className="card" style={{ padding: 18 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 110px 220px 130px 200px",
                    gap: 16,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontSize: 10.5,
                          color: "var(--muted-fg)",
                          background: "var(--muted)",
                          padding: "2px 7px",
                          borderRadius: 4,
                        }}
                      >
                        {f.k}
                      </span>
                    </div>
                    <div
                      className="font-heading"
                      style={{ fontSize: 14.5, fontWeight: 900, letterSpacing: "-0.015em" }}
                    >
                      {f.t}
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                      {f.desc}
                    </div>
                  </div>
                  <div>
                    <div className="label-mp">Estado</div>
                    <button
                      onClick={() => toggleFlag(f)}
                      disabled={isPending}
                      style={{
                        marginTop: 4,
                        padding: 0,
                        background: "transparent",
                        border: 0,
                        cursor: "pointer",
                      }}
                    >
                      <RSPill bg={STATE_COLOR[f.state]}>{STATE_LABEL[f.state]}</RSPill>
                    </button>
                  </div>
                  <div>
                    <div
                      className="label-mp"
                      style={{ display: "flex", justifyContent: "space-between" }}
                    >
                      <span>Despliegue</span>
                      <span style={{ color: STATE_COLOR[f.state], fontWeight: 900 }}>{f.rollout}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      defaultValue={f.rollout}
                      disabled={isPending || !f.enabled}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        (e.target as HTMLInputElement).dataset.pending = String(v);
                      }}
                      onPointerUp={(e) => {
                        const v = parseInt((e.target as HTMLInputElement).value, 10);
                        if (v !== f.rollout) updateRollout(f, v);
                      }}
                      onKeyUp={(e) => {
                        const v = parseInt((e.target as HTMLInputElement).value, 10);
                        if (v !== f.rollout) updateRollout(f, v);
                      }}
                      style={{ width: "100%", marginTop: 6, accentColor: "var(--primary)" }}
                    />
                  </div>
                  <div>
                    <div className="label-mp">Excepciones</div>
                    <button
                      onClick={() => setAssignFor(f)}
                      style={{
                        marginTop: 4,
                        padding: "4px 10px",
                        border: "1px solid var(--border)",
                        background: "#fff",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 11,
                        fontWeight: 800,
                        fontFamily: "inherit",
                      }}
                    >
                      {f.assignments.length} excepción{f.assignments.length === 1 ? "" : "es"} →
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      className="btn"
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 10.5,
                        color: "#dc2626",
                      }}
                      onClick={() => removeFlag(f)}
                      disabled={isPending}
                    >
                      <Icon name="trash-2" size={11} color="#dc2626" />
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <FlagPlaceholder key={k} />)}
      </div>

      {showCreate && <CreateFlagModal onClose={() => setShowCreate(false)} />}
      {assignFor && (
        <AssignmentsModal
          flag={assignFor}
          clubs={data.clubs}
          onClose={() => setAssignFor(null)}
        />
      )}
    </>
  );
}

function CreateFlagModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [submitting, startSubmit] = useTransition();
  const [template, setTemplate] = useState<(typeof FLAG_TEMPLATES)[number]>(FLAG_TEMPLATES[0]);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabledDefault, setEnabledDefault] = useState(false);
  const [rolloutPct, setRolloutPct] = useState(0);

  const applyTemplate = (t: (typeof FLAG_TEMPLATES)[number]) => {
    setTemplate(t);
    setKey(t.key);
    setDescription(t.description);
    setEnabledDefault(t.default);
    setRolloutPct(t.rollout);
  };

  const validKey = /^[a-z][a-z0-9_]{2,79}$/.test(key);

  const doSubmit = () => {
    if (!validKey) return toast({ icon: "alert-triangle", title: "Key inválida", sub: "Solo minúsculas, números y _ (mín. 3 chars)." });
    startSubmit(async () => {
      const res = await upsertFlag({
        key,
        description: description || key,
        enabledDefault,
        rolloutPct,
      });
      if (res.ok) {
        toast({ icon: "check", title: `Flag "${key}" creado` });
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <ModalShell onClose={onClose} title="Nuevo flag" width={560}>
      <div className="label-mp" style={{ marginBottom: 6 }}>
        1. Plantilla
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))",
          gap: 6,
          marginBottom: 16,
        }}
      >
        {FLAG_TEMPLATES.map((t) => (
          <button
            key={t.id}
            onClick={() => applyTemplate(t)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: template.id === t.id ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: template.id === t.id ? "#ecfdf5" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="label-mp" style={{ marginBottom: 6 }}>
        2. Key (lowercase_snake)
      </div>
      <input
        value={key}
        onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
        placeholder="ej. realtime_chat_v2"
        style={{
          width: "100%",
          padding: "8px 12px",
          border: validKey || key === "" ? "1px solid var(--border)" : "1px solid #dc2626",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          marginBottom: key && !validKey ? 4 : 12,
        }}
      />
      {key && !validKey && (
        <div style={{ fontSize: 10, color: "#dc2626", marginBottom: 12 }}>
          Mínimo 3 chars · empieza por letra · solo lowercase, números y `_`.
        </div>
      )}

      <div className="label-mp" style={{ marginBottom: 6 }}>
        3. Descripción
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="¿Qué hace este flag? ¿Por qué se introduce?"
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "inherit",
          minHeight: 60,
          marginBottom: 12,
          resize: "vertical",
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <div className="label-mp" style={{ marginBottom: 6 }}>
            Por defecto
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => setEnabledDefault(false)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: !enabledDefault ? "2px solid var(--muted-fg)" : "1px solid var(--border)",
                background: !enabledDefault ? "var(--muted)" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              APAGADO
            </button>
            <button
              onClick={() => setEnabledDefault(true)}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 8,
                border: enabledDefault ? "2px solid var(--primary)" : "1px solid var(--border)",
                background: enabledDefault ? "#ecfdf5" : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                fontWeight: 800,
              }}
            >
              ENCENDIDO
            </button>
          </div>
        </div>
        <div>
          <div className="label-mp" style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
            <span>Despliegue</span>
            <b style={{ color: "var(--primary)" }}>{rolloutPct}%</b>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={rolloutPct}
            disabled={!enabledDefault}
            onChange={(e) => setRolloutPct(parseInt(e.target.value, 10))}
            style={{ width: "100%", marginTop: 8, accentColor: "var(--primary)" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn"
          style={{ background: "#fff", border: "1px solid var(--border)", flex: 1 }}
          onClick={onClose}
        >
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={doSubmit}
          disabled={submitting || !validKey}
        >
          {submitting ? "Creando…" : "Crear flag"}
        </button>
      </div>
    </ModalShell>
  );
}

function AssignmentsModal({
  flag,
  clubs,
  onClose,
}: {
  flag: FlagRow;
  clubs: ClubLite[];
  onClose: () => void;
}) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [scope, setScope] = useState<"user" | "club" | "role">("user");
  const [scopeId, setScopeId] = useState<string>("");
  const [enabled, setEnabled] = useState(true);
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; display_name: string } | null>(null);

  const doUserSearch = () => {
    if (userQuery.trim().length < 1) return;
    startTransition(async () => {
      const res = await searchUsers({ q: userQuery });
      if (res.ok) setUserResults(res.data);
    });
  };

  const ROLES_FOR_SCOPE = ["admin", "partner", "owner", "manager", "coach", "employee", "user"];

  const finalScopeId =
    scope === "user" ? selectedUser?.id ?? "" : scope === "club" ? scopeId : scopeId;

  const doAssign = () => {
    if (!finalScopeId) return toast({ icon: "alert-triangle", title: "Selecciona destino" });
    startTransition(async () => {
      const res = await upsertFlagAssignment({
        flagKey: flag.k,
        scope,
        scopeId: finalScopeId,
        enabled,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Excepción aplicada" });
        setSelectedUser(null);
        setScopeId("");
        setUserQuery("");
        setUserResults([]);
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const doRemove = async (a: FlagAssignment) => {
    const ok = await confirm({
      title: "Quitar excepción",
      body: `¿Quitar excepción ${a.scope}=${a.scopeId}?`,
      confirmLabel: "Quitar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteFlagAssignment({
        flagKey: a.flagKey,
        scope: a.scope,
        scopeId: a.scopeId,
      });
      if (res.ok) toast({ icon: "check", title: "Excepción eliminada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <ModalShell onClose={onClose} title={`Excepciones · ${flag.k}`} width={560}>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {([
          { v: "user" as const, l: "Usuario" },
          { v: "club" as const, l: "Club" },
          { v: "role" as const, l: "Rol" },
        ]).map((s) => (
          <button
            key={s.v}
            onClick={() => {
              setScope(s.v);
              setScopeId("");
              setSelectedUser(null);
            }}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 8,
              border: scope === s.v ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: scope === s.v ? "#ecfdf5" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            {s.l}
          </button>
        ))}
      </div>

      {scope === "user" && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doUserSearch()}
              placeholder="Buscar usuario por @username o nombre…"
              style={{
                flex: 1,
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "inherit",
              }}
            />
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)" }}
              onClick={doUserSearch}
            >
              <Icon name="search" size={12} />
            </button>
          </div>
          {selectedUser ? (
            <div
              style={{
                padding: "8px 12px",
                background: "#ecfdf5",
                border: "1px solid var(--primary)",
                borderRadius: 6,
                marginBottom: 12,
              }}
            >
              <b>{selectedUser.display_name}</b> · @{selectedUser.username}
            </div>
          ) : (
            userResults.length > 0 && (
              <div style={{ marginBottom: 12, maxHeight: 140, overflowY: "auto" }}>
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      background: "#fff",
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: "inherit",
                      marginBottom: 4,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{u.display_name}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{u.username}</div>
                  </button>
                ))}
              </div>
            )
          )}
        </>
      )}

      {scope === "club" && (
        <select
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "inherit",
            marginBottom: 12,
          }}
        >
          <option value="">— elegir club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}

      {scope === "role" && (
        <select
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "inherit",
            marginBottom: 12,
          }}
        >
          <option value="">— elegir rol —</option>
          {ROLES_FOR_SCOPE.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800 }}>Valor de la excepción:</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setEnabled(false)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: !enabled ? "2px solid var(--muted-fg)" : "1px solid var(--border)",
              background: !enabled ? "var(--muted)" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            OFF
          </button>
          <button
            onClick={() => setEnabled(true)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: enabled ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: enabled ? "#ecfdf5" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            ON
          </button>
        </div>
        <button
          className="btn btn-primary"
          style={{ marginLeft: "auto", fontSize: 11 }}
          onClick={doAssign}
          disabled={isPending || !finalScopeId}
        >
          Aplicar excepción
        </button>
      </div>

      <div className="label-mp" style={{ marginBottom: 8 }}>
        Excepciones actuales ({flag.assignments.length})
      </div>
      {flag.assignments.length === 0 ? (
        <div
          style={{
            padding: 14,
            background: "#fafafa",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--muted-fg)",
            textAlign: "center",
          }}
        >
          Sin excepciones. El flag aplica el valor por defecto a todos.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflowY: "auto" }}>
          {flag.assignments.map((a) => (
            <div
              key={`${a.scope}-${a.scopeId}`}
              style={{
                display: "grid",
                gridTemplateColumns: "70px 1fr 60px 60px",
                gap: 8,
                alignItems: "center",
                padding: "8px 12px",
                background: "var(--muted)",
                borderRadius: 6,
                fontSize: 11,
              }}
            >
              <span style={{ fontWeight: 900, textTransform: "uppercase", fontSize: 9.5, letterSpacing: "0.08em" }}>
                {a.scope}
              </span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10 }}>
                {a.scopeId.length > 28 ? `${a.scopeId.slice(0, 8)}…${a.scopeId.slice(-4)}` : a.scopeId}
              </span>
              <span
                style={{
                  fontWeight: 900,
                  color: a.enabled ? "var(--primary)" : "var(--muted-fg)",
                  textAlign: "center",
                }}
              >
                {a.enabled ? "SÍ" : "NO"}
              </span>
              <button
                onClick={() => doRemove(a)}
                disabled={isPending}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

function ModalShell({
  onClose,
  title,
  width,
  children,
}: {
  onClose: () => void;
  title: string;
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ padding: 24, width, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}
        >
          <h2
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: 0 }}
          >
            {title}
            <span className="dot">.</span>
          </h2>
          <button
            onClick={onClose}
            style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 20 }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
