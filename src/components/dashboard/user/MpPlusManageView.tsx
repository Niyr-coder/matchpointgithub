"use client";
// Client view de MpPlusManageScreen — estilo editorial v2 (PolHero + bento +
// watermark gigante) consistente con FinanzasView/MarketingView/CanchasView.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { cancelMyPlan, requestPlanUpgrade } from "@/server/actions/player-subscriptions";
import { MP_PLUS_MANAGE_BENEFITS, MP_PLUS_PLAN } from "@/lib/marketing/mp-plus";

export type MpPlusManageData = {
  userId: string;
  displayName: string;
  planTier: string;
  expiresAtIso: string | null;
  daysRemaining: number;
  cycleDays: number;
  cycleStartIso: string | null;
  activeSubscription: {
    id: string;
    startsAtIso: string | null;
    expiresAtIso: string | null;
    durationMonths: number;
  } | null;
  totalPaidCents: number;
  cyclesCompleted: number;
  nextChargeCents: number;
  paymentMethod: string;
  history: Array<{
    id: string;
    createdAtIso: string;
    amountCents: number;
    method: string;
    status: string;
  }>;
};

function fmtMoney(cents: number, opts: { sign?: "+" | "-" | "" } = {}): string {
  const sign = opts.sign ?? "";
  return `${sign}${new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(Math.abs(cents) / 100)}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}
function statusLabel(s: string): string {
  if (s === "captured") return "Capturado";
  if (s === "refunded") return "Reembolsado";
  if (s === "pending_proof") return "Pendiente · comprobante";
  if (s === "proof_submitted") return "En revisión";
  if (s === "cancelled" || s === "void") return "Anulada";
  return s;
}

export function MpPlusManageView({ data }: { data: MpPlusManageData }) {
  const toast = useToast();
  const router = useRouter();
  const [extendPending, startExtend] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const HISTORY_PAGE_SIZE = 4;
  const historyPages = Math.max(1, Math.ceil(data.history.length / HISTORY_PAGE_SIZE));
  const [historyPage, setHistoryPage] = useState(0);

  const handleExtend = (months: number) => {
    startExtend(async () => {
      const res = await requestPlanUpgrade({ tier: "premium", durationMonths: months });
      if (!res.ok) {
        const pendingTx = res.error.fields?.transactionId?.[0];
        toast({
          icon: "alert-triangle",
          title: "No se pudo solicitar",
          sub: res.error.message,
        });
        if (pendingTx) {
          router.push(`/pagos/${pendingTx}`);
        } else if (res.error.code === "PLAN.PENDING_EXISTS") {
          router.push("/dashboard/user/mi-plan");
        }
        return;
      }
      toast({
        icon: "check-circle-2",
        title: `Solicitud creada · ${months} ${months === 1 ? "mes" : "meses"}`,
        sub: "Sube tu comprobante para activar la renovación.",
      });
      router.push(`/pagos/${res.data.transactionId}`);
    });
  };

  const handleCancel = () => {
    if (!data.activeSubscription) return;
    startCancel(async () => {
      const res = await cancelMyPlan({
        subscriptionId: data.activeSubscription!.id,
        reason: "Cancelado desde la pantalla Mi plan MATCHPOINT+",
      });
      if (res.ok) {
        toast({
          icon: "check-circle-2",
          title: "Suscripción cancelada",
          sub: `Conservas los beneficios hasta el ${fmtDate(data.expiresAtIso)}.`,
        });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const firstName = data.displayName.split(" ")[0] || "jugador";
  const expiresLabel = fmtDate(data.expiresAtIso);
  const cycleLengthLabel = data.activeSubscription?.durationMonths === 1
    ? "/mes"
    : `/${data.activeSubscription?.durationMonths ?? 1} meses`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Hero único: combina PolHero (watermark MP+ + label/title/sub) con
          el countdown gigante. Sin duplicación visual. ── */}
      <div
        style={{
          position: "relative",
          padding: 32,
          borderRadius: "var(--radius-mp-card)",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f1f23 60%, #10b981 220%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        {/* Watermark "MP+" gigante (estilo PolHero) */}
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 240,
            color: "rgba(255,255,255,0.05)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -20%)",
            textTransform: "uppercase",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}
        >
          MP+
        </div>
        {/* Glow verde (del hero card original) */}
        <div
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            width: 280,
            height: 280,
            borderRadius: "50%",
            background: "radial-gradient(circle at 30% 30%, rgba(16,185,129,0.28), transparent 70%)",
            filter: "blur(24px)",
            pointerEvents: "none",
          }}
        />

        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div style={{ maxWidth: 560 }}>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>● Tu plan · MATCHPOINT+</div>
              <h1
                className="font-heading"
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                  margin: "8px 0 6px",
                  lineHeight: 1.05,
                }}
              >
                Eres MATCHPOINT+, {firstName}<span className="dot">.</span>
              </h1>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.55 }}>
                Beneficios activos, renovación sugerida e historial. No hay cobro automático: cada extensión se confirma con comprobante manual.
              </div>

              {/* Countdown gigante */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 26, flexWrap: "wrap" }}>
                <span
                  className="font-heading tabular"
                  style={{
                    fontSize: 96,
                    fontWeight: 900,
                    letterSpacing: "-0.06em",
                    lineHeight: 0.82,
                    color: "var(--primary)",
                  }}
                >
                  {data.daysRemaining}
                </span>
                <span
                  className="font-heading"
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    color: "#fff",
                    textTransform: "uppercase",
                  }}
                >
                  {data.daysRemaining === 1 ? "día" : "días"} restan
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.7)", marginTop: 12 }}>
                Vence el <b style={{ color: "#fff" }}>{expiresLabel}</b> · renovación sugerida <b style={{ color: "#fff" }}>{fmtMoney(data.nextChargeCents)}{cycleLengthLabel}</b> · último método <b style={{ color: "#fff" }}>{data.paymentMethod}</b>
              </div>
            </div>

            {/* Bloque derecho: actions + progress */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch", minWidth: 240 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn"
                  style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}
                  onClick={() => router.push("/dashboard/user/mi-plan")}
                >
                  <Icon name="receipt" size={13} color="#fff" />
                  Historial y solicitudes
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={extendPending}
                  onClick={() => handleExtend(1)}
                >
                  <Icon name="zap" size={13} color="#fff" />
                  {extendPending ? "Procesando…" : `${MP_PLUS_PLAN.renewCta} · ${MP_PLUS_PLAN.priceLabel}`}
                </button>
              </div>
              <div style={{ marginTop: 4 }}>
                <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>● Progreso del ciclo</div>
                <div
                  style={{
                    marginTop: 8,
                    width: "100%",
                    height: 8,
                    background: "rgba(255,255,255,0.1)",
                    borderRadius: 9999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, ((data.cycleDays - data.daysRemaining) / Math.max(1, data.cycleDays)) * 100))}%`,
                      height: "100%",
                      background: "var(--primary)",
                    }}
                  />
                </div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.55)", marginTop: 6, textAlign: "right" }}>
                  <b style={{ color: "#fff" }}>{data.cycleDays - data.daysRemaining}</b> de {data.cycleDays} días transcurridos
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs 2x2 con iconos top-right ── */}
      <div className="mp-partner-torneo-kpis">
        <KpiCard label="Días restantes" value={String(data.daysRemaining)} sub={`de ${data.cycleDays} del ciclo`} icon="calendar-clock" accent="var(--primary)" />
        <KpiCard label="Cobrado total" value={fmtMoney(data.totalPaidCents)} sub={`${data.cyclesCompleted} ${data.cyclesCompleted === 1 ? "ciclo completado" : "ciclos completados"}`} icon="wallet" />
        <KpiCard label="Renovación sugerida" value={fmtMoney(data.nextChargeCents)} sub="sin cobro automático" icon="receipt" />
        <KpiCard label="Beneficios" value={String(MP_PLUS_MANAGE_BENEFITS.length)} sub="activos durante el ciclo" icon="sparkles" accent="#fbbf24" />
      </div>

      {/* ── Split: beneficios (lista vertical) + historial ── */}
      <div className="mp-partner-torneo-bottom">
        {/* Columna izquierda: lista de beneficios */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <div className="label-mp">Beneficios activos</div>
            <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>{MP_PLUS_MANAGE_BENEFITS.length} incluidos</span>
          </div>
          <h3
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}
          >
            Lo que tienes activo<span className="dot">.</span>
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {MP_PLUS_MANAGE_BENEFITS.map((b, i) => (
              <li
                key={b.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 36px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 0",
                  borderTop: i === 0 ? 0 : "1px dashed var(--border)",
                }}
              >
                <span
                  className="font-heading"
                  style={{
                    fontSize: 22,
                    fontWeight: 900,
                    letterSpacing: "-0.04em",
                    color: "var(--primary)",
                    textAlign: "center",
                    lineHeight: 1,
                  }}
                >
                  {b.metric}
                </span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em" }}>
                    {b.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.45 }}>{b.description}</div>
                </div>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: "var(--muted)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    justifySelf: "end",
                  }}
                >
                  <Icon name={b.icon} size={14} color="var(--primary)" />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Columna derecha: historial */}
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <div>
              <div className="label-mp">Historial de cobros</div>
              <h3
                className="font-heading"
                style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}
              >
                Lo que has pagado<span className="dot">.</span>
              </h3>
            </div>
            <button
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }}
              onClick={() => toast({ icon: "sparkles", title: "Descargar CSV · próximamente" })}
            >
              <Icon name="download" size={11} />
              CSV
            </button>
          </div>
        {data.history.length === 0 ? (
          <div style={{ padding: 22, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
            Sin movimientos todavía.
          </div>
        ) : (
          <>
            {/* Carousel: cada página es un column con HISTORY_PAGE_SIZE items.
                La página 0 (visible al entrar) tiene los más recientes. */}
            <div style={{ overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  display: "flex",
                  width: `${historyPages * 100}%`,
                  transform: `translateX(-${historyPage * (100 / historyPages)}%)`,
                  transition: "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)",
                }}
              >
                {Array.from({ length: historyPages }).map((_, pageIdx) => {
                  const pageItems = data.history.slice(
                    pageIdx * HISTORY_PAGE_SIZE,
                    (pageIdx + 1) * HISTORY_PAGE_SIZE,
                  );
                  return (
                    <div key={pageIdx} style={{ width: `${100 / historyPages}%`, flexShrink: 0 }}>
                      {pageItems.map((h, i) => {
                        const isRefund = h.status === "refunded";
                        const isCaptured = h.status === "captured";
                        return (
                          <div
                            key={h.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 70px",
                              gap: 10,
                              alignItems: "center",
                              padding: "12px 0",
                              borderTop: i === 0 ? 0 : "1px dashed var(--border)",
                              fontSize: 12,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                <span
                                  className="font-heading tabular"
                                  style={{
                                    color: "var(--muted-fg)",
                                    fontSize: 10.5,
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                    fontWeight: 900,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {fmtDate(h.createdAtIso)}
                                </span>
                                <span style={{ fontSize: 12, fontWeight: 800 }}>MATCHPOINT+</span>
                              </div>
                              <div style={{ color: "var(--muted-fg)", fontSize: 10.5, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {h.method} · {statusLabel(h.status)}
                              </div>
                            </div>
                            <span
                              className="font-heading tabular"
                              style={{
                                fontWeight: 900,
                                fontSize: 14,
                                textAlign: "right",
                                color: isRefund ? "var(--destructive-fg)" : isCaptured ? "var(--primary)" : "var(--muted-fg)",
                              }}
                            >
                              {fmtMoney(h.amountCents, { sign: isRefund ? "-" : isCaptured ? "+" : "" })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer: contador + prev/next */}
            {historyPages > 1 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border)",
                  fontSize: 11,
                }}
              >
                <span style={{ color: "var(--muted-fg)" }}>
                  Página <b style={{ color: "#0a0a0a" }}>{historyPage + 1}</b> de {historyPages} · {data.history.length} cobros
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                    disabled={historyPage === 0}
                    aria-label="Página anterior"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: historyPage === 0 ? "var(--muted)" : "#fff",
                      border: "1px solid var(--border)",
                      cursor: historyPage === 0 ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: historyPage === 0 ? 0.4 : 1,
                    }}
                  >
                    <Icon name="chevron-left" size={12} />
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(historyPages - 1, p + 1))}
                    disabled={historyPage >= historyPages - 1}
                    aria-label="Página siguiente"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: historyPage >= historyPages - 1 ? "var(--muted)" : "#fff",
                      border: "1px solid var(--border)",
                      cursor: historyPage >= historyPages - 1 ? "not-allowed" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: historyPage >= historyPages - 1 ? 0.4 : 1,
                    }}
                  >
                    <Icon name="chevron-right" size={12} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* ── Cancel bar (estilo destructivo editorial) ── */}
      {data.activeSubscription && (
        <div
          style={{
            padding: 16,
            background: "var(--destructive-bg)",
            border: "1px solid var(--destructive-border)",
            borderRadius: "var(--radius-mp-card)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "rgba(220,38,38,0.1)",
                color: "var(--destructive-fg)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name="alert-triangle" size={16} color="var(--destructive-fg)" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900 }}>¿Pausar o cancelar?</div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.4 }}>
                Conservas los beneficios hasta el <b style={{ color: "#0a0a0a" }}>{expiresLabel}</b>. Si solicitas MATCHPOINT+ después, arrancas un ciclo nuevo desde cero.
              </div>
            </div>
          </div>
          {!confirmCancel ? (
            <button
              onClick={() => setConfirmCancel(true)}
              style={{
                background: "transparent",
                border: 0,
                color: "var(--destructive-fg)",
                fontWeight: 900,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                padding: "8px 14px",
              }}
            >
              Cancelar suscripción →
            </button>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="btn"
                onClick={() => setConfirmCancel(false)}
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                No, mantener
              </button>
              <button
                className="btn"
                disabled={cancelPending}
                onClick={handleCancel}
                style={{
                  background: "var(--destructive-fg)",
                  color: "#fff",
                  border: "1px solid var(--destructive-fg)",
                  opacity: cancelPending ? 0.5 : 1,
                  cursor: cancelPending ? "not-allowed" : "pointer",
                }}
              >
                {cancelPending ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
  accent?: string;
}) {
  const accentColor = accent ?? "#0a0a0a";
  const isPrimary = accent === "var(--primary)";
  const iconBg = isPrimary ? "rgba(16,185,129,0.1)" : accent === "#fbbf24" ? "rgba(251,191,36,0.12)" : "var(--muted)";
  return (
    <div className="card" style={{ padding: 18, position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          width: 32,
          height: 32,
          borderRadius: 8,
          background: iconBg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={15} color={accentColor} />
      </div>
      <div className="label-mp" style={{ paddingRight: 40 }}>{label}</div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 32,
          fontWeight: 900,
          letterSpacing: "-0.035em",
          marginTop: 10,
          color: accentColor,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700, marginTop: 4 }}>{sub}</div>
    </div>
  );
}
