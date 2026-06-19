"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import type { AdminPartnerRow, AdminPartnersData } from "@/server/actions/admin/partners";

const STATUS: Record<string, { label: string; bg: string; color?: string }> = {
  active: { label: "Activo", bg: "#ecfdf5", color: "#047857" },
  pending: { label: "Pendiente", bg: "#fef3c7", color: "#92400e" },
  suspended: { label: "Suspendido", bg: "#fee2e2", color: "#991b1b" },
  archived: { label: "Archivado", bg: "var(--muted)", color: "var(--muted-fg)" },
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

function KpiCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: string;
}) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span className="label-mp">{label}</span>
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: "var(--muted)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted-fg)",
          }}
        >
          <Icon name={icon} size={14} />
        </span>
      </div>
      <div className="font-heading" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" }}>
        {value}
      </div>
      <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 11.5 }}>{hint}</p>
    </div>
  );
}

function MiniList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="card" style={{ padding: 14, minHeight: 120 }}>
      <div className="label-mp" style={{ marginBottom: 10 }}>
        {title}
      </div>
      {children.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
      ) : (
        <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 12 }}>{empty}</p>
      )}
    </div>
  );
}

function PartnerDetail({ row }: { row: AdminPartnerRow }) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
        <div>
          <div className="label-mp">Detalle read-only</div>
          <h2 className="font-heading" style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900 }}>
            {row.name}
          </h2>
          <p style={{ margin: "4px 0 0", color: "var(--muted-fg)", fontSize: 12 }}>
            /{row.slug} · creado {dateLabel(row.createdAt)}
            {row.contactEmail ? ` · ${row.contactEmail}` : ""}
          </p>
        </div>
        {statusPill(row.status)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        <MiniList title="Miembros partner_members" empty="Sin miembros registrados.">
          {row.members.slice(0, 6).map((m) => (
            <div key={m.userId} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
              <span style={{ fontWeight: 800 }}>{m.name}</span>
              <span style={{ color: "var(--muted-fg)" }}>{m.role}</span>
            </div>
          ))}
        </MiniList>

        <MiniList title="Roles MATCHPOINT" empty="Sin role_assignments partner activas.">
          {row.roleAssignments
            .filter((r) => !r.revokedAt)
            .slice(0, 6)
            .map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                <span style={{ fontWeight: 800 }}>{r.name}</span>
                <span style={{ color: "var(--muted-fg)" }}>{dateLabel(r.grantedAt)}</span>
              </div>
            ))}
        </MiniList>

        <MiniList title="Clubes linkeados" empty="Sin clubes asociados.">
          {row.clubs.slice(0, 6).map((club) => (
            <div key={club.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
              <span style={{ fontWeight: 800 }}>{club.name}</span>
              <span style={{ color: "var(--muted-fg)" }}>{club.revenueSharePct}% rev share</span>
            </div>
          ))}
        </MiniList>

        <MiniList title="Torneos recientes" empty="Sin torneos asociados.">
          {row.tournaments.slice(0, 6).map((t) => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
              <span style={{ fontWeight: 800 }}>{t.name}</span>
              <span style={{ color: "var(--muted-fg)" }}>
                {t.registrations} insc. · {money(t.capturedRevenueCents)}
              </span>
            </div>
          ))}
        </MiniList>

        <MiniList title="Ligas" empty="Sin ligas asociadas.">
          {row.leagues.slice(0, 6).map((league) => (
            <div key={league.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
              <span style={{ fontWeight: 800 }}>{league.name}</span>
              <span style={{ color: "var(--muted-fg)" }}>{league.status}</span>
            </div>
          ))}
        </MiniList>

        <MiniList title="Payouts partner" empty="Sin payouts para este partner.">
          {row.payouts.slice(0, 6).map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
              <span style={{ fontWeight: 800 }}>{dateLabel(p.periodEnd)}</span>
              <span style={{ color: "var(--muted-fg)" }}>
                {money(p.netCents)} · {p.status}
              </span>
            </div>
          ))}
        </MiniList>
      </div>
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      const matchesStatus = status === "all" || row.status === status;
      const matchesQuery =
        q.length === 0 ||
        row.name.toLowerCase().includes(q) ||
        row.slug.toLowerCase().includes(q) ||
        row.owners.some((owner) => owner.toLowerCase().includes(q));
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
            /{row.slug}
            {row.owners.length ? ` · owner: ${row.owners[0]}` : ""}
          </div>
        </div>
      ),
    },
    { k: "status", l: "Estado", render: (row) => statusPill(row.status) },
    {
      k: "members",
      l: "Miembros",
      align: "center",
      render: (row) => (
        <b className="font-heading">
          {row.memberCount}
          {row.roleAssignmentCount !== row.memberCount ? ` / ${row.roleAssignmentCount} roles` : ""}
        </b>
      ),
    },
    {
      k: "clubs",
      l: "Clubes",
      align: "center",
      render: (row) => <b className="font-heading">{row.clubCount}</b>,
    },
    {
      k: "events",
      l: "Torneos / ligas",
      align: "center",
      render: (row) => (
        <span>
          <b className="font-heading">{row.tournamentCount}</b>
          <span style={{ color: "var(--muted-fg)" }}> / {row.leagueCount}</span>
        </span>
      ),
    },
    {
      k: "registrations",
      l: "Inscritos",
      align: "center",
      render: (row) => <b className="font-heading">{row.registrationCount}</b>,
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
      render: (row) => <b>{money(row.payoutPendingCents)}</b>,
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <RSHeader
        label="Plataforma · Partners"
        title={
          <>
            Partners <span className="dot">●</span> {data.totals.partners}
          </>
        }
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: 10, color: "var(--muted-fg)" }}>
                <Icon name="search" size={13} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar partner u owner..."
                style={{
                  padding: "8px 14px 8px 32px",
                  borderRadius: 9999,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  minWidth: 220,
                }}
              />
            </div>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 9999,
                border: "1px solid var(--border)",
                background: "#fff",
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              <option value="all">Todos los estados</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS[s]?.label ?? s}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <div className="mp-admin-kpis-5">
        <KpiCard label="Partners activos" value={`${data.totals.activePartners}`} hint="Organizadores con estado active." icon="handshake" />
        <KpiCard label="Clubes linkeados" value={`${data.totals.clubs}`} hint="Vía partner_club_links." icon="building-2" />
        <KpiCard label="Torneos activos" value={`${data.totals.activeTournaments}`} hint={`${data.totals.tournaments} torneos totales.`} icon="trophy" />
        <KpiCard label="Ingreso capturado" value={money(data.totals.capturedRevenueCents)} hint="Transactions kind=tournament." icon="wallet" />
        <KpiCard label="Payouts pendientes" value={money(data.totals.pendingPayoutsCents)} hint="Scope partner: pending/approved/processing." icon="arrow-up-right" />
      </div>

      <p style={{ margin: 0, color: "var(--muted-fg)", fontSize: 12 }}>
        Vista read-only basada en backend existente: partners, miembros, roles, clubes, torneos, ligas, transacciones y payouts.
      </p>

      <RSTable cols={cols} rows={filtered} rowKey={(row) => row.id} rowOnClick={(row) => setSelectedId(row.id)} />

      {selected ? <PartnerDetail row={selected} /> : null}
    </div>
  );
}
