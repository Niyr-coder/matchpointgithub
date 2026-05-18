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

type PaywallFn = (t: PaywallTrigger) => void;
const PaywallCtx = createContext<PaywallFn | null>(null);

export function usePaywall(): PaywallFn {
  const fn = useContext(PaywallCtx);
  if (!fn) throw new Error("usePaywall must be used inside <PublicChrome>");
  return fn;
}

function AuthFromQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = params.get("auth");
  const next = params.get("next") ?? undefined;
  const initial: AuthMode | null = raw === "signin" || raw === "signup" ? raw : null;
  const [open, setOpen] = useState<AuthMode | null>(initial);

  useEffect(() => {
    if (initial) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth");
      router.replace(url.pathname + (url.search || ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;
  return <AuthModal mode={open} next={next} onClose={() => setOpen(null)} />;
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
    <PaywallCtx.Provider value={setPaywall}>
      <Nav onPaywall={setPaywall} auth={auth} />
      {children}
      <Footer />
      {paywall && <Paywall trigger={paywall} onClose={() => setPaywall(null)} />}
      <Suspense fallback={null}>
        <AuthFromQuery />
      </Suspense>
    </PaywallCtx.Provider>
  );
}
