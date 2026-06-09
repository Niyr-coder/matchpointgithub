"use client";
// Pantalla de ventas de MATCHPOINT+ (landing premium/aspiracional). Migrada 1:1
// del prototipo (ui_kits/dashboard/MatchPointPlusScreen.jsx): hero + pricing
// toggle + features + comparación Free vs MP+ + testimonios + FAQ + CTA final.
// data-lucide → <Icon>, window.mpToast → useToast.
//
// Modelo real: MATCHPOINT+ cuesta USD 6.99/mes y se activa con comprobante
// manual por transferencia o DeUna. No hay trial, tarjeta ni recurrencia.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  MP_PLUS_CORE_BENEFITS,
  MP_PLUS_PLAN,
} from "@/lib/marketing/mp-plus";

const COMPARE = [
  { l: "Roster máximo en Teams", free: "12", plus: "24" },
  { l: "Invitaciones pendientes de team", free: "3", plus: "Sin tope definido" },
  { l: "Cambios de nombre de team", free: "2", plus: "5" },
  { l: "Coach AI", free: "Vista bloqueada", plus: "Vista previa / early access" },
  { l: "Historial público de perfil", free: "Limitado", plus: "Completo" },
  { l: "Badge de plan", free: "—", plus: "MATCHPOINT+" },
  { l: "Pago", free: "—", plus: "Transferencia o DeUna" },
];

const USE_CASES = [
  { icon: "users", title: "Capitanes de teams", text: "Más espacio para roster, invitaciones y cambios de nombre cuando tu equipo crece." },
  { icon: "sparkles", title: "Coach AI temprano", text: "Acceso a la vista previa para probar la experiencia mientras llega el backend real." },
  { icon: "line-chart", title: "Más contexto deportivo", text: "Historial público de perfil completo y superficies preparadas para insights avanzados." },
];

const FAQS = [
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. Sin penalidad. Conservas los beneficios hasta la fecha de vencimiento de tu ciclo activo.",
  },
  {
    q: "¿Cómo pago MATCHPOINT+?",
    a: "Solicitas el plan en Mi plan, pagas por transferencia o DeUna, subes el comprobante y el equipo lo aprueba manualmente.",
  },
  {
    q: "¿Se cobra automáticamente cada mes?",
    a: "No. No hay tarjeta ni cobro recurrente. Cada renovación es una solicitud nueva con comprobante.",
  },
  {
    q: "¿Qué pasa con mis datos si cancelo?",
    a: "Tu cuenta de jugador no cambia. Los beneficios de MATCHPOINT+ se desactivan cuando termina el ciclo pagado.",
  },
  {
    q: "¿MATCHPOINT+ reemplaza la membresía de mi club?",
    a: "No. MATCHPOINT+ es de la plataforma. La membresía del club es aparte (canchas y beneficios del club).",
  },
  {
    q: "¿Cuánto cuesta?",
    a: `El precio vigente es ${MP_PLUS_PLAN.priceLabel}. Puedes solicitar 1, 3 o 12 meses desde Mi plan según el monto del comprobante.`,
  },
];

const money = (c: number) => "USD " + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);

