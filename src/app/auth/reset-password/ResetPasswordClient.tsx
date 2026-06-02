"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { Icon } from "@/components/Icon";
import { getBrowserClient } from "@/lib/db/client.browser";
import { updatePasswordFromForm } from "@/server/actions/auth";
import { AuthError as AuthErrorBanner } from "@/app/(auth)/_components/AuthError";
import { AuthField } from "@/app/(auth)/_components/AuthField";
import type { ActionResult } from "@/lib/api/action";

type State = ActionResult<{ ok: true }> | null;

type Status = "checking" | "ready" | "invalid";

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

export function ResetPasswordClient({ serverError }: { serverError: string | null }) {
  const [status, setStatus] = useState<Status>(serverError ? "invalid" : "checking");
  const [bootstrapError, setBootstrapError] = useState<string | null>(serverError);
  const [state, formAction, pending] = useActionState<State, FormData>(
    updatePasswordFromForm,
    null,
  );

  // Si no vino ?code el page lo dejó en "checking". El SDK del browser puede
  // levantar la sesión desde tres lugares:
  //   1) Hash `#access_token=…&type=recovery` (flow implícito de Supabase v1
  //      verify, que es lo que devuelve `admin.generateLink` y los templates
  //      de Supabase por default). `@supabase/ssr` NO parsea hash
  //      automáticamente, así que lo hacemos a mano con `setSession`.
  //   2) Sesión recovery ya persistida en cookies (segundo viaje).
  //   3) `?code=` que ya fue intercambiado server-side en `page.tsx`.
  useEffect(() => {
    if (status !== "checking") return;
    const supabase = getBrowserClient();
    let cancelled = false;

    async function check() {
      try {
        const hash = window.location.hash;
        if (hash.includes("access_token") && hash.includes("type=recovery")) {
          const hashParams = new URLSearchParams(hash.slice(1));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");
          if (access_token && refresh_token) {
            const { error } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            });
            if (cancelled) return;
            if (error) {
              console.error("[reset-password] setSession failed", error.message);
              setBootstrapError(
                "Tu enlace ya no es válido. Es probable que haya expirado o se haya usado.",
              );
              setStatus("invalid");
              return;
            }
            // Limpiamos el hash para que un refresh no vuelva a procesarlo.
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
            setStatus("ready");
            return;
          }
        }

        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setStatus("ready");
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
        const second = await supabase.auth.getSession();
        if (cancelled) return;
        if (second.data.session) {
          setStatus("ready");
        } else {
          setBootstrapError(
            "Tu enlace ya no es válido. Es probable que haya expirado o se haya usado.",
          );
          setStatus("invalid");
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[reset-password] session check failed", e);
        setBootstrapError(
          "No pudimos validar tu enlace. Solicita uno nuevo.",
        );
        setStatus("invalid");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const f = state && !state.ok ? state.error.fields : undefined;

  return (
    <div
      className="card"
      style={{ width: "100%", maxWidth: 460, overflow: "hidden", padding: 0 }}
    >
      <Hero />
      <div style={{ padding: 24 }}>
        {status === "checking" && <Checking />}
        {status === "invalid" && <InvalidLink message={bootstrapError ?? ""} />}
        {status === "ready" && (
          <form
            action={formAction}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <p style={{ fontSize: 13, color: "var(--muted-fg)", margin: 0 }}>
              Crea una nueva contraseña. Mínimo 8 caracteres, con letras y
              números.
            </p>

            <AuthField
              label="Nueva contraseña"
              hint="Mínimo 8 caracteres, con letras y números"
              error={f?.password?.[0]}
            >
              <input
                name="password"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                autoComplete="new-password"
                autoFocus
                style={inp}
              />
            </AuthField>

            <AuthField label="Confirma la contraseña" error={f?.confirm?.[0]}>
              <input
                name="confirm"
                type="password"
                required
                minLength={8}
                placeholder="••••••••"
                autoComplete="new-password"
                style={inp}
              />
            </AuthField>

            {state && !state.ok && (
              <AuthErrorBanner message={state.error.message} />
            )}

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
              <Icon name="log-in" size={14} color="#fff" />
              {pending ? "Guardando..." : "Actualizar contraseña"}
            </button>
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
        NEW
      </div>
      <div className="label-mp" style={{ color: "rgba(255,255,255,0.7)" }}>
        ● Restablece tu contraseña
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
        Nueva contraseña
        <span style={{ color: "#fbbf24" }}>.</span>
      </h2>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
        Elige una que recuerdes — esta vez sí.
      </div>
    </div>
  );
}

function Checking() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "16px 0",
        color: "var(--muted-fg)",
        fontSize: 13,
      }}
    >
      Validando tu enlace…
    </div>
  );
}

function InvalidLink({ message }: { message: string }) {
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
          background: "#fef2f2",
          border: "1px solid #fecaca",
          margin: "4px auto 0",
        }}
      >
        <Icon name="x" size={22} color="#dc2626" />
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
        Enlace no válido
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
        {message ||
          "Tu enlace ya no es válido. Es probable que haya expirado o se haya usado."}
      </p>
      <Link
        href="/forgot-password"
        className="lp-btn lp-btn-primary"
        style={{
          width: "100%",
          justifyContent: "center",
          textDecoration: "none",
        }}
      >
        Solicita uno nuevo
      </Link>
    </div>
  );
}
