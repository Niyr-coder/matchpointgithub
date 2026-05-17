// AuthModal — single modal for both sign-in and sign-up, styled like the
// landing Paywall (black → green gradient hero + JOIN/SIGN IN watermark).
// Replaces the ugly standalone /login and /signup full-page forms.
"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { Icon } from "@/components/Icon";
import { signInFromForm, signUpFromForm } from "@/server/actions/auth";
import type { ActionResult } from "@/lib/api/action";
import type { SessionResponse } from "@/lib/schemas/identity";

export type AuthMode = "signin" | "signup";

type State = ActionResult<SessionResponse> | null;

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

export function AuthModal({
  mode: initialMode = "signup",
  next,
  onClose,
}: {
  mode?: AuthMode;
  next?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);

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
          maxWidth: 460,
          overflow: "hidden",
          padding: 0,
          animation: "lpMpFadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <Hero mode={mode} onClose={onClose} />
        <div style={{ padding: 24 }}>
          {mode === "signup" ? (
            <SignUpForm next={next} onSwitch={() => setMode("signin")} />
          ) : (
            <SignInForm next={next} onSwitch={() => setMode("signup")} />
          )}
        </div>
      </div>
    </div>
  );
}

function Hero({ mode, onClose }: { mode: AuthMode; onClose: () => void }) {
  const isSignUp = mode === "signup";
  return (
    <div
      style={{
        position: "relative",
        padding: "28px 28px 22px",
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
          textTransform: "uppercase",
        }}
      >
        {isSignUp ? "JOIN" : "PLAY"}
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
        ● {isSignUp ? "Es gratis · < 60 s" : "MATCHPOINT"}
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
        {isSignUp ? "Crea tu cuenta" : "Bienvenido"}
        <span style={{ color: "#fbbf24" }}>.</span>
      </h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
        {isSignUp
          ? "Únete a la comunidad de pickleball en Ecuador"
          : "Ingresa y vuelve al juego"}
      </div>
    </div>
  );
}

// ── Sign-up ────────────────────────────────────────────────────────────
function SignUpForm({ next, onSwitch }: { next?: string; onSwitch: () => void }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    signUpFromForm,
    null,
  );
  const f = state && !state.ok ? state.error.fields : undefined;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {next && <input type="hidden" name="next" value={next} />}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <FieldLabel label="Nombre" error={f?.displayName?.[0]}>
          <input
            name="displayName"
            required
            placeholder="Vicente"
            autoComplete="name"
            style={inp}
          />
        </FieldLabel>
        <FieldLabel label="Usuario" error={f?.username?.[0]}>
          <input
            name="username"
            required
            placeholder="vicente"
            autoComplete="username"
            style={inp}
          />
        </FieldLabel>
      </div>

      <FieldLabel label="Email" error={f?.email?.[0]}>
        <input
          name="email"
          type="email"
          required
          placeholder="tu@email.com"
          autoComplete="email"
          style={inp}
        />
      </FieldLabel>

      <FieldLabel label="Contraseña" hint="Mínimo 8 caracteres" error={f?.password?.[0]}>
        <input
          name="password"
          type="password"
          required
          placeholder="••••••••"
          autoComplete="new-password"
          style={inp}
        />
      </FieldLabel>

      {state && !state.ok && <ErrorBanner message={state.error.message} />}

      <button
        type="submit"
        disabled={pending}
        className="lp-btn lp-btn-primary"
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "13px 18px",
          marginTop: 4,
          opacity: pending ? 0.6 : 1,
        }}
      >
        <Icon name="mail" size={14} color="#fff" />
        {pending ? "Creando cuenta..." : "Crear cuenta gratis"}
      </button>

      <OAuthButtons />

      <div
        style={{
          textAlign: "center",
          marginTop: 10,
          fontSize: 11.5,
          color: "var(--muted-fg)",
        }}
      >
        ¿Ya tienes cuenta?{" "}
        <button
          type="button"
          onClick={onSwitch}
          style={{
            color: "var(--primary)",
            fontWeight: 800,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Inicia sesión
        </button>
      </div>
    </form>
  );
}

// ── Sign-in ────────────────────────────────────────────────────────────
function SignInForm({ next, onSwitch }: { next?: string; onSwitch: () => void }) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    signInFromForm,
    null,
  );
  const f = state && !state.ok ? state.error.fields : undefined;

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {next && <input type="hidden" name="next" value={next} />}

      <FieldLabel label="Email" error={f?.email?.[0]}>
        <input
          name="email"
          type="email"
          required
          placeholder="tu@email.com"
          autoComplete="email"
          style={inp}
        />
      </FieldLabel>

      <FieldLabel label="Contraseña" error={f?.password?.[0]}>
        <input
          name="password"
          type="password"
          required
          placeholder="••••••••"
          autoComplete="current-password"
          style={inp}
        />
      </FieldLabel>

      {state && !state.ok && <ErrorBanner message={state.error.message} />}

      <button
        type="submit"
        disabled={pending}
        className="lp-btn lp-btn-primary"
        style={{
          width: "100%",
          justifyContent: "center",
          padding: "13px 18px",
          marginTop: 4,
          opacity: pending ? 0.6 : 1,
        }}
      >
        <Icon name="log-in" size={14} color="#fff" />
        {pending ? "Ingresando..." : "Ingresar"}
      </button>

      <OAuthButtons />

      <div
        style={{
          textAlign: "center",
          marginTop: 10,
          fontSize: 11.5,
          color: "var(--muted-fg)",
        }}
      >
        ¿No tienes cuenta?{" "}
        <button
          type="button"
          onClick={onSwitch}
          style={{
            color: "var(--primary)",
            fontWeight: 800,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Regístrate
        </button>
      </div>
    </form>
  );
}

// ── Sub-pieces ─────────────────────────────────────────────────────────
function FieldLabel({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "#0a0a0a",
        }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 700 }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{hint}</span>
      ) : null}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        padding: "10px 12px",
        borderRadius: 8,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        color: "#991b1b",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {message}
    </div>
  );
}

function OAuthButtons() {
  // OAuth providers come online once configured in Supabase dashboard.
  // For now we render the buttons disabled to preserve the original Paywall design.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      <button
        type="button"
        disabled
        title="Próximamente"
        className="lp-btn lp-btn-outline"
        style={{ width: "100%", justifyContent: "center", opacity: 0.55, cursor: "not-allowed" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continuar con Google
      </button>
      <button
        type="button"
        disabled
        title="Próximamente"
        className="lp-btn lp-btn-outline"
        style={{ width: "100%", justifyContent: "center", opacity: 0.55, cursor: "not-allowed" }}
      >
        <Icon name="apple" size={14} />
        Continuar con Apple
      </button>
    </div>
  );
}
