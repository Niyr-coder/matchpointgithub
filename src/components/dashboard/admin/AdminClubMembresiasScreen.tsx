import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { adminListClubMemberships } from "@/server/actions/club-memberships";
import { getTakeRatePct } from "@/server/queries/platform-config";

type MembershipRow = {
  id: string;
  status: "pending" | "active" | "expired" | "cancelled" | "rejected" | string;
  member_no: number | null;
  expires_at: string | null;
  created_at: string | null;
  clubs: { name: string | null; city?: string | null } | null;
  profiles: { display_name: string | null; username: string | null } | null;
  club_membership_tiers: {
    name: string | null;
    price_cents: number | null;
    duration_months?: number | null;
  } | null;
};

const MEMB_RANKING_COLS = "44px 1.8fr 110px 100px 110px 130px";
const MEMB_LIST_COLS = "86px 1.4fr 1.3fr 1fr 100px 110px 100px";

type ClubSummary = {
  club: string;
  city: string;
  activeMembers: number;
  totalRows: number;
  activeMonthlyCents: number;
  tiers: Set<string>;
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "#b45309" },
  active: { label: "Activa", color: "#047857" },
  expired: { label: "Vencida", color: "var(--muted-fg)" },
  cancelled: { label: "Cancelada", color: "#dc2626" },
  rejected: { label: "Rechazada", color: "#dc2626" },
};

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const moneyK = (cents: number) => {
  const amount = cents / 100;
  return amount >= 1000 ? `$${(amount / 1000).toFixed(1)}k` : `$${amount.toFixed(0)}`;
};
const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function monthlyValue(row: MembershipRow): number {
  const price = row.club_membership_tiers?.price_cents ?? 0;
  const months = row.club_membership_tiers?.duration_months ?? 1;
  return months > 0 ? Math.round(price / months) : price;
}

function memberName(row: MembershipRow): string {
  return row.profiles?.display_name || (row.profiles?.username ? `@${row.profiles.username}` : "—");
}

function buildSummaries(rows: MembershipRow[]): ClubSummary[] {
  const map = new Map<string, ClubSummary>();
  for (const row of rows) {
    const club = row.clubs?.name ?? "Club sin nombre";
    const summary =
      map.get(club) ??
      {
        club,
        city: row.clubs?.city ?? "—",
        activeMembers: 0,
        totalRows: 0,
        activeMonthlyCents: 0,
        tiers: new Set<string>(),
      };
    summary.totalRows++;
    if (row.club_membership_tiers?.name) summary.tiers.add(row.club_membership_tiers.name);
    if (row.status === "active") {
      summary.activeMembers++;
      summary.activeMonthlyCents += monthlyValue(row);
    }
    map.set(club, summary);
  }
  return Array.from(map.values()).sort((a, b) => b.activeMonthlyCents - a.activeMonthlyCents);
}

