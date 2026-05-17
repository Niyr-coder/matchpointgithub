// Client view de AdminRolesScreen — sidebar de roles + miembros + role_requests + asignar modal.
"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  assignRole,
  revokeRole,
  approveRoleRequest,
  rejectRoleRequest,
  searchUsers,
} from "@/server/actions/roles";

type PermVal = "all" | "own" | "limited" | "public" | "none";
type RoleEntry = { k: string; t: string; color: string; desc: string };

export type RoleMember = {
  assignmentId: string;
  userId: string;
  username: string;
  displayName: string;
  clubId: string | null;
  clubName: string | null;
  grantedAt: string;
};
export type RoleRequest = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  requestedRole: string;
  targetClubId: string | null;
  targetClubName: string | null;
  reason: string | null;
  createdAt: string;
};
export type ClubOption = { id: string; name: string };
export type RolesData = {
  counts: Record<string, number>;
  members: Record<string, RoleMember[]>;
  requests: RoleRequest[];
  clubs: ClubOption[];
};

const ROLES: RoleEntry[] = [
  { k: "admin", t: "Admin", color: "#dc2626", desc: "Control total de plataforma. Sin restricciones." },
  { k: "partner", t: "Partner", color: "#7c3aed", desc: "Organiza ligas y torneos en la plataforma." },
  { k: "owner", t: "Owner club", color: "#0a0a0a", desc: "Dueño de un club registrado." },
  { k: "manager", t: "Manager club", color: "#0ea5e9", desc: "Operación diaria del club." },
  { k: "coach", t: "Coach", color: "#f59e0b", desc: "Da clases en clubes asociados." },
  { k: "employee", t: "Empleado club", color: "#10b981", desc: "Recepción, caja, atención." },
  { k: "user", t: "Usuario", color: "var(--muted-fg)", desc: "Jugador estándar." },
];
const CLUB_SCOPED = new Set(["owner", "manager", "coach", "employee"]);

const CAPS = [
  "Clubes · ver",
  "Clubes · suspender",
  "Usuarios · ver",
  "Usuarios · suspender",
  "Pagos · procesar",
  "Moderación · resolver",
  "Audit · ver",
  "Config · editar",
  "Impersonar",
  "Feature flags",
  "Roles · asignar",
  "Reportes · resolver",
] as const;

const PERMS: Record<string, Record<string, PermVal>> = {
  admin: { "Clubes · ver": "all", "Clubes · suspender": "all", "Usuarios · ver": "all", "Usuarios · suspender": "all", "Pagos · procesar": "all", "Moderación · resolver": "all", "Audit · ver": "all", "Config · editar": "all", Impersonar: "all", "Feature flags": "all", "Roles · asignar": "all", "Reportes · resolver": "all" },
  partner: { "Clubes · ver": "own", "Clubes · suspender": "none", "Usuarios · ver": "own", "Usuarios · suspender": "none", "Pagos · procesar": "own", "Moderación · resolver": "none", "Audit · ver": "none", "Config · editar": "none", Impersonar: "none", "Feature flags": "none", "Roles · asignar": "none", "Reportes · resolver": "none" },
  owner: { "Clubes · ver": "own", "Clubes · suspender": "none", "Usuarios · ver": "own", "Usuarios · suspender": "none", "Pagos · procesar": "own", "Moderación · resolver": "none", "Audit · ver": "own", "Config · editar": "own", Impersonar: "none", "Feature flags": "none", "Roles · asignar": "limited", "Reportes · resolver": "none" },
  manager: { "Clubes · ver": "own", "Clubes · suspender": "none", "Usuarios · ver": "own", "Usuarios · suspender": "none", "Pagos · procesar": "none", "Moderación · resolver": "none", "Audit · ver": "none", "Config · editar": "own", Impersonar: "none", "Feature flags": "none", "Roles · asignar": "none", "Reportes · resolver": "none" },
  coach: { "Clubes · ver": "own", "Clubes · suspender": "none", "Usuarios · ver": "own", "Usuarios · suspender": "none", "Pagos · procesar": "own", "Moderación · resolver": "none", "Audit · ver": "none", "Config · editar": "none", Impersonar: "none", "Feature flags": "none", "Roles · asignar": "none", "Reportes · resolver": "none" },
  employee: { "Clubes · ver": "own", "Clubes · suspender": "none", "Usuarios · ver": "own", "Usuarios · suspender": "none", "Pagos · procesar": "limited", "Moderación · resolver": "none", "Audit · ver": "none", "Config · editar": "none", Impersonar: "none", "Feature flags": "none", "Roles · asignar": "none", "Reportes · resolver": "none" },
  user: { "Clubes · ver": "public", "Clubes · suspender": "none", "Usuarios · ver": "public", "Usuarios · suspender": "none", "Pagos · procesar": "own", "Moderación · resolver": "none", "Audit · ver": "own", "Config · editar": "own", Impersonar: "none", "Feature flags": "none", "Roles · asignar": "none", "Reportes · resolver": "none" },
};

