"use client";
// Carnet VIP del jugador por club. Migrado del prototipo
// (ui_kits/dashboard/MisMembresiasScreen.jsx) con datos REALES: selector de
// clubes, hero tipo carnet, beneficios del tier, renovación y comparación de
// planes. KPIs del mes e historial de uso quedan fuera (sin tracking todavía).
// Sin PSP: "Renovar" lleva al flujo de pago del club (transferencia manual).
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { membershipTemplate } from "@/lib/clubs/membership";

export type MembershipRow = {
  id: string;
  clubId: string;
  clubName: string;
  clubSlug: string | null;
  clubCity: string | null;
  status: string;
  memberNo: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  tierId: string | null;
  tierName: string;
  priceCents: number;
  durationMonths: number;
  discountPct: number;
  benefits: string[];
  templateKey: string | null;
};

export type TierRow = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationMonths: number;
  benefits: string[];
};

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);

const dateLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "—";

const monthLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-EC", { month: "short", year: "numeric" }) : "—";

const periodLabel = (months: number) => (months === 1 ? "/mes" : months === 12 ? "/año" : `/${months} meses`);

type DerivedStatus = "active" | "expiring" | "expired" | "pending";

function statusOf(m: MembershipRow): DerivedStatus {
  if (m.status === "pending") return "pending";
  if (m.status === "expired") return "expired";
  if (m.expiresAt) {
    const ms = new Date(m.expiresAt).getTime() - Date.now();
    if (ms <= 0) return "expired";
    if (ms <= 7 * 24 * 60 * 60 * 1000) return "expiring";
  }
  return "active";
}

