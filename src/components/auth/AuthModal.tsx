// AuthModal — single modal for both sign-in and sign-up, styled like the
// landing Paywall (black → green gradient hero + JOIN/SIGN IN watermark).
// Replaces the ugly standalone /login and /signup full-page forms.
"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { signInFromForm, signUpFromForm } from "@/server/actions/auth";
import type { ActionResult } from "@/lib/api/action";
import type { SessionResponse } from "@/lib/schemas/identity";

export type AuthMode = "signin" | "signup";

type State = ActionResult<SessionResponse> | null;

// Reglas del UsernameSchema (src/lib/schemas/common.ts): 3–24 chars,
// letras/dígitos/_/. (case-insensitive). Lo replicamos client-side para
// poder dar feedback inline antes del submit. El submit sigue validando
// con el schema en el server — esto es solo recognition-over-recall.
const USERNAME_RE = /^[a-z0-9_.]{3,24}$/i;
const USERNAME_HINT = "3–24 caracteres · letras, números, _ o .";

// Si el server action retornó ok=true pero la página no navegó (caso raro de
// useActionState + redirect en Next 16), forzamos navegación client-side.
// Por defecto vamos a /dashboard/user; el caller puede overridear con `next`.
function useAuthRedirectFallback(state: State, next?: string) {
  const router = useRouter();
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    if (state && state.ok) {
      fired.current = true;
      router.replace(next || "/dashboard/user");
    }
  }, [state, next, router]);
}

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
  notice,
  onClose,
}: {
  mode?: AuthMode;
  next?: string;
  // Aviso contextual mostrado sobre el formulario (ej. sesión cerrada por
  // suspensión). Tono "warning"; no es un error de submit.
  notice?: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape cierra el modal. Listener global porque el focus puede estar en
  // cualquier descendiente (inputs, botones OAuth, etc.) y queremos que la
  // tecla funcione siempre que el modal esté montado.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Scroll-lock: mientras el modal está abierto, congelamos el scroll del
  // body para que la rueda del ratón no mueva el landing detrás del overlay.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Restaurar focus al elemento que abrió el modal cuando se desmonta.
  // Guardamos el `activeElement` al montar y se lo devolvemos al cerrar,
  // siempre que el nodo siga vivo en el DOM (WCAG 2.4.3 Focus Order).
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    return () => {
      if (trigger && document.contains(trigger)) trigger.focus?.();
    };
  }, []);

  // Focus trap: confina Tab/Shift+Tab dentro del modal. Calculamos los
  // focusables en cada Tab para tolerar disabled, conditional rendering del
  // form (signin vs signup), y elementos que aparecen al cambiar de modo.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
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
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="authmodal-title"
        aria-describedby="authmodal-subtitle"
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
          {notice && <NoticeBanner message={notice} />}
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
        className="mp-press"
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
        ● {isSignUp ? "Es gratis · en menos de 60 s" : "MATCHPOINT"}
      </div>
      <h2
        id="authmodal-title"
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
      <div
        id="authmodal-subtitle"
        style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}
      >
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
  // Safety net: si el server action devolvió ok pero el redirect no propagó
  // (cuirks de Next 16 + Turbopack con useActionState), navegamos a mano.
  useAuthRedirectFallback(state, next);

  // React 19 hace requestFormReset() después de cada form action, incluso si
  // falla. Para preservar lo que el usuario ya escribió (loss aversion +
  // Forgiveness lens) controlamos los inputs no-sensibles vía useState. Solo
  // password se vacía tras error, que es lo deseable por seguridad.
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Reset solo del password tras un error del server.
  useEffect(() => {
    if (state && !state.ok) setPassword("");
  }, [state]);

  const usernameInvalid = username.length > 0 && !USERNAME_RE.test(username);
  const strength = useMemo(() => passwordStrength(password), [password]);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
      {next && <input type="hidden" name="next" value={next} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FieldLabel label="Nombre" error={f?.displayName?.[0]}>
          <input
            name="displayName"
            required
            placeholder="Tu nombre"
            autoComplete="name"
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={inp}
          />
        </FieldLabel>
        <FieldLabel
          label="Usuario"
          hint={USERNAME_HINT}
          error={f?.username?.[0] ?? (usernameInvalid ? USERNAME_HINT : undefined)}
        >
          <input
            name="username"
            required
            placeholder="vicente_uio"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={usernameInvalid || Boolean(f?.username?.[0])}
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inp}
        />
      </FieldLabel>

      <FieldLabel label="Contraseña" error={f?.password?.[0]}>
        <PasswordInput
          name="password"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword((s) => !s)}
          autoComplete="new-password"
          minHint="Mínimo 8 caracteres, con letras y números"
        />
        {password.length > 0 && <PasswordStrengthBar level={strength} />}
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

      <SignupLegalConsent />

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
  // Preservamos el email tipeado para pre-llenarlo en /forgot-password si el
  // user clickea "¿Olvidaste tu contraseña?".
  const [email, setEmail] = useState("");
  useAuthRedirectFallback(state, next);

  const forgotHref = email
    ? `/forgot-password?email=${encodeURIComponent(email)}`
    : "/forgot-password";

  // Preservar email tras error: Loss Aversion + Forgiveness. Re-tipear el
  // correo después de un typo de contraseña es fricción innecesaria
  // (auditoría MAT-45 B3). Solo limpiamos password tras error.
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state && !state.ok) setPassword("");
  }, [state]);

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
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inp}
        />
      </FieldLabel>

      <FieldLabel label="Contraseña" error={f?.password?.[0]}>
        <PasswordInput
          name="password"
          value={password}
          onChange={setPassword}
          show={showPassword}
          onToggle={() => setShowPassword((s) => !s)}
          autoComplete="current-password"
        />
      </FieldLabel>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -2 }}>
        <a
          href={forgotHref}
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            color: "var(--primary)",
            textDecoration: "none",
          }}
        >
          ¿Olvidaste tu contraseña?
        </a>
      </div>

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

      <div
        style={{
          textAlign: "center",
          fontSize: 10.5,
          color: "var(--muted-fg)",
          marginTop: 2,
        }}
      >
        Te recordamos en este dispositivo por 30 días.
      </div>

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

