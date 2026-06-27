// Client view de AdminTeamScreen — layout 1:1 (AdminPower.jsx 110-190).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { assignTicket, autoAssignTickets } from "@/server/actions/support";
import { revokeRole } from "@/server/actions/roles";

export type TeamRole = "Admin" | "Moderador" | "Soporte" | "Finanzas";
export type MemberRow = {
  id: string;
  assignmentId: string;
  n: string;
  email: string;
  role: TeamRole;
  av: string;
  avBg: string;
  area: string;
  load: number;
  openCases: number;
  online: boolean;
  lastAct: string;
};
export type TeamData = {
  rows: MemberRow[];
  kpis: {
    onlineCount: number;
    totalCount: number;
    openCasesCount: number;
    slaLabel: string;
    resolvedTodayCount: number;
  };
};

const ROLE_COLOR: Record<TeamRole, string> = {
  Admin: "#dc2626",
  Moderador: "#fbbf24",
  Soporte: "#0ea5e9",
  Finanzas: "var(--primary)",
};

const PLACEHOLDER_COUNT = 4;

function MemberPlaceholder() {
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
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: "50%",
            background: "var(--muted)",
            color: "var(--muted-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          —
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              className="font-heading"
              style={{ fontSize: 14.5, fontWeight: 900, color: "var(--muted-fg)" }}
            >
              Sin staff interno
            </span>
            <RSPill bg="var(--muted-fg)">—</RSPill>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3 }}>— · —</div>
        </div>
      </div>
    </div>
  );
}

