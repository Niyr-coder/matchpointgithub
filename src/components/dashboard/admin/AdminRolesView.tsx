"use client";
// Admin · Permisos & Roles v2 — MERGE del visor RBAC (rediseño) con el backend
// REAL. Conserva el diseño (lista por scope, hero, matriz de capacidades,
// comparador, leyenda) y recablea lo operativo: solicitudes de rol pendientes
// (aprobar/rechazar), asignar/revocar rol, counts y miembros reales. Recibe
// `data: RolesData` del server AdminRolesScreen.
//
// NOTA: la matriz de capacidades es una REFERENCIA ilustrativa — el RBAC granular
// no existe; el modelo real son RoleKeys en role_assignments. Lo operativo (lo de
// abajo) sí es real. Ver docs/guides/00-roles.md.
import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { roleBadgeMeta } from "@/lib/ui/role-badge";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { MpBadge } from "@/components/dashboard/widgets/MpBadge";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";
import { assignRole, revokeRole, approveRoleRequest, rejectRoleRequest, searchUsers, listRoleMembers, type RoleMemberDTO } from "@/server/actions/roles";
import { updateRoleCapability } from "@/server/actions/role-capabilities";
import type { RolesData, RoleRequest, ClubOption } from "./AdminRolesScreenView";

type Level = "all" | "limited" | "own" | "public" | "none";
type Role = { k: RoleKey; t: string; color: string; icon: string; badge: string; scope: string; desc: string };

// Solo los 7 RoleKeys reales del sistema (sin mod/support/finance del prototipo).
const ROLE_ORDER: RoleKey[] = ["admin", "partner", "owner", "manager", "coach", "employee", "user"];
const ROLE_TITLE: Record<RoleKey, string> = {
  admin: "Admin",
  partner: "Partner",
  owner: "Owner club",
  manager: "Manager club",
  coach: "Coach",
  employee: "Empleado club",
  user: "Jugador",
};
const ROLE_SCOPE: Record<RoleKey, string> = {
  admin: "Plataforma",
  partner: "Club",
  owner: "Club",
  manager: "Club",
  coach: "Club",
  employee: "Club",
  user: "End user",
};
const ROLES: Role[] = ROLE_ORDER.map((k) => {
  const cfg = MP_ROLES[k];
  const badge = roleBadgeMeta(k);
  return {
    k,
    t: ROLE_TITLE[k],
    color: badge.color,
    icon: badge.icon,
    badge: badge.label,
    scope: ROLE_SCOPE[k],
    desc: cfg.desc,
  };
});
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLES.map((r) => [r.k, r.t]));
const CLUB_SCOPED = new Set<string>(["owner", "manager", "coach", "employee"]);
const SCOPES = ["Plataforma", "Club", "End user"];

const DOMAINS = [
  { d: "Clubes", i: "building-2", caps: [{ k: "clubs.view", l: "Ver clubes" }, { k: "clubs.create", l: "Crear clubes" }, { k: "clubs.verify", l: "Verificar (badge oficial)" }, { k: "clubs.suspend", l: "Suspender clubes" }] },
  { d: "Usuarios", i: "users", caps: [{ k: "users.view", l: "Ver perfiles" }, { k: "users.suspend", l: "Suspender cuentas" }, { k: "users.impersonate", l: "Impersonar usuarios" }] },
  { d: "Pagos", i: "wallet", caps: [{ k: "pay.process", l: "Procesar pagos" }, { k: "pay.refund", l: "Reembolsar" }, { k: "pay.payout", l: "Aprobar payouts" }] },
  { d: "Moderación", i: "shield-alert", caps: [{ k: "mod.resolve", l: "Resolver reportes" }, { k: "mod.ban", l: "Banear usuarios" }, { k: "mod.appeal", l: "Revisar apelaciones" }] },
  { d: "Sistema", i: "settings", caps: [{ k: "sys.audit", l: "Ver audit log" }, { k: "sys.config", l: "Editar configuración" }, { k: "sys.flags", l: "Modificar feature flags" }, { k: "sys.roles", l: "Asignar roles" }] },
];

