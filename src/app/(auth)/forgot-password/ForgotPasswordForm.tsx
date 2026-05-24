"use client";

import Link from "next/link";
import { useActionState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { requestPasswordResetFromForm } from "@/server/actions/auth";
import { AuthField } from "@/app/(auth)/_components/AuthField";
import { AuthError } from "@/app/(auth)/_components/AuthError";
import type { ActionResult } from "@/lib/api/action";

type State = ActionResult<{ ok: true }> | null;

const inp: CSSProperties = {
  padding: "11px 13px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  background: "#fff",
  width: "100%",
};

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    requestPasswordResetFromForm,
    null,
  );
  const f = state && !state.ok ? state.error.fields : undefined;
  const sent = state && state.ok;

  return (
    <div
      className="card"
      style={{
        width: "100%",
        maxWidth: 460,
        overflow: "hidden",
        padding: 0,
      }}
    >
      <Hero />
      <div style={{ padding: 24 }}>
        {sent ? (
          <SentState email={initialEmail} />
        ) : (
          <form
            action={formAction}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: 0 }}>
              Ingresa tu correo y te enviaremos un enlace seguro para crear una
              nueva contraseña.
            </p>

            <AuthField label="Email" error={f?.email?.[0]}>
              <input
                name="email"
                type="email"
                required
                defaultValue={initialEmail}
                placeholder="tu@email.com"
                autoComplete="email"
                autoFocus={!initialEmail}
                style={inp}
              />
            </AuthField>

            {state && !state.ok && <AuthError message={state.error.message} />}

            <button
              type="submit"
              disabled={pending}
              className="lp-btn lp-btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                padding: "13px 18px",
                opacity: pending ? 0.6 : 1,
              }}
            >
              <Icon name="mail" size={14} color="#fff" />
              {pending ? "Enviando..." : "Enviar enlace de recuperación"}
            </button>

            <div
              style={{
                textAlign: "center",
                fontSize: 12,
                color: "var(--muted-fg)",
              }}
            >
              <Link
                href="/?auth=signin"
                style={{
                  color: "var(--primary)",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                ← Volver al inicio de sesión
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Hero() {
  return (
    <div
      style={{
        position: "relative",
        padding: "28px 28px 22px",
        background:
          "linear-gradient(135deg, #0a0a0a 0%, #064e3b 60%, #10b981 200%)",
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
          textTransform: "uppercase",
        }}
      >
        RESET
      </div>
      <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
        ● Recupera tu acceso
      </div>
      <h2
        className="font-heading"
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          textTransform: "uppercase",
          margin: "8px 0 4px",
          lineHeight: 1,
        }}
      >
        ¿Olvidaste tu contraseña?
        <span style={{ color: "#fbbf24" }}>.</span>
      </h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
        Te ayudamos a volver al juego en menos de 1 minuto.
      </div>
    </div>
  );
}

function SentState({ email }: { email: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          margin: "4px auto 0",
        }}
      >
        <Icon name="mail" size={22} color="#059669" />
      </div>
      <h3
        style={{
          fontSize: 16,
          fontWeight: 900,
          textAlign: "center",
          margin: 0,
          color: "#0a0a0a",
        }}
      >
        Revisa tu correo
      </h3>
      <p
        style={{
          fontSize: 13,
          color: "var(--muted-fg)",
          textAlign: "center",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Te enviamos un correo si esa cuenta existe. Revisa tu bandeja
        {email ? (
          <>
            {" "}— incluyendo spam — en{" "}
            <strong style={{ color: "#0a0a0a" }}>{email}</strong>.
          </>
        ) : (
          " e incluyendo la carpeta de spam."
        )}
      </p>
      <p
        style={{
          fontSize: 11.5,
          color: "var(--muted-fg)",
          textAlign: "center",
          margin: 0,
        }}
      >
        El enlace expira en 1 hora.
      </p>
      <Link
        href="/?auth=signin"
        className="lp-btn lp-btn-outline"
        style={{
          width: "100%",
          justifyContent: "center",
          textDecoration: "none",
          marginTop: 4,
        }}
      >
        Volver al inicio de sesión
      </Link>
    </div>
  );
}
