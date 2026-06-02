"use client";
// Admin · Feature Flags — rediseño v2 COMPLETO cableado al backend real.
// Conserva todos los elementos del prototipo (env, owner, segmento, impacto/
// crítico, kill switch, targeting, historial) y los conecta a datos/acciones
// reales: feature_flags (+ env/impact/owner/segment, mig 152) +
// feature_flag_assignments + audit_log (historial). Recibe `data: FlagsData`.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { upsertFlag, deleteFlag, upsertFlagAssignment, deleteFlagAssignment, killSwitchNonCritical, listFlagHistory, type FlagHistoryEntry } from "@/server/actions/featureFlags";
import { searchUsers } from "@/server/actions/roles";
import { knownFlag, uncreatedKnownFlags, type KnownFlag } from "@/lib/flags/registry";
import type { FlagsData, FlagRow, FlagAssignment, ClubLite, FlagEnv, FlagImpact } from "./AdminFlagsScreenView";

const STATE_META: Record<FlagRow["state"], { c: string; l: string }> = {
  on: { c: "var(--primary)", l: "Activo" },
  off: { c: "var(--muted-fg)", l: "Inactivo" },
  rollout: { c: "#fbbf24", l: "Rollout" },
};
const ENV_META: Record<FlagEnv, { c: string; l: string }> = {
  prod: { c: "#dc2626", l: "PROD" },
  staging: { c: "#fbbf24", l: "STAGING" },
  beta: { c: "#7c3aed", l: "BETA" },
  dev: { c: "#0ea5e9", l: "DEV" },
};
const ENVS: FlagEnv[] = ["prod", "staging", "beta", "dev"];
const IMPACTS: FlagImpact[] = ["low", "med", "high"];
const IMPACT_LABEL: Record<FlagImpact, string> = { low: "Bajo", med: "Medio", high: "Crítico" };
const ROLES_FOR_SCOPE = ["admin", "partner", "owner", "manager", "coach", "employee", "user"];
const FLAGS_TABLE_MIN_WIDTH = 760;
const ROW_COLS = "minmax(0, 1.4fr) 64px 112px minmax(0, 1fr) 64px 64px";

const agoLabel = (iso: string | null) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return "hace " + Math.max(1, Math.floor(ms / 6e4)) + " min";
  if (h < 24) return "hace " + h + " h";
  return "hace " + Math.floor(h / 24) + " días";
};

// patch que preserva los campos base del flag (para no pisar nada en un update parcial).
const basePatch = (f: FlagRow) => ({ key: f.k, description: f.desc, enabledDefault: f.enabled, rolloutPct: f.rollout });

