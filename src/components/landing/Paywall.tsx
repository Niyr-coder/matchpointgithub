// Paywall — locked-content modal. CTAs delegate to AuthModal for the real flow.
"use client";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";

export type PaywallTrigger = "reservar" | "inscripcion" | "clase" | "mensaje" | "perfil";

const BENEFITS: Record<PaywallTrigger, string[]> = {
  reservar: ["Reserva en 60 segundos", "Cancha de tu nivel y horario favorito", "Invita a tus amigos"],
  inscripcion: ["Inscríbete a este torneo", "Súbete al ranking nacional", "Conoce rivales de tu nivel"],
  clase: ["Reserva con coaches certificados", "Sube tu nivel oficial", "Paquetes desde $14/clase"],
  mensaje: ["Habla con clubes y coaches", "Crea matches con tus amigos", "Recibe invitaciones"],
  perfil: ["Crea tu perfil deportivo", "Tu nivel oficial certificado", "Histórico de partidos"],
};

const TEXT: Record<PaywallTrigger, string> = {
  reservar: "Crea tu cuenta para reservar",
  inscripcion: "Crea tu cuenta para inscribirte",
  clase: "Crea tu cuenta para reservar la clase",
  mensaje: "Crea tu cuenta para enviar mensajes",
  perfil: "Crea tu cuenta para ver el perfil",
};

export function Paywall({ trigger, onClose }: { trigger: PaywallTrigger; onClose: () => void }) {
  const b = BENEFITS[trigger] || BENEFITS.perfil;
  const t = TEXT[trigger] || TEXT.perfil;
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  if (authMode) {
    return (
      <AuthModal
        mode={authMode}
        next="/dashboard/user"
        onClose={() => {
          setAuthMode(null);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(8px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "100%",
          maxWidth: 440,
          overflow: "hidden",
          padding: 0,
          animation: "lpMpFadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <div
          style={{
            position: "relative",
            padding: "28px 28px 20px",
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 200%)",
            color: "#fff",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 180,
              color: "rgba(255,255,255,0.06)",
              letterSpacing: "-0.06em",
              lineHeight: 0.8,
              transform: "rotate(-6deg) translate(15%, -25%)",
              pointerEvents: "none",
            }}
          >
            JOIN
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} color="#fff" />
          </button>
          <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
            ● Es gratis · {"< 60 s"}
          </div>
          <h2
            className="font-heading"
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              margin: "8px 0 4px",
              lineHeight: 1,
            }}
          >
            {t}
            <span style={{ color: "#fbbf24" }}>.</span>
          </h2>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
            Únete a 8,412 jugadores ya en Ecuador
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {b.map((bx, i) => (
            <div
              key={i}
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", fontSize: 13 }}
            >
              <Icon name="check-circle-2" size={16} color="var(--primary)" />
              <span style={{ fontWeight: 700 }}>{bx}</span>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className="lp-btn lp-btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: "13px 18px" }}
            >
              <Icon name="mail" size={14} />
              Crear cuenta gratis
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 14, fontSize: 11.5, color: "var(--muted-fg)" }}>
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => setAuthMode("signin")}
              style={{
                color: "var(--primary)",
                fontWeight: 800,
                background: "transparent",
                border: 0,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              Inicia sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
