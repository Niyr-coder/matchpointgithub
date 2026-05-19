// Nav — landing top bar. v2 mobile floating.
// Desktop (≥768px): banner negro + sticky nav full-width (sin cambios respecto
// a la versión previa, salvo el wrapper `hidden md:block`).
// Mobile (<768px): pill flotante con backdrop-blur, solo logo + hamburguesa
// + CTA primario. Los 4 links y la auth completa viven en un sheet que abre
// al tap. El banner "370/500 cupos" se convierte en chip dentro del sheet
// para no robar verticales al hero en pantallas chicas.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";
import type { PaywallTrigger } from "./Paywall";

export type NavAuth = {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

type Props = {
  onPaywall: (t: PaywallTrigger) => void;
  auth: NavAuth | null;
};

const ITEMS = [
  { k: "/clubes", l: "Clubes" },
  { k: "/eventos", l: "Eventos" },
  { k: "/coaches", l: "Coaches" },
  { k: "/ranking", l: "Ranking" },
];

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Nav({ onPaywall: _onPaywall, auth }: Props) {
  const pathname = usePathname() || "/";
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAuthed = auth != null;

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  // Cerrar sheet al cambiar de ruta (tap en un link la dispara).
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* ====================================================================
          DESKTOP (≥768px) — barra flotante glass oscuro, mismo estilo que
          mobile pero con los 4 nav links + ambos auth CTAs visibles. Sin
          banner negro arriba (decisión del user). Centrada con max-w 1280
          + margen lateral. Contenedor ::before+::after no aplican aquí; el
          backdrop-blur va directo en la nav.
          ==================================================================== */}
      <div className="hidden md:block">
        <nav
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            width: "calc(100% - 24px)",
            maxWidth: 1280,
            zIndex: 100,
            background: "rgba(10,10,10,0.55)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 36px rgba(0,0,0,0.25)",
            padding: "10px 14px 10px 22px",
            display: "flex",
            alignItems: "center",
            gap: 28,
            color: "#fff",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              color: "#fff",
            }}
          >
            <span style={{ color: "var(--primary)", fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
              ●
            </span>
            <span
              className="font-heading"
              style={{ fontWeight: 900, letterSpacing: "-0.02em", fontSize: 20 }}
            >
              MATCHPOINT
            </span>
          </Link>
          <div style={{ display: "flex", gap: 4, alignItems: "center", flex: 1 }}>
            {ITEMS.map((it) => {
              const active = pathname.startsWith(it.k);
              return (
                <Link
                  key={it.k}
                  href={it.k}
                  className="mp-nav-link-dark"
                  data-active={active ? "true" : "false"}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 9999,
                    fontWeight: active ? 900 : 700,
                    fontSize: 12.5,
                    textDecoration: "none",
                    transition: "background 180ms var(--ease-out), color 180ms var(--ease-out)",
                  }}
                >
                  {it.l}
                </Link>
              );
            })}
          </div>

          {isAuthed && auth ? (
            <Link
              href="/dashboard/user"
              className="mp-liquid-cta"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.15)",
                  color: "#fff",
                  fontSize: 9.5,
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  backgroundImage: auth.avatarUrl ? `url(${auth.avatarUrl})` : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  zIndex: 1,
                }}
              >
                {!auth.avatarUrl && avatarInitials(auth.displayName)}
              </span>
              Mi dashboard
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9999,
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  background: "transparent",
                  color: "#fff",
                  border: "1.5px solid rgba(255,255,255,0.3)",
                  cursor: "pointer",
                  transition: "border-color 200ms var(--ease-out), background 200ms var(--ease-out)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.7)";
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className="mp-liquid-cta"
              >
                Crear cuenta
              </button>
            </>
          )}
        </nav>
      </div>

      {/* ====================================================================
          MOBILE (<768px) — barra flotante glass + sheet hamburguesa.
          La barra es fixed y NO reserva layout: el hero arranca pegado al
          top y la barra flota encima con backdrop-blur. El hero tiene su
          propio pt-22 (88px) para que el h1 no quede tapado por la barra.
          ==================================================================== */}
      <div className="md:hidden">
        {/* Backdrop: siempre montado para que opacity transitions funcionen
            en enter Y exit. pointer-events solo cuando está abierto. */}
        <div
          aria-hidden={!mobileOpen}
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 150,
            background: "rgba(0,0,0,0.45)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? "auto" : "none",
            transition: "opacity 240ms var(--ease-out)",
          }}
        />

        {/* Bar: z-index 300 para quedar SOBRE el sheet — el hamburger morphed
            a X tiene que seguir siendo tocable para cerrar. */}
        <nav
          style={{
            position: "fixed",
            top: 12,
            left: 8,
            right: 8,
            zIndex: 300,
            background: "rgba(10,10,10,0.55)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), 0 10px 36px rgba(0,0,0,0.25)",
            padding: "8px 8px 8px 18px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: 60,
            color: "#fff",
          }}
        >
          <Link
            href="/"
            className="mp-press"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              textDecoration: "none",
              color: "#fff",
            }}
          >
            <span style={{ color: "var(--primary)", fontSize: 18, fontWeight: 900, lineHeight: 1 }}>
              ●
            </span>
            <span
              className="font-heading"
              style={{ fontWeight: 900, letterSpacing: "-0.02em", fontSize: 15 }}
            >
              MATCHPOINT
            </span>
          </Link>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
            className="mp-press"
            style={{
              width: 38,
              height: 38,
              borderRadius: 9999,
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                position: "relative",
                width: 18,
                height: 14,
                display: "inline-block",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: mobileOpen ? "50%" : "30%",
                  width: 18,
                  height: 2,
                  background: "#fff",
                  borderRadius: 2,
                  transformOrigin: "center",
                  transform: mobileOpen
                    ? "translateY(-50%) rotate(45deg)"
                    : "translateY(-50%) rotate(0deg)",
                  transition:
                    "top 240ms var(--ease-out), transform 240ms var(--ease-out)",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: mobileOpen ? "50%" : "70%",
                  width: 18,
                  height: 2,
                  background: "#fff",
                  borderRadius: 2,
                  transformOrigin: "center",
                  transform: mobileOpen
                    ? "translateY(-50%) rotate(-45deg)"
                    : "translateY(-50%) rotate(0deg)",
                  transition:
                    "top 240ms var(--ease-out), transform 240ms var(--ease-out)",
                }}
              />
            </span>
          </button>

          {isAuthed && auth ? (
            <Link href="/dashboard/user" className="mp-liquid-cta">
              Mi dashboard
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              className="mp-liquid-cta"
            >
              Crear cuenta
            </button>
          )}
        </nav>

        {/* Sheet card: siempre montado. Translate + opacity + scale en transición.
            transform-origin top-right para que parezca "salir" del hamburger. */}
        <div
          role="dialog"
          aria-modal={mobileOpen}
          aria-hidden={!mobileOpen}
          style={{
            position: "fixed",
            top: 80,
            left: 8,
            right: 8,
            zIndex: 200,
            background: "#fff",
            borderRadius: 18,
            padding: 16,
            boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
            opacity: mobileOpen ? 1 : 0,
            transform: mobileOpen
              ? "translateY(0) scale(1)"
              : "translateY(-8px) scale(0.97)",
            transformOrigin: "top right",
            pointerEvents: mobileOpen ? "auto" : "none",
            transition: mobileOpen
              ? "opacity 240ms var(--ease-out), transform 380ms var(--ease-drawer)"
              : "opacity 200ms var(--ease-out), transform 240ms var(--ease-out)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {ITEMS.map((it, i) => {
              const active = pathname.startsWith(it.k);
              return (
                <Link
                  key={it.k}
                  href={it.k}
                  className="mp-nav-link"
                  data-active={active ? "true" : "false"}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    fontWeight: active ? 900 : 700,
                    fontSize: 15,
                    textDecoration: "none",
                    opacity: mobileOpen ? 1 : 0,
                    transform: mobileOpen ? "translateY(0)" : "translateY(6px)",
                    transition: mobileOpen
                      ? `opacity 280ms var(--ease-out) ${80 + i * 40}ms, transform 280ms var(--ease-out) ${80 + i * 40}ms`
                      : "opacity 160ms var(--ease-out), transform 160ms var(--ease-out)",
                  }}
                >
                  {it.l}
                </Link>
              );
            })}
          </div>

          <div style={{ height: 1, background: "var(--border)", margin: "14px 0" }} />

          {isAuthed && auth ? (
            <Link
              href="/dashboard/user"
              className="lp-btn lp-btn-primary"
              style={{ width: "100%", textDecoration: "none" }}
              onClick={() => setMobileOpen(false)}
            >
              Mi dashboard
            </Link>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                className="lp-btn lp-btn-outline"
                style={{ width: "100%" }}
                onClick={() => {
                  setMobileOpen(false);
                  setAuthMode("signin");
                }}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                className="lp-btn lp-btn-primary"
                style={{ width: "100%" }}
                onClick={() => {
                  setMobileOpen(false);
                  setAuthMode("signup");
                }}
              >
                Crear cuenta
              </button>
            </div>
          )}

          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 12,
              fontSize: 11.5,
              fontWeight: 800,
              textAlign: "center",
              letterSpacing: "0.04em",
            }}
          >
            {isAuthed && auth ? (
              <>
                <span style={{ color: "var(--primary)" }}>●</span> Bienvenido de vuelta,{" "}
                {auth.displayName.split(" ")[0]}
              </>
            ) : (
              <>
                <span style={{ color: "var(--primary)" }}>●</span> Acceso anticipado · 370/500
                cupos gratis
              </>
            )}
          </div>
        </div>
      </div>

      {authMode && (
        <AuthModal
          mode={authMode}
          next="/dashboard/user"
          onClose={() => setAuthMode(null)}
        />
      )}
    </>
  );
}
