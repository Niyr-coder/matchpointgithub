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

  const isPremium = plan.tier === "premium";
  const tierLabel = TIER_LABEL[plan.tier] ?? plan.tier;
  const badgeColor = isPremium ? "#10b981" : "#94a3b8";

  const doUpgrade = () => {
    if (pending) return;
    startTransition(async () => {
      const r = await requestPlanUpgrade({ tier: "premium", durationMonths: 1 });
      if (!r.ok) {
        const msg =
          r.error.code === "PLAN.PENDING_EXISTS"
            ? "Ya tienes una solicitud de upgrade pendiente. Sube el comprobante o espera la aprobación."
            : r.error.code === "AUTH.UNAUTHENTICATED"
              ? "Inicia sesión para activar Premium."
              : r.error.message || "No se pudo crear la solicitud.";
        toast({
          icon: "alert-triangle",
          title: "No se pudo activar Premium",
          sub: msg,
        });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: "Solicitud creada",
        sub: "Sube tu comprobante para activar Premium.",
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
        sub="Administra tu plan, pide un upgrade y revisa el historial de pagos."
      />

      {/* Card destacada del plan actual */}
      <div
        className="card"
        style={{
          padding: 22,
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 18,
          alignItems: "center",
        }}
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
              {isPremium ? "● PREMIUM" : "● FREE"}
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
              ? `Plan activo hasta ${fmtDate(plan.expiresAt)}. Disfrutas todas las funciones Premium de MATCHPOINT.`
              : "Estás en el plan gratuito. Activa Premium para ver estadísticas avanzadas, reservas prioritarias y más."}
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
              {pending ? "Procesando…" : "Extender 1 mes · USD 5"}
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
              {pending ? "Procesando…" : "Activar MATCHPOINT+ · USD 5/mes"}
            </button>
          )}
          <div
            style={{
              fontSize: 10.5,
              color: "var(--muted-fg)",
              textAlign: "center",
            }}
          >
            Pago por transferencia o DeUna
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
            Cuando solicites tu primer upgrade aparecerá aquí con su estado y comprobante.
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
// Lista de features gateadas detrás de MATCHPOINT+. Teams es la primera
// con caps reales (migration 102). El resto son placeholders honestos
// ("Próximamente") hasta que se implementen.
type BenefitRow = {
  label: string;
  free: string;
  premium: string;
  highlight?: boolean;
};

type BenefitCategory = {
  title: string;
  hint?: string;
  rows: BenefitRow[];
  available: boolean; // false => "Próximamente"
};

const BENEFITS: BenefitCategory[] = [
  {
    title: "Teams",
    hint: "Crea y lidera un equipo. Crear y unirse es gratis; los caps cambian según tu plan.",
    available: true,
    rows: [
      { label: "Miembros del roster", free: "12", premium: "24", highlight: true },
      { label: "Invitaciones pendientes", free: "3", premium: "Ilimitadas", highlight: true },
      { label: "Cambios de nombre", free: "2 veces", premium: "5 veces" },
      { label: "Estadísticas avanzadas", free: "—", premium: "Incluidas" },
    ],
  },
  {
    title: "Torneos privados",
    hint: "Próximamente — torneos solo-invitación entre amigos o tu club.",
    available: false,
    rows: [{ label: "Crear torneos privados", free: "—", premium: "Ilimitados" }],
  },
  {
    title: "Descuentos en clases",
    hint: "Próximamente — % de descuento en clases de coaches afiliados.",
    available: false,
    rows: [{ label: "Descuento aplicado", free: "—", premium: "Hasta 15%" }],
  },
];

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {BENEFITS.map((cat) => (
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
  category: BenefitCategory;
  isPremium: boolean;
}) {
  const dimmed = !category.available;
  return (
    <div
      className="card"
      style={{
        padding: 18,
        opacity: dimmed ? 0.68 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
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
      {category.hint && (
        <div style={{ fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.4 }}>
          {category.hint}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
        {category.rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 8,
              background: "#fafafa",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "#0a0a0a" }}>
              {row.label}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: isPremium ? "var(--muted-fg)" : "#0a0a0a",
                textAlign: "right",
                minWidth: 36,
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
                minWidth: 56,
              }}
              title="MATCHPOINT+"
            >
              {row.premium}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
