// Nav — landing top bar. "Iniciar sesión" / "Crear cuenta" open the AuthModal.
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AuthModal, type AuthMode } from "@/components/auth/AuthModal";
import type { PaywallTrigger } from "./Paywall";

type Props = { onPaywall: (t: PaywallTrigger) => void };

const ITEMS = [
  { k: "/clubes", l: "Clubes" },
  { k: "/eventos", l: "Eventos" },
  { k: "/coaches", l: "Coaches" },
  { k: "/ranking", l: "Ranking" },
];

export function Nav(_props: Props) {
  const pathname = usePathname() || "/";
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  return (
    <>
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
        <span style={{ color: "var(--primary)" }}>●</span> Acceso anticipado abierto · 370/500 cupos
        gratis ·{" "}
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
                  style={{
                    padding: "8px 14px",
                    borderRadius: 9999,
                    background: active ? "var(--muted)" : "transparent",
                    color: active ? "#0a0a0a" : "var(--muted-fg)",
                    fontWeight: active ? 900 : 700,
                    fontSize: 12.5,
                    textDecoration: "none",
                    transition: "all 0.15s",
                  }}
                >
                  {it.l}
                </Link>
              );
            })}
          </div>
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
        </div>
      </nav>

      {authMode && <AuthModal mode={authMode} onClose={() => setAuthMode(null)} />}
    </>
  );
}