export function AdminFlagsView({ data }: { data: FlagsData }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  useRealtimeRefresh([{ table: "feature_flags" }, { table: "feature_flag_assignments" }], { debounceMs: 1500 });

  const [search, setSearch] = useState("");
  const [stateF, setStateF] = useState<"all" | FlagRow["state"]>("all");
  const [envF, setEnvF] = useState<"all" | FlagEnv>("all");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = data.rows.filter((f) => {
    if (stateF !== "all" && f.state !== stateF) return false;
    if (envF !== "all" && f.env !== envF) return false;
    if (search && !(f.k + " " + f.t + " " + f.desc + " " + (f.segment ?? "") + " " + (f.owner ?? "")).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const openFlag = openKey ? data.rows.find((f) => f.k === openKey) ?? null : null;
  const criticalCount = data.rows.filter((f) => f.impact === "high").length;
  const rolloutFlags = data.rows.filter((f) => f.state === "rollout");
  const recent = [...data.rows].filter((f) => f.updatedAt).sort((a, b) => (b.updatedAt! > a.updatedAt! ? 1 : -1)).slice(0, 4);

  const run = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, okMsg: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast({ icon: "check", title: okMsg });
        router.refresh();
      } else toast({ icon: "alert-triangle", title: "Error", sub: res.error?.message });
    });

  const toggleFlag = (f: FlagRow) => run(() => upsertFlag({ ...basePatch(f), enabledDefault: !f.enabled }), !f.enabled ? "Flag activado" : "Flag desactivado");
  const setRollout = (f: FlagRow, pct: number) => run(() => upsertFlag({ ...basePatch(f), rolloutPct: pct }), `Despliegue: ${pct}%`);
  const patchMeta = (f: FlagRow, partial: Partial<{ env: FlagEnv; impact: FlagImpact; owner: string | null; segment: string | null; label: string | null; description: string }>) =>
    run(() => upsertFlag({ ...basePatch(f), ...partial }), "Flag actualizado");
  const removeFlag = async (f: FlagRow) => {
    const ok = await confirm({ title: `Eliminar flag "${f.k}"`, body: "Es permanente y borra todas las excepciones.", confirmLabel: "Eliminar", destructive: true });
    if (!ok) return;
    run(async () => {
      const r = await deleteFlag({ key: f.k });
      if (r.ok) setOpenKey(null);
      return r;
    }, "Flag eliminado");
  };
  const doKillSwitch = async () => {
    const ok = await confirm({ title: "Activar kill switch", body: "Apaga TODOS los flags no críticos (impact ≠ crítico) en prod: rollout 0% y default off. Queda en el audit. Los flags críticos no se tocan.", confirmLabel: "Activar kill switch", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      const res = await killSwitchNonCritical(undefined);
      if (res.ok) {
        toast({ icon: "power", title: `Kill switch · ${res.data.affected} flags apagados` });
        router.refresh();
      } else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "#7c3aed" }}>● Plataforma · control de features</div>
            <h1 className="font-heading" style={{ fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1, margin: "8px 0 0" }}>
              Feature flags<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
              {data.kpis.totalCount} flags · orden: features cableadas, pendientes de cablear, paywalls y huérfanos al final
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} color="#fff" />Nuevo flag
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="mp-flags-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <FFKpi icon="zap" label="Activos" value={String(data.kpis.activeCount)} sub="encendidos" emerald tip="Flags encendidos al 100%: la función está disponible para todos los usuarios." />
        <FFKpi icon="git-branch" label="En rollout" value={String(data.kpis.rolloutCount)} sub="liberación gradual" warn tip="Liberación gradual: el flag está encendido solo para una parte de los usuarios (ej. 25%), no para todos." />
        <FFKpi icon="moon" label="Apagados" value={String(data.kpis.offCount)} sub="no afectan prod" tip="Flags apagados: nadie ve la función. No afectan a la app." />
        <FFKpi icon="alert-octagon" label="Críticos" value={String(criticalCount)} sub="impact alto · protegidos" danger={criticalCount > 0} tip="Flags marcados como impacto alto. Afectan algo sensible, por eso el kill switch NO los apaga." />
      </div>

      {/* SEARCH + FILTERS */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240, maxWidth: 380 }}>
          <span style={{ position: "absolute", left: 12, top: 11, display: "inline-flex" }}>
            <Icon name="search" size={13} color="var(--muted-fg)" />
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar clave, owner, segmento…" style={{ width: "100%", padding: "11px 14px 11px 34px", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12.5, fontFamily: "ui-monospace, monospace", outline: "none", background: "#fff" }} />
        </div>
        <FilterPill label="Env" value={envF} onChange={(v) => setEnvF(v as "all" | FlagEnv)} options={[{ k: "all", l: "Todos" }, { k: "prod", l: "Prod" }, { k: "staging", l: "Staging" }, { k: "beta", l: "Beta" }, { k: "dev", l: "Dev" }]} />
        <FilterPill label="Estado" value={stateF} onChange={(v) => setStateF(v as "all" | FlagRow["state"])} options={[{ k: "all", l: "Todos" }, { k: "on", l: "Activos" }, { k: "rollout", l: "Rollout" }, { k: "off", l: "Apagados" }]} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          <b style={{ color: "#0a0a0a" }}>{filtered.length}</b> de {data.rows.length}
        </span>
      </div>

      {/* MAIN GRID */}
      <div className="mp-flags-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 16, alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden", minWidth: 0 }}>
          <div style={{ overflowX: "auto", width: "100%" }}>
            <div style={{ minWidth: FLAGS_TABLE_MIN_WIDTH, width: "100%" }}>
              <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, gap: 14, padding: "11px 20px", background: "#fafafa", borderBottom: "1px solid var(--border)", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
                <span>Flag</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Env <InfoTip text="Entorno donde aplica el flag: prod = la app real que usan los jugadores; staging/beta/dev = ambientes de prueba." /></span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Estado <InfoTip text="Activo = encendido para todos · Rollout = encendido solo para una parte · Apagado = nadie lo ve. El % es el alcance del despliegue." /></span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Segmento / owner <InfoTip text="Segmento = a quiénes apunta el flag (texto descriptivo). Owner = quién es responsable de él." /></span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Excepc. <InfoTip text="Excepciones: reglas que pisan el valor por defecto para un usuario, club o rol específico (ej. encenderlo solo para un club)." /></span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>On/Off <InfoTip text="Prende o apaga el flag para todos (el valor por defecto). Las excepciones pueden pisar esto." /></span>
              </div>
              {filtered.map((f, i) => (
                <FlagRowItem key={f.k} f={f} last={i === filtered.length - 1} pending={pending} onToggle={() => toggleFlag(f)} onOpen={() => setOpenKey(f.k)} />
              ))}
            </div>
          </div>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}>
              <Icon name="filter-x" size={20} />
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0a0a0a", marginTop: 8 }}>{data.rows.length === 0 ? "Aún no hay flags · crea el primero" : "Ningún flag para esos filtros"}</div>
            </div>
          )}
        </div>

        <div className="mp-flags-rail" style={{ position: "sticky", top: 88, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Próximos a 100% */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span className="label-mp">En rollout</span>
              <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>{rolloutFlags.length}</span>
            </div>
            {rolloutFlags.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>Ningún flag en despliegue gradual.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {rolloutFlags.slice(0, 4).map((f) => (
                  <button key={f.k} onClick={() => setOpenKey(f.k)} style={{ background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4, gap: 8 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.t}</span>
                      <span className="tabular" style={{ fontSize: 11, fontWeight: 800, color: "#fbbf24", flexShrink: 0 }}>{f.rollout}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: f.rollout + "%", background: "#fbbf24" }} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cambios recientes (real, por updated_at) */}
          <div className="card" style={{ padding: 16 }}>
            <div className="label-mp" style={{ marginBottom: 12 }}>Cambios recientes</div>
            {recent.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>Sin actividad.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 11, position: "relative", paddingLeft: 4 }}>
                <div style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 1, background: "var(--border)" }} />
                {recent.map((f, i) => (
                  <button key={f.k} onClick={() => setOpenKey(f.k)} style={{ display: "flex", gap: 10, alignItems: "flex-start", position: "relative", background: "transparent", border: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: i === 0 ? "var(--primary)" : "var(--muted-fg)", flexShrink: 0, marginTop: 5, zIndex: 1, border: "2px solid #fff", boxSizing: "content-box" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.t}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{agoLabel(f.updatedAt)}{f.owner ? ` · ${f.owner}` : ""}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Kill switch (real) */}
          <div className="card" style={{ padding: 16, background: "#0a0a0a", color: "#fff", border: 0, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 90% 20%, rgba(220,38,38,0.2), transparent 60%)" }} />
            <div style={{ position: "relative" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 9999, background: "#fee2e2", color: "#dc2626", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>● Sólo emergencias</div>
              <div className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", marginTop: 10 }}>
                Kill switch<span style={{ color: "var(--primary)" }}>.</span>
              </div>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", margin: "6px 0 12px", lineHeight: 1.5 }}>Apaga todos los flags no críticos en prod (rollout 0% + off). Los de impacto crítico quedan intactos. Queda en el audit.</p>
              <button onClick={doKillSwitch} disabled={pending} style={{ width: "100%", padding: "10px 14px", borderRadius: 9999, background: "#dc2626", color: "#fff", border: 0, fontFamily: "inherit", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", cursor: pending ? "wait" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="power" size={13} color="#fff" />Activar kill switch
              </button>
            </div>
          </div>
        </div>
      </div>

      {openFlag && <FlagDrawer key={openFlag.k} f={openFlag} clubs={data.clubs} pending={pending} onClose={() => setOpenKey(null)} onSetRollout={(p) => setRollout(openFlag, p)} onToggle={() => toggleFlag(openFlag)} onDelete={() => removeFlag(openFlag)} onPatchMeta={(p) => patchMeta(openFlag, p)} onRefresh={() => router.refresh()} />}
      {creating && <CreateFlagModal existingKeys={data.rows.map((r) => r.k)} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); router.refresh(); }} />}
    </div>
  );
}

function FlagRowItem({ f, last, pending, onToggle, onOpen }: { f: FlagRow; last: boolean; pending: boolean; onToggle: () => void; onOpen: () => void }) {
  const sm = STATE_META[f.state];
  const em = ENV_META[f.env];
  const known = knownFlag(f.k);
  // Nombre visible: override del admin (label) → registro de código → titleize(key).
  const displayName = f.label?.trim() || known?.label || f.t;
  // Texto descriptivo: lo que el código dice que controla (canónico) o, si no es
  // conocido, la nota que puso el admin en la DB.
  const desc = known?.description ?? f.desc;
  return (
    <div style={{ display: "grid", gridTemplateColumns: ROW_COLS, gap: 14, alignItems: "center", padding: "13px 20px", borderBottom: last ? 0 : "1px solid var(--border)", background: "#fff" }}>
      <button onClick={onOpen} className="mp-flag-row" style={{ minWidth: 0, background: "transparent", border: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
          <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em" }}>{displayName}</span>
          {f.impact === "high" && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, background: "#fee2e2", color: "#dc2626", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>● Crítico</span>}
          {known && !known.wired && <span title="Registrado en el código pero todavía no se consulta: prenderlo aún no tiene efecto (pendiente de cablear)." style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "help" }}>pendiente</span>}
          {!known && <span title="Este flag no está referenciado en el código: prenderlo o apagarlo no tiene efecto. Candidato a eliminar." style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "help" }}>⚠ sin uso</span>}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "ui-monospace, monospace", color: "#525252", fontSize: 10.5, flexShrink: 0 }}>{f.k}</span>
          <span>·</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{desc}</span>
        </div>
      </button>
      <div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", color: em.c }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: em.c }} />
          {em.l}
        </span>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 4 }}>
          <span className="font-heading tabular" style={{ fontSize: 15, fontWeight: 900, color: sm.c }}>{f.rollout}<span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>%</span></span>
          <span style={{ fontSize: 10, fontWeight: 800, color: sm.c, textTransform: "uppercase", letterSpacing: "0.08em" }}>{sm.l}</span>
        </div>
        <div style={{ height: 3, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: f.rollout + "%", background: sm.c }} />
        </div>
      </div>
      <button onClick={onOpen} className="mp-flag-row" style={{ minWidth: 0, background: "transparent", border: 0, cursor: "pointer", textAlign: "left", fontFamily: "inherit", padding: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.segment || <span style={{ color: "var(--muted-fg)" }}>sin segmento</span>}</div>
        <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{f.owner || "sin owner"} · {agoLabel(f.updatedAt)}</div>
      </button>
      <button onClick={onOpen} className="mp-flag-row" style={{ background: "transparent", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: 0, fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
        {f.assignments.length > 0 ? `${f.assignments.length}` : "—"}
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
        <Toggle on={f.enabled} disabled={pending} onChange={onToggle} />
      </div>
    </div>
  );
}

// Tooltip accesible (hover + foco + tap). Posición fixed para no quedar recortado
// por contenedores con overflow (tablas, drawer). Texto en español sencillo.
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setCoords({ x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 6 });
    setOpen(true);
  };
  const hide = () => setOpen(false);
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button ref={ref} type="button" aria-label={text} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={(e) => { e.stopPropagation(); if (open) hide(); else show(); }} style={{ background: "transparent", border: 0, padding: 0, margin: 0, cursor: "help", display: "inline-flex", color: "var(--muted-fg)", lineHeight: 0 }}>
        <Icon name="info" size={12} color="var(--muted-fg)" />
      </button>
      {open && coords && (
        <span role="tooltip" style={{ position: "fixed", left: coords.x, top: coords.y, zIndex: 1200, maxWidth: 240, background: "#0a0a0a", color: "#fff", fontSize: 11, lineHeight: 1.45, fontWeight: 500, letterSpacing: 0, textTransform: "none", padding: "8px 11px", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", pointerEvents: "none" }}>{text}</span>
      )}
    </span>
  );
}

