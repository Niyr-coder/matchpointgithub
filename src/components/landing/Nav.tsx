// Nav — landing top bar.
// Si `auth` es null muestra "Iniciar sesión / Crear cuenta" (abren AuthModal).
// Si `auth` viene seteado (PublicChrome resolvió sesión server-side), muestra
// "Mi dashboard" + avatar/nombre. Evita el bug en que el user ya tiene
// cookie pero los CTAs lo seguían empujando a auth.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  const isAuthed = auth != null;

  return (
    <>
      {/* Banner superior: CTA cambia según sesión */}
      <div
        style={{
          background: "#0a0a0a",
          color: "#fff",
          padding: "8px 0",
          textAlign: "center",
          fontSize: 11.5,
          fontWeight: 800,
          letterSpacing: "0.04em",
        }}
      >
        {isAuthed && auth ? (
          <>
            <span style={{ color: "var(--primary)" }}>●</span>{" "}
            Bienvenido de vuelta, {auth.displayName.split(" ")[0]} ·{" "}
            <Link
              href="/dashboard/user"
              style={{ color: "#fbbf24", textDecoration: "underline" }}
            >
              Ir a tu dashboard
            </Link>
          </>
        ) : (
          <>
            <span style={{ color: "var(--primary)" }}>●</span> Acceso anticipado abierto ·
            370/500 cupos gratis ·{" "}
            <button
              type="button"
              onClick={() => setAuthMode("signup")}
              style={{
                color: "#fbbf24",
                background: "transparent",
                border: 0,
                textDecoration: "underline",
                cursor: "pointer",
                font: "inherit",
                padding: 0,
              }}
            >
              Únete
            </button>
          </>
        )}
      </div>

      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "14px 32px",
            display: "flex",
            alignItems: "center",
            gap: 28,
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              color: "#0a0a0a",
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
                  className="mp-nav-link"
                  style={{
                    padding: "8px 14px",
                    borderRadius: 9999,
                    background: active ? "var(--muted)" : "transparent",
                    color: active ? "#0a0a0a" : "var(--muted-fg)",
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
              className="lp-btn lp-btn-primary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
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
                className="lp-btn lp-btn-outline"
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className="lp-btn lp-btn-primary"
              >
                Crear cuenta
              </button>
            </>
          )}
        </div>
      </nav>

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