const STATUS_META: Record<DerivedStatus, { chip: string; dot: string; badgeBg: string; badgeFg: string }> = {
  active: { chip: "Activa", dot: "#10b981", badgeBg: "rgba(16,185,129,0.12)", badgeFg: "#10b981" },
  expiring: { chip: "Por vencer", dot: "#d97706", badgeBg: "#fef3c7", badgeFg: "#92400e" },
  expired: { chip: "Vencida", dot: "#dc2626", badgeBg: "#fee2e2", badgeFg: "#dc2626" },
  pending: { chip: "Pendiente", dot: "#737373", badgeBg: "var(--muted)", badgeFg: "var(--muted-fg)" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MP";
  return parts.slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "MP";
}

// QR decorativo determinístico a partir del N° de socio (solo visual).
function qrCells(seed: string): boolean[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const cells: boolean[] = [];
  for (let i = 0; i < 64; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    cells.push((h & 1) === 1);
  }
  return cells;
}

export function MisMembresiasScreenView({
  memberships,
  tiersByClub,
  memberName,
}: {
  memberships: MembershipRow[];
  tiersByClub: Record<string, TierRow[]>;
  memberName: string;
}) {
  const [activeId, setActiveId] = useState<string>(memberships[0]?.id ?? "");
  const M = useMemo(() => memberships.find((m) => m.id === activeId) ?? memberships[0], [memberships, activeId]);

  if (memberships.length === 0 || !M) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Header count={0} activeCount={0} />
        <EmptyState
          icon="star"
          title="Aún no tienes membresías"
          hint="Hazte miembro VIP de un club desde su página para obtener tu carnet, número de socio y beneficios."
          action={
            <Link href="/dashboard/user/clubes" className="btn btn-primary">
              <Icon name="building-2" size={13} color="#fff" /> Ver clubes
            </Link>
          }
        />
      </div>
    );
  }

  const tpl = membershipTemplate(M.templateKey);
  const st = statusOf(M);
  const meta = STATUS_META[st];
  const activeCount = memberships.filter((m) => statusOf(m) === "active" || statusOf(m) === "expiring").length;
  const tiers = tiersByClub[M.clubId] ?? [];
  const ini = initials(memberName);
  const cells = qrCells(M.memberNo != null ? `${M.clubId}-${M.memberNo}` : M.id);

  const benefits = M.discountPct > 0 ? [`${M.discountPct}% de descuento en el club`, ...M.benefits] : M.benefits;

  const renewHref = M.clubSlug ? `/dashboard/clubes/${M.clubSlug}` : "/dashboard/user/clubes";
  const renewLabel = st === "pending" ? "Completar pago" : st === "expired" ? "Reactivar membresía" : "Renovar";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <Header count={memberships.length} activeCount={activeCount} />

      {/* Selector de clubes */}
      {memberships.length > 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {memberships.map((m) => {
            const on = m.id === activeId;
            const ms = statusOf(m);
            const mm = STATUS_META[ms];
            const mtpl = membershipTemplate(m.templateKey);
            return (
              <button
                key={m.id}
                onClick={() => setActiveId(m.id)}
                className="mp-press"
                style={{
                  textAlign: "left",
                  padding: "14px 16px",
                  borderRadius: 14.4,
                  border: "1px solid " + (on ? "#0a0a0a" : "var(--border)"),
                  background: on ? "#0a0a0a" : "#fff",
                  color: on ? "#fff" : "#0a0a0a",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: 42,
                    height: 42,
                    borderRadius: 9,
                    background: on ? mtpl.accent : "var(--muted)",
                    color: on ? "#0a0a0a" : "#0a0a0a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-heading)",
                    fontWeight: 900,
                    fontSize: 14,
                  }}
                >
                  {initials(m.clubName)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.clubName}
                  </div>
                  <div style={{ fontSize: 11, color: on ? "rgba(255,255,255,0.6)" : "var(--muted-fg)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: mm.dot }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.tierName}</span>
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    padding: "3px 9px",
                    borderRadius: 9999,
                    fontSize: 9.5,
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    background: on ? "rgba(255,255,255,0.14)" : mm.badgeBg,
                    color: on ? "rgba(255,255,255,0.85)" : mm.badgeFg,
                  }}
                >
                  {mm.chip}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* HERO — carnet */}
      <div
        style={{
          position: "relative",
          borderRadius: 14.4,
          overflow: "hidden",
          padding: "28px 32px",
          background: tpl.bg,
          color: tpl.fg,
          minHeight: 260,
        }}
      >
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 88% 30%, rgba(16,185,129,0.22), transparent 55%)", pointerEvents: "none" }} />
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 380,
            color: tpl.fg === "#ffffff" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)",
            letterSpacing: "-0.08em",
            lineHeight: 0.78,
            transform: "translate(8%, -18%)",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          VIP
        </div>

        <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1.4fr auto", gap: 30, alignItems: "stretch" }}>
          {/* Izquierda */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0, gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 9999,
                    background: "rgba(16,185,129,0.18)",
                    border: "1px solid rgba(16,185,129,0.4)",
                    fontSize: 9.5,
                    fontWeight: 900,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: tpl.fg === "#ffffff" ? "#6ee7b7" : "#047857",
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />
                  {meta.chip} · {M.tierName}
                </span>
                {M.clubCity && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700, color: tpl.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    <Icon name="map-pin" size={11} color={tpl.muted} /> {M.clubCity}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: tpl.muted, letterSpacing: "0.2em", textTransform: "uppercase" }}>Socio</div>
              <div className="font-heading" style={{ marginTop: 4, fontSize: 38, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95, overflow: "hidden", textOverflow: "ellipsis" }}>
                {memberName}
                <span style={{ color: tpl.accent }}>.</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 700, color: tpl.fg, opacity: 0.85 }}>{M.clubName}</div>
            </div>

            <div style={{ display: "flex", gap: 28, alignItems: "flex-end", flexWrap: "wrap" }}>
              <CarnetField label="N° Socio" value={M.memberNo != null ? `Nº ${String(M.memberNo).padStart(3, "0")}` : "—"} muted={tpl.muted} fg={tpl.fg} mono />
              <CarnetField label="Socio desde" value={monthLabel(M.startsAt)} muted={tpl.muted} fg={tpl.fg} />
              <CarnetField label="Renueva" value={st === "pending" ? "Al aprobar" : dateLabel(M.expiresAt)} muted={tpl.muted} fg={tpl.fg} />
              <CarnetField label="Cuota" value={money(M.priceCents) + periodLabel(M.durationMonths)} muted={tpl.muted} fg={tpl.fg} />
            </div>
          </div>

          {/* Derecha: avatar + QR */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexShrink: 0 }}>
            <div
              style={{
                width: 92,
                height: 92,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #10b981, #047857)",
                border: "3px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-heading)",
                fontWeight: 900,
                fontSize: 30,
                color: "#fff",
              }}
            >
              {ini}
            </div>
            <div className="mp-qr-cells" style={{ width: 84, height: 84, padding: 6, borderRadius: 9, background: "#fff", gap: 1 }} aria-hidden>
              {cells.map((on, i) => (
                <span key={i} style={{ background: on ? "#0a0a0a" : "#fff" }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Beneficios del plan */}
      {benefits.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 className="font-heading" style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Beneficios incluidos<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
              {benefits.length} beneficio{benefits.length === 1 ? "" : "s"} · plan {M.tierName}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
            {benefits.map((b, i) => (
              <div key={i} className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 9, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check" size={17} color="#047857" />
                </span>
                <div className="font-heading" style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.3 }}>{b}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Renovación */}
      <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, maxWidth: 540 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <div>
            <div className="label-mp" style={{ color: "var(--primary)" }}>Renovación</div>
            <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              {st === "expired" ? "Membresía vencida" : "Próximo cobro"}
              <span style={{ color: "var(--primary)" }}>.</span>
            </h3>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 9999, background: meta.badgeBg, color: meta.badgeFg, fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />
            {meta.chip}
          </span>
        </div>

        <div style={{ padding: 16, borderRadius: 12, background: "linear-gradient(135deg, #fafafa, #f5f5f5)", border: "1px solid var(--border)", display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: "var(--muted-fg)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
              {st === "pending" ? "Pendiente de aprobación del club" : st === "expired" ? "Venció el " + dateLabel(M.expiresAt) : "Vence el " + dateLabel(M.expiresAt)}
            </div>
            <div className="font-heading" style={{ marginTop: 4, fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {money(M.priceCents)}
              <span style={{ fontSize: 14, color: "var(--muted-fg)", fontWeight: 700, marginLeft: 4 }}>{periodLabel(M.durationMonths)}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted-fg)" }}>Pago por transferencia o DeUna · lo aprueba el club</div>
          </div>
          <Icon name="credit-card" size={36} color="#0a0a0a" style={{ opacity: 0.18 }} />
        </div>

        <Link href={renewHref} className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
          <Icon name="repeat" size={13} color="#fff" /> {renewLabel}
        </Link>
      </div>

      {/* Comparar planes */}
      {tiers.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
            <h2 className="font-heading" style={{ margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
              Planes del club<span style={{ color: "var(--primary)" }}>.</span>
            </h2>
            <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Cambia de plan desde la página del club</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {tiers.map((p) => (
              <PlanCard key={p.id} tier={p} current={p.id === M.tierId} clubHref={renewHref} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ count, activeCount }: { count: number; activeCount: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Mi cuenta · Club</div>
        <h1 className="font-heading" style={{ margin: "6px 0 0", fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 0.95 }}>
          Mis membresías<span style={{ color: "var(--primary)" }}>.</span>
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted-fg)" }}>
          {count === 0
            ? "Tus tarjetas VIP en los clubes."
            : `${count} club${count === 1 ? "" : "es"} · ${activeCount} activa${activeCount === 1 ? "" : "s"} · revisa tus beneficios.`}
        </p>
      </div>
      <Link href="/dashboard/user/clubes" className="btn" style={{ background: "#fff", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
        <Icon name="plus" size={13} /> Suscribirme a otro club
      </Link>
    </div>
  );
}

function CarnetField({ label, value, mono, muted, fg }: { label: string; value: string; mono?: boolean; muted: string; fg: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: "0.2em", textTransform: "uppercase", color: muted }}>{label}</div>
      <div
        className={mono ? undefined : "font-heading"}
        style={{ marginTop: 3, fontSize: 14, fontWeight: 900, letterSpacing: mono ? "0.05em" : "-0.01em", fontFamily: mono ? "ui-monospace, monospace" : "var(--font-heading)", color: fg }}
      >
        {value}
      </div>
    </div>
  );
}

function PlanCard({ tier, current, clubHref }: { tier: TierRow; current: boolean; clubHref: string }) {
  return (
    <div
      className="card"
      style={{
        padding: 18,
        border: "1px solid " + (current ? "#0a0a0a" : "var(--border)"),
        background: current ? "#0a0a0a" : "#fff",
        color: current ? "#fff" : "#0a0a0a",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {current && (
        <div style={{ position: "absolute", top: 14, right: 14, padding: "3px 9px", background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 9999, fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6ee7b7" }}>
          Tu plan
        </div>
      )}
      <div>
        <div className="label-mp" style={{ color: current ? "rgba(255,255,255,0.55)" : "var(--muted-fg)" }}>Plan</div>
        <h3 className="font-heading" style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", lineHeight: 1, color: current ? "#fff" : "#0a0a0a", overflow: "hidden", textOverflow: "ellipsis" }}>
          {tier.name}
          {current && <span style={{ color: "#34d399" }}>.</span>}
        </h3>
        {tier.description && <div style={{ fontSize: 11.5, color: current ? "rgba(255,255,255,0.6)" : "var(--muted-fg)", marginTop: 4 }}>{tier.description}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="font-heading" style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{money(tier.priceCents)}</span>
        <span style={{ fontSize: 12, color: current ? "rgba(255,255,255,0.55)" : "var(--muted-fg)", fontWeight: 700 }}>{periodLabel(tier.durationMonths)}</span>
      </div>
      {tier.benefits.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tier.benefits.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, lineHeight: 1.5 }}>
              <Icon name="check" size={12} color={current ? "#34d399" : "var(--primary)"} style={{ marginTop: 3, flexShrink: 0 }} />
              <span style={{ color: current ? "rgba(255,255,255,0.85)" : "#0a0a0a" }}>{b}</span>
            </div>
          ))}
        </div>
      )}
      {current ? (
        <div className="btn" style={{ marginTop: 4, background: "rgba(255,255,255,0.1)", color: "#fff", border: 0, opacity: 0.7, cursor: "default", justifyContent: "center" }}>
          Tu plan actual
        </div>
      ) : (
        <Link href={clubHref} className="btn btn-primary" style={{ marginTop: 4, justifyContent: "center" }}>
          Cambiar a {tier.name} <Icon name="arrow-right" size={13} color="#fff" />
        </Link>
      )}
    </div>
  );
}