// La matriz ahora viene REAL de data.matrix (tabla role_capabilities, mig 158).
// Ausencia de nivel = "none". Editable desde "Editar permisos".
const LEVELS: Level[] = ["all", "limited", "own", "public", "none"];

const PERM_META: Record<Level, { l: string; c: string; bg: string; border: string; dot: string }> = {
  all: { l: "Todo", c: "#fff", bg: "var(--primary)", border: "var(--primary)", dot: "●" },
  limited: { l: "Limitado", c: "#92400e", bg: "#fef3c7", border: "#fcd34d", dot: "◐" },
  own: { l: "Propio", c: "#1e40af", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.3)", dot: "○" },
  public: { l: "Público", c: "#525252", bg: "var(--muted)", border: "var(--border)", dot: "◌" },
  none: { l: "Ninguno", c: "var(--muted-fg)", bg: "transparent", border: "var(--border)", dot: "✕" },
};

const nf = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const initials = (name: string) => name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
const agoLabel = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "hoy";
  if (days < 30) return `hace ${days}d`;
  return `hace ${Math.floor(days / 30)} mes${Math.floor(days / 30) === 1 ? "" : "es"}`;
};

export function AdminRolesView({ data }: { data: RolesData }) {
  useRealtimeRefresh([{ table: "role_assignments" }, { table: "role_requests" }], { debounceMs: 3000 });
  const router = useRouter();
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState("admin");
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [editingPerms, setEditingPerms] = useState(false);
  const [searching, startMembersTransition] = useTransition();
  const [mq, setMq] = useState("");
  const [found, setFound] = useState<RoleMemberDTO[] | null>(null);

  // Nivel real de una capacidad para un rol (ausencia = none). Mig 158.
  const levelOf = (role: string, cap: string): Level => (data.matrix[role]?.[cap] ?? "none") as Level;

  const sel = ROLES.find((r) => r.k === selected)!;
  const cmp = compareWith ? ROLES.find((r) => r.k === compareWith) ?? null : null;
  const grouped = SCOPES.map((s) => ({ s, roles: ROLES.filter((r) => r.scope === s) }));
  const count = (k: string) => data.counts[k] ?? 0;
  const totalUsers = Object.values(data.counts).reduce((s, n) => s + n, 0);
  const members = data.members[selected] ?? [];

  // Búsqueda server-side de miembros del rol seleccionado (debounce). found=null
  // → muestra solo el preview; si hay query (≥2), muestra resultados.
  useEffect(() => {
    const term = mq.trim();
    if (term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFound(null);
      return;
    }
    const id = setTimeout(() => {
      startMembersTransition(async () => {
        const res = await listRoleMembers({ role: selected, q: term, limit: 40 });
        if (res.ok) setFound(res.data);
      });
    }, 300);
    return () => clearTimeout(id);
  }, [mq, selected]);

  // Search-first para todos los roles: solo un preview corto + búsqueda (nunca
  // listas largas). Para gestionar a alguien puntual, se busca.
  const PREVIEW = 6;
  const preview = members.slice(0, PREVIEW);
  const renderMemberRow = (m: RoleMemberDTO, i: number) => (
    <div key={m.assignmentId} style={{ display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 12, alignItems: "center", padding: "11px 18px", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: sel.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900 }}>{initials(m.displayName)}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.displayName} <span style={{ color: "var(--muted-fg)", fontWeight: 500 }}>@{m.username}</span></div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{m.clubName ? `${m.clubName} · ` : ""}desde {agoLabel(m.grantedAt)}</div>
      </div>
      <button className="btn" style={{ background: "#fff", border: "1px solid #fecaca", color: "#dc2626", fontSize: 10 }} disabled={pending} onClick={() => handleRevoke(m.assignmentId, m.displayName)}>
        <Icon name="user-minus" size={11} color="#dc2626" />Revocar
      </button>
    </div>
  );
  const requests = data.requests;

  const allCaps = DOMAINS.flatMap((d) => d.caps);
  const fullCaps = allCaps.filter((c) => levelOf(selected, c.k) === "all").length;
  const partial = allCaps.filter((c) => ["limited", "own"].includes(levelOf(selected, c.k))).length;
  const totalCaps = allCaps.length;

  const handleApprove = async (req: RoleRequest) => {
    let clubId: string | null = req.targetClubId;
    if (CLUB_SCOPED.has(req.requestedRole) && !clubId) {
      const list = data.clubs.map((c) => `${c.id} → ${c.name}`).join("\n");
      const choice = await ask({ title: "Club requerido", label: `Rol "${req.requestedRole}" necesita club`, placeholder: "Pega el ID del club", helper: list ? `Clubes:\n${list}` : "No hay clubes.", required: true, confirmLabel: "Aprobar" });
      if (choice == null) return;
      clubId = choice.trim();
    }
    startTransition(async () => {
      const res = await approveRoleRequest({ requestId: req.id, clubId });
      if (res.ok) { toast({ icon: "check", title: "Solicitud aprobada" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };
  const handleReject = async (req: RoleRequest) => {
    const ok = await confirm({ title: "Rechazar solicitud", body: `¿Rechazar la solicitud de ${req.displayName}?`, confirmLabel: "Rechazar", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      const res = await rejectRoleRequest({ requestId: req.id });
      if (res.ok) { toast({ icon: "check", title: "Solicitud rechazada" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };
  const handleRevoke = async (assignmentId: string, displayName: string) => {
    const ok = await confirm({ title: "Revocar rol", body: `¿Revocar el rol "${sel.t}" a ${displayName}?`, confirmLabel: "Revocar", destructive: true });
    if (!ok) return;
    startTransition(async () => {
      const res = await revokeRole({ assignmentId });
      if (res.ok) { toast({ icon: "check", title: "Rol revocado" }); router.refresh(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* HEADER */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp" style={{ color: "#dc2626" }}>● RBAC · control de acceso basado en roles</div>
            <h1 className="font-heading mp-admin-page-title" style={{ fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: "8px 0 0" }}>
              Permisos & Roles<span className="dot">.</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: "8px 0 0" }}>
              {ROLES.length} roles · {nf(totalUsers)} asignaciones de usuario{requests.length > 0 ? ` · ${requests.length} solicitud${requests.length === 1 ? "" : "es"} pendiente${requests.length === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAssign(true)}>
            <Icon name="user-plus" size={13} color="#fff" />Asignar rol
          </button>
        </div>
      </div>

      {/* SOLICITUDES PENDIENTES (real) */}
      {requests.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid #fcd34d" }}>
          <div style={{ padding: "14px 20px", background: "#fffbeb", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="inbox" size={16} color="#92400e" />
            <h2 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0, color: "#78350f" }}>
              {requests.length} solicitud{requests.length === 1 ? "" : "es"} de rol pendiente{requests.length === 1 ? "" : "s"}<span className="dot">.</span>
            </h2>
          </div>
          {requests.map((r, i) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 14, alignItems: "center", padding: "14px 20px", borderTop: i === 0 ? 0 : "1px solid var(--border)" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <span className="font-heading" style={{ fontSize: 13, fontWeight: 900 }}>{initials(r.displayName)}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{r.displayName} <span style={{ color: "var(--muted-fg)", fontWeight: 500 }}>@{r.username}</span></div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
                  pide <b style={{ color: "#0a0a0a", textTransform: "uppercase" }}>{ROLE_LABEL[r.requestedRole] ?? r.requestedRole}</b>
                  {r.targetClubName ? ` · ${r.targetClubName}` : ""} · {agoLabel(r.createdAt)}
                </div>
                {r.reason && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 3, fontStyle: "italic" }}>“{r.reason}”</div>}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-primary" style={{ fontSize: 10.5 }} disabled={pending} onClick={() => handleApprove(r)}>
                  <Icon name="check" size={11} color="#fff" />Aprobar
                </button>
                <button className="btn" style={{ background: "#fff", border: "1px solid #fecaca", color: "#dc2626", fontSize: 10.5 }} disabled={pending} onClick={() => handleReject(r)}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MAIN GRID */}
      <div className="mp-roles-grid" style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 16, alignItems: "flex-start" }}>
        {/* ROLE LIST */}
        <div className="mp-roles-list" style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 88 }}>
          {grouped.map((g) => (
            <div key={g.s} className="card" style={{ padding: 8 }}>
              <div style={{ padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="label-mp">{g.s}</span>
                <span style={{ fontSize: 10, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace" }}>{nf(g.roles.reduce((s, r) => s + count(r.k), 0))}</span>
              </div>
              {g.roles.map((r) => {
                const on = selected === r.k;
                return (
                  <button key={r.k} onClick={() => setSelected(r.k)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 10px", borderRadius: 8, background: on ? "#0a0a0a" : "transparent", color: on ? "#fff" : "#0a0a0a", border: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 2 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: on ? 900 : 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>{r.t}</div>
                      <div style={{ fontSize: 10, color: on ? "rgba(255,255,255,0.55)" : "var(--muted-fg)", marginTop: 1 }}>{nf(count(r.k))} {count(r.k) === 1 ? "usuario" : "usuarios"}</div>
                    </div>
                    {compareWith === r.k && <span style={{ padding: "2px 6px", borderRadius: 4, background: "#fbbf24", color: "#0a0a0a", fontSize: 8, fontWeight: 900, letterSpacing: "0.1em" }}>VS</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* ROLE DETAIL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Hero */}
          <div className="card" style={{ padding: 0, overflow: "hidden", background: "#0a0a0a", color: "#fff", position: "relative", border: 0 }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 90% 20%, ${sel.color}33, transparent 55%)` }} />
            <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 180, color: "rgba(255,255,255,0.04)", letterSpacing: "-0.06em", lineHeight: 0.8, transform: "rotate(-6deg) translate(8%, -16%)", textTransform: "uppercase", pointerEvents: "none" }}>{sel.t}</div>
            <div style={{ position: "relative", padding: "22px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <MpBadge
                  {...roleBadgeMeta(sel.k)}
                  variant="soft"
                  size="sm"
                  title="Rol seleccionado"
                />
                <span style={{ padding: "2px 8px", borderRadius: 9999, background: "rgba(255,255,255,0.1)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase" }}>{sel.scope}</span>
              </div>
              <div className="mp-roles-hero" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <h2 className="font-heading" style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0, lineHeight: 1 }}>
                    {sel.t}<span style={{ color: "var(--primary)" }}>.</span>
                  </h2>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", margin: "8px 0 0", maxWidth: 480 }}>{sel.desc}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex" }}>
                      {members.slice(0, 4).map((m, i) => (
                        <div key={m.assignmentId} style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg, hsl(${i * 70}, 60%, 45%), hsl(${i * 70 + 60}, 65%, 35%))`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #0a0a0a", marginLeft: i === 0 ? 0 : -8, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 10 }}>
                          {initials(m.displayName)}
                        </div>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                      {members.length === 0 ? "Sin usuarios con este rol" : <>{members.slice(0, 2).map((m) => m.displayName.split(" ")[0]).join(", ")}{count(sel.k) > 2 ? <> y <b style={{ color: "#fff" }}>{nf(count(sel.k) - 2)} más</b></> : ""}</>}
                    </span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>Usuarios</div>
                  <div className="font-heading tabular" style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 4 }}>{nf(count(sel.k))}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 6, fontFamily: "ui-monospace, monospace" }}>{fullCaps}/{totalCaps} capacidades · {partial} parciales</div>
                </div>
              </div>
            </div>
            <div style={{ position: "relative", padding: "12px 26px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.3)", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontFamily: "ui-monospace, monospace" }}>role.{sel.k}</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <select value={compareWith || ""} onChange={(e) => setCompareWith(e.target.value || null)} style={{ padding: "7px 13px", borderRadius: 9999, background: compareWith ? "#fbbf24" : "rgba(255,255,255,0.1)", border: "1px solid " + (compareWith ? "#fbbf24" : "rgba(255,255,255,0.2)"), color: compareWith ? "#0a0a0a" : "#fff", fontFamily: "inherit", fontSize: 10.5, fontWeight: 800, cursor: "pointer", outline: "none" }}>
                  <option value="">Comparar con…</option>
                  {ROLES.filter((r) => r.k !== selected).map((r) => (
                    <option key={r.k} value={r.k}>{r.t}</option>
                  ))}
                </select>
                {selected === "admin" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 9999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", color: "rgba(255,255,255,0.6)", fontSize: 10.5, fontWeight: 800 }}>
                    <Icon name="lock" size={11} color="rgba(255,255,255,0.6)" />Acceso total · inmutable
                  </span>
                ) : (
                  <button className="btn" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 10.5 }} onClick={() => setEditingPerms(true)}>
                    <Icon name="pencil" size={11} color="#fff" />Editar permisos
                  </button>
                )}
                <button className="btn btn-primary" style={{ fontSize: 10.5 }} onClick={() => setShowAssign(true)}>
                  <Icon name="user-plus" size={11} color="#fff" />Asignar este rol
                </button>
              </div>
            </div>
          </div>

          {/* MIEMBROS reales del rol seleccionado */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="label-mp">Miembros · {sel.t}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ position: "relative" }}>
                  <Icon name="search" size={12} color="var(--muted-fg)" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
                  <input
                    value={mq}
                    onChange={(e) => setMq(e.target.value)}
                    placeholder="Buscar miembro…"
                    style={{ width: 180, padding: "6px 24px 6px 26px", borderRadius: 9999, border: "1px solid var(--border)", fontSize: 11.5, fontFamily: "inherit", outline: "none" }}
                  />
                  {mq && (
                    <button onClick={() => setMq("")} aria-label="Limpiar" style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", background: "transparent", border: 0, cursor: "pointer", display: "inline-flex", color: "var(--muted-fg)" }}>
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 11, color: "var(--muted-fg)", whiteSpace: "nowrap" }}>
                  {searching ? "Buscando…" : found ? `${nf(found.length)} ${found.length === 1 ? "resultado" : "resultados"}` : `${nf(count(sel.k))} ${count(sel.k) === 1 ? "usuario" : "usuarios"}`}
                </span>
              </div>
            </div>
            {found ? (
              found.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--muted-fg)", fontSize: 12.5 }}>Sin resultados para «{mq.trim()}» en {sel.t}.</div>
              ) : (
                found.map(renderMemberRow)
              )
            ) : members.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--muted-fg)", fontSize: 12.5 }}>Nadie tiene este rol todavía.</div>
            ) : (
              <>
                {count(sel.k) > preview.length && (
                  <div style={{ padding: "8px 18px", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)", background: "var(--muted)" }}>Más recientes · busca para ver el resto</div>
                )}
                {preview.map(renderMemberRow)}
                {count(sel.k) > preview.length && (
                  <div style={{ padding: "11px 18px", borderTop: "1px dashed var(--border)", fontSize: 11.5, color: "var(--muted-fg)", display: "flex", alignItems: "center", gap: 7 }}>
                    <Icon name="search" size={13} />
                    <span>y <b style={{ color: "#0a0a0a" }}>{nf(count(sel.k) - preview.length)}</b> más — usa la búsqueda para encontrar a alguien.</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Matriz (referencia ilustrativa) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--muted-fg)", padding: "0 2px" }}>
            <Icon name="info" size={12} />
            <span>Matriz de capacidades <b style={{ color: "#0a0a0a" }}>real y editable</b> (tabla <code>role_capabilities</code>). El enforcement se aplica en server actions; la cobertura en RLS se adopta por etapas.</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {DOMAINS.map((d) => (
              <DomainCard key={d.d} d={d} selectedKey={selected} cmpKey={compareWith} selRole={sel} cmpRole={cmp} levelOf={levelOf} />
            ))}
          </div>

          {/* Legend */}
          <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#fafafa" }}>
            <span className="label-mp">Leyenda</span>
            {(Object.keys(PERM_META) as Level[]).map((lvl) => (
              <PermChip key={lvl} level={lvl} />
            ))}
          </div>
        </div>
      </div>

      {showAssign && <AssignRoleModal clubs={data.clubs} defaultRole={selected} onClose={() => setShowAssign(false)} onDone={() => { setShowAssign(false); router.refresh(); }} />}
      {editingPerms && <EditPermsModal role={sel} levelOf={levelOf} onClose={() => setEditingPerms(false)} onChanged={() => router.refresh()} />}
    </div>
  );
}

function EditPermsModal({ role, levelOf, onClose, onChanged }: { role: Role; levelOf: (role: string, cap: string) => Level; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [savingCap, setSavingCap] = useState<string | null>(null);

  const setLevel = (capKey: string, level: Level) => {
    setSavingCap(capKey);
    startTransition(async () => {
      const res = await updateRoleCapability({ role: role.k, capKey, level });
      setSavingCap(null);
      if (res.ok) { toast({ icon: "check", title: "Permiso actualizado" }); onChanged(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <div onMouseDown={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "mpFade 200ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} className="card" style={{ padding: 0, width: 560, maxWidth: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", animation: "mpPop 220ms cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="label-mp" style={{ color: role.color }}>● Editar permisos · {role.t}</div>
            <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: "4px 0 0" }}>Capacidades del rol<span className="dot">.</span></h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="mp-close-btn"><Icon name="x" size={15} /></button>
        </div>
        <div style={{ padding: "8px 0", overflowY: "auto" }}>
          {DOMAINS.map((d) => (
            <div key={d.d} style={{ padding: "10px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Icon name={d.i} size={13} color="var(--muted-fg)" />
                <span className="label-mp">{d.d}</span>
              </div>
              {d.caps.map((cap) => (
                <div key={cap.k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px dashed var(--border)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{cap.l}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace" }}>{cap.k}</div>
                  </div>
                  <select
                    value={levelOf(role.k, cap.k)}
                    disabled={pending && savingCap === cap.k}
                    onChange={(e) => setLevel(cap.k, e.target.value as Level)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 11.5, fontFamily: "inherit", background: "#fff", fontWeight: 700, outline: "none" }}
                  >
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>{PERM_META[lv].l}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: "var(--muted)" }}>
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>Los cambios se guardan al instante y quedan en el audit log.</span>
          <button className="btn btn-primary" onClick={onClose}>Listo</button>
        </div>
      </div>
    </div>
  );
}

function DomainCard({ d, selectedKey, cmpKey, selRole, cmpRole, levelOf }: { d: (typeof DOMAINS)[number]; selectedKey: string; cmpKey: string | null; selRole: Role; cmpRole: Role | null; levelOf: (role: string, cap: string) => Level }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: 32, height: 32, borderRadius: 9, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={d.i} size={15} color="#fff" />
        </span>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase", margin: 0 }}>{d.d}<span className="dot">.</span></h3>
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace", marginLeft: 4 }}>{d.caps.length} permisos</span>
      </div>
      <div className="mp-table-scroll">
        <div style={{ minWidth: cmpRole ? 460 : 320, display: "grid", gridTemplateColumns: cmpRole ? "1fr 130px 24px 130px" : "1fr 160px", gap: 12, alignItems: "center" }}>
          {cmpRole && (
            <>
              <div />
              <div style={{ textAlign: "center", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: selRole.color }}>{selRole.t}</div>
              <div />
              <div style={{ textAlign: "center", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: cmpRole.color }}>{cmpRole.t}</div>
            </>
          )}
          {d.caps.map((cap, i) => {
            const selLevel = levelOf(selectedKey, cap.k);
            const cmpLevel = cmpKey ? levelOf(cmpKey, cap.k) : null;
            const diff = cmpLevel != null && selLevel !== cmpLevel;
            const cellTop = { paddingTop: i === 0 ? 6 : 12, paddingBottom: 6, borderTop: i === 0 ? 0 : "1px dashed var(--border)" };
            return (
              <div key={cap.k} style={{ display: "contents" }}>
                <div style={cellTop}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{cap.l}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>{cap.k}</div>
                </div>
                <div style={{ ...cellTop, display: "flex", justifyContent: "center" }}>
                  <PermChip level={selLevel} />
                </div>
                {cmpRole && (
                  <>
                    <div style={{ ...cellTop, display: "flex", justifyContent: "center" }}>
                      {diff ? <Icon name="arrow-left-right" size={13} color="#fbbf24" /> : <span style={{ width: 13, height: 1, background: "var(--border)" }} />}
                    </div>
                    <div style={{ ...cellTop, display: "flex", justifyContent: "center" }}>
                      <PermChip level={cmpLevel ?? "none"} dim={!diff} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PermChip({ level, dim }: { level: Level; dim?: boolean }) {
  const m = PERM_META[level] ?? PERM_META.none;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 9999, background: m.bg, color: m.c, border: "1px solid " + m.border, fontSize: 10, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", opacity: dim ? 0.55 : 1 }}>
      <span>{m.dot}</span>
      {m.l}
    </span>
  );
}

function AssignRoleModal({ clubs, defaultRole, onClose, onDone }: { clubs: ClubOption[]; defaultRole: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; display_name: string } | null>(null);
  // "partner" no se asigna desde este editor genérico — huérfano sin partner_id/partner_members (usar Admin → Partners).
  const assignableRoles = ROLES.filter((r) => r.k !== "partner");
  const [role, setRole] = useState(defaultRole === "user" || defaultRole === "partner" ? "coach" : defaultRole);
  const [clubId, setClubId] = useState("");
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const needsClub = CLUB_SCOPED.has(role);

  const doSearch = () => {
    if (query.trim().length < 1) return;
    startSearch(async () => {
      const res = await searchUsers({ q: query });
      if (res.ok) setResults(res.data);
      else toast({ icon: "alert-triangle", title: "Error buscando", sub: res.error.message });
    });
  };
  const doSubmit = () => {
    if (!selectedUser) return toast({ icon: "alert-triangle", title: "Selecciona un usuario" });
    if (needsClub && !clubId) return toast({ icon: "alert-triangle", title: "Selecciona un club" });
    startSubmit(async () => {
      const res = await assignRole({ userId: selectedUser.id, role, clubId: needsClub ? clubId : null });
      if (res.ok) { toast({ icon: "check", title: `Rol "${ROLE_LABEL[role]}" asignado a ${selectedUser.display_name}` }); onDone(); }
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <div onMouseDown={onClose} className="mp-modal-overlay" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10,10,10,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "mpFade 200ms cubic-bezier(0.16,1,0.3,1)" }}>
      <div onMouseDown={(e) => e.stopPropagation()} className="card mp-modal-panel" style={{ padding: 24, width: 480, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 14, maxHeight: "90vh", overflow: "auto", animation: "mpPop 220ms cubic-bezier(0.16,1,0.3,1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="font-heading" style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: 0 }}>Asignar rol<span className="dot">.</span></h2>
          <button onClick={onClose} aria-label="Cerrar" className="mp-close-btn"><Icon name="x" size={15} /></button>
        </div>

        <div>
          <div className="label-mp" style={{ marginBottom: 6 }}>Usuario</div>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()} placeholder="Buscar por nombre o @username…" style={{ flex: 1, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, outline: "none" }} />
            <button className="btn" onClick={doSearch} disabled={searching} style={{ background: "#fff", border: "1px solid var(--border)" }}>Buscar</button>
          </div>
          {selectedUser ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: "#ecfdf5", border: "1px solid rgba(16,185,129,0.25)" }}>
              <Icon name="check-circle-2" size={14} color="#047857" />
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{selectedUser.display_name} <span style={{ color: "var(--muted-fg)" }}>@{selectedUser.username}</span></span>
              <button onClick={() => setSelectedUser(null)} style={{ background: "transparent", border: 0, color: "var(--muted-fg)", cursor: "pointer", textDecoration: "underline", fontSize: 11 }}>cambiar</button>
            </div>
          ) : (
            results.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                {results.map((u) => (
                  <button key={u.id} onClick={() => { setSelectedUser(u); setResults([]); }} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 }}>
                    {u.display_name} <span style={{ color: "var(--muted-fg)" }}>@{u.username}</span>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label-mp">Rol</span>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, background: "#fff", outline: "none" }}>
            {assignableRoles.map((r) => (
              <option key={r.k} value={r.k}>{r.t}</option>
            ))}
          </select>
        </label>

        {needsClub && (
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="label-mp">Club (requerido para este rol)</span>
            <select value={clubId} onChange={(e) => setClubId(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12.5, background: "#fff", outline: "none" }}>
              <option value="">Elige un club…</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button className="btn" onClick={onClose} style={{ background: "#fff", border: "1px solid var(--border)" }}>Cancelar</button>
          <button className="btn btn-primary" onClick={doSubmit} disabled={submitting}>
            <Icon name="check" size={13} color="#fff" />Asignar rol
          </button>
        </div>
      </div>
    </div>
  );
}