function FFKpi({ icon, label, value, sub, emerald, warn, danger, tip }: { icon: string; label: string; value: string; sub?: string; emerald?: boolean; warn?: boolean; danger?: boolean; tip?: string }) {
  const c = danger ? "#dc2626" : emerald ? "#047857" : warn ? "#92400e" : "#0a0a0a";
  const bg = danger ? "#fee2e2" : emerald ? "rgba(16,185,129,0.12)" : warn ? "#fef3c7" : "var(--muted)";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span className="label-mp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{label}{tip && <InfoTip text={tip} />}</span>
        <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color: c, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={13} color={c} />
        </span>
      </div>
      <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em", color: c }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function FilterPill({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { k: string; l: string }[] }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff" }}>
      <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-fg)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, background: "transparent", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", outline: "none" }}>
        {options.map((o) => (
          <option key={o.k} value={o.k}>{o.l}</option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onChange} style={{ flexShrink: 0, width: 40, height: 22, borderRadius: 9999, background: on ? "var(--primary)" : "#e5e5e5", position: "relative", cursor: disabled ? "wait" : "pointer", border: 0, padding: 0, opacity: disabled ? 0.6 : 1, transition: "background 150ms" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "left 150ms" }} />
    </button>
  );
}

function Seg({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ padding: "7px 12px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "var(--muted-fg)" }}>{children}</button>
  );
}

