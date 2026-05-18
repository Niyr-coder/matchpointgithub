"use client";

// Ubicación: Renderizado dentro de ClubMarketingScreenView.
// ¿Por qué Marketing y no Config? "Destacar mi club" es una acción de
// adquisición/visibilidad (aparecer en hero del listado público, badge en
// cards, prioridad en mapa). Eso pertenece al dominio de marketing —
// promover el club a más usuarios — y no al de configuración operativa
// (horarios, tarifas, reglas). Además, el dueño ya viene a Marketing con
// la mentalidad de "invertir para crecer", así que el CTA encaja con el
// resto del contexto.
//
// Sobre las server actions: usamos directamente las que ya están en
// `src/server/actions/club-featuring.ts` (Agente U). La signature real
// devuelve `status: "active" | "inactive"` y `hasPendingRequest` como
// boolean separado, así que el panel deriva los tres estados visuales
// (active / pending / none) a partir de ambos campos. No exponemos
// `pendingTransactionId` porque la action actual no lo retorna; el link
// "Ver pago" se oculta cuando no lo tenemos.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  getClubFeaturingStatus,
  requestClubFeaturing,
} from "@/server/actions/club-featuring";

type ViewStatus = "active" | "pending" | "none";

type DerivedStatus = {
  view: ViewStatus;
  featuredUntil: string | null;
};