export async function AdminClubMembresiasScreen() {
  const [membershipsRes, takeRatePct] = await Promise.all([
    adminListClubMemberships({}),
    getTakeRatePct(),
  ]);
  const rows = (membershipsRes.ok ? membershipsRes.data : []) as MembershipRow[];
  const summaries = buildSummaries(rows);
  const activeRows = rows.filter((row) => row.status === "active");
  const pendingRows = rows.filter((row) => row.status === "pending");
  const monthlyCents = activeRows.reduce((sum, row) => sum + monthlyValue(row), 0);
  const platformFeeCents = Math.round(monthlyCents * (takeRatePct / 100));
  const activeClubCount = summaries.filter((row) => row.activeMembers > 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            className="font-heading mp-admin-page-title"
            style={{
              margin: 0,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
            }}
          >
            Membresías de club<span style={{ color: "var(--primary)" }}>.</span>
          </h1>
          <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
            Vista cross-club real. Los pagos se aprueban en cada club, no desde admin plataforma.
          </p>
        </div>
        <button
          className="btn"
          disabled
          title="Las políticas globales todavía no tienen modelo propio"
          style={{ background: "#fff", border: "1px solid var(--border)", opacity: 0.55, cursor: "not-allowed" }}
        >
          <Icon name="settings-2" size={13} />
          Política global pendiente
        </button>
      </div>

      <div className="mp-admin-club-memb-kpis">
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 14,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
            color: "#fff",
            padding: 18,
          }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 90% 20%, rgba(16,185,129,0.25), transparent 55%)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span className="label-mp" style={{ color: "#34d399" }}>
                ● Comisión estimada
              </span>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#34d399" }}>
                {takeRatePct.toFixed(takeRatePct % 1 === 0 ? 0 : 1)}% configurado
              </span>
            </div>
            <div className="font-heading tabular mp-admin-hero-value" style={{ fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 6 }}>
              {moneyK(platformFeeCents)}
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", fontWeight: 700, marginLeft: 6 }}>/mes</span>
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.72)", marginTop: 6 }}>
              Sobre {moneyK(monthlyCents)} mensuales activos estimados.
            </div>
          </div>
        </div>
        <AdminMembKpi icon="users" label="Socios activos" value={String(activeRows.length)} sub={`${rows.length} filas totales`} />
        <AdminMembKpi icon="clock" label="Pendientes" value={String(pendingRows.length)} sub="cola del club" warn={pendingRows.length > 0} />
        <AdminMembKpi icon="building-2" label="Clubes activos" value={String(activeClubCount)} sub={`${summaries.length} con historial`} />
        <AdminMembKpi icon="bar-chart-3" label="Mensual activo" value={moneyK(monthlyCents)} sub="precio / duración" emerald />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="star" title="Sin membresías todavía" hint="Cuando un club venda membresías, aparecerán aquí con datos reales." />
      ) : (
        <>
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>
                ● Ranking real
              </div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>
                Clubes por mensual activo<span className="dot">.</span>
              </h3>
            </div>
            <div className="mp-table-scroll">
              <div style={{ minWidth: 760 }}>
                <div style={{ display: "grid", gridTemplateColumns: MEMB_RANKING_COLS, gap: 12, padding: "10px 18px", background: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
                  <span>#</span>
                  <span>Club</span>
                  <span>Ciudad</span>
                  <span>Activos</span>
                  <span>Tiers</span>
                  <span style={{ textAlign: "right" }}>Mensual</span>
                </div>
                {summaries.map((club, index) => (
                  <div key={club.club} style={{ display: "grid", gridTemplateColumns: MEMB_RANKING_COLS, gap: 12, padding: "13px 18px", alignItems: "center", borderBottom: index < summaries.length - 1 ? "1px solid var(--border)" : undefined }}>
                    <span className="font-heading tabular" style={{ fontWeight: 900, color: index < 3 ? "var(--primary)" : "var(--muted-fg)" }}>{index + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{club.club}</span>
                    <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{club.city}</span>
                    <span className="tabular" style={{ fontSize: 13, fontWeight: 800 }}>{club.activeMembers}</span>
                    <span className="tabular" style={{ fontSize: 13, color: "var(--muted-fg)" }}>{club.tiers.size}</span>
                    <span className="font-heading tabular" style={{ textAlign: "right", fontWeight: 900 }}>{money(club.activeMonthlyCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
              <div className="label-mp" style={{ color: "var(--primary)" }}>
                ● Últimas membresías
              </div>
              <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, textTransform: "uppercase" }}>
                Lista cross-club<span className="dot">.</span>
              </h3>
            </div>
            <div className="mp-table-scroll">
              <div style={{ minWidth: 860 }}>
                <div style={{ display: "grid", gridTemplateColumns: MEMB_LIST_COLS, gap: 12, padding: "10px 18px", background: "var(--muted)", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
                  <span>Nº socio</span>
                  <span>Miembro</span>
                  <span>Club</span>
                  <span>Tier</span>
                  <span>Mensual</span>
                  <span>Vence</span>
                  <span>Estado</span>
                </div>
                {rows.slice(0, 80).map((row, index) => {
                  const meta = STATUS_META[row.status] ?? { label: row.status, color: "var(--muted-fg)" };
                  return (
                    <div key={row.id} style={{ display: "grid", gridTemplateColumns: MEMB_LIST_COLS, gap: 12, padding: "12px 18px", alignItems: "center", borderBottom: index < Math.min(rows.length, 80) - 1 ? "1px solid var(--border)" : undefined, fontSize: 12.5 }}>
                      <span style={{ fontWeight: 900, color: "var(--muted-fg)" }}>{row.member_no != null ? `#${String(row.member_no).padStart(3, "0")}` : "—"}</span>
                      <span style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{memberName(row)}</span>
                      <span style={{ color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.clubs?.name ?? "—"}</span>
                      <span style={{ color: "var(--muted-fg)" }}>{row.club_membership_tiers?.name ?? "—"}</span>
                      <span className="tabular" style={{ fontWeight: 800 }}>{money(monthlyValue(row))}</span>
                      <span style={{ color: "var(--muted-fg)" }}>{dateLabel(row.expires_at)}</span>
                      <span style={{ fontWeight: 900, color: meta.color }}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AdminMembKpi({
  icon,
  label,
  value,
  sub,
  emerald,
  warn,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  emerald?: boolean;
  warn?: boolean;
}) {
  const color = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
          {label}
        </span>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: emerald ? "rgba(16,185,129,0.12)" : warn ? "#fef3c7" : "var(--muted)",
            color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={13} color={color} />
        </span>
      </div>
      <div className="font-heading tabular" style={{ fontSize: 26, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em", color }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