function FlagDrawer({ f, clubs, pending, onClose, onSetRollout, onToggle, onDelete, onPatchMeta, onRefresh }: { f: FlagRow; clubs: ClubLite[]; pending: boolean; onClose: () => void; onSetRollout: (pct: number) => void; onToggle: () => void; onDelete: () => void; onPatchMeta: (p: Partial<{ env: FlagEnv; impact: FlagImpact; owner: string | null; segment: string | null; label: string | null }>) => void; onRefresh: () => void }) {
  const sm = STATE_META[f.state];
  const em = ENV_META[f.env];
  const known = knownFlag(f.k);
  const displayName = f.label?.trim() || known?.label || f.t;
  const [labelDraft, setLabelDraft] = useState(f.label ?? "");
  const [owner, setOwner] = useState(f.owner ?? "");
  const [segment, setSegment] = useState(f.segment ?? "");
  const [history, setHistory] = useState<FlagHistoryEntry[] | null>(null);
  const [loadingHist, setLoadingHist] = useState(false);

  const loadHistory = () => {
    setLoadingHist(true);
    void listFlagHistory({ key: f.k }).then((res) => {
      if (res.ok) setHistory(res.data);
      setLoadingHist(false);
    });
  };

  const codeSnippet = `if (await isFlagEnabled('${f.k}')) {\n  // feature on\n}`;
  const targetingSnippet = `// el ${f.rollout}% recibe el flag\nif (hash(user.id) % 100 < ${f.rollout}) enable('${f.k}')`;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, background: "#fff", height: "100%", overflow: "auto", boxShadow: "-12px 0 32px rgba(0,0,0,0.18)", animation: "mpSlideIn 220ms cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ background: "#0a0a0a", color: "#fff", padding: 22, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 85% 20%, rgba(124,58,237,0.2), transparent 60%)" }} />
          <button onClick={onClose} aria-label="Cerrar" style={{ position: "absolute", top: 14, right: 14, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 }}>
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div style={{ position: "relative" }}>
            <div className="label-mp" style={{ color: "#c4b5fd" }}>● Feature flag</div>
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 10, wordBreak: "break-all" }}>{f.k}</div>
            <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "6px 0 0" }}>
              {displayName}<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff" }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: em.c }} />{em.l}
              </span>
              <span style={{ padding: "3px 9px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", color: sm.c, fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>● {sm.l}</span>
              {f.impact === "high" && <span style={{ padding: "3px 9px", borderRadius: 9999, background: "#fee2e2", color: "#dc2626", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>Crítico</span>}
              <Toggle on={f.enabled} disabled={pending} onChange={onToggle} />
            </div>
          </div>
        </div>

        {/* Qué controla (según el registro de código) */}
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)", background: known ? (known.wired ? "rgba(16,185,129,0.04)" : "#fffbeb") : "#fef2f2" }}>
          <div className="label-mp" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            Qué controla
            {known && (
              <span style={{ padding: "1px 7px", borderRadius: 9999, fontSize: 8.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", background: known.wired ? "rgba(16,185,129,0.14)" : "#fef3c7", color: known.wired ? "#047857" : "#92400e" }}>{known.wired ? "● Cableado" : "Pendiente"}</span>
            )}
          </div>
          {known ? (
            <>
              <p style={{ margin: 0, fontSize: 12.5, color: "#0a0a0a", lineHeight: 1.5 }}>{known.description}</p>
              {!known.wired && (
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#78350f", lineHeight: 1.5 }}>
                  ⚠️ El código todavía no consulta este flag, así que prenderlo aún no tiene efecto. Hay que cablear el chequeo en las superficies de abajo.
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                {known.surfaces.map((s) => (
                  <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 9999, background: "var(--muted)", fontSize: 10.5, fontWeight: 700, color: "#0a0a0a" }}>
                    <Icon name="code" size={10} color="var(--muted-fg)" />{s}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Icon name="alert-triangle" size={14} color="#dc2626" />
              <p style={{ margin: 0, fontSize: 12, color: "#7f1d1d", lineHeight: 1.5 }}>
                Este flag <b>no está referenciado en el código</b>: prenderlo o apagarlo no tiene ningún efecto. Es candidato a eliminar, o falta registrarlo en <code style={{ fontFamily: "ui-monospace, monospace" }}>src/lib/flags/registry.ts</code> si sí se usa.
              </p>
            </div>
          )}
        </div>

        {/* Rollout */}
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="label-mp" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Rollout <InfoTip text="A qué porcentaje de usuarios les llega la función. 25% = 1 de cada 4. 100% = todos." /></div>
            <span className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, color: sm.c }}>{f.rollout}<span style={{ fontSize: 14, color: "var(--muted-fg)", fontWeight: 700 }}>%</span></span>
          </div>
          <div style={{ position: "relative", height: 8, borderRadius: 9999, background: "var(--muted)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: f.rollout + "%", background: sm.c }} />
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {[0, 10, 25, 50, 75, 100].map((p) => (
              <button key={p} disabled={pending} onClick={() => onSetRollout(p)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid var(--border)", background: f.rollout === p ? "#0a0a0a" : "#fff", color: f.rollout === p ? "#fff" : "#0a0a0a", fontFamily: "ui-monospace, monospace", fontSize: 10.5, fontWeight: 800, cursor: pending ? "wait" : "pointer" }}>{p}%</button>
            ))}
          </div>
        </div>

        {/* Metadata: env / impact / owner / segment */}
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>Configuración <InfoTip text="Nombre = cómo se ve en el panel (no cambia la clave que usa el código). Entorno = dónde aplica. Impacto = qué tan delicado es; 'Crítico' queda protegido del kill switch. Owner y segmento son informativos." /></div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Nombre visible</span>
            <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} onBlur={() => labelDraft !== (f.label ?? "") && onPatchMeta({ label: labelDraft.trim() || null })} placeholder={known?.label || f.t} style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none" }} />
            <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>Clave (no editable): <code style={{ fontFamily: "ui-monospace, monospace" }}>{f.k}</code></span>
          </label>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Entorno</div>
          <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2, marginBottom: 12 }}>
            {ENVS.map((e) => (
              <Seg key={e} on={f.env === e} onClick={() => f.env !== e && onPatchMeta({ env: e })}>{ENV_META[e].l}</Seg>
            ))}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Impacto</div>
          <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2, marginBottom: 12 }}>
            {IMPACTS.map((im) => (
              <Seg key={im} on={f.impact === im} onClick={() => f.impact !== im && onPatchMeta({ impact: im })}>{IMPACT_LABEL[im]}</Seg>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Owner</span>
              <input value={owner} onChange={(e) => setOwner(e.target.value)} onBlur={() => owner !== (f.owner ?? "") && onPatchMeta({ owner: owner.trim() || null })} placeholder="nombre o email" style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Segmento</span>
              <input value={segment} onChange={(e) => setSegment(e.target.value)} onBlur={() => segment !== (f.segment ?? "") && onPatchMeta({ segment: segment.trim() || null })} placeholder="ej: 25% clubes pro" style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none" }} />
            </label>
          </div>
        </div>

        {/* Excepciones */}
        <AssignmentsSection f={f} clubs={clubs} onRefresh={onRefresh} />

        {/* Targeting (informativo) */}
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>Targeting <InfoTip text="Cómo se decide a quién le toca el flag: por el hash del id del usuario, de forma estable (el mismo usuario siempre cae igual). Es ilustrativo." /></div>
          <pre style={{ margin: 0, padding: 14, background: "#0a0a0a", color: "#34d399", fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.7, borderRadius: 8, overflow: "auto" }}>{targetingSnippet}</pre>
          {f.segment && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 8 }}>Segmento: <b style={{ color: "#0a0a0a" }}>{f.segment}</b></div>}
        </div>

        {/* Uso en código */}
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>Uso en código</div>
          <pre style={{ margin: 0, padding: 12, background: "#fafafa", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.6, overflow: "auto" }}>{codeSnippet}</pre>
        </div>

        {/* Historial (real desde audit_log) */}
        <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="label-mp">Historial</div>
            {history === null && (
              <button onClick={loadHistory} disabled={loadingHist} style={{ background: "transparent", border: 0, color: "var(--primary)", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                {loadingHist ? "Cargando…" : "Ver historial"}
              </button>
            )}
          </div>
          {history !== null && (
            history.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>Sin registros de auditoría todavía.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, position: "relative", paddingLeft: 4 }}>
                <div style={{ position: "absolute", left: 9, top: 4, bottom: 4, width: 1, background: "var(--border)" }} />
                {history.map((h) => (
                  <div key={h.id} style={{ display: "flex", gap: 12, padding: "6px 0", alignItems: "flex-start", position: "relative" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: h.action === "delete" ? "#dc2626" : h.action === "insert" ? "var(--primary)" : "#fbbf24", flexShrink: 0, marginTop: 3, border: "2px solid #fff", boxShadow: "0 0 0 1px var(--border)", zIndex: 1 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{h.action}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 1 }}>{h.actorRole ?? "sistema"} · {agoLabel(h.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Delete */}
        <div style={{ padding: 18 }}>
          <button onClick={onDelete} disabled={pending} className="btn" style={{ width: "100%", background: "#fff", border: "1px solid #fecaca", color: "#dc2626", justifyContent: "center" }}>
            <Icon name="trash-2" size={13} color="#dc2626" />Eliminar flag
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentsSection({ f, clubs, onRefresh }: { f: FlagRow; clubs: ClubLite[]; onRefresh: () => void }) {
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [scope, setScope] = useState<"user" | "club" | "role">("club");
  const [enabled, setEnabled] = useState(true);
  const [clubId, setClubId] = useState("");
  const [role, setRole] = useState("user");
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; display_name: string } | null>(null);

  const doSearch = () => {
    if (userQuery.trim().length < 1) return;
    startTransition(async () => {
      const res = await searchUsers({ q: userQuery });
      if (res.ok) setUserResults(res.data);
    });
  };
  const scopeId = scope === "user" ? selectedUser?.id ?? "" : scope === "club" ? clubId : role;
  const doAssign = () => {
    if (!scopeId) return toast({ icon: "alert-triangle", title: "Selecciona destino" });
    startTransition(async () => {
      const res = await upsertFlagAssignment({ flagKey: f.k, scope, scopeId, enabled });
      if (res.ok) {
        toast({ icon: "check", title: "Excepción aplicada" });
        setSelectedUser(null);
        setClubId("");
        setUserQuery("");
        setUserResults([]);
        onRefresh();
      } else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };
  const doRemove = async (a: FlagAssignment) => {
    const ok = await confirm({ title: "Quitar excepción", body: `¿Quitar ${a.scope}=${a.scopeId}?`, confirmLabel: "Quitar", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteFlagAssignment({ flagKey: a.flagKey, scope: a.scope, scopeId: a.scopeId });
      if (res.ok) {
        toast({ icon: "check", title: "Excepción eliminada" });
        onRefresh();
      } else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? id;

  return (
    <div style={{ padding: 18, borderBottom: "1px solid var(--border)" }}>
      <div className="label-mp" style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>Excepciones · pisan el default <InfoTip text="Reglas puntuales que ganan sobre el valor general: enciende o apaga el flag solo para un usuario, club o rol específico." /></div>
      {f.assignments.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {f.assignments.map((a) => (
            <div key={a.scope + a.scopeId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "var(--muted)" }}>
              <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-fg)", width: 38 }}>{a.scope}</span>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.scope === "club" ? clubName(a.scopeId) : a.scopeId}</span>
              <span style={{ fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", color: a.enabled ? "#047857" : "#dc2626" }}>{a.enabled ? "ON" : "OFF"}</span>
              <button onClick={() => doRemove(a)} disabled={pending} aria-label="Quitar" style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted-fg)", display: "inline-flex" }}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginBottom: 12 }}>Sin excepciones · todos siguen el default.</div>
      )}

      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        {([{ v: "user", l: "Usuario" }, { v: "club", l: "Club" }, { v: "role", l: "Rol" }] as const).map((s) => (
          <button key={s.v} onClick={() => setScope(s.v)} style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: scope === s.v ? "2px solid var(--primary)" : "1px solid var(--border)", background: scope === s.v ? "#ecfdf5" : "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{s.l}</button>
        ))}
      </div>

      {scope === "user" && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="Buscar usuario…" style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none" }} />
            <button className="btn" onClick={doSearch} disabled={pending} style={{ background: "#fff", border: "1px solid var(--border)" }}>Buscar</button>
          </div>
          {selectedUser ? (
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700 }}>Seleccionado: {selectedUser.display_name} <button onClick={() => setSelectedUser(null)} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", textDecoration: "underline", fontSize: 11 }}>cambiar</button></div>
          ) : (
            userResults.length > 0 && (
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflow: "auto" }}>
                {userResults.map((u) => (
                  <button key={u.id} onClick={() => setSelectedUser(u)} style={{ textAlign: "left", padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                    {u.display_name} <span style={{ color: "var(--muted-fg)" }}>@{u.username}</span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
      {scope === "club" && (
        <select value={clubId} onChange={(e) => setClubId(e.target.value)} style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, marginBottom: 10, background: "#fff" }}>
          <option value="">Elige un club…</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
      {scope === "role" && (
        <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, marginBottom: 10, background: "#fff" }}>
          {ROLES_FOR_SCOPE.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <Toggle on={enabled} onChange={() => setEnabled((v) => !v)} />
          {enabled ? "Activar para este destino" : "Desactivar para este destino"}
        </label>
        <button className="btn btn-primary" onClick={doAssign} disabled={pending}>
          <Icon name="plus" size={12} color="#fff" />Aplicar excepción
        </button>
      </div>
    </div>
  );
}

function CreateFlagModal({ existingKeys, onClose, onCreated }: { existingKeys: string[]; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const uncreated = uncreatedKnownFlags(existingKeys);
  // Modo por defecto: elegir de los flags conocidos (si quedan); si no, manual.
  const [mode, setMode] = useState<"known" | "manual">(uncreated.length > 0 ? "known" : "manual");
  const [picked, setPicked] = useState<KnownFlag | null>(uncreated[0] ?? null);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [enabledDefault, setEnabledDefault] = useState(false);
  const [env, setEnv] = useState<FlagEnv>("prod");
  const [impact, setImpact] = useState<FlagImpact>("med");

  const create = () => {
    const isKnown = mode === "known" && picked;
    const k = (isKnown ? picked!.key : key).trim().toLowerCase().replace(/\s+/g, "_");
    if (k.length < 2) return toast({ icon: "alert-triangle", title: "Elige o escribe una clave válida" });
    const desc = isKnown ? picked!.description : description.trim() || "—";
    const imp = isKnown ? picked!.impact : impact;
    startTransition(async () => {
      const res = await upsertFlag({ key: k, description: desc, enabledDefault, rolloutPct: enabledDefault ? 100 : 0, env, impact: imp });
      if (res.ok) {
        toast({ icon: "check", title: "Flag creado", sub: k });
        onCreated();
      } else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <div onMouseDown={onClose} className="mp-modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, animation: "mpFade 200ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} className="card mp-modal-panel" style={{ maxWidth: 480, width: "100%", padding: 22, display: "flex", flexDirection: "column", gap: 14, animation: "mpPop 220ms cubic-bezier(0.16,1,0.3,1)", maxHeight: "90vh", overflow: "auto" }}>
        <div>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Nuevo flag</div>
          <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>Crear feature flag<span className="dot">.</span></h3>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>Un flag solo tiene efecto si el código lo lee. Elige uno de los flags que el código ya conoce, o crea uno manual (avanzado).</p>
        </div>

        {/* Selector de modo */}
        <div style={{ display: "inline-flex", padding: 3, background: "var(--muted)", borderRadius: 9999, border: "1px solid var(--border)", gap: 2, alignSelf: "flex-start" }}>
          <Seg on={mode === "known"} onClick={() => setMode("known")}>Conocido</Seg>
          <Seg on={mode === "manual"} onClick={() => setMode("manual")}>Manual (avanzado)</Seg>
        </div>

        {mode === "known" ? (
          uncreated.length === 0 ? (
            <div style={{ padding: 12, borderRadius: 8, background: "var(--muted)", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
              Todos los flags conocidos por el código ya existen. Para crear uno nuevo, primero regístralo en <code style={{ fontFamily: "ui-monospace, monospace" }}>src/lib/flags/registry.ts</code> o usa el modo manual.
            </div>
          ) : (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Flag conocido</span>
                <select value={picked?.key ?? ""} onChange={(e) => setPicked(uncreated.find((f) => f.key === e.target.value) ?? null)} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "#fff", outline: "none" }}>
                  {uncreated.map((f) => (
                    <option key={f.key} value={f.key}>{f.label} · {f.key}</option>
                  ))}
                </select>
              </label>
              {picked && (
                <div style={{ padding: 12, borderRadius: 8, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
                  <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#047857", marginBottom: 4 }}>{picked.key}</div>
                  <p style={{ margin: 0, fontSize: 12, color: "#0a0a0a", lineHeight: 1.5 }}>{picked.description}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {picked.surfaces.map((s) => (
                      <span key={s} style={{ padding: "2px 8px", borderRadius: 9999, background: "#fff", border: "1px solid var(--border)", fontSize: 10, fontWeight: 700 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Clave (snake_case)</span>
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="ej: nuevo_checkout" style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontSize: 13, outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Descripción</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Qué controla este flag" style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }} />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, background: "#fffbeb", fontSize: 11, color: "#78350f", lineHeight: 1.45 }}>
              <Icon name="alert-triangle" size={13} color="#b45309" />
              <span>Manual = quedará como <b>huérfano</b> hasta que el código lea esta key (y la registres en <code style={{ fontFamily: "ui-monospace, monospace" }}>registry.ts</code>).</span>
            </div>
          </>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Entorno</span>
            <select value={env} onChange={(e) => setEnv(e.target.value as FlagEnv)} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "#fff", outline: "none" }}>
              {ENVS.map((e) => <option key={e} value={e}>{ENV_META[e].l}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5, opacity: mode === "known" ? 0.55 : 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-fg)" }}>Impacto {mode === "known" && "(del registro)"}</span>
            <select value={mode === "known" && picked ? picked.impact : impact} disabled={mode === "known"} onChange={(e) => setImpact(e.target.value as FlagImpact)} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, background: "#fff", outline: "none" }}>
              {IMPACTS.map((im) => <option key={im} value={im}>{IMPACT_LABEL[im]}</option>)}
            </select>
          </label>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
          <Toggle on={enabledDefault} onChange={() => setEnabledDefault((v) => !v)} />
          Encendido por defecto (100%)
        </label>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} style={{ background: "#fff", border: "1px solid var(--border)" }}>Cancelar</button>
          <button className="btn btn-primary" onClick={create} disabled={pending || (mode === "known" && !picked)}>
            <Icon name="check" size={13} color="#fff" />Crear
          </button>
        </div>
      </div>
    </div>
  );
}
