// PublicChromeClient — componente client interno que monta Nav + children +
// Footer y maneja el estado de Paywall/AuthModal. Antes este código vivía en
// PublicChrome.tsx; lo extraje para que PublicChrome pueda ser un wrapper
// async server que resuelva la sesión una sola vez por request y la baje al
// Nav (necesario para mostrar "Mi dashboard" en vez de "Iniciar sesión"
// cuando el user ya tiene cookie de Supabase).
"use client";
import {
  Suspense,
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav, type NavAuth } from "./Nav";
import { Footer } from "./Footer";
import { Paywall, type PaywallTrigger } from "./Paywall";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";
import { Icon } from "@/components/Icon";

type PaywallFn = (t: PaywallTrigger) => void;
const PaywallCtx = createContext<PaywallFn | null>(null);

export function usePaywall(): PaywallFn {
  const fn = useContext(PaywallCtx);
  if (!fn) throw new Error("usePaywall must be used inside <PublicChrome>");
  return fn;
}

// Expone la sesión resuelta en el server al árbol del landing para que
// componentes como EventDetailView puedan skip el paywall cuando ya hay
// cookie. null = anonimo, NavAuth = autenticado.
const AuthCtx = createContext<NavAuth | null>(null);

export function useLandingAuth(): NavAuth | null {
  return useContext(AuthCtx);
}

// Toast post-logout: aparece cuando llegamos a /?logout=ok desde
// signOutAndRedirect(). Cierra el feedback loop (Shneiderman #4) tras una
// transición que de otra forma sería silenciosa. Auto-dismiss a 4s; el
// query param se limpia al montar para que un refresh no lo reactive.
function LogoutFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const flag = params.get("logout");
  const [visible, setVisible] = useState(flag === "ok");

  useEffect(() => {
    if (flag !== "ok") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("logout");
    router.replace(url.pathname + (url.search || ""));
    const t = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 220,
        padding: "12px 16px",
        background: "#0a0a0a",
        border: "1px solid rgba(16,185,129,0.4)",
        borderRadius: 12,
        color: "#fff",
        fontSize: 13,
        fontWeight: 700,
        display: "inline-flex",
        gap: 12,
        alignItems: "center",
        boxShadow: "0 16px 40px rgba(0,0,0,0.32)",
        maxWidth: "calc(100vw - 32px)",
        animation: "mpToastIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: "#10b981",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name="check" size={15} color="#fff" />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>Cerraste sesión</div>
        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
          Vuelve cuando quieras.
        </div>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Cerrar aviso"
        style={{
          flexShrink: 0,
          background: "transparent",
          border: 0,
          color: "rgba(255,255,255,0.5)",
          cursor: "pointer",
          padding: 4,
          display: "inline-flex",
        }}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

// Mensaje del modal cuando el proxy cerró la sesión por suspensión y bota al
// landing con ?suspended=1 (vía /login). El proxy ya invalidó la sesión, acá
// solo comunicamos el motivo para cerrar el feedback loop.
const SUSPENDED_NOTICE =
  "Tu cuenta está suspendida y cerramos tu sesión. Si crees que es un error, escríbenos a soporte.";

function AuthFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("auth");
  const next = params.get("next") ?? undefined;
  const suspended = params.get("suspended") === "1";
  // Una suspensión siempre abre el modal en modo signin (es donde el usuario
  // reintentaría entrar), aunque el query `auth` no venga.
  const initial: AuthMode | null =
    raw === "signin" || raw === "signup" ? raw : suspended ? "signin" : null;
  const [open, setOpen] = useState<AuthMode | null>(initial);
  const [notice] = useState<string | undefined>(
    suspended ? SUSPENDED_NOTICE : undefined,
  );

  useEffect(() => {
    if (initial || suspended) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      url.searchParams.delete("suspended");
      router.replace(url.pathname + (url.search || ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  return (
    <AuthModal
      mode={open}
      next={next}
      notice={notice}
      onClose={() => setOpen(null)}
    />
  );
}

export function PublicChromeClient({
  children,
  auth,
}: {
  children: ReactNode;
  auth: NavAuth | null;
}) {
  const [paywall, setPaywall] = useState<PaywallTrigger | null>(null);
  return (
    <AuthCtx.Provider value={auth}>
      <PaywallCtx.Provider value={setPaywall}>
        <Nav onPaywall={setPaywall} auth={auth} />
        {children}
        <Footer />
        {paywall && <Paywall trigger={paywall} onClose={() => setPaywall(null)} />}
        <Suspense fallback={null}>
          <AuthFromQuery />
        </Suspense>
        <Suspense fallback={null}>
          <LogoutFromQuery />
        </Suspense>
      </PaywallCtx.Provider>
    </AuthCtx.Provider>
  );
}
