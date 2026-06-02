// Modal de info del plan MATCHPOINT+ — features + precio + CTA de solicitud.
// Se abre desde el botón "Solicitar MATCHPOINT+" para que el usuario vea
// qué obtiene antes de entrar al checkout.
"use client";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { MP_PLUS_MODAL_BENEFITS, MP_PLUS_PLAN } from "@/lib/marketing/mp-plus";

type Mode = "activate" | "renew";

type Props = {
  mode: Mode;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Brand color para MATCHPOINT+ — ámbar dorado consistente con el header,
// pill y dot. Lo guardamos en una const para no repetirlo en cada style.
const GOLD = "#facc15";

export function MatchPointPlusModal({ mode, pending, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ctaLabel = mode === "renew" ? MP_PLUS_PLAN.renewCta : MP_PLUS_PLAN.requestCta;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.62)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "mpBannerIn 220ms var(--ease-out)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          width: "min(520px, 100%)",
          maxHeight: "92vh",
          overflow: "auto",
          boxShadow: "0 30px 70px rgba(0,0,0,0.4)",
        }}
      >
        {/* Header oscuro con gradient verde */}
        <div
          style={{
            position: "relative",
            padding: "28px 26px 24px",
            background:
              "linear-gradient(135deg, #0a0a0a 0%, #111827 50%, #064e3b 100%)",
            color: "#fff",
            overflow: "hidden",
          }}
        >
          {/* Halo dorado */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 88% 18%, rgba(250,204,21,0.28), transparent 55%)",
              pointerEvents: "none",
            }}
          />
          {/* Watermark "+" gigante */}
          <div
            style={{
              position: "absolute",
              top: -14,
              right: -10,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 220,
              color: "rgba(250,204,21,0.06)",
              lineHeight: 1,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            +
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "rgba(255,255,255,0.85)",
              borderRadius: 8,
              width: 30,
              height: 30,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              fontFamily: "inherit",
              transition: "background 160ms var(--ease-out)",
              zIndex: 3,
            }}
          >
            ×
          </button>
          <div style={{ position: "relative", zIndex: 2 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px",
                background: `linear-gradient(135deg, ${GOLD} 0%, #d97706 100%)`,
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#0a0a0a",
              }}
            >
              <Icon name="crown" size={11} color="#0a0a0a" />
              MATCHPOINT+
            </div>
            <h2
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                margin: "14px 0 8px",
                lineHeight: 1.02,
                color: "#fff",
              }}
            >
              {mode === "renew" ? "Renueva tu plan" : "Más margen para jugar"}
              <span style={{ color: GOLD }}>.</span>
            </h2>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.82)",
                margin: 0,
                maxWidth: 380,
                lineHeight: 1.55,
              }}
            >
              {mode === "renew" ? (
                <>
                  Solicita otro ciclo y sube tu comprobante para mantener tus beneficios activos.
                </>
              ) : (
                <>
                  Teams con más margen, historial completo y Coach AI en vista previa por{" "}
                  <b style={{ color: "#fff", fontWeight: 800 }}>{MP_PLUS_PLAN.priceLabel}</b>.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Features */}
        <div style={{ padding: "20px 26px 8px" }}>
          <div
            style={{
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
              marginBottom: 10,
            }}
          >
            Qué incluye
          </div>
          {MP_PLUS_MODAL_BENEFITS.map((f) => (
            <div
              key={f.title}
              style={{
                display: "flex",
                gap: 14,
                padding: "11px 0",
                borderBottom: "1px solid var(--border)",
                alignItems: "flex-start",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: "rgba(250,204,21,0.14)",
                  border: "1px solid rgba(250,204,21,0.32)",
                  color: GOLD,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={f.icon} size={15} color={GOLD} />
              </div>
              <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                <div
                  className="font-heading"
                  style={{
                    fontSize: 13,
                    fontWeight: 900,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    color: "#0a0a0a",
                    lineHeight: 1.1,
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted-fg)",
                    marginTop: 4,
                    lineHeight: 1.45,
                  }}
                >
                  {f.description}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer con precio + CTA */}
        <div
          style={{
            padding: "18px 26px 22px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            background: "var(--muted)",
            borderTop: "1px solid var(--border)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 140 }}>
            <div
              className="label-mp"
              style={{ color: "var(--muted-fg)", marginBottom: 4 }}
            >
              {mode === "renew" ? "Renovación (1 mes)" : "Precio mensual"}
            </div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 1,
                color: "#0a0a0a",
              }}
            >
              {MP_PLUS_PLAN.priceAmountLabel}
              <span style={{ color: GOLD }}>.</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--muted-fg)",
                  fontWeight: 600,
                  marginLeft: 4,
                }}
              >
                /mes
              </span>
            </div>
            <div
              style={{
                fontSize: 10.5,
                color: "var(--muted-fg)",
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              {MP_PLUS_PLAN.paymentShort}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "transparent",
              border: 0,
              padding: "10px 12px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
              cursor: "pointer",
              fontFamily: "inherit",
              borderRadius: 9999,
              transition: "color 160ms var(--ease-out)",
            }}
            disabled={pending}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#0a0a0a")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-fg)")}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="btn btn-primary mp-shine"
            style={{
              fontSize: 12,
              padding: "12px 18px",
              background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
              boxShadow: "0 6px 18px rgba(16,185,129,0.35)",
            }}
          >
            <Icon name={mode === "renew" ? "calendar-plus" : "zap"} size={13} color="#fff" />
            {pending ? "Procesando…" : ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
