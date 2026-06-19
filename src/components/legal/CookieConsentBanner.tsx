"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  acceptCookieConsent,
  hasCookieConsent,
} from "@/lib/legal/compliance";

/** Banner de cookies esenciales (LOPDP). Una vez por dispositivo hasta limpiar storage. */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasCookieConsent()) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    acceptCookieConsent();
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-desc"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 210,
        padding: "12px 16px max(12px, env(safe-area-inset-bottom))",
        background: "rgba(10,10,10,0.96)",
        borderTop: "1px solid rgba(16,185,129,0.35)",
        color: "#fff",
        boxShadow: "0 -12px 40px rgba(0,0,0,0.25)",
        animation: "mpToastIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: "1 1 280px" }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(16,185,129,0.2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="cookie" size={16} color="#6ee7b7" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div id="cookie-consent-title" style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
              Usamos cookies esenciales
            </div>
            <p
              id="cookie-consent-desc"
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.45,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              Las usamos para mantener tu sesión, recordar preferencias básicas y proteger la cuenta.
              No usamos cookies publicitarias de terceros. Más detalle en nuestra{" "}
              <Link
                href="/legal/privacidad"
                style={{ color: "#6ee7b7", fontWeight: 700, textDecoration: "underline" }}
              >
                Política de Privacidad
              </Link>
              .
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="lp-btn lp-btn-primary"
          style={{
            flexShrink: 0,
            padding: "10px 18px",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
