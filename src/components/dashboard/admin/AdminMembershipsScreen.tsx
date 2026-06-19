// Server: oversight admin de membresías VIP cross-club (governance).
import { EmptyState } from "@/components/ui/EmptyState";
import { adminListClubMemberships } from "@/server/actions/club-memberships";

type Row = {
  id: string;
  status: string;
  member_no: number | null;
  expires_at: string | null;
  clubs: { name: string | null } | null;
  profiles: { display_name: string | null; username: string | null } | null;
  club_membership_tiers: { name: string | null; price_cents: number | null } | null;
};

const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "—");
const money = (c: number | null | undefined) => `$${((c ?? 0) / 100).toFixed(2)}`;
const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "#b45309" },
  active: { label: "Activa", tone: "var(--success-fg)" },
  expired: { label: "Vencida", tone: "var(--muted-fg)" },
  cancelled: { label: "Cancelada", tone: "var(--destructive-fg)" },
  rejected: { label: "Rechazada", tone: "var(--destructive-fg)" },
};

const MEMB_COLS = "auto 1.5fr 1.2fr 1fr auto auto";

export async function AdminMembershipsScreen() {
  const res = await adminListClubMemberships({});
  const rows = res.ok ? (res.data as Row[]) : [];
  const active = rows.filter((r) => r.status === "active").length;
  const revenue = rows.filter((r) => r.status === "active").reduce((s, r) => s + (r.club_membership_tiers?.price_cents ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 className="font-heading mp-admin-page-title" style={{ margin: 0, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
          Membresías de clubes<span style={{ color: "var(--primary)" }}>.</span>
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>{rows.length} membresías · {active} activas · {money(revenue)} en cuotas activas (estimado).</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="star" title="Sin membresías" hint="Ningún club ha vendido membresías todavía." />
      ) : (
        <div className="card mp-table-scroll" style={{ padding: 0, overflow: "hidden" }}>
          <div className="mp-admin-memberships-inner">
            <div
              className="mp-admin-memberships-head mp-table-row"
              style={{ display: "grid", gridTemplateColumns: MEMB_COLS, gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-fg)" }}
            >
              <span>Nº</span><span>Miembro</span><span>Club</span><span>Tier</span><span>Vence</span><span>Estado</span>
            </div>
            {rows.map((r, i) => {
              const sm = STATUS[r.status] ?? { label: r.status, tone: "var(--muted-fg)" };
              const memberLabel = r.profiles?.display_name || (r.profiles?.username ? `@${r.profiles.username}` : "—");
              const memberNo = r.member_no != null ? `#${String(r.member_no).padStart(3, "0")}` : "—";
              return (
                <div
                  key={r.id}
                  className="mp-admin-memberships-row mp-table-row"
                  style={{ display: "grid", gridTemplateColumns: MEMB_COLS, gap: 10, padding: "9px 14px", borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : undefined, alignItems: "center", fontSize: 12.5 }}
                >
                  <span className="mp-admin-memberships-cell" data-label="Nº" style={{ fontWeight: 900, color: "var(--muted-fg)" }}>{memberNo}</span>
                  <span className="mp-admin-memberships-cell" data-label="Miembro" style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{memberLabel}</span>
                  <span className="mp-admin-memberships-cell" data-label="Club" style={{ color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.clubs?.name ?? "—"}</span>
                  <span className="mp-admin-memberships-cell" data-label="Tier" style={{ color: "var(--muted-fg)" }}>{r.club_membership_tiers?.name ?? "—"}</span>
                  <span className="mp-admin-memberships-cell" data-label="Vence" style={{ color: "var(--muted-fg)" }}>{dateLabel(r.expires_at)}</span>
                  <span className="mp-admin-memberships-cell" data-label="Estado" style={{ fontWeight: 900, color: sm.tone }}>{sm.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
