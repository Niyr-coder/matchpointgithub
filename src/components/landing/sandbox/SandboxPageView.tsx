// /sandbox — migrado 1:1 desde MATCHPOINT Public.html (793-872)
"use client";
import Link from "next/link";
import { Fragment } from "react";
import { Icon } from "@/components/Icon";

const KPIS = [
  { l: "Revenue hoy", v: "$1,842", sub: "+18% vs ayer", c: "var(--primary)" },
  { l: "Ocupación", v: "78%", sub: "24 / 32 horas reservadas", c: "#0a0a0a" },
  { l: "Socios activos", v: "486", sub: "+12 este mes", c: "#0ea5e9" },
  { l: "Rating club", v: "4.9 ★", sub: "312 reseñas", c: "#fbbf24" },
] as const;

const HOURS = ["07", "09", "11", "17", "19", "21"];
const COURTS = ["C1", "C2", "C3", "C4"];

type CellState = "event" | "reserved" | "free" | "class";
const STATE_STYLES: Record<CellState, { bg: string; fg: string; label: string }> = {
  event: { bg: "#fef3c7", fg: "#92400e", label: "EVT" },
  reserved: { bg: "var(--primary)", fg: "#fff", label: "BOOK" },
  free: { bg: "#fff", fg: "var(--muted-fg)", label: "—" },
  class: { bg: "#7c3aed", fg: "#fff", label: "CLASE" },
};

const PAYOUT_BREAKDOWN = [
  ["Revenue", "$14,840"],
  ["Comisión MP", "–$1,484"],
  ["Pagos staff", "–$3,820"],
] as const;

function cellState(hi: number, c: number): CellState {
  const r = (hi * 7 + c * 13) % 6;
  if (r === 0) return "event";
  if (r < 2) return "reserved";
  if (r < 4) return "free";
  if (r === 4) return "class";
  return "reserved";
}

export function SandboxPageView() {
  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 89,
          zIndex: 50,
          padding: "12px 0",
          background: "linear-gradient(90deg, #fbbf24, #f59e0b)",
          color: "#0a0a0a",
          textAlign: "center",
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: "0.05em",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 10px",
            background: "#0a0a0a",
            color: "#fbbf24",
            borderRadius: 9999,
            fontSize: 9.5,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            marginRight: 10,
          }}
        >
          ● MODO DEMO · SOLICITUD RECIBIDA
        </span>
        Te llamamos en 24h · mientras tanto, toca todo lo que quieras ·{" "}
        <Link href="/demo" style={{ color: "#0a0a0a", textDecoration: "underline", fontWeight: 900 }}>
          Agendar llamada ahora →
        </Link>
      </div>

      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-15">
        <div className="label-mp" style={{ color: "var(--primary)" }}>● Sandbox · owner view</div>
        <h1
          className="font-heading"
          style={{
            fontSize: "clamp(2.5rem, 5vw, 4rem)",
            fontWeight: 900,
            letterSpacing: "-0.035em",
            textTransform: "uppercase",
            margin: "8px 0 14px",
            lineHeight: 1,
          }}
        >
          Hola, Andrés<span className="dot">.</span>
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--muted-fg)",
            maxWidth: 540,
            lineHeight: 1.55,
            marginBottom: 28,
          }}
        >
          Vista rápida de Club Norte Pickleball. Para experimentar TODO el dashboard (manager, empleado, partner, coach, admin) abre la versión completa.
        </p>

        <div className="mp-partner-torneo-kpis" style={{ marginBottom: 28 }}>
          {KPIS.map((k) => (
            <div key={k.l} className="card" style={{ padding: 20 }}>
              <div className="label-mp">{k.l}</div>
              <div
                className="font-heading tabular"
                style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 8, color: k.c }}
              >
                {k.v}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="mp-landing-split">
          <div className="card" style={{ padding: 22 }}>
            <h2
              className="font-heading"
              style={{
                fontSize: 18,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "-0.01em",
                margin: "0 0 14px",
              }}
            >
              Calendario · hoy<span className="dot">.</span>
            </h2>
            <div className="mp-sandbox-grid-scroll">
            <div className="mp-sandbox-grid-inner">
            <div style={{ display: "grid", gridTemplateColumns: "60px repeat(4, 1fr)", gap: 4 }}>
              <div />
              {COURTS.map((c) => (
                <div
                  key={c}
                  style={{
                    fontSize: 9.5,
                    fontWeight: 900,
                    textAlign: "center",
                    letterSpacing: "0.14em",
                    color: "var(--muted-fg)",
                    padding: "4px 0",
                  }}
                >
                  {c}
                </div>
              ))}
              {HOURS.map((h, hi) => (
                <Fragment key={h}>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--muted-fg)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      paddingRight: 6,
                    }}
                  >
                    {h}:00
                  </div>
                  {[0, 1, 2, 3].map((c) => {
                    const state = cellState(hi, c);
                    const s = STATE_STYLES[state];
                    return (
                      <div
                        key={c}
                        style={{
                          height: 32,
                          borderRadius: 4,
                          background: s.bg,
                          color: s.fg,
                          fontSize: 9,
                          fontWeight: 900,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: state === "free" ? "1px dashed var(--border)" : "0",
                        }}
                      >
                        {s.label}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 14, fontSize: 11, color: "var(--muted-fg)" }}>
              <span>● <b style={{ color: "#0a0a0a" }}>24 reservas</b></span>
              <span>● <b style={{ color: "#0a0a0a" }}>3 clases</b></span>
              <span>● <b style={{ color: "#0a0a0a" }}>1 evento</b></span>
            </div>
          </div>

          <div className="card" style={{ padding: 22, background: "#0a0a0a", color: "#fff" }}>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>● Payout mañana</div>
            <div
              className="font-heading"
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: "var(--primary)",
                letterSpacing: "-0.035em",
                marginTop: 8,
              }}
            >
              $9,536
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>Banco Pichincha ····5421</div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.15)" }}>
              {PAYOUT_BREAKDOWN.map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    fontSize: 11.5,
                  }}
                >
                  <span style={{ color: "rgba(255,255,255,0.6)" }}>{k}</span>
                  <span style={{ fontWeight: 800 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 36,
            padding: 28,
            background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
            color: "#fff",
            borderRadius: 14.4,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="label-mp" style={{ color: "#fbbf24" }}>● ¿Te gustó?</div>
            <div
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                marginTop: 6,
              }}
            >
              Llévalo a tu club<span style={{ color: "#fbbf24" }}>.</span>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              Esto es 5% del dashboard. Hay 6 roles más con superpoderes propios.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/dashboard"
              className="btn"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                textDecoration: "none",
              }}
            >
              <Icon name="external-link" size={13} />
              Versión completa
            </Link>
            <Link href="/soy-club" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Hablar con MP
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
