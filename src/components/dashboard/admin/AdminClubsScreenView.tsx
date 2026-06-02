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
  grantClubPlanAdmin,
  revokeClubPlanAdmin,
} from "@/server/actions/admin/club-plans";
import {
  quickApproveApplication,
  rejectApplication,
} from "@/server/actions/clubApplicationsAdmin";
import { getApplicationDetail } from "@/server/actions/clubApplications";
import { downloadCsv } from "@/lib/export/csv";

export type Status = "verified" | "pending" | "rejected";
export type ClubPlan = "starter" | "pro" | "partner";
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
  planTier: ClubPlan;
  planExpiresAt: string | null;
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

function RowMenu({
  club,
  onGrantPlan,
  onRevokePlan,
}: {
  club: ClubRow;
  onGrantPlan: (tier: "pro" | "partner") => void;
  onRevokePlan: () => void;
}) {
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
  const isPaidPlan = club.planTier === "pro" || club.planTier === "partner";

  // Construimos la lista de items dinámicamente para insertar separadores
  // (border-top) entre items sin tener que pensar adjacencias hardcoded —
  // mismo patrón que el kebab de TeamScreenView.
  type Item = {
    key: string;
    icon: string;
    iconColor?: string;
    label: string;
    onClick: () => void;
    danger?: boolean;
  };
  const items: Item[] = [];
  if (isActive) {
    items.push({
      key: "suspend",
      icon: "ban",
      iconColor: "#dc2626",
      label: "Suspender club",
      onClick: doSuspend,
      danger: true,
    });
  } else {
    items.push({
      key: "activate",
      icon: "check-circle-2",
      iconColor: "var(--primary)",
      label: "Reactivar club",
      onClick: doActivate,
    });
  }
  if (club.planTier === "starter") {
    items.push(
      {
        key: "grant-pro",
        icon: "zap",
        iconColor: "var(--primary)",
        label: "Activar Club Pro",
        onClick: () => {
          setOpen(false);
          onGrantPlan("pro");
        },
      },
      {
        key: "grant-partner",
        icon: "handshake",
        iconColor: "var(--primary)",
        label: "Activar Partner",
        onClick: () => {
          setOpen(false);
          onGrantPlan("partner");
        },
      },
    );
  }
  if (isPaidPlan) {
    items.push(
      {
        key: "extend",
        icon: "rotate-cw",
        iconColor: "var(--primary)",
        label: `Extender ${club.planTier === "pro" ? "Club Pro" : "Partner"}`,
        onClick: () => {
          setOpen(false);
          onGrantPlan(club.planTier as "pro" | "partner");
        },
      },
      {
        key: "revoke",
        icon: "x-circle",
        iconColor: "#dc2626",
        label: "Revocar plan",
        onClick: () => {
          setOpen(false);
          onRevokePlan();
        },
        danger: true,
      },
    );
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-label="Opciones del club"
        style={{
          width: 26,
          height: 26,
          borderRadius: 9999,
          border: "1px solid var(--border)",
          background: "#fff",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          lineHeight: 1,
        }}
      >
        <Icon name="more-horizontal" size={12} color="var(--muted-fg)" />
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: 32,
              zIndex: 41,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
              width: 240,
              overflow: "hidden",
              color: "#0a0a0a",
              fontSize: 12,
            }}
          >
            {items.map((it) => (
              <button
                key={it.key}
                onClick={it.onClick}
                disabled={isPending}
                style={{
                  ...TEAM_ITEM_STYLE,
                  color: it.danger ? "#dc2626" : "#0a0a0a",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--muted)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon name={it.icon} size={13} color={it.iconColor ?? "var(--muted-fg)"} />
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Patrón de item del dropdown — mismo styling que el kebab de TeamScreenView.
const TEAM_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "9px 14px",
  background: "transparent",
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  textAlign: "left",
};

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
  useRealtimeRefresh([{ table: "clubs" }, { table: "club_applications" }], { debounceMs: 4000 });

  const [f, setF] = useState<"all" | Status>("all");
  const filtered = f === "all" ? data.rows : data.rows.filter((c) => c.status === f);

  const [dialog, setDialog] = useState<
    | { kind: "grant"; club: ClubRow; tier: "pro" | "partner" }
    | { kind: "revoke"; club: ClubRow }
    | null
  >(null);

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
      k: "plan",
      l: "Plan",
      render: (c) => <PlanBadge tier={c.planTier} expiresAt={c.planExpiresAt} />,
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (c) => (
        <RowMenu
          club={c}
          onGrantPlan={(tier) => setDialog({ kind: "grant", club: c, tier })}
          onRevokePlan={() => setDialog({ kind: "revoke", club: c })}
        />
      ),
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
      {dialog?.kind === "grant" && (
        <GrantClubPlanDialog
          club={dialog.club}
          tier={dialog.tier}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "revoke" && (
        <RevokeClubPlanDialog
          club={dialog.club}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}

// ── PlanBadge ───────────────────────────────────────────────────────────
const PLAN_LABEL: Record<ClubPlan, string> = {
  starter: "Starter",
  pro: "Club Pro",
  partner: "Partner",
};

function PlanBadge({ tier, expiresAt }: { tier: ClubPlan; expiresAt: string | null }) {
  const isPaid = tier !== "starter";
  return (
    <span
      title={isPaid && expiresAt ? `Vence: ${fmtExpiryDate(expiresAt)}` : isPaid ? "Sin vencimiento" : "Plan gratuito"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 9999,
        background: isPaid ? "#ecfdf5" : "var(--muted)",
        border: isPaid ? "1px solid #10b981" : "1px solid var(--border)",
        color: isPaid ? "#047857" : "var(--muted-fg)",
        fontSize: 10,
        fontWeight: 900,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {isPaid && <Icon name={tier === "partner" ? "handshake" : "zap"} size={9} color="#047857" />}
      {PLAN_LABEL[tier]}
    </span>
  );
}

function fmtExpiryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ── Dialogs grant/revoke plan club ──────────────────────────────────────
function GrantClubPlanDialog({
  club,
  tier,
  onClose,
}: {
  club: ClubRow;
  tier: "pro" | "partner";
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [months, setMonths] = useState<number | null>(tier === "partner" ? null : 1);
  const [reason, setReason] = useState("");
  const extending = club.planTier === tier;

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await grantClubPlanAdmin({
        clubId: club.id,
        tier,
        durationMonths: months,
        reason: reason.trim() || undefined,
      });
      if (res.ok) {
        toast({
          icon: "check-circle-2",
          title: `${tier === "pro" ? "Club Pro" : "Partner"} activado`,
          sub: res.data.expiresAt
            ? `Vence: ${fmtExpiryDate(res.data.expiresAt)}`
            : "Sin vencimiento",
        });
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <ClubPlanModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        {extending ? "Extender" : "Activar"} {tier === "pro" ? "Club Pro" : "Partner"} · {club.name}
      </h3>
      <p
        style={{ margin: "8px 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        El plan se activa inmediatamente, sin pasar por comprobante.{" "}
        {extending && club.planExpiresAt
          ? `Plan vigente vence el ${fmtExpiryDate(club.planExpiresAt)}; los meses se suman desde esa fecha.`
          : null}
      </p>

      <ClubPlanFieldLabel>Duración</ClubPlanFieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6, marginBottom: 14 }}>
        {[1, 3, 6, 12].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMonths(m)}
            style={{
              padding: "10px 6px",
              borderRadius: 8,
              border: months === m ? "2px solid var(--primary)" : "1px solid var(--border)",
              background: months === m ? "#ecfdf5" : "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12.5,
              fontWeight: 900,
            }}
          >
            {m} {m === 1 ? "mes" : "meses"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMonths(null)}
          style={{
            padding: "10px 6px",
            borderRadius: 8,
            border: months === null ? "2px solid var(--primary)" : "1px solid var(--border)",
            background: months === null ? "#ecfdf5" : "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
            fontSize: 12.5,
            fontWeight: 900,
          }}
        >
          Indefinido
        </button>
      </div>

      <ClubPlanFieldLabel>Motivo (opcional)</ClubPlanFieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Ej: contrato anual firmado, prueba piloto, partner inaugural"
        style={CLUB_PLAN_TEXTAREA_STYLE}
      />

      <ClubPlanDialogFooter>
        <ClubPlanSecondaryBtn onClick={onClose} disabled={pending}>
          Cancelar
        </ClubPlanSecondaryBtn>
        <button
          onClick={handleConfirm}
          disabled={pending}
          className="btn btn-primary"
          style={{ opacity: pending ? 0.6 : 1 }}
        >
          <Icon name={tier === "partner" ? "handshake" : "zap"} size={13} color="#fff" />
          {pending
            ? "Activando…"
            : months === null
              ? "Activar sin vencimiento"
              : `Activar ${months} ${months === 1 ? "mes" : "meses"}`}
        </button>
      </ClubPlanDialogFooter>
    </ClubPlanModalShell>
  );
}

function RevokeClubPlanDialog({
  club,
  onClose,
}: {
  club: ClubRow;
  onClose: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const canSubmit = reason.trim().length >= 2;

  const handleConfirm = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const res = await revokeClubPlanAdmin({ clubId: club.id, reason: reason.trim() });
      if (res.ok) {
        toast({ icon: "check", title: "Plan del club revocado", sub: club.name });
        onClose();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  return (
    <ClubPlanModalShell onClose={onClose}>
      <h3
        className="font-heading"
        style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
      >
        Revocar plan de {club.name}
      </h3>
      <p
        style={{ margin: "8px 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}
      >
        El club vuelve a Starter inmediatamente. Las suscripciones activas
        quedan canceladas con el motivo en el audit log.
      </p>

      <ClubPlanFieldLabel>Motivo (obligatorio)</ClubPlanFieldLabel>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Ej: fin de contrato, falta de pago, downgrade solicitado"
        style={CLUB_PLAN_TEXTAREA_STYLE}
      />

      <ClubPlanDialogFooter>
        <ClubPlanSecondaryBtn onClick={onClose} disabled={pending}>
          Cancelar
        </ClubPlanSecondaryBtn>
        <button
          onClick={handleConfirm}
          disabled={pending || !canSubmit}
          className="btn"
          style={{
            background: "#dc2626",
            color: "#fff",
            opacity: pending || !canSubmit ? 0.6 : 1,
          }}
        >
          <Icon name="x-circle" size={13} color="#fff" />
          {pending ? "Revocando…" : "Revocar plan"}
        </button>
      </ClubPlanDialogFooter>
    </ClubPlanModalShell>
  );
}

// ── Modal helpers (locales a este screen) ───────────────────────────────
function ClubPlanModalShell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480 }}
      >
        {children}
      </div>
    </div>
  );
}

function ClubPlanFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

function ClubPlanDialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
      {children}
    </div>
  );
}

function ClubPlanSecondaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn"
      style={{ background: "#fff", border: "1px solid var(--border)" }}
    >
      {children}
    </button>
  );
}

const CLUB_PLAN_TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  padding: 12,
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontFamily: "inherit",
  fontSize: 13,
  resize: "vertical",
};
