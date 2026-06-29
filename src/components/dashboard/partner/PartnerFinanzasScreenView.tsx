// Client view de PartnerFinanzasScreen — layout 1:1 (RoleScreensPolish.jsx 358-462).
"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { MpProgressBar } from "../widgets/MpProgressBar";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import {
  BankAccountFields,
  bankDraftToAccount,
  bankDraftIsIncomplete,
  accountToBankDraft,
  type BankDraft,
} from "@/components/dashboard/user/quedada-fields/BankAccountFields";
import { savePartnerPayoutAccount } from "@/server/actions/partners";
import type { PaymentAccount } from "@/lib/schemas/banking";

export type RevenueRow = {
  id: string;
  n: string;
  v: string;
  p: number;
  c: string;
  live: boolean;
};

export type FinanzasData = {
  partnerId: string | null;
  payoutAccount: PaymentAccount | null;
  monthRevenueCents: number;
  mpFeeCents: number;
  clubsShareCents: number;
  netCents: number;
  deltaPct: number | null;
  ticketAvgCents: number | null;
  inscritosMonth: number;
  inscritosDelta: number;
  activeTournaments: number;
  revenueByTournament: RevenueRow[];
};

function fmtUSD(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

const REV_PLACEHOLDER_COUNT = 3;

// ── PayoutAccountCard ────────────────────────────────────────────────────────
function PayoutAccountCard({
  orgId,
  initial,
}: {
  orgId: string;
  initial: PaymentAccount | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BankDraft>(accountToBankDraft(initial));
  const [current, setCurrent] = useState<PaymentAccount | null>(initial);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave() {
    const account = bankDraftToAccount(draft);
    startTransition(async () => {
      const res = await savePartnerPayoutAccount({ orgId, account });
      if (res.ok) {
        setCurrent(res.data.account);
        setEditing(false);
        showToast(true, "Cuenta de cobro guardada.");
      } else {
        showToast(false, res.error?.message ?? "Error al guardar");
      }
    });
  }

  const masked = current
    ? `${current.bank} · ${current.accountType} ·· ${current.accountNumber.slice(-4)}`
    : null;

  return (
    <div className="card" style={{ padding: 22, position: "relative" }}>
      {toast && (
        <div
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: toast.ok ? "#10b981" : "#dc2626",
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            padding: "6px 12px",
            borderRadius: 8,
            zIndex: 10,
          }}
        >
          {toast.msg}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h2
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", margin: 0 }}
          >
            Cuenta de cobro<span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 11.5, color: "var(--muted-fg)", margin: "4px 0 0" }}>
            Datos bancarios donde MATCHPOINT te deposita tus payouts.
          </p>
        </div>
        {!editing && (
          <button
            className="btn btn-sm"
            onClick={() => { setDraft(accountToBankDraft(current)); setEditing(true); }}
            style={{ flexShrink: 0 }}
          >
            <Icon name={current ? "pencil" : "plus"} size={13} />
            {current ? "Editar" : "Agregar cuenta"}
          </button>
        )}
      </div>

      {!editing && current && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: "var(--muted)",
            borderRadius: 10,
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: 8,
              background: "#10b981", color: "#fff",
              display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <Icon name="landmark" size={16} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--fg)" }}>{current.holderName}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 1 }}>{masked}</div>
          </div>
          <div
            style={{
              fontSize: 10, fontWeight: 800, background: "#d1fae5", color: "#065f46",
              padding: "3px 8px", borderRadius: 99,
            }}
          >
            Activa
          </div>
        </div>
      )}

      {!editing && !current && (
        <div
          style={{
            padding: "24px 0", textAlign: "center", color: "var(--muted-fg)",
            fontSize: 12.5, fontWeight: 700,
          }}
        >
          <Icon name="landmark" size={20} color="var(--muted-fg)" />
          <div style={{ marginTop: 8 }}>
            Sin cuenta configurada — MATCHPOINT no puede procesar tu payout.
          </div>
        </div>
      )}

      {editing && (
        <div>
          <BankAccountFields value={draft} onChange={setDraft} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={pending || bankDraftIsIncomplete(draft)}
            >
              {pending ? "Guardando…" : "Guardar cuenta"}
            </button>
            <button
              className="btn"
              onClick={() => { setDraft(accountToBankDraft(current)); setEditing(false); }}
              disabled={pending}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PartnerFinanzasScreenView({ data }: { data: FinanzasData }) {
  useRealtimeRefresh(
    data.partnerId
      ? [
          // transactions no tiene partner_id; filtrar por kind=tournament
          // descarta pagos de reservas/clases/proshop ajenos al partner.
          { table: "transactions", filter: "kind=eq.tournament" },
          { table: "tournaments", filter: `partner_id=eq.${data.partnerId}` },
        ]
      : [],
    { enabled: !!data.partnerId, debounceMs: 2000 },
  );

  const hasRev = data.revenueByTournament.length > 0;
  const hasNet = data.monthRevenueCents > 0;

  const waterfall = [
    { l: "Revenue bruto", v: fmtUSD(data.monthRevenueCents), sign: "+" as const, color: "#fff" },
    { l: "Comisión MATCHPOINT (10%)", v: fmtUSD(data.mpFeeCents), sign: "–" as const, color: "#dc2626" },
    { l: "Pago a clubes sede", v: fmtUSD(data.clubsShareCents), sign: "–" as const, color: "#fbbf24" },
    { l: "Tu neto", v: fmtUSD(data.netCents), sign: "=" as const, color: "var(--primary)", bold: true },
  ];

  const deltaLabel = data.deltaPct == null ? "—" : `${data.deltaPct >= 0 ? "↑" : "↓"} ${Math.abs(data.deltaPct)}%`;
  const ticketLabel = data.ticketAvgCents == null ? "$—" : fmtUSD(data.ticketAvgCents);
  const inscritosDeltaLabel = data.inscritosDelta === 0 ? "—" : `${data.inscritosDelta > 0 ? "↑" : "↓"} ${Math.abs(data.inscritosDelta)}`;

  const secondary = [
    {
      l: "Ticket prom.",
      v: ticketLabel,
      sub: data.ticketAvgCents == null ? "sin tracking aún" : "Este mes",
      subC: data.ticketAvgCents == null ? "var(--muted-fg)" : "var(--primary)",
    },
    {
      l: "Inscritos",
      v: data.inscritosMonth.toLocaleString("en-US"),
      sub: data.inscritosDelta === 0 ? "—" : inscritosDeltaLabel,
      subC: "var(--primary)",
    },
    {
      l: "Take rate eff.",
      v: hasNet ? "—" : "—",
      sub: "sin tracking aún",
      subC: "var(--muted-fg)",
    },
    {
      l: "Margen",
      v: "—",
      sub: "sin tracking aún",
      subC: "var(--muted-fg)",
      accent: "var(--muted-fg)",
    },
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="$$$$"
        accent="#10b981"
        label="Partner · Finanzas · este mes"
        title="Tu negocio en números"
        sub="Revenue por torneo, comisiones, pagos a clubes y tu neto. Todo en un lugar."
        right={
          <button className="btn btn-primary" disabled={!hasNet} style={{ opacity: hasNet ? 1 : 0.5 }}>
            <Icon name="download" size={13} color="#fff" />
            Estado financiero
          </button>
        }
      />

      <div className="mp-partner-fin-split mp-role-home-panels">
        {/* Big net + waterfall */}
        <div
          className="card"
          style={{
            padding: 24,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 80%, #10b981 200%)",
            color: "#fff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 200,
              color: "rgba(255,255,255,0.05)",
              letterSpacing: "-0.06em",
              transform: "rotate(-6deg) translate(15%, -20%)",
            }}
          >
            NET
          </div>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
            ● Neto este mes
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 12 }}>
            <span
              className="font-heading tabular mp-partner-fin-hero-value"
              style={{
                fontSize: 68,
                fontWeight: 900,
                letterSpacing: "-0.045em",
                lineHeight: 0.9,
                color: hasNet ? "var(--primary)" : "rgba(255,255,255,0.4)",
              }}
            >
              {hasNet ? fmtUSD(data.netCents) : "$—"}
            </span>
            <span style={{ fontSize: 14, color: "var(--primary)", fontWeight: 900 }}>{deltaLabel}</span>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>
            {data.payoutAccount
              ? `${data.payoutAccount.bank} ·· ${data.payoutAccount.accountNumber.slice(-4)}`
              : "Sin cuenta bancaria vinculada"}
          </div>

          <div style={{ marginTop: 28 }}>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
              Desglose
            </div>
            {waterfall.map((r, i) => (
              <div
                key={r.l}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "9px 0",
                  borderTop: i === 0 ? "0" : "1px dashed rgba(255,255,255,0.12)",
                }}
              >
                <span
                  style={{
                    fontSize: r.bold ? 13 : 12,
                    color: r.bold ? "#fff" : "rgba(255,255,255,0.75)",
                    fontWeight: r.bold ? 900 : 700,
                  }}
                >
                  {r.sign === "=" ? "=" : r.sign} {r.l}
                </span>
                <span
                  className="font-heading tabular"
                  style={{
                    fontSize: r.bold ? 18 : 15,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    color: r.color,
                  }}
                >
                  {r.v}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: secondary KPIs + payouts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="mp-partner-fin-kpis-secondary mp-grid-form-2 gap-3">
            {secondary.map((k) => (
              <div key={k.l} className="card" style={{ padding: 16 }}>
                <div className="label-mp">{k.l}</div>
                <div
                  className="font-heading tabular"
                  style={{
                    fontSize: 26,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    marginTop: 8,
                    color: k.accent || "#0a0a0a",
                  }}
                >
                  {k.v}
                </div>
                <div style={{ fontSize: 10, color: k.subC, fontWeight: 800, marginTop: 4 }}>
                  {k.sub}
                </div>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="label-mp" style={{ marginBottom: 10 }}>
              Próximos payouts
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 0",
                  borderTop: i === 0 ? "0" : "1px dashed var(--border)",
                  opacity: 0.6,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "var(--muted)",
                    color: "var(--muted-fg)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name="clock" size={14} color="var(--muted-fg)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--muted-fg)" }}>
                    Sin payouts
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                    — · sin tracking aún
                  </div>
                </div>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 15,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    color: "var(--muted-fg)",
                  }}
                >
                  $—
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue por torneo */}
      <div className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Revenue por torneo<span className="dot">.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {data.activeTournaments} activos · este mes
          </span>
        </div>
        {hasRev
          ? data.revenueByTournament.map((t) => (
              <div
                key={t.id}
                className="mp-partner-fin-rev-row"
                style={{
                  padding: "10px 0",
                  borderTop: "1px dashed var(--border)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {t.n}
                    {t.live && <RSPill bg="#dc2626">LIVE</RSPill>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>
                    {t.p}% del revenue
                  </div>
                </div>
                <MpProgressBar pct={Math.min(100, t.p * 3)} color={t.c} height={10} />
                <div
                  className="font-heading tabular"
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "-0.025em",
                    textAlign: "right",
                    color: "var(--primary)",
                  }}
                >
                  {t.v}
                </div>
              </div>
            ))
          : Array.from({ length: REV_PLACEHOLDER_COUNT }).map((_, k) => (
              <div
                key={k}
                className="mp-partner-fin-rev-row"
                style={{
                  padding: "10px 0",
                  borderTop: "1px dashed var(--border)",
                  opacity: 0.6,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: "var(--muted-fg)",
                    }}
                  >
                    Sin torneos
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>
                    — del revenue
                  </div>
                </div>
                <div
                  style={{
                    height: 10,
                    background: "var(--muted)",
                    borderRadius: 9999,
                    overflow: "hidden",
                  }}
                />
                <div
                  className="font-heading tabular"
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "-0.025em",
                    textAlign: "right",
                    color: "var(--muted-fg)",
                  }}
                >
                  $—
                </div>
              </div>
            ))}
      </div>

      {data.partnerId && (
        <PayoutAccountCard orgId={data.partnerId} initial={data.payoutAccount} />
      )}
    </>
  );
}
