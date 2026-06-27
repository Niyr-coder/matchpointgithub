"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "@/components/dashboard/ToastProvider";
import { CreatePartnerModal } from "./CreatePartnerModal";
import { AdminLinkClubModal } from "./AdminLinkClubModal";
import { adminUnlinkClubFromPartner } from "@/server/actions/admin/partner-club-links";
import type { AdminPartnerRow, AdminPartnersData } from "@/server/actions/admin/partners";

const STATUS: Record<string, { label: string; bg: string; color?: string }> = {
  active:    { label: "Activo",     bg: "#ecfdf5", color: "#047857" },
  pending:   { label: "Pendiente",  bg: "#fef3c7", color: "#92400e" },
  suspended: { label: "Suspendido", bg: "#fee2e2", color: "#991b1b" },
  archived:  { label: "Archivado",  bg: "var(--muted)", color: "var(--muted-fg)" },
};

const LEAGUE_STATUS: Record<string, string> = {
  draft:                "Borrador",
  published:            "Publicado",
  registration_open:    "Inscripciones abiertas",
  registration_closed:  "Inscripciones cerradas",
  live:                 "En curso",
  finished:             "Finalizado",
  cancelled:            "Cancelado",
};

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusPill(status: string) {
  const meta = STATUS[status] ?? { label: status, bg: "var(--muted)", color: "var(--muted-fg)" };
  return (
    <RSPill bg={meta.bg} color={meta.color}>
      {meta.label}
    </RSPill>
  );
}

function KpiCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="label-mp">{label}</span>
        <span style={{ width: 30, height: 30, borderRadius: 10, background: "var(--muted)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--muted-fg)" }}>
          <Icon name={icon} size={14} />
        </span>
      </div>
      <div className="font-heading" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" }}>{value}</div>
      <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 11.5 }}>{hint}</p>
    </div>
  );
}

function StatLine({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--muted-fg)" }}>
        {label}
      </span>
      <span className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", color: accent ?? "var(--fg)" }}>
        {value}
      </span>
    </div>
  );
}

function ActivityList({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="label-mp" style={{ marginBottom: 8 }}>{title}</div>
      {children.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{children}</div>
      ) : (
        <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 11 }}>{empty}</p>
      )}
    </div>
  );
}