export function MpPlusSalesView() {
  const toast = useToast();
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState(0);

  const startUpgrade = () => {
    router.push("/dashboard/user/mi-plan?upgrade=premium");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* HERO */}
      <div className="mp-mpplus-hero" style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #022c22 60%, #064e3b 100%)", color: "#fff" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 88% 30%, rgba(16,185,129,0.30), transparent 55%), radial-gradient(circle at 10% 80%, rgba(16,185,129,0.10), transparent 50%)", pointerEvents: "none" }} />
        <div aria-hidden className="mp-mpplus-hero-watermark" style={{ position: "absolute", top: -40, right: -40, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 420, color: "rgba(16,185,129,0.06)", letterSpacing: "-0.08em", lineHeight: 0.78, pointerEvents: "none", userSelect: "none" }}>+</div>

        <div style={{ position: "relative", maxWidth: 720 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 9999, background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.4)" }}>
            <Icon name="sparkles" size={12} color="#6ee7b7" />
            <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "#34d399" }}>MATCHPOINT+ de la plataforma</span>
          </div>
          <h1 className="font-heading" style={{ margin: "14px 0 12px", fontSize: "clamp(40px, 6vw, 60px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 0.9 }}>
            MATCHPOINT<span style={{ color: "#10b981" }}>+</span>
            <br />
            Más margen para tu juego<span style={{ color: "#34d399" }}>.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,0.82)", maxWidth: 580 }}>
            Teams con límites más amplios, historial público completo y Coach AI en vista previa. Todo con pago manual, sin tarjeta ni cobro automático.
          </p>

          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span className="font-heading" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{money(MP_PLUS_PLAN.priceCents)}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>/mes</span>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" style={{ background: "#10b981", color: "#fff", padding: "13px 22px", fontSize: 13 }} onClick={startUpgrade}>
              <Icon name="sparkles" size={14} color="#fff" /> {MP_PLUS_PLAN.requestCta}
            </button>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)" }}>{MP_PLUS_PLAN.paymentShort}</span>
          </div>
        </div>
      </div>

      {/* FEATURES GRID */}
      <div>
        <div style={{ marginBottom: 16, maxWidth: 720 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Qué incluye</div>
          <h2 className="font-heading" style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            Beneficios reales del plan<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted-fg)" }}>Copy alineado a lo que existe hoy o está claramente marcado como vista previa.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {MP_PLUS_CORE_BENEFITS.map((f) => (
            <div key={f.title} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 14.4, background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={f.icon} size={18} color="#047857" />
              </span>
              <div>
                <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                  {f.title}
                  <span className="dot">.</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.45 }}>{f.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* COMPARACIÓN */}
      <div>
        <div style={{ marginBottom: 16, maxWidth: 600 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Comparación</div>
          <h2 className="font-heading" style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            Free vs MATCHPOINT<span style={{ color: "var(--primary)" }}>+</span>
            <span className="dot">.</span>
          </h2>
        </div>
      <div className="card mp-mpplus-compare" style={{ overflow: "hidden" }}>
          <div className="mp-mpplus-compare-head">
            <div style={{ padding: "16px 18px" }}>
              <span className="label-mp">Característica</span>
            </div>
            <div style={{ padding: "16px 18px", borderLeft: "1px solid var(--border)", textAlign: "center" }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted-fg)" }}>Free</div>
              <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 4 }}>$0</div>
            </div>
            <div style={{ padding: "16px 18px", borderLeft: "1px solid var(--border)", textAlign: "center", background: "rgba(16,185,129,0.06)" }}>
              <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--primary)" }}>● MATCHPOINT+</div>
              <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, marginTop: 4, color: "#0a0a0a" }}>
                {money(MP_PLUS_PLAN.priceCents)}
                <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>/mes</span>
              </div>
            </div>
          </div>
          {COMPARE.map((c, i) => (
            <div key={c.l} className="mp-mpplus-compare-row" style={{ borderBottom: i < COMPARE.length - 1 ? "1px solid var(--border)" : 0 }}>
              <div style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600 }}>{c.l}</div>
              <div className="mp-mpplus-compare-free" style={{ padding: "14px 18px", borderLeft: "1px solid var(--border)", textAlign: "center", fontSize: 12.5, color: c.free === "—" ? "var(--muted-fg)" : "#0a0a0a" }}>{c.free}</div>
              <div className="mp-mpplus-compare-plus" style={{ padding: "14px 18px", borderLeft: "1px solid var(--border)", textAlign: "center", background: "rgba(16,185,129,0.03)", fontSize: 12.5, fontWeight: 800, color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="check" size={13} color="var(--primary)" />
                {c.plus}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CASOS DE USO */}
      <div>
        <div style={{ marginBottom: 16, maxWidth: 620 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Casos de uso</div>
          <h2 className="font-heading" style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            Dónde se nota MATCHPOINT+<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {USE_CASES.map((item) => (
            <div key={item.title} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={item.icon} size={16} color="#047857" />
              </span>
              <div>
                <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>{item.title}</div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div>
        <div style={{ marginBottom: 16, maxWidth: 620 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● FAQ</div>
          <h2 className="font-heading" style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            Preguntas frecuentes<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
        </div>
        <div className="card" style={{ overflow: "hidden" }}>
          {FAQS.map((f, i) => {
            const open = openFaq === i;
            return (
              <button key={f.q} onClick={() => setOpenFaq(open ? -1 : i)} style={{ width: "100%", padding: "16px 20px", background: "transparent", border: 0, borderBottom: i < FAQS.length - 1 ? "1px solid var(--border)" : 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#0a0a0a" }}>{f.q}</span>
                  <Icon name={open ? "minus" : "plus"} size={16} color="var(--muted-fg)" style={{ flexShrink: 0 }} />
                </div>
                {open && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.55 }}>{f.a}</p>}
              </button>
            );
          })}
        </div>
      </div>

      {/* FINAL CTA */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #022c22 100%)", color: "#fff", padding: "36px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 80% 50%, rgba(16,185,129,0.22), transparent 55%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", maxWidth: 480 }}>
          <div className="label-mp" style={{ color: "#34d399" }}>● Empieza hoy</div>
          <h2 className="font-heading" style={{ margin: "8px 0 8px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            Solicita por USD 6.99
            <br />
            con pago manual<span className="dot">.</span>
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>{MP_PLUS_PLAN.paymentHint}</p>
        </div>
        <button className="btn" style={{ position: "relative", background: "#10b981", color: "#fff", padding: "14px 24px", fontSize: 14 }} onClick={startUpgrade}>
          <Icon name="sparkles" size={14} color="#fff" /> {MP_PLUS_PLAN.requestCta}
        </button>
      </div>
    </div>
  );
}