const FEATURING_PRICE_USD = 200;
const FEATURING_DAYS = 30;
const WARN_DAYS = 7;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const months = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function ClubFeaturingPanel({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<DerivedStatus | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getClubFeaturingStatus({ clubId }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        const view: ViewStatus =
          res.data.status === "active"
            ? "active"
            : res.data.hasPendingRequest
              ? "pending"
              : "none";
        setStatus({ view, featuredUntil: res.data.featuredUntil });
      } else {
        setStatus({ view: "none", featuredUntil: null });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const handleActivate = () => {
    if (pending) return;
    startTransition(async () => {
      const res = await requestClubFeaturing({
        clubId,
        durationDays: FEATURING_DAYS,
      });
      if (!res.ok) {
        const msg =
          res.error.code === "CLUB_FEATURING.PENDING_EXISTS"
            ? "Ya tienes una solicitud de destacado pendiente. Sube el comprobante o espera la aprobación."
            : res.error.code === "AUTH.UNAUTHENTICATED"
              ? "Inicia sesión para destacar tu club."
              : res.error.message || "No se pudo crear la solicitud.";
        toast({
          icon: "alert-triangle",
          title: "No se pudo activar el destacado",
          sub: msg,
        });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: "Solicitud creada",
        sub: "Sube tu comprobante para activar el destacado.",
      });
      router.push(`/pagos/${res.data.transactionId}`);
    });
  };

  if (loading || !status) return <ShellLoading />;

  if (status.view === "active") {
    const left = daysUntil(status.featuredUntil);
    const warn = left !== null && left <= WARN_DAYS;
    return (
      <ActiveCard
        clubName={clubName}
        featuredUntil={status.featuredUntil}
        daysLeft={left}
        warn={warn}
        pending={pending}
        onExtend={handleActivate}
      />
    );
  }

  if (status.view === "pending") {
    return <PendingCard transactionId={null} />;
  }

  return <NoneCard pending={pending} onActivate={handleActivate} />;
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-componentes visuales
// ─────────────────────────────────────────────────────────────────────────

function ShellLoading() {
  return (
    <div
      style={{
        marginBottom: 14,
        background: "linear-gradient(135deg, #0a0a0a 0%, #111827 55%, #0a0a0a 100%)",
        color: "#fff",
        borderRadius: 14.4,
        padding: "18px 20px",
        border: "1px solid rgba(255,255,255,0.06)",
        minHeight: 88,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "rgba(250,204,21,0.14)",
          border: "1px solid rgba(250,204,21,0.3)",
          flexShrink: 0,
        }}
      />
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
        Cargando estado de destacado…
      </div>
    </div>
  );
}

function ShellWrap({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 14,
        background: "linear-gradient(135deg, #0a0a0a 0%, #111827 55%, #0a0a0a 100%)",
        color: "#fff",
        borderRadius: 14.4,
        padding: "18px 22px",
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 90% 30%, rgba(250,204,21,0.18), transparent 55%), radial-gradient(ellipse at 10% 80%, rgba(16,185,129,0.14), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

function CrownBadge({ color = "#facc15" }: { color?: string }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: `${color}24`,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: `1px solid ${color}4D`,
        flexShrink: 0,
      }}
    >
      <Icon name="crown" size={18} />
    </div>
  );
}

function ActiveCard({
  clubName,
  featuredUntil,
  daysLeft,
  warn,
  pending,
  onExtend,
}: {
  clubName: string;
  featuredUntil: string | null;
  daysLeft: number | null;
  warn: boolean;
  pending: boolean;
  onExtend: () => void;
}) {
  return (
    <ShellWrap>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <CrownBadge color="#10b981" />
          <div style={{ minWidth: 0 }}>
            <div
              className="font-heading"
              style={{
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ color: "#10b981" }}>✓</span>
              {clubName} está destacado
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                marginTop: 4,
              }}
            >
              Hasta {fmtDate(featuredUntil)}
              {daysLeft !== null && (
                <span
                  style={{
                    marginLeft: 10,
                    fontWeight: 800,
                    color: warn ? "#fbbf24" : "rgba(255,255,255,0.55)",
                  }}
                >
                  {warn
                    ? `Renueva antes de ${daysLeft} día${daysLeft === 1 ? "" : "s"}`
                    : `${daysLeft} días restantes`}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onExtend}
          disabled={pending}
          style={{
            background: "#facc15",
            color: "#0a0a0a",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            cursor: pending ? "wait" : "pointer",
            whiteSpace: "nowrap",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending
            ? "Procesando…"
            : `Extender ${FEATURING_DAYS} días · USD ${FEATURING_PRICE_USD}`}
        </button>
      </div>
    </ShellWrap>
  );
}

function PendingCard({ transactionId }: { transactionId: string | null }) {
  return (
    <div
      style={{
        marginBottom: 14,
        background:
          "linear-gradient(135deg, #422006 0%, #78350f 55%, #422006 100%)",
        color: "#fff",
        borderRadius: 14.4,
        padding: "18px 22px",
        border: "1px solid rgba(251,191,36,0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(251,191,36,0.18)",
              color: "#fbbf24",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(251,191,36,0.4)",
              flexShrink: 0,
            }}
          >
            <Icon name="clock" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="font-heading"
              style={{
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Solicitud en revisión
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.75)",
                marginTop: 4,
              }}
            >
              El admin aprobará tu comprobante en menos de 24 h. Si fue
              rechazado, puedes resubirlo desde el detalle del pago.
            </div>
          </div>
        </div>
        {transactionId && (
          <a
            href={`/pagos/${transactionId}`}
            style={{
              background: "#fbbf24",
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "10px 16px",
              borderRadius: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            Ver pago →
          </a>
        )}
      </div>
    </div>
  );
}

function NoneCard({
  pending,
  onActivate,
}: {
  pending: boolean;
  onActivate: () => void;
}) {
  const bullets: { icon: string; text: string }[] = [
    { icon: "star", text: "Aparece en el hero del listado público de clubes." },
    { icon: "badge-check", text: "Badge dorado “Destacado” en las cards de búsqueda." },
    { icon: "map-pin", text: "Prioridad en el mapa para usuarios cercanos." },
  ];

  return (
    <ShellWrap>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, minWidth: 0, flex: 1 }}>
          <CrownBadge />
          <div style={{ minWidth: 0 }}>
            <div
              className="font-heading"
              style={{
                fontWeight: 900,
                fontSize: 18,
                letterSpacing: "-0.025em",
                lineHeight: 1.1,
              }}
            >
              Destaca tu club por {FEATURING_DAYS} días
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                marginTop: 4,
              }}
            >
              Multiplica la visibilidad de tu club entre los jugadores de tu ciudad.
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "14px 0 0",
                display: "grid",
                gap: 8,
              }}
            >
              {bullets.map((b) => (
                <li
                  key={b.text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 12.5,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      background: "rgba(250,204,21,0.16)",
                      color: "#facc15",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={b.icon} size={12} />
                  </span>
                  {b.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onActivate}
            disabled={pending}
            style={{
              background: "#facc15",
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "12px 18px",
              borderRadius: 10,
              border: "none",
              cursor: pending ? "wait" : "pointer",
              whiteSpace: "nowrap",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending
              ? "Procesando…"
              : `Activar destacado · USD ${FEATURING_PRICE_USD}`}
          </button>
          <div
            style={{
              fontSize: 10.5,
              color: "rgba(255,255,255,0.55)",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            USD {FEATURING_PRICE_USD} por {FEATURING_DAYS} días
          </div>
        </div>
      </div>
    </ShellWrap>
  );
}