export function AdminTeamScreenView({
  data,
  viewerUserId,
}: {
  data: TeamData;
  viewerUserId: string | null;
}) {
  useRealtimeRefresh([{ table: "role_assignments" }, { table: "tickets" }, { table: "reports" }], { debounceMs: 4000 });
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleAssignCase = async (assigneeId: string, name: string) => {
    const ticketId = await ask({
      title: `Asignar caso a ${name}`,
      label: "ID del ticket",
      placeholder: "Pega el UUID del ticket",
      required: true,
      confirmLabel: "Asignar",
    });
    if (ticketId == null) return;
    startTransition(async () => {
      const res = await assignTicket({ id: ticketId.trim(), assigneeId });
      if (res.ok) toast({ icon: "check", title: `Caso asignado a ${name}` });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const handleAutoAssign = async () => {
    const ok = await confirm({
      title: "Auto-asignar tickets",
      body: "¿Repartir los tickets sin asignar entre los admins activos por carga?",
      confirmLabel: "Repartir",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await autoAssignTickets();
      if (res.ok) {
        toast({
          icon: "shuffle",
          title:
            res.data.assigned === 0
              ? "No había tickets sin asignar"
              : `${res.data.assigned} ticket${res.data.assigned === 1 ? "" : "s"} asignado${res.data.assigned === 1 ? "" : "s"}`,
        });
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleInviteStaff = () => {
    toast({
      icon: "user-plus",
      title: "Gestiona admins desde Permisos & Roles",
      sub: "Usa Asignar rol para dar acceso admin a una cuenta existente.",
    });
  };

  const handleRevoke = async (assignmentId: string, name: string) => {
    const ok = await confirm({
      title: `Revocar acceso admin a ${name}`,
      body: "Esta persona perderá acceso al panel de administración. La acción queda registrada en el audit log.",
      confirmLabel: "Revocar",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await revokeRole({ assignmentId });
      if (res.ok) toast({ icon: "user-minus", title: `Acceso admin revocado a ${name}` });
      else toast({ icon: "alert-triangle", title: "Error al revocar", sub: res.error.message });
    });
  };

  const hasRows = data.rows.length > 0;

  const KPIS: [string, string, string][] = [
    [
      "Admins activos",
      String(data.kpis.totalCount),
      "var(--primary)",
    ],
    ["Casos abiertos", String(data.kpis.openCasesCount), "#fbbf24"],
    ["SLA promedio", data.kpis.slaLabel, "#0a0a0a"],
    ["Casos resueltos · hoy", String(data.kpis.resolvedTodayCount), "var(--primary)"],
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="STAFF"
        accent="#dc2626"
        label="Plataforma · Equipo interno MATCHPOINT"
        title="Equipo MP"
        sub={`${data.kpis.totalCount} ${data.kpis.totalCount === 1 ? "persona" : "personas"} operando MATCHPOINT. Asigna casos y balancea carga con datos reales de soporte y moderación.`}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
              onClick={handleAutoAssign}
              disabled={isPending}
            >
              <Icon name="shuffle" size={12} />
              Auto-asignar
            </button>
            <button className="btn btn-primary" onClick={handleInviteStaff}>
              <Icon name="user-plus" size={13} />
              Invitar staff
            </button>
          </div>
        }
      />

      <div className="mp-partner-torneo-kpis">
        {KPIS.map(([l, v, c]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                marginTop: 8,
                color: c,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </div>

      <div className="mp-admin-kpis-2">
        {hasRows
          ? data.rows.map((p) => (
              <div key={p.id} className="card" style={{ padding: 18 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ position: "relative" }}>
                    <div
                      style={{
                        width: 46,
                        height: 46,
                        borderRadius: "50%",
                        background: p.avBg,
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "Plus Jakarta Sans",
                        fontWeight: 900,
                        fontSize: 13,
                      }}
                    >
                      {p.av}
                    </div>
                    {p.online && (
                      <span
                        style={{
                          position: "absolute",
                          bottom: -1,
                          right: -1,
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          background: "var(--primary)",
                          border: "2px solid #fff",
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className="font-heading"
                        style={{ fontSize: 14.5, fontWeight: 900, letterSpacing: "-0.015em" }}
                      >
                        {p.n}
                      </span>
                      <RSPill bg={ROLE_COLOR[p.role]}>{p.role}</RSPill>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3 }}>
                      {p.email} · {p.area}
                    </div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4 }}>
                      {p.lastAct === "—" ? "Actividad reciente no disponible" : `Última actividad: ${p.lastAct}`}
                    </div>
                  </div>
                </div>
                <div className="mp-tournament-form-grid-2" style={{ marginTop: 14 }}>
                  <div style={{ padding: 10, background: "var(--muted)", borderRadius: 8 }}>
                    <div className="label-mp">Carga · semana</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
                      <span
                        className="font-heading"
                        style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
                      >
                        {p.load}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>casos</span>
                    </div>
                    <div
                      style={{
                        height: 4,
                        background: "#fff",
                        borderRadius: 9999,
                        marginTop: 6,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: Math.min(100, p.load * 6) + "%",
                          background:
                            p.load > 14 ? "#dc2626" : p.load > 8 ? "#fbbf24" : "var(--primary)",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ padding: 10, background: "var(--muted)", borderRadius: 8 }}>
                    <div className="label-mp">Abiertos · ahora</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
                      <span
                        className="font-heading"
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          letterSpacing: "-0.02em",
                          color: p.openCases > 0 ? "#dc2626" : "var(--primary)",
                        }}
                      >
                        {p.openCases}
                      </span>
                      <span style={{ fontSize: 9, color: "var(--muted-fg)" }}>pendientes</span>
                    </div>
                  </div>
                </div>
                {viewerUserId !== p.id && (
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        flex: 1,
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 10.5,
                      }}
                      onClick={() =>
                        toast({
                          icon: "message-square",
                          title: "Mensajería interna pendiente",
                          sub: "La pantalla muestra carga real, pero aún no abre chats directos entre admins.",
                        })
                      }
                    >
                      <Icon name="message-square" size={11} />
                      Mensaje
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1, fontSize: 10.5 }}
                      onClick={() => handleAssignCase(p.id, p.n)}
                      disabled={isPending}
                    >
                      <Icon name="user-plus" size={11} />
                      Asignar caso
                    </button>
                    <button
                      type="button"
                      className="btn"
                      style={{
                        background: "#fff",
                        border: "1px solid #fca5a5",
                        fontSize: 10.5,
                        color: "#dc2626",
                      }}
                      onClick={() => handleRevoke(p.assignmentId, p.n)}
                      disabled={isPending}
                    >
                      <Icon name="user-minus" size={11} color="#dc2626" />
                      Revocar
                    </button>
                  </div>
                )}
              </div>
            ))
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <MemberPlaceholder key={k} />)}
      </div>
    </>
  );
}