function valStyle(v: PermVal): { bg: string; l: string; color: string } {
  if (v === "all") return { bg: "var(--primary)", l: "● Todo", color: "#fff" };
  if (v === "own") return { bg: "#0ea5e9", l: "○ Propio", color: "#fff" };
  if (v === "limited") return { bg: "#fbbf24", l: "◐ Limitado", color: "#fff" };
  if (v === "public") return { bg: "var(--muted)", l: "Público", color: "var(--muted-fg)" };
  return { bg: "var(--muted)", l: "✗ Ninguno", color: "var(--muted-fg)" };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

export function AdminRolesScreenView({ data }: { data: RolesData }) {
  useRealtimeRefresh([{ table: "role_assignments" }, { table: "role_requests" }]);
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<string>("admin");
  const [showAssign, setShowAssign] = useState(false);
  const sel = ROLES.find((r) => r.k === selected)!;
  const perms = PERMS[selected];
  const members = data.members[selected] ?? [];
  const totalUsers = Object.values(data.counts).reduce((s, n) => s + n, 0).toLocaleString("en-US");

  const handleRevoke = async (assignmentId: string, displayName: string) => {
    const ok = await confirm({
      title: "Revocar rol",
      body: `¿Revocar el rol "${selected}" a ${displayName}?`,
      confirmLabel: "Revocar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await revokeRole({ assignmentId });
      if (res.ok) toast({ icon: "check", title: "Rol revocado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleApprove = async (req: RoleRequest) => {
    const needsClub = CLUB_SCOPED.has(req.requestedRole);
    let clubId: string | null = req.targetClubId;
    if (needsClub && !clubId) {
      const clubsList = data.clubs.map((c) => `${c.id} → ${c.name}`).join("\n");
      const choice = await ask({
        title: "Club requerido",
        label: `Rol "${req.requestedRole}" necesita club`,
        placeholder: "Pega el ID del club",
        helper: clubsList ? `Clubes disponibles:\n${clubsList}` : "No hay clubes registrados.",
        required: true,
        confirmLabel: "Aprobar",
      });
      if (choice == null) return;
      clubId = choice.trim();
    }
    startTransition(async () => {
      const res = await approveRoleRequest({ requestId: req.id, clubId });
      if (res.ok) toast({ icon: "check", title: "Solicitud aprobada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleReject = async (req: RoleRequest) => {
    const ok = await confirm({
      title: "Rechazar solicitud",
      body: `¿Rechazar la solicitud de ${req.displayName}?`,
      confirmLabel: "Rechazar",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await rejectRoleRequest({ requestId: req.id });
      if (res.ok) toast({ icon: "check", title: "Solicitud rechazada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  return (
    <>
      <PolHero
        tone="dark"
        wm="RBAC"
        accent="#dc2626"
        label="Plataforma · Permisos & Roles"
        title="Quién puede hacer qué"
        sub="Asigna o revoca roles, aprueba solicitudes pendientes y revisa la matriz de capacidades de los 7 roles."
        right={
          <button className="btn btn-primary" onClick={() => setShowAssign(true)}>
            <Icon name="user-plus" size={13} />
            Asignar rol
          </button>
        }
      />

      {data.requests.length > 0 && (
        <div className="card" style={{ padding: 18, border: "2px solid #fbbf24" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Icon name="alert-triangle" size={16} color="#fbbf24" />
            <h2
              className="font-heading"
              style={{
                fontSize: 14,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              Solicitudes pendientes <span style={{ color: "var(--muted-fg)" }}>({data.requests.length})</span>
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.requests.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 110px 1fr auto",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  background: "var(--muted)",
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{r.displayName}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{r.username}</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--primary)",
                  }}
                >
                  → {r.requestedRole}
                </span>
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                  {r.targetClubName ? `Club: ${r.targetClubName}` : "Sin club específico"}
                  {r.reason ? ` · "${r.reason}"` : ""}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 10.5 }}
                    disabled={isPending}
                    onClick={() => handleApprove(r)}
                  >
                    Aprobar
                  </button>
                  <button
                    className="btn"
                    style={{
                      background: "#fff",
                      border: "1px solid var(--border)",
                      fontSize: 10.5,
                      color: "#dc2626",
                    }}
                    disabled={isPending}
                    onClick={() => handleReject(r)}
                  >
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div className="card" style={{ padding: 12 }}>
          <div className="label-mp" style={{ padding: "6px 8px 8px" }}>
            {ROLES.length} roles · {totalUsers} usuarios
          </div>
          {ROLES.map((r) => {
            const on = selected === r.k;
            const count = data.counts[r.k] ?? 0;
            return (
              <button
                key={r.k}
                onClick={() => setSelected(r.k)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: 8,
                  background: on ? "#ecfdf5" : "transparent",
                  border: 0,
                  borderLeft: on ? "3px solid var(--primary)" : "3px solid transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 7,
                    background: r.color,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="shield" size={12} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 11.5,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {r.t}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>
                    {count.toLocaleString("en-US")} usuarios
                  </div>
                </div>
                {on && <Icon name="chevron-right" size={13} color="var(--muted-fg)" />}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ padding: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 20,
                paddingBottom: 18,
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: sel.color,
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="shield" size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div className="label-mp">Rol</div>
                <h2
                  className="font-heading"
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-0.025em",
                    textTransform: "uppercase",
                    margin: "2px 0 4px",
                  }}
                >
                  {sel.t}
                  <span className="dot">.</span>
                </h2>
                <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>{sel.desc}</div>
              </div>
            </div>

            <div className="label-mp" style={{ marginBottom: 10 }}>
              Miembros con este rol ({members.length})
            </div>
            {members.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  background: "#fafafa",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "var(--muted-fg)",
                  textAlign: "center",
                }}
              >
                Sin miembros asignados.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {members.map((m) => (
                  <div
                    key={m.assignmentId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 100px 80px",
                      gap: 12,
                      alignItems: "center",
                      padding: "10px 12px",
                      background: "var(--muted)",
                      borderRadius: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>{m.displayName}</div>
                      <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{m.username}</div>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                      {m.clubName ? `Club: ${m.clubName}` : "Global"}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                      Asignado {fmtDate(m.grantedAt)}
                    </div>
                    <button
                      className="btn"
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 10,
                        color: "#dc2626",
                      }}
                      disabled={isPending}
                      onClick={() => handleRevoke(m.assignmentId, m.displayName)}
                    >
                      Revocar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="label-mp" style={{ marginBottom: 12 }}>
              Matriz de capacidades (referencia RLS)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10 }}>
              {CAPS.map((cap) => {
                const v = valStyle(perms[cap] ?? "none");
                return (
                  <div key={cap} style={{ display: "contents" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 0",
                        borderTop: "1px dashed var(--border)",
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{cap}</span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 0",
                        borderTop: "1px dashed var(--border)",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: 9999,
                          background: v.bg,
                          color: v.color,
                          fontSize: 9.5,
                          fontWeight: 900,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                        }}
                      >
                        {v.l}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showAssign && (
        <AssignRoleModal
          clubs={data.clubs}
          onClose={() => setShowAssign(false)}
          defaultRole={selected}
        />
      )}
    </>
  );
}

function AssignRoleModal({
  clubs,
  onClose,
  defaultRole,
}: {
  clubs: ClubOption[];
  onClose: () => void;
  defaultRole: string;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; display_name: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; display_name: string } | null>(null);
  const [role, setRole] = useState<string>(defaultRole);
  const [clubId, setClubId] = useState<string>("");
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
      const res = await assignRole({
        userId: selectedUser.id,
        role,
        clubId: needsClub ? clubId : null,
      });
      if (res.ok) {
        toast({ icon: "check", title: `Rol "${role}" asignado a ${selectedUser.display_name}` });
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

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
        style={{ padding: 24, width: 480, maxWidth: "100%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: 0 }}
          >
            Asignar rol<span className="dot">.</span>
          </h2>
          <button
            onClick={onClose}
            style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 20 }}
          >
            ×
          </button>
        </div>

        <div className="label-mp" style={{ marginBottom: 6 }}>
          1. Usuario
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="Buscar por @username o nombre…"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "inherit",
            }}
          />
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={doSearch} disabled={searching}>
            <Icon name="search" size={12} />
          </button>
        </div>
        {results.length > 0 && !selectedUser && (
          <div style={{ marginBottom: 12, maxHeight: 160, overflowY: "auto" }}>
            {results.map((u) => (
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
        )}
        {selectedUser && (
          <div
            style={{
              padding: "8px 12px",
              background: "#ecfdf5",
              border: "1px solid var(--primary)",
              borderRadius: 6,
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{selectedUser.display_name}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{selectedUser.username}</div>
            </div>
            <button
              onClick={() => {
                setSelectedUser(null);
                setResults([]);
                setQuery("");
              }}
              style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--muted-fg)" }}
            >
              cambiar
            </button>
          </div>
        )}

        <div className="label-mp" style={{ marginBottom: 6 }}>
          2. Rol
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
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
          {ROLES.map((r) => (
            <option key={r.k} value={r.k}>
              {r.t}
            </option>
          ))}
        </select>

        {needsClub && (
          <>
            <div className="label-mp" style={{ marginBottom: 6 }}>
              3. Club {clubs.length === 0 && <span style={{ color: "#dc2626" }}>(sin clubes activos)</span>}
            </div>
            <select
              value={clubId}
              onChange={(e) => setClubId(e.target.value)}
              disabled={clubs.length === 0}
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
          </>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
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
            disabled={submitting || !selectedUser || (needsClub && !clubId)}
          >
            {submitting ? "Asignando…" : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
}