function PartnerDetail({ row, partnerId }: { row: AdminPartnerRow; partnerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleUnlink = (clubId: string) => {
    startTransition(async () => {
      const res = await adminUnlinkClubFromPartner({ partnerId, clubId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "Error al desvincular", sub: res.error.message, tone: "error" });
        return;
      }
      toast({ icon: "check", title: "Club desvinculado" });
      setUnlinkingId(null);
      router.refresh();
    });
  };

  // Fusiona partner_members + role_assignments en una vista única de equipo.
  // Un usuario puede estar en ambas; si está en ambas se muestra una sola fila.
  const teamMap = new Map<string, { name: string; orgRole: string | null; hasAccess: boolean }>();
  for (const m of row.members) {
    teamMap.set(m.userId, { name: m.name, orgRole: m.role, hasAccess: false });
  }
  for (const r of row.roleAssignments.filter((r) => !r.revokedAt)) {
    const existing = teamMap.get(r.userId);
    if (existing) {
      existing.hasAccess = true;
    } else {
      teamMap.set(r.userId, { name: r.name, orgRole: null, hasAccess: true });
    }
  }
  const team = Array.from(teamMap.values());

  return (
    <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div>
          <h2 className="font-heading" style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em" }}>
            {row.name}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted-fg)", fontSize: 12 }}>
            /{row.slug}
            {row.contactEmail ? ` · ${row.contactEmail}` : ""}
            {" · desde "}{dateLabel(row.createdAt)}
          </p>
        </div>
        {statusPill(row.status)}
      </div>

      {/* Stats en línea */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
        <StatLine label="Torneos activos" value={String(row.activeTournamentCount)} />
        <StatLine label="Inscritos" value={String(row.registrationCount)} />
        <StatLine label="Revenue capturado" value={money(row.capturedRevenueCents)} accent="var(--primary)" />
        <StatLine
          label="Payouts pendientes"
          value={money(row.payoutPendingCents)}
          accent={row.payoutPendingCents > 0 ? "#f59e0b" : undefined}
        />
      </div>

      {/* Grid principal: Equipo + Clubes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Equipo */}
        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp" style={{ marginBottom: 10 }}>Equipo</div>
          {team.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 12 }}>Sin miembros registrados.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {team.slice(0, 8).map((m, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                  <span style={{ fontWeight: 800 }}>{m.name}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {m.orgRole && (
                      <span style={{ fontSize: 10, color: "var(--muted-fg)", textTransform: "capitalize" }}>
                        {m.orgRole}
                      </span>
                    )}
                    {m.hasAccess ? (
                      <RSPill bg="#d1fae5" color="#047857">Acceso</RSPill>
                    ) : (
                      <RSPill bg="var(--muted)" color="var(--muted-fg)">Sin acceso</RSPill>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clubes del partner */}
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="label-mp">Clubes del partner</div>
            <button
              type="button"
              className="btn"
              style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => setLinkOpen(true)}
            >
              <Icon name="plus" size={11} />
              Vincular
            </button>
          </div>

          {row.clubs.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 12 }}>Sin clubes vinculados.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {row.clubs.map((club) => (
                <div key={club.id}>
                  {unlinkingId === club.id ? (
                    <div style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fef2f2", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "#991b1b", fontWeight: 700 }}>¿Desvincular {club.name}?</span>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button type="button" className="btn" disabled={pending} onClick={() => handleUnlink(club.id)}
                          style={{ fontSize: 11, padding: "2px 8px", background: "#ef4444", color: "#fff", border: "none" }}>
                          {pending ? "…" : "Sí"}
                        </button>
                        <button type="button" className="btn" disabled={pending} onClick={() => setUnlinkingId(null)}
                          style={{ fontSize: 11, padding: "2px 8px" }}>
                          No
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 800 }}>{club.name}</span>
                        {club.city && <span style={{ color: "var(--muted-fg)", marginLeft: 5 }}>{club.city}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 9999, background: "#f0fdf4", color: "#166534", fontSize: 10, fontWeight: 800 }}>
                          {club.revenueSharePct}% comisión
                        </span>
                        <button
                          type="button"
                          onClick={() => setUnlinkingId(club.id)}
                          aria-label={`Desvincular ${club.name}`}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-fg)", padding: 2, lineHeight: 1, display: "flex" }}
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actividad reciente: Torneos · Ligas · Payouts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <ActivityList title="Torneos recientes" empty="Sin torneos.">
          {row.tournaments.slice(0, 5).map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.name}
              </span>
              <span style={{ color: "var(--muted-fg)", flexShrink: 0 }}>
                {t.registrations} · {money(t.capturedRevenueCents)}
              </span>
            </div>
          ))}
        </ActivityList>

        <ActivityList title="Ligas" empty="Sin ligas.">
          {row.leagues.slice(0, 5).map((l) => (
            <div key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {l.name}
              </span>
              <span style={{ color: "var(--muted-fg)", flexShrink: 0, fontSize: 10 }}>
                {LEAGUE_STATUS[l.status] ?? l.status}
              </span>
            </div>
          ))}
        </ActivityList>

        <ActivityList title="Payouts" empty="Sin payouts.">
          {row.payouts.slice(0, 5).map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11 }}>
              <span style={{ fontWeight: 700 }}>{dateLabel(p.periodEnd)}</span>
              <span style={{ fontWeight: 700, flexShrink: 0, color: p.status === "paid" ? "var(--primary)" : "#f59e0b" }}>
                {money(p.netCents)}
              </span>
            </div>
          ))}
        </ActivityList>
      </div>

      {linkOpen && (
        <AdminLinkClubModal
          open={linkOpen}
          onClose={() => setLinkOpen(false)}
          partnerId={partnerId}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}

export function AdminPartnersScreenView({ data }: { data: AdminPartnersData }) {
  useRealtimeRefresh(
    [
      { table: "partner_orgs" },
      { table: "partner_members" },
      { table: "partner_club_links" },
      { table: "role_assignments" },
      { table: "tournaments" },
      { table: "leagues" },
      { table: "registrations" },
      { table: "transactions" },
      { table: "payouts" },
    ],
    { debounceMs: 5000 },
  );

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | string>("all");
  const [selectedId, setSelectedId] = useState(data.rows[0]?.id ?? "");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      const matchesStatus = status === "all" || row.status === status;
      const matchesQuery =
        q.length === 0 ||
        row.name.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        row.owners.some((o) => o.toLowerCase().includes(q));
      return matchesStatus && matchesQuery;
    });
  }, [data.rows, query, status]);

  const selected = data.rows.find((row) => row.id === selectedId) ?? filtered[0] ?? data.rows[0];
  const statuses = Array.from(new Set(data.rows.map((row) => row.status)));

  const cols: RSColumn<AdminPartnerRow>[] = [
    {
      k: "name",
      l: "Partner",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 900 }}>{row.name}</div>
          <div style={{ color: "var(--muted-fg)", fontSize: 10 }}>
            /{row.slug}{row.owners.length ? ` · ${row.owners[0]}` : ""}
          </div>
        </div>
      ),
    },
    { k: "status", l: "Estado", render: (row) => statusPill(row.status) },
    {
      k: "clubCount",
      l: "Clubes",
      align: "center",
      render: (row) => <b className="font-heading">{row.clubCount}</b>,
    },
    {
      k: "activeTournamentCount",
      l: "Torneos activos",
      align: "center",
      render: (row) => <b className="font-heading">{row.activeTournamentCount}</b>,
    },
    {
      k: "capturedRevenueCents",
      l: "Capturado",
      align: "right",
      render: (row) => (
        <b style={{ color: row.capturedRevenueCents > 0 ? "var(--primary)" : "var(--muted-fg)" }}>
          {money(row.capturedRevenueCents)}
        </b>
      ),
    },
    {
      k: "payoutPendingCents",
      l: "Payouts pendientes",
      align: "right",
      render: (row) => (
        <b style={{ color: row.payoutPendingCents > 0 ? "#f59e0b" : "var(--muted-fg)" }}>
          {money(row.payoutPendingCents)}
        </b>
      ),
    },
  ];

  if (data.rows.length === 0) {
    return (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <RSHeader
            label="Plataforma · Partners"
            title={<>Partners <span className="dot">●</span> 0</>}
            action={
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={13} color="#fff" />
                Nuevo partner
              </button>
            }
          />
          <EmptyState
            icon="handshake"
            title="Sin partners registrados"
            hint="Crea el primer organizador externo. Busca al owner entre usuarios registrados y asigna nombre y slug."
            action={
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Icon name="user-plus" size={13} color="#fff" />
                Añadir partner
              </button>
            }
          />
        </div>
        {createOpen && <CreatePartnerModal onClose={() => setCreateOpen(false)} />}
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <RSHeader
          label="Plataforma · Partners"
          title={<>Partners <span className="dot">●</span> {data.totals.partners}</>}
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <Icon name="plus" size={13} color="#fff" />
                Nuevo partner
              </button>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)" }}>
                  <Icon name="search" size={13} />
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar partner u owner..."
                  style={{ padding: "8px 14px 8px 32px", borderRadius: 9999, border: "1px solid var(--border)", fontSize: 12, minWidth: 220 }}
                />
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", fontSize: 12, fontWeight: 800 }}
              >
                <option value="all">Todos los estados</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>{STATUS[s]?.label ?? s}</option>
                ))}
              </select>
            </div>
          }
        />

        <div className="mp-admin-kpis-5">
          <KpiCard label="Partners activos"     value={`${data.totals.activePartners}`}               hint="Organizadores con estado activo."             icon="handshake" />
          <KpiCard label="Clubes vinculados"    value={`${data.totals.clubs}`}                        hint="Clubes con al menos un partner activo."       icon="building-2" />
          <KpiCard label="Torneos activos"      value={`${data.totals.activeTournaments}`}            hint={`${data.totals.tournaments} torneos en total.`} icon="trophy" />
          <KpiCard label="Ingreso capturado"    value={money(data.totals.capturedRevenueCents)}       hint="Transacciones de tipo torneo capturadas."     icon="wallet" />
          <KpiCard label="Payouts pendientes"   value={money(data.totals.pendingPayoutsCents)}        hint="Payouts en estado pendiente o en proceso."    icon="arrow-up-right" />
        </div>

        <RSTable
          cols={cols}
          rows={filtered}
          rowKey={(row) => row.id}
          rowOnClick={(row) => setSelectedId(row.id)}
          selectedKey={selected?.id}
        />

        {selected && <PartnerDetail row={selected} partnerId={selected.id} />}
      </div>
      {createOpen && <CreatePartnerModal onClose={() => setCreateOpen(false)} />}
    </>
  );
}
