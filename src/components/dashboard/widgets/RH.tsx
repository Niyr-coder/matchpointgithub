// Widgets compartidos por todos los RoleHomes — RHWelcome, RHKpi, RHPanel.
// Migrado 1:1 desde ui_kits/dashboard/RoleHomes.jsx (líneas 1-51).
import type { ReactNode } from "react";
import { MP_ROLES, type RoleKey } from "@/lib/roles";

const RH_TILE = {
  padding: 20,
  borderRadius: 14.4,
  background: "#fff",
  border: "1px solid var(--border)",
} as const;

export function RHWelcome({
  role,
  userName,
  contextLabel,
}: {
  role: RoleKey;
  userName?: string | null;
  contextLabel?: string | null;
}) {
  const r = MP_ROLES[role];
  const firstName = (userName ?? r.ctx).split(" ")[0] || "tú";
  const showContext = !!contextLabel;
  return (
    <div
      style={{
        position: "relative",
        padding: "26px 28px",
        borderRadius: 14.4,
        overflow: "hidden",
        background: `linear-gradient(135deg, #0a0a0a 0%, ${r.color} 140%)`,
        color: "#fff",
      }}
    >
      <div
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
          transform: "rotate(-6deg) translate(15%, -20%)",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        {r.badge.slice(0, 4)}
      </div>
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 11px",
              borderRadius: 9999,
              background: "rgba(255,255,255,0.12)",
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
            }}
          >
            ● {r.badge}
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: 38,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              margin: "8px 0 4px",
              lineHeight: 1,
            }}
          >
            Hola, {firstName}
            <span style={{ color: "#fbbf24" }}>.</span>
          </h1>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", maxWidth: 540, lineHeight: 1.5 }}>
            {r.desc}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {showContext && (
            <>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                Contexto
              </div>
              <div
                className="font-heading"
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  marginTop: 4,
                  letterSpacing: "-0.02em",
                }}
              >
                {contextLabel}
              </div>
            </>
          )}
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            {new Date().toLocaleDateString("es-EC", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RHKpi({
  label,
  value,
  sub,
  delta,
  deltaPos,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: string;
  deltaPos?: boolean;
  accent?: string;
}) {
  return (
    <div style={RH_TILE}>
      <div className="label-mp">{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <div
          className="font-heading tabular"
          style={{
            fontSize: 30,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: "-0.03em",
            color: accent || "#0a0a0a",
          }}
        >
          {value}
        </div>
        {delta && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: deltaPos ? "var(--primary)" : "#dc2626",
            }}
          >
            {delta}
          </div>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

export function RHPanel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={RH_TILE}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h2
          className="font-heading"
          style={{
            fontSize: 16,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          {title}
          <span style={{ color: "var(--primary)" }}>.</span>
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}