function PasswordInput({
  name,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  minHint,
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: "new-password" | "current-password";
  minHint?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        placeholder="••••••••"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={autoComplete === "new-password" ? 8 : undefined}
        style={{ ...inp, paddingRight: 40 }}
        aria-describedby={minHint ? `${name}-hint` : undefined}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={show}
        style={{
          position: "absolute",
          top: "50%",
          right: 6,
          transform: "translateY(-50%)",
          width: 30,
          height: 30,
          borderRadius: 6,
          background: "transparent",
          border: 0,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted-fg)",
        }}
      >
        <Icon name={show ? "eye-off" : "eye"} size={15} />
      </button>
      {minHint && (
        <span id={`${name}-hint`} style={{ display: "none" }}>
          {minHint}
        </span>
      )}
    </div>
  );
}

type StrengthLevel = 0 | 1 | 2 | 3;

// Heurística simple para no inflar el bundle: score basado en longitud y
// diversidad de clases de caracteres (minúscula/mayúscula/dígito/símbolo).
// No reemplaza una librería tipo zxcvbn — solo da un signal visual rápido
// para feedback durante la captura. El gate real lo hace PasswordSchema.
function passwordStrength(pw: string): StrengthLevel {
  if (pw.length === 0) return 0;
  if (pw.length < 8) return 1;
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^A-Za-z0-9]/.test(pw)) classes++;
  if (pw.length >= 12 && classes >= 3) return 3;
  if (classes >= 2) return 2;
  return 1;
}

function PasswordStrengthBar({ level }: { level: StrengthLevel }) {
  const labels = ["", "Débil", "Media", "Fuerte"];
  const colors = ["transparent", "#dc2626", "#f59e0b", "#10b981"];
  return (
    <div style={{ marginTop: 4 }}>
      <div
        aria-hidden
        style={{ display: "flex", gap: 4, height: 4, borderRadius: 2, overflow: "hidden" }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              background: i <= level ? colors[level] : "rgba(0,0,0,0.08)",
              transition: "background 180ms",
            }}
          />
        ))}
      </div>
      {level > 0 && (
        <span
          aria-live="polite"
          style={{
            fontSize: 10.5,
            color: colors[level],
            fontWeight: 700,
            marginTop: 4,
            display: "inline-block",
          }}
        >
          {labels[level]}
        </span>
      )}
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

// Aviso contextual (no es error de submit). Tono ámbar. Se muestra sobre el
// formulario — ej. cuando el proxy cierra la sesión por suspensión y manda
// ?suspended=1, o cualquier mensaje informativo que abra el modal.
function NoticeBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: 8,
        background: "#fffbeb",
        border: "1px solid #fde68a",
        color: "#92400e",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.45,
      }}
    >
      {message}
    </div>
  );
}

// LOPDP exige consentimiento informado y explícito antes de procesar datos
// personales. Esta línea se renderiza inmediatamente debajo del CTA "Crear
// cuenta gratis" para que el usuario que se registra con email vea los
// términos sin tener que scrollear o cerrar el modal.
function SignupLegalConsent() {
  return (
    <div
      style={{
        fontSize: 10.5,
        lineHeight: 1.5,
        color: "var(--muted-fg)",
        textAlign: "center",
        marginTop: 2,
      }}
    >
      Al crear tu cuenta aceptas nuestros{" "}
      <a
        href="/legal/terminos"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#0a0a0a", textDecoration: "underline", fontWeight: 700 }}
      >
        Términos
      </a>{" "}
      y{" "}
      <a
        href="/legal/privacidad"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#0a0a0a", textDecoration: "underline", fontWeight: 700 }}
      >
        Política de Privacidad
      </a>
      .
    </div>
  );
}

