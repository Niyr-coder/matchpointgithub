"use client";
// Pantalla de ventas de MATCHPOINT+ (landing premium/aspiracional). Migrada 1:1
// del prototipo (ui_kits/dashboard/MatchPointPlusScreen.jsx): hero + pricing
// toggle + features + comparación Free vs MP+ + testimonios + FAQ + CTA final.
// data-lucide → <Icon>, window.mpToast → useToast.
//
// ⚠️ DEMO VISUAL: el modelo de facturación mostrado (prueba 14 días + tarjeta,
// precios $9.99/$79.99, plan anual, IVA 12%, auto-renovación) es del prototipo y
// NO coincide con el modelo real (MP+ = $5/mes, transferencia/DeUna, sin trial,
// sin recurrencia, activación admin). Los CTA solo muestran toast "próximamente"
// (no disparan cobro). Pendiente de adaptar copy/precio al modelo real — ver
// docs/guides/04-placeholders.md y docs/product/00-matchpoint-plus.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

const PRICE_MONTHLY = 999; // cents (demo)
const PRICE_ANNUAL = 7999; // cents (demo)
const SAVINGS_PCT = Math.round((1 - PRICE_ANNUAL / 12 / PRICE_MONTHLY) * 100);

const FEATURES = [
  { icon: "infinity", l: "Quedadas ilimitadas", sub: "Crea todas las que quieras. En Free: 1/mes." },
  { icon: "bar-chart-3", l: "Estadísticas avanzadas", sub: "Heatmaps de cancha, % de victoria por golpe, racha histórica." },
  { icon: "sparkles", l: "Coach AI", sub: "Sube tu match y recibe análisis táctico en 60 seg." },
  { icon: "trophy", l: "Acceso anticipado a torneos", sub: "24h antes que la gente Free. Cupos premium." },
  { icon: "zap", l: "Reserva prioritaria", sub: "Slots premium en clubes asociados, 14 días antes." },
  { icon: "eye-off", l: "Sin anuncios", sub: "Toda la plataforma limpia, todo el tiempo." },
  { icon: "crown", l: "Badge VIP en tu perfil", sub: "Otros jugadores ven que eres miembro Premium." },
  { icon: "phone", l: "Soporte prioritario", sub: "Línea directa con SLA <2h hábiles + llamada agendada." },
];

const COMPARE = [
  { l: "Quedadas que puedes crear", free: "1 / mes", plus: "Ilimitadas" },
  { l: "Estadísticas", free: "Básicas", plus: "Avanzadas + heatmaps" },
  { l: "Coach AI · análisis de partidos", free: "—", plus: "Ilimitado" },
  { l: "Acceso a torneos", free: "Cuando abren", plus: "24h antes" },
  { l: "Reserva con anticipación", free: "7 días", plus: "14 días" },
  { l: "Anuncios", free: "Sí", plus: "Sin anuncios" },
  { l: "Soporte", free: "Email · 24h", plus: "Prioritario <2h + llamada" },
  { l: "Badge VIP en perfil", free: "—", plus: "Sí" },
];

const TESTIMONIALS = [
  { who: "Mateo Vélez", l: "Nivel 4.5 · Cumbayá", text: '"Las stats de Coach AI me ayudaron a corregir mi tercer golpe. Subí 0.3 en 2 meses."', rating: 5 },
  { who: "Camila Reyes", l: "Nivel 4.0 · La Carolina", text: '"Vale la pena solo por las quedadas ilimitadas. Organizo 3 por semana sin pensarlo."', rating: 5 },
  { who: "Joaquín Silva", l: "Coach · Pickle Garden", text: '"Mis alumnos con MP+ tienen un nivel de juego notablemente más alto. Las stats no mienten."', rating: 5 },
];

const FAQS = [
  { q: "¿Puedo cancelar cuando quiera?", a: "Sí. Sin penalidad. Sigues con tus beneficios hasta el fin del ciclo ya pagado." },
  { q: "¿La prueba de 14 días es realmente gratis?", a: "Sí. Pides tu tarjeta para evitar fraudes pero no cobramos nada hasta el día 15. Te avisamos 3 días antes." },
  { q: "¿Qué pasa con mis datos si cancelo?", a: "Tus stats avanzadas se archivan pero siguen ahí si vuelves. Tu cuenta jugador no cambia." },
  { q: "¿MP+ reemplaza la membresía de mi club?", a: "No. MP+ es de la plataforma. La membresía de club te da acceso a sus canchas y beneficios físicos." },
  { q: "¿Aplican impuestos?", a: "Los precios mostrados incluyen IVA. Te enviamos comprobante por cada cobro." },
];

const money = (c: number) => "$" + (c / 100).toFixed(c % 100 === 0 ? 0 : 2);

