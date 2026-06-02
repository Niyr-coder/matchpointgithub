// Client view de MiPlanScreen — plan vigente, upgrade y historial.
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useToast } from "../ToastProvider";
import { requestPlanUpgrade } from "@/server/actions/player-subscriptions";
import { MatchPointPlusModal } from "./MatchPointPlusModal";
import {
  MP_PLUS_BENEFIT_CATEGORIES,
  MP_PLUS_PLAN,
  type MpPlusBenefitCategory,
} from "@/lib/marketing/mp-plus";

export type PlanInfo = {
  tier: string;
  expiresAt: string | null;
  active: boolean;
};

export type PlanSubscriptionRow = {
  id: string;
  tier: string;
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  durationMonths: number;
  transactionId: string | null;
  createdAt: string;
};

const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

const TIER_LABEL: Record<string, string> = {
  free: "Free",
  premium: "MATCHPOINT+",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  active: "Activa",
  expired: "Expirada",
  cancelled: "Cancelada",
  rejected: "Rechazada",
};

const STATUS_BG: Record<string, string> = {
  pending: "#fbbf24",
  active: "#10b981",
  expired: "#94a3b8",
  cancelled: "#64748b",
  rejected: "#ef4444",
};

export function MiPlanScreenView({
  plan,
  history,
}: {
  plan: PlanInfo;
  history: PlanSubscriptionRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const autoFiredRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);

  const isPremium = plan.active;
  const tierLabel = isPremium ? (TIER_LABEL[plan.tier] ?? plan.tier) : TIER_LABEL.free;
  const badgeColor = isPremium ? "#10b981" : "#94a3b8";

  const doUpgrade = () => {
    if (pending) return;
    startTransition(async () => {
      const r = await requestPlanUpgrade({ tier: "premium", durationMonths: 1 });
      if (!r.ok) {
        const pendingTx = r.error.fields?.transactionId?.[0];
        toast({
          icon: "alert-triangle",
          title: "No se pudo solicitar MATCHPOINT+",
          sub:
            r.error.code === "AUTH.UNAUTHENTICATED"
              ? "Inicia sesión para solicitar MATCHPOINT+."
              : r.error.message || "No se pudo crear la solicitud.",
        });
        if (pendingTx) {
          router.push(`/pagos/${pendingTx}`);
        }
        return;
      }
      toast({
        icon: "check-circle-2",
        title: "Solicitud creada",
        sub: "Sube tu comprobante para que el equipo active MATCHPOINT+.",
      });
      setModalOpen(false);
      router.push(`/pagos/${r.data.transactionId}`);
    });
  };

  // Auto-abre el modal cuando viene ?upgrade=premium desde un CTA externo.
  // En vez de crear la transacción al toque, mostramos primero qué ofrece.
  useEffect(() => {
    if (autoFiredRef.current) return;
    if (searchParams?.get("upgrade") !== "premium") return;
    if (plan.tier !== "free" && plan.tier !== "premium") return;
    autoFiredRef.current = true;
    setModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <>
      <PolHero
        tone="dark"
        wm="PLAN"
        accent={badgeColor}
        label="Suscripción · Mi plan"
        title="Tu plan MATCHPOINT"
        sub="Administra tu plan, solicita MATCHPOINT+ y revisa el historial de pagos."
      />

      {/* Card destacada del plan actual */}
      <div
        className="card grid grid-cols-1 min-[520px]:grid-cols-[1fr_auto] gap-4 items-center"
        style={{ padding: 22 }}
      >
        <div>
          <div className="label-mp">Plan actual</div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 6,
            }}
          >
            <div
              className="font-heading"
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                color: badgeColor,
                textTransform: "uppercase",
              }}
            >
              {tierLabel}
              <span className="dot">.</span>
            </div>
            <RSPill bg={badgeColor}>
              {isPremium ? "● MATCHPOINT+" : "● FREE"}
            </RSPill>
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--muted-fg)",
              marginTop: 10,
              maxWidth: 520,
            }}
          >
            {isPremium
              ? `Plan activo hasta ${fmtDate(plan.expiresAt)}. Disfrutas los beneficios disponibles de MATCHPOINT+.`
              : `Estás en el plan gratuito. Solicita MATCHPOINT+ para teams con más margen, historial completo y Coach AI en vista previa por ${MP_PLUS_PLAN.priceLabel}.`}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {isPremium ? (
            <button
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
              disabled={pending}
              style={{
                fontSize: 12,
                opacity: pending ? 0.6 : 1,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              <Icon name="calendar-plus" size={13} color="#fff" />
              {pending ? "Procesando…" : `${MP_PLUS_PLAN.renewCta} · ${MP_PLUS_PLAN.priceLabel}`}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setModalOpen(true)}
              disabled={pending}
              style={{
                fontSize: 13,
                padding: "12px 18px",
                opacity: pending ? 0.6 : 1,
                cursor: pending ? "wait" : "pointer",
              }}
            >
              <Icon name="zap" size={14} color="#fff" />
              {pending ? "Procesando…" : `${MP_PLUS_PLAN.requestCta} · ${MP_PLUS_PLAN.priceLabel}`}
            </button>
          )}
          <div
            style={{
              fontSize: 10.5,
              color: "var(--muted-fg)",
              textAlign: "center",
            }}
          >
            {MP_PLUS_PLAN.paymentShort}
          </div>
        </div>
      </div>

      <BenefitsSection isPremium={isPremium} />

      <h2
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: "4px 0 0",
        }}
      >
        Historial<span className="dot">.</span>
      </h2>

      {history.length === 0 ? (
        <div
          className="card"
          style={{ padding: 40, textAlign: "center", color: "var(--muted-fg)" }}
        >
          <Icon name="history" size={32} color="var(--muted-fg)" />
          <div
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              marginTop: 12,
              color: "#0a0a0a",
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
            }}
          >
            Sin historial todavía<span className="dot">.</span>
          </div>
          <p
            style={{
              fontSize: 13,
              marginTop: 8,
              maxWidth: 360,
              margin: "8px auto 0",
            }}
          >
            Cuando solicites MATCHPOINT+ aparecerá aquí con su estado y comprobante.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            className="grid grid-cols-[1fr_1fr_100px] md:grid-cols-[110px_100px_1fr_1fr_120px] gap-3"
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--muted)",
            }}
          >
            <div className="label-mp">Estado</div>
            <div className="label-mp hidden md:block">Plan</div>
            <div className="label-mp">Inicio</div>
            <div className="label-mp hidden md:block">Vence</div>
            <div className="label-mp" style={{ textAlign: "right" }}>
              Comprobante
            </div>
          </div>
          {history.map((row) => {
            const statusBg = STATUS_BG[row.status] ?? "#94a3b8";
            return (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_1fr_100px] md:grid-cols-[110px_100px_1fr_1fr_120px] gap-3 items-center"
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>
                  <RSPill bg={statusBg}>
                    {STATUS_LABEL[row.status] ?? row.status}
                  </RSPill>
                </div>
                <div className="hidden md:block" style={{ fontSize: 12, fontWeight: 800 }}>
                  {TIER_LABEL[row.tier] ?? row.tier}
                </div>
                <div style={{ fontSize: 12 }}>{fmtDate(row.startsAt)}</div>
                <div className="hidden md:block" style={{ fontSize: 12 }}>{fmtDate(row.expiresAt)}</div>
                <div style={{ textAlign: "right" }}>
                  {row.transactionId ? (
                    <button
                      className="btn"
                      onClick={() =>
                        router.push(`/pagos/${row.transactionId}`)
                      }
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 10.5,
                      }}
                    >
                      <Icon name="file-text" size={11} />
                      Ver
                    </button>
                  ) : (
                    <span
                      style={{ fontSize: 11, color: "var(--muted-fg)" }}
                    >
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <MatchPointPlusModal
          mode={isPremium ? "renew" : "activate"}
          pending={pending}
          onConfirm={doUpgrade}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

// ── Beneficios ─────────────────────────────────────────────────────────
// Lista canónica de beneficios detrás de MATCHPOINT+. Mantener este render
// ligado a `src/lib/marketing/mp-plus.ts` para no volver a duplicar promesas.
type BenefitRow = {
  label: string;
  free: string;
  plus: string;
  highlight?: boolean;
};

function BenefitsSection({ isPremium }: { isPremium: boolean }) {
  return (
    <div>
      <h2
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: "4px 0 14px",
        }}
      >
        Qué incluye MATCHPOINT+<span className="dot">.</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {MP_PLUS_BENEFIT_CATEGORIES.map((cat) => (
          <BenefitCard key={cat.title} category={cat} isPremium={isPremium} />
        ))}
      </div>
    </div>
  );
}

function BenefitCard({
  category,
  isPremium,
}: {
  category: MpPlusBenefitCategory;
  isPremium: boolean;
}) {
  const dimmed = !category.available;
  return (
    <div
      className="card flex h-full min-h-0 flex-col gap-3"
      style={{
        padding: 18,
        opacity: dimmed ? 0.68 : 1,
      }}
    >
      <div
        className="shrink-0"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, minHeight: 22 }}
      >
        <div
          className="font-heading"
          style={{
            fontSize: 15,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {category.title}
        </div>
        {!category.available && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: 9999,
              background: "var(--muted)",
              color: "var(--muted-fg)",
              whiteSpace: "nowrap",
            }}
          >
            Pronto
          </span>
        )}
      </div>
      <div
        className="line-clamp-4 shrink-0"
        style={{
          height: 64,
          fontSize: 11.5,
          color: "var(--muted-fg)",
          lineHeight: 1.4,
        }}
      >
        {category.hint ?? null}
      </div>
      <div
        className="shrink-0"
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <div
          className="grid grid-cols-1 gap-1 px-2.5 py-1.5 sm:grid-cols-[minmax(0,1fr)_52px_minmax(76px,0.75fr)] sm:gap-2 sm:items-center"
          style={{
            background: "rgba(10,10,10,0.035)",
            borderBottom: "1px solid var(--border)",
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          <span>Beneficio</span>
          <span style={{ textAlign: "right" }}>Free</span>
          <span style={{ textAlign: "right" }}>MP+</span>
        </div>
        {category.rows.map((row: BenefitRow, index) => (
          <div
            key={row.label}
            className="grid grid-cols-1 gap-1 px-2.5 py-2 sm:grid-cols-[minmax(0,1fr)_52px_minmax(76px,0.75fr)] sm:gap-2 sm:items-center sm:min-h-[42px]"
            style={{
              borderTop: index === 0 ? "none" : "1px solid rgba(10,10,10,0.08)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, color: "#0a0a0a", lineHeight: 1.35 }}>
              {row.label}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: isPremium ? "var(--muted-fg)" : "#0a0a0a",
                textAlign: "right",
                lineHeight: 1.35,
                fontVariantNumeric: "tabular-nums",
              }}
              title="Free"
            >
              {row.free}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: isPremium ? "var(--primary)" : "#facc15",
                textAlign: "right",
                lineHeight: 1.35,
                fontVariantNumeric: "tabular-nums",
              }}
              title="MATCHPOINT+"
            >
              {row.plus}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
