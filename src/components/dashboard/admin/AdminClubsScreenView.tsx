// Client view de AdminClubsScreen — layout 1:1 (RoleScreens.jsx 73-114).
"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSFilters, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { suspendClub, activateClub } from "@/server/actions/clubs";
import {
  quickApproveApplication,
  rejectApplication,
} from "@/server/actions/clubApplicationsAdmin";
import { getApplicationDetail } from "@/server/actions/clubApplications";
import { downloadCsv } from "@/lib/export/csv";

export type Status = "verified" | "pending" | "rejected";
export type ClubRow = {
  id: string;
  name: string;
  city: string;
  courts: number;
  members: number;
  rev: string;
  status: Status;
  founded: string;
  tier: "PRO" | "NEW" | "STD" | "X";
};
export type PendingApplication = {
  id: string;
  name: string;
  city: string;
  status: string;
  submittedAt: string | null;
  applicantName: string;
  contactPerson: string | null;
  contactEmail: string | null;
};
export type ClubsData = { rows: ClubRow[]; pending: PendingApplication[] };

const APP_STATUS_LABEL: Record<string, string> = {
  submitted: "ENVIADA",
  docs_review: "REVISIÓN DOCS",
  field_verification: "VERIF. CAMPO",
  final_review: "REVISIÓN FINAL",
};

const ST_COLOR: Record<Status, string> = {
  verified: "var(--primary)",
  pending: "#fbbf24",
  rejected: "#dc2626",
};

const ST_LABEL: Record<Status, string> = {
  verified: "Verificado",
  pending: "Pendiente",
  rejected: "Rechazado",
};