export function MpPlusSalesView() {
  const toast = useToast();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState(0);

  const activePrice = billing === "monthly" ? PRICE_MONTHLY : Math.round(PRICE_ANNUAL / 12);
  const startTrial = () => toast({ icon: "sparkles", title: "Empezar prueba · próximamente", sub: "El checkout de MATCHPOINT+ llega pronto" });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* HERO */}
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 14.4, background: "linear-gradient(135deg, #0a0a0a 0%, #022c22 60%, #064e3b 100%)", color: "#fff", padding: "44px 36px" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 88% 30%, rgba(16,185,129,0.30), transparent 55%), radial-gradient(circle at 10% 80%, rgba(16,185,129,0.10), transparent 50%)", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", top: -40, right: -40, fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 420, color: "rgba(16,185,129,0.06)", letterSpacing: "-0.08em", lineHeight: 0.78, pointerEvents: "none", userSelect: "none" }}>+</div>

        <div style={{ position: "relative", maxWidth: 720 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", borderRadius: 9999, background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.4)" }}>
            <Icon name="sparkles" size={12} color="#6ee7b7" />
            <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "#34d399" }}>Premium de la plataforma</span>
          </div>
          <h1 className="font-heading" style={{ margin: "14px 0 12px", fontSize: "clamp(40px, 6vw, 60px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 0.9 }}>
            MATCHPOINT<span style={{ color: "#10b981" }}>+</span>
            <br />
            Tu juego, sin límites<span style={{ color: "#34d399" }}>.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,0.82)", maxWidth: 580 }}>
            Quedadas ilimitadas. Coach AI que analiza tus partidos. Estadísticas avanzadas. Acceso anticipado a torneos. Todo lo que necesitas para subir de nivel — sin anuncios.
          </p>

          {/* Pricing toggle + precio */}
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", padding: 4, background: "rgba(255,255,255,0.08)", borderRadius: 9999, border: "1px solid rgba(255,255,255,0.12)" }}>
              {([{ k: "monthly", l: "Mensual" }, { k: "annual", l: "Anual" }] as const).map((o) => {
                const on = billing === o.k;
                return (
                  <button key={o.k} onClick={() => setBilling(o.k)} style={{ padding: "8px 18px", borderRadius: 9999, border: 0, cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", background: on ? "#fff" : "transparent", color: on ? "#0a0a0a" : "rgba(255,255,255,0.75)" }}>
                    {o.l}
                    {o.k === "annual" && <span style={{ marginLeft: 6, padding: "2px 6px", borderRadius: 9999, background: on ? "#10b981" : "rgba(16,185,129,0.22)", color: "#fff", fontSize: 9 }}>−{SAVINGS_PCT}%</span>}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span className="font-heading" style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{money(activePrice)}</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>/mes</span>
              {billing === "annual" && <span style={{ fontSize: 11.5, color: "#6ee7b7", fontWeight: 800, marginLeft: 6 }}>· cobro anual {money(PRICE_ANNUAL)}</span>}
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" style={{ background: "#10b981", color: "#fff", padding: "13px 22px", fontSize: 13 }} onClick={startTrial}>
              <Icon name="sparkles" size={14} color="#fff" /> Empezar prueba gratis 14 días
            </button>
            <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)" }}>Sin compromiso · cancela cuando quieras</span>
          </div>
        </div>
      </div>

      {/* FEATURES GRID */}
      <div>
        <div style={{ marginBottom: 16, maxWidth: 720 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Qué incluye</div>
          <h2 className="font-heading" style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            8 superpoderes para tu juego<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted-fg)" }}>Cada uno diseñado para que pases más tiempo jugando y menos peleando con la app.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {FEATURES.map((f) => (
            <div key={f.l} style={{ padding: 18, border: "1px solid var(--border)", borderRadius: 14.4, background: "#fff", display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, background: "rgba(16,185,129,0.12)", color: "#047857", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={f.icon} size={18} color="#047857" />
              </span>
              <div>
                <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}>
                  {f.l}
                  <span className="dot">.</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.45 }}>{f.sub}</div>
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
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", borderBottom: "1px solid var(--border)" }}>
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
                {money(activePrice)}
                <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>/mes</span>
              </div>
            </div>
          </div>
          {COMPARE.map((c, i) => (
            <div key={c.l} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", borderBottom: i < COMPARE.length - 1 ? "1px solid var(--border)" : 0, alignItems: "center" }}>
              <div style={{ padding: "14px 18px", fontSize: 13, fontWeight: 600 }}>{c.l}</div>
              <div style={{ padding: "14px 18px", borderLeft: "1px solid var(--border)", textAlign: "center", fontSize: 12.5, color: c.free === "—" ? "var(--muted-fg)" : "#0a0a0a" }}>{c.free}</div>
              <div style={{ padding: "14px 18px", borderLeft: "1px solid var(--border)", textAlign: "center", background: "rgba(16,185,129,0.03)", fontSize: 12.5, fontWeight: 800, color: "#047857", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Icon name="check" size={13} color="var(--primary)" />
                {c.plus}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TESTIMONIOS */}
      <div>
        <div style={{ marginBottom: 16, maxWidth: 620 }}>
          <div className="label-mp" style={{ color: "var(--primary)" }}>● Social proof</div>
          <h2 className="font-heading" style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", lineHeight: 1 }}>
            Jugadores que ya están dentro<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          {TESTIMONIALS.map((t) => (
            <div key={t.who} className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, borderLeft: "2px solid var(--primary)" }}>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: t.rating }).map((_, j) => (
                  <Icon key={j} name="star" size={14} color="#f59e0b" style={{ fill: "#f59e0b" }} />
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, color: "#0a0a0a", lineHeight: 1.55, fontStyle: "italic" }}>{t.text}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                <span style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#10b981,#047857)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 12 }}>
                  {t.who.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                </span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>{t.who}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{t.l}</div>
                </div>
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
            14 días gratis
            <br />
            después <span style={{ color: "#34d399" }}>{money(activePrice)}/mes</span>
            <span className="dot">.</span>
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.72)" }}>Sin compromiso · cancela cuando quieras · te avisamos antes del primer cobro.</p>
        </div>
        <button className="btn" style={{ position: "relative", background: "#10b981", color: "#fff", padding: "14px 24px", fontSize: 14 }} onClick={startTrial}>
          <Icon name="sparkles" size={14} color="#fff" /> Empezar prueba gratis
        </button>
      </div>
    </div>
  );
}