function RowMenu({ club }: { club: ClubRow }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const doSuspend = async () => {
    setOpen(false);
    const reason = await ask({
      title: `Suspender ${club.name}`,
      label: "Razón de la suspensión",
      placeholder: "Explica brevemente la razón",
      multiline: true,
      required: true,
      confirmLabel: "Suspender",
      destructive: true,
    });
    if (reason == null) return;
    startTransition(async () => {
      const res = await suspendClub({ id: club.id, reason });
      if (res.ok) toast({ icon: "check", title: "Club suspendido" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const doActivate = async () => {
    setOpen(false);
    const ok = await confirm({
      title: `Reactivar club`,
      body: `¿Reactivar el club ${club.name}?`,
      confirmLabel: "Reactivar",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await activateClub({ id: club.id });
      if (res.ok) toast({ icon: "check", title: "Club reactivado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const isActive = club.status === "verified";

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: open ? "var(--primary)" : "var(--muted)",
          color: open ? "#fff" : "#0a0a0a",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="more-horizontal" size={13} color={open ? "#fff" : "#0a0a0a"} />
      </button>
      {open && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50 }}
            onClick={() => setOpen(false)}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 36,
              minWidth: 180,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
              zIndex: 51,
              padding: 6,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {isActive ? (
              <button
                onClick={doSuspend}
                style={{
                  padding: "8px 12px",
                  border: 0,
                  background: "transparent",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12,
                  color: "#dc2626",
                  cursor: "pointer",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="ban" size={12} color="#dc2626" />
                Suspender club
              </button>
            ) : (
              <button
                onClick={doActivate}
                style={{
                  padding: "8px 12px",
                  border: 0,
                  background: "transparent",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12,
                  color: "var(--primary)",
                  cursor: "pointer",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Icon name="check-circle-2" size={12} color="var(--primary)" />
                Reactivar club
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PendingAppRow({
  app,
  onApprove,
  onReject,
  isPending,
}: {
  app: PendingApplication;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr auto auto",
          gap: 12,
          alignItems: "center",
          padding: "12px 14px",
        }}
      >
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>{app.name}</div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
            {app.city} · solicita {app.applicantName}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
          {app.contactPerson ? `${app.contactPerson} · ` : ""}
          {app.contactEmail ?? "sin contacto"}
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 9999,
            background: "#fef3c7",
            color: "#92400e",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            border: "1px solid #fde68a",
          }}
        >
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#d97706" }} />
          {APP_STATUS_LABEL[app.status] ?? app.status.toUpperCase()}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <Link
            href={`/dashboard/admin/admin-clubs/${app.id}`}
            className="btn"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              border: "1px solid #0a0a0a",
              fontSize: 10.5,
              textDecoration: "none",
            }}
          >
            Revisar
            <Icon name="arrow-right" size={11} color="#fff" />
          </Link>
          <button
            className="btn btn-primary"
            style={{ fontSize: 10.5 }}
            disabled={isPending}
            onClick={onApprove}
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
            onClick={onReject}
          >
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}


const APP_PHASE_ORDER: ReadonlyArray<{ k: string; color: string }> = [
  { k: "submitted", color: "#737373" },
  { k: "docs_review", color: "#fbbf24" },
  { k: "field_verification", color: "#0ea5e9" },
  { k: "final_review", color: "#7c3aed" },
];

function PhaseChip({
  k,
  label,
  color,
  n,
  active,
  onClick,
}: {
  k: string;
  label: string;
  color: string;
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      key={k}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 9999,
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        background: active ? color : "#fff",
        color: active ? "#fff" : color,
        border: `1px solid ${active ? color : "var(--border)"}`,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "background 140ms var(--ease-out), color 140ms var(--ease-out)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: active ? "#fff" : color,
        }}
      />
      {label}
      <span
        className="tabular"
        style={{
          fontSize: 10,
          opacity: 0.85,
          padding: "1px 6px",
          borderRadius: 4,
          background: active ? "rgba(255,255,255,0.18)" : "var(--muted)",
        }}
      >
        {n}
      </span>
    </button>
  );
}

function PendingAppsBanner({ apps }: { apps: PendingApplication[] }) {
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  const doApprove = async (app: PendingApplication) => {
    const ok = await confirm({
      title: `Aprobar "${app.name}"`,
      body: "Se creará el club y se le asignará el rol owner al solicitante.",
      confirmLabel: "Aprobar",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await quickApproveApplication({ applicationId: app.id });
      if (r.ok) toast({ icon: "check", title: `Club "${app.name}" aprobado` });
      else toast({ icon: "alert-triangle", title: "Error", sub: r.error.message });
    });
  };

  const doReject = async (app: PendingApplication) => {
    const reason = await ask({
      title: `Rechazar "${app.name}"`,
      label: "Motivo del rechazo",
      placeholder: "Explica brevemente la razón",
      multiline: true,
      required: true,
      confirmLabel: "Rechazar",
      destructive: true,
    });
    if (reason == null) return;
    startTransition(async () => {
      const r = await rejectApplication({ applicationId: app.id, reason });
      if (r.ok) toast({ icon: "check", title: "Solicitud rechazada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: r.error.message });
    });
  };

  if (apps.length === 0) return null;
  const countByPhase = new Map<string, number>();
  for (const a of apps) countByPhase.set(a.status, (countByPhase.get(a.status) ?? 0) + 1);
  const visible = phaseFilter === "all" ? apps : apps.filter((a) => a.status === phaseFilter);
  return (
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
          Solicitudes de club pendientes{" "}
          <span style={{ color: "var(--muted-fg)" }}>({apps.length})</span>
        </h2>
      </div>
      {/* Chips por fase — click filtra el listado. Muestra todas las fases del
          enum aunque tengan 0 (sirve de mapa visual del pipeline). */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        <PhaseChip
          k="all"
          label="Todas"
          color="#0a0a0a"
          n={apps.length}
          active={phaseFilter === "all"}
          onClick={() => setPhaseFilter("all")}
        />
        {APP_PHASE_ORDER.map((p) => (
          <PhaseChip
            key={p.k}
            k={p.k}
            label={APP_STATUS_LABEL[p.k] ?? p.k}
            color={p.color}
            n={countByPhase.get(p.k) ?? 0}
            active={phaseFilter === p.k}
            onClick={() => setPhaseFilter(p.k)}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visible.length === 0 ? (
          <div
            style={{
              fontSize: 11.5,
              color: "var(--muted-fg)",
              padding: "10px 0",
              textAlign: "center",
            }}
          >
            Sin solicitudes en esta fase.
          </div>
        ) : (
          visible.map((a) => (
            <PendingAppRow
              key={a.id}
              app={a}
              onApprove={() => doApprove(a)}
              onReject={() => doReject(a)}
              isPending={isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function AdminClubsScreenView({ data }: { data: ClubsData }) {
  useRealtimeRefresh([{ table: "clubs" }, { table: "club_applications" }]);

  const [f, setF] = useState<"all" | Status>("all");
  const filtered = f === "all" ? data.rows : data.rows.filter((c) => c.status === f);

  const cols: RSColumn<ClubRow>[] = [
    {
      k: "name",
      l: "Club",
      render: (c) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 900 }}>{c.name}</div>
          <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
            {c.city} · {c.founded}
          </div>
        </div>
      ),
    },
    {
      k: "tier",
      l: "Tier",
      render: (c) => (
        <RSPill
          bg={
            c.tier === "PRO"
              ? "#0a0a0a"
              : c.tier === "NEW"
              ? "#fbbf24"
              : c.tier === "X"
              ? "var(--muted)"
              : "var(--muted-fg)"
          }
          color={c.tier === "X" ? "var(--muted-fg)" : "#fff"}
        >
          {c.tier}
        </RSPill>
      ),
    },
    {
      k: "courts",
      l: "Canchas",
      align: "center",
      render: (c) => <b className="font-heading">{c.courts}</b>,
    },
    {
      k: "members",
      l: "Socios",
      align: "center",
      render: (c) => <b className="font-heading">{c.members.toLocaleString("en-US")}</b>,
    },
    {
      k: "rev",
      l: "Revenue · mes",
      align: "right",
      render: (c) => <b style={{ color: "var(--primary)" }}>{c.rev}</b>,
    },
    {
      k: "status",
      l: "Estado",
      render: (c) => <RSPill bg={ST_COLOR[c.status]}>{ST_LABEL[c.status]}</RSPill>,
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (c) => <RowMenu club={c} />,
    },
  ];

  return (
    <>
      <PendingAppsBanner apps={data.pending} />
      <RSHeader
        label="Plataforma · Clubes"
        title={
          <>
            Clubes <span className="dot">●</span> {data.rows.length}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER }}
              onClick={() =>
                downloadCsv("clubes", filtered, [
                  { header: "id", get: (c) => c.id },
                  { header: "nombre", get: (c) => c.name },
                  { header: "ciudad", get: (c) => c.city },
                  { header: "estado", get: (c) => ST_LABEL[c.status] },
                  { header: "tier", get: (c) => c.tier },
                  { header: "canchas", get: (c) => c.courts },
                  { header: "socios", get: (c) => c.members },
                  { header: "revenue_mes", get: (c) => c.rev },
                  { header: "fundado", get: (c) => c.founded },
                ])
              }
              disabled={filtered.length === 0}
            >
              <Icon name="download" size={12} />
              Exportar CSV
            </button>
            <button className="btn btn-primary">
              <Icon name="plus" size={13} />
              Invitar club
            </button>
          </div>
        }
      />
      <RSFilters
        value={f}
        onChange={setF}
        items={[
          { k: "all", l: "Todos", n: data.rows.length },
          { k: "verified", l: "● Verificados", n: data.rows.filter((c) => c.status === "verified").length },
          { k: "pending", l: "⚠ Pendientes", n: data.rows.filter((c) => c.status === "pending").length },
          { k: "rejected", l: "○ Rechazados", n: data.rows.filter((c) => c.status === "rejected").length },
        ]}
      />
      <RSTable cols={cols} rows={filtered} rowKey={(c) => c.id} />
    </>
  );
}
