"use client";
// Pantalla "Coach AI" — beneficio exclusivo de MATCHPOINT+.
// Migrada 1:1 del prototipo (ui_kits/dashboard/CoachAIScreen.jsx):
// data-lucide → <Icon>, window.mpToast → useToast.
// Layout: hero marketing + tabs (analizar / último análisis / historial /
// progreso). Datos mock — todavía no hay backend de análisis de video.
// Si el user no tiene MP+, el hero se mantiene y debajo se muestra un banner
// de upsell en lugar de la herramienta.
import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";

type Strength = { l: string; s: string };
type Weakness = { l: string; s: string; priority: "alta" | "media" };
type Drill = { l: string; dur: string; icon: string };

const LAST = {
  title: "Match vs. Joaquín Ruiz",
  date: "Vie 02 may · 19:00",
  result: "Ganaste 11-7, 11-9",
  duration: "52 min",
  overallScore: 7.4,
  strengths: [
    { l: "Tercer golpe drop", s: "Conversión 78% · top 15%" },
    { l: "Defensa en cocina", s: "14/16 puntos defendidos" },
  ] as Strength[],
  weaknesses: [
    { l: "Saque cruzado", s: "Solo 4/12 al fondo · trabajar precisión", priority: "alta" },
    { l: "Volea de revés", s: "2 unforced errors · postura cerrada", priority: "media" },
  ] as Weakness[],
  drills: [
    { l: "Saque al fondo · 50 reps", dur: "15 min", icon: "target" },
    { l: "Pareja de volea revés", dur: "20 min", icon: "users-round" },
  ] as Drill[],
  tactics:
    '"Tu rival tira mucho a tu revés. Cuando uses el slice como golpe de transición, sube a la red — ganaste 9/11 puntos en cocina."',
};

const PREVIOUS = [
  { title: "Match vs. Andrea Pinto", when: "Mié 30 abr", score: 8.1, result: "Win 11-8, 8-11, 11-6" },
  { title: "Match vs. Mateo Vélez", when: "Dom 27 abr", score: 6.2, result: "Loss 7-11, 9-11" },
  { title: "Match vs. Nicolás Vera", when: "Sáb 26 abr", score: 8.6, result: "Win 11-5, 11-3" },
  { title: "Match vs. Sofía Andrade", when: "Mié 23 abr", score: 5.8, result: "Loss 6-11, 11-9, 7-11" },
];

const TREND = [6.2, 5.8, 7.0, 8.6, 6.2, 8.1, 7.4];

type Tab = "analizar" | "ultimo" | "historial" | "progreso";

export function CoachAIScreenView({ isPremium }: { isPremium: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("analizar");
  const [dragOver, setDragOver] = useState(false);

  const tabs: { k: Tab; l: string; icon: string }[] = [
    { k: "analizar", l: "Analizar match", icon: "upload-cloud" },
    { k: "ultimo", l: "Último análisis", icon: "sparkles" },
    { k: "historial", l: "Historial", icon: "history" },
    { k: "progreso", l: "Progreso", icon: "trending-up" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* HERO marketing */}
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          borderRadius: 14.4,
          background: "linear-gradient(135deg, #0a0a0a 0%, #022c22 60%, #064e3b 100%)",
          color: "#fff",
          padding: "28px 30px",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(ellipse at 88% 30%, rgba(16,185,129,0.30), transparent 55%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -40,
            right: -10,
            fontFamily: "var(--font-heading)",
            fontWeight: 900,
            fontSize: 220,
            color: "rgba(16,185,129,0.06)",
            letterSpacing: "-0.08em",
            lineHeight: 0.8,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          AI
        </div>

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 580 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 12px",
                borderRadius: 9999,
                background: "rgba(16,185,129,0.18)",
                border: "1px solid rgba(16,185,129,0.4)",
              }}
            >
              <Icon name="sparkles" size={12} color="#6ee7b7" />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#34d399",
                }}
              >
                Beneficio MATCHPOINT+
              </span>
            </div>
            <h1
              className="font-heading"
              style={{
                margin: "14px 0 8px",
                fontSize: 42,
                fontWeight: 900,
                letterSpacing: "-0.03em",
                textTransform: "uppercase",
                lineHeight: 0.92,
              }}
            >
              Coach AI<span style={{ color: "#34d399" }}>.</span>
            </h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "rgba(255,255,255,0.82)" }}>
              Sube un video de tu match y recibe análisis táctico en 60 segundos: tus fortalezas, qué corregir y drills
              personalizados.
            </p>
          </div>
          {isPremium && (
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 900,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "#34d399",
                  }}
                >
                  Análisis esta semana
                </div>
                <div
                  className="font-heading tabular"
                  style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.02em" }}
                >
                  3<span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>/ ilimitados</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GATE: sin MP+ → upsell */}
      {!isPremium ? (
        <CoachAIUpsell />
      ) : (
        <>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
            {tabs.map((t) => {
              const on = tab === t.k;
              return (
                <button
                  key={t.k}
                  onClick={() => setTab(t.k)}
                  style={{
                    padding: "12px 18px",
                    border: 0,
                    borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
                    background: "transparent",
                    color: on ? "#0a0a0a" : "var(--muted-fg)",
                    fontFamily: "inherit",
                    fontWeight: on ? 900 : 600,
                    fontSize: 12,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: -1,
                  }}
                >
                  <Icon name={t.icon} size={13} /> {t.l}
                </button>
              );
            })}
          </div>

          {/* ANALIZAR — upload */}
          {tab === "analizar" && (
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start" }}>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  toast({ icon: "sparkles", title: "Análisis iniciado · 60 seg" });
                }}
                style={{
                  padding: 40,
                  borderRadius: 14.4,
                  border: "2px dashed " + (dragOver ? "#10b981" : "var(--border)"),
                  background: dragOver ? "rgba(16,185,129,0.05)" : "#fafafa",
                  textAlign: "center",
                  transition: "all 150ms cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    background: "#0a0a0a",
                    color: "#fff",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <Icon name="upload-cloud" size={28} color="#fff" />
                </div>
                <h3
                  className="font-heading"
                  style={{ margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                >
                  Sube tu video<span className="dot">.</span>
                </h3>
                <p style={{ margin: "8px 0 16px", fontSize: 13, color: "var(--muted-fg)" }}>
                  MP4, MOV o link de YouTube/Drive · máx 500 MB · análisis en ~60 seg
                </p>
                <div style={{ display: "inline-flex", gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => toast({ icon: "sparkles", title: "Análisis iniciado · 60 seg" })}
                  >
                    <Icon name="upload" size={13} color="#fff" /> Subir archivo
                  </button>
                  <button
                    className="btn"
                    style={{ background: "#fff", border: "1px solid var(--border)" }}
                    onClick={() => toast({ icon: "link", title: "Pega el link de tu video" })}
                  >
                    <Icon name="link" size={13} /> Pegar link
                  </button>
                </div>
                <div
                  style={{
                    marginTop: 16,
                    padding: 12,
                    borderRadius: 9,
                    background: "#fff",
                    border: "1px solid var(--border)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--muted-fg)",
                  }}
                >
                  <Icon name="info" size={11} />
                  Pon la cámara al fondo de la cancha. Que vea a los 4 jugadores.
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="card" style={{ padding: 18 }}>
                  <div className="label-mp" style={{ color: "var(--primary)" }}>
                    ● Cómo funciona
                  </div>
                  <h3
                    className="font-heading"
                    style={{ margin: "4px 0 12px", fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                  >
                    3 pasos<span className="dot">.</span>
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { n: 1, l: "Subes el video", s: "Match completo o solo el set que quieras analizar." },
                      { n: 2, l: "AI procesa", s: "Detecta golpes, posiciones, errores y aciertos." },
                      { n: 3, l: "Recibes tu análisis", s: "Fortalezas, áreas a mejorar, drills y tactic notes." },
                    ].map((s) => (
                      <div key={s.n} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span
                          style={{
                            flexShrink: 0,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: "#0a0a0a",
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontFamily: "var(--font-heading)",
                            fontSize: 11,
                            fontWeight: 900,
                          }}
                        >
                          {s.n}
                        </span>
                        <div>
                          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{s.l}</div>
                          <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{s.s}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="card"
                  style={{
                    padding: 18,
                    background: "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))",
                    borderColor: "rgba(16,185,129,0.18)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Icon name="zap" size={14} color="#047857" />
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        color: "#047857",
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      Tip pro
                    </span>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#0a0a0a", lineHeight: 1.5 }}>
                    El mejor ángulo es desde detrás del lado contrario. Cualquier teléfono moderno funciona; trípode
                    opcional pero recomendado.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ÚLTIMO ANÁLISIS */}
          {tab === "ultimo" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card" style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
                <div>
                  <div className="label-mp" style={{ color: "var(--primary)" }}>
                    ● Último match analizado
                  </div>
                  <h3
                    className="font-heading"
                    style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                  >
                    {LAST.title}
                    <span className="dot">.</span>
                  </h3>
                  <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--muted-fg)", display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <span>
                      <Icon name="calendar" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      {LAST.date}
                    </span>
                    <span>
                      <Icon name="clock" size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                      {LAST.duration}
                    </span>
                    <span style={{ color: "#047857", fontWeight: 700 }}>{LAST.result}</span>
                  </div>
                </div>
                <div style={{ textAlign: "center", padding: 14, borderRadius: 14.4, background: "#0a0a0a", color: "#fff", minWidth: 130 }}>
                  <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#34d399" }}>
                    Score AI
                  </div>
                  <div className="font-heading tabular" style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em" }}>
                    {LAST.overallScore}
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>/10</span>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>BUEN MATCH</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "rgba(16,185,129,0.12)",
                        color: "#047857",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="trending-up" size={14} color="#047857" />
                    </span>
                    <h3
                      className="font-heading"
                      style={{ margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}
                    >
                      Tus fortalezas<span className="dot">.</span>
                    </h3>
                  </div>
                  {LAST.strengths.map((s, i) => (
                    <div key={i} style={{ padding: "10px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{s.l}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>{s.s}</div>
                    </div>
                  ))}
                </div>

                <div className="card" style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: "#fef3c7",
                        color: "#b45309",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="target" size={14} color="#b45309" />
                    </span>
                    <h3
                      className="font-heading"
                      style={{ margin: 0, fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase" }}
                    >
                      A mejorar<span className="dot">.</span>
                    </h3>
                  </div>
                  {LAST.weaknesses.map((w, i) => (
                    <div key={i} style={{ padding: "10px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{w.l}</span>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: 9999,
                            background: w.priority === "alta" ? "#fee2e2" : "#fef3c7",
                            color: w.priority === "alta" ? "#dc2626" : "#92400e",
                            fontSize: 9,
                            fontWeight: 900,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {w.priority}
                        </span>
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>{w.s}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tactic note */}
              <div
                className="card"
                style={{
                  padding: 22,
                  background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
                  color: "#fff",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  aria-hidden
                  style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 90% 30%, rgba(16,185,129,0.18), transparent 55%)" }}
                />
                <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 14 }}>
                  <Icon name="message-square-quote" size={22} color="#34d399" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "#34d399" }}>
                      ● Tactic note del AI
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: 16, fontWeight: 600, lineHeight: 1.5, fontStyle: "italic" }}>{LAST.tactics}</p>
                  </div>
                </div>
              </div>

              {/* Drills */}
              <div className="card" style={{ padding: 22 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div className="label-mp" style={{ color: "var(--primary)" }}>
                      ● Tu plan
                    </div>
                    <h3
                      className="font-heading"
                      style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                    >
                      Drills recomendados<span className="dot">.</span>
                    </h3>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>Para tu próxima sesión</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {LAST.drills.map((d, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 14,
                        borderRadius: 11,
                        border: "1px solid var(--border)",
                        background: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 9,
                          background: "rgba(16,185,129,0.12)",
                          color: "#047857",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon name={d.icon} size={16} color="#047857" />
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800 }}>{d.l}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{d.dur}</div>
                      </div>
                      <button
                        style={{ width: 28, height: 28, borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", cursor: "pointer" }}
                        onClick={() => toast({ icon: "play", title: "Drill: " + d.l })}
                      >
                        <Icon name="play" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* HISTORIAL */}
          {tab === "historial" && (
            <div className="card" style={{ overflow: "hidden" }}>
              {PREVIOUS.map((p, i, arr) => {
                const win = p.result.startsWith("Win");
                return (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 130px 110px 60px 80px",
                      gap: 12,
                      padding: "14px 18px",
                      alignItems: "center",
                      borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : 0,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>{p.title}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>{p.result}</div>
                    </div>
                    <span style={{ fontSize: 11.5, color: "var(--muted-fg)" }}>{p.when}</span>
                    <span
                      style={{
                        padding: "3px 9px",
                        borderRadius: 9999,
                        background: win ? "rgba(16,185,129,0.12)" : "#fee2e2",
                        color: win ? "#047857" : "#dc2626",
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 70,
                      }}
                    >
                      {win ? "Win" : "Loss"}
                    </span>
                    <span
                      className="font-heading tabular"
                      style={{ fontSize: 18, fontWeight: 900, color: p.score >= 8 ? "#047857" : p.score >= 7 ? "#0a0a0a" : "#b45309" }}
                    >
                      {p.score}
                    </span>
                    <button
                      className="btn"
                      style={{ background: "#fff", border: "1px solid var(--border)", padding: "5px 11px", fontSize: 10.5 }}
                      onClick={() => setTab("ultimo")}
                    >
                      Ver
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* PROGRESO */}
          {tab === "progreso" && (
            <div className="card" style={{ padding: 22 }}>
              <div style={{ marginBottom: 16 }}>
                <div className="label-mp" style={{ color: "var(--primary)" }}>
                  ● Progreso · últimos 7 análisis
                </div>
                <h3
                  className="font-heading"
                  style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
                >
                  Tu evolución<span className="dot">.</span>
                </h3>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>
                  Score AI por match. Ascendente = vas mejorando.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 180, padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                {TREND.map((v, i) => {
                  const h = (v / 10) * 100;
                  const isLast = i === TREND.length - 1;
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <span className="font-heading tabular" style={{ fontSize: 11, fontWeight: 800, color: "var(--muted-fg)" }}>
                        {v}
                      </span>
                      <div
                        style={{
                          width: "100%",
                          maxWidth: 40,
                          height: h + "%",
                          background: isLast ? "var(--primary)" : "#0a0a0a",
                          borderRadius: "6px 6px 0 0",
                          transition: "height 360ms cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, color: "var(--muted-fg)" }}>
                <span>Hace 7 matches</span>
                <span>Hoy</span>
              </div>
              <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <ProgressTile label="Tendencia" value="Subiendo" sub="+1.2 puntos en 7 análisis" icon="trending-up" emerald />
                <ProgressTile label="Mejor área" value="3er golpe" sub="+18% conversión vs primer análisis" icon="zap" />
                <ProgressTile label="A trabajar" value="Saque" sub="Sigue siendo la #1 prioridad" icon="target" warn />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProgressTile({
  label,
  value,
  sub,
  icon,
  emerald,
  warn,
}: {
  label: string;
  value: string;
  sub: string;
  icon: string;
  emerald?: boolean;
  warn?: boolean;
}) {
  const c = emerald ? "#047857" : warn ? "#b45309" : "#0a0a0a";
  return (
    <div style={{ padding: 14, borderRadius: 11, background: "var(--muted)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
          {label}
        </span>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: emerald ? "rgba(16,185,129,0.16)" : warn ? "#fef3c7" : "#fff",
            color: c,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={icon} size={11} color={c} />
        </span>
      </div>
      <div
        className="font-heading"
        style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", textTransform: "uppercase", marginTop: 4, color: c }}
      >
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// Banner de upsell para users sin MATCHPOINT+. Mismo patrón que la pantalla de
// Personalización: CTA al plan, sin esconder de qué se trata el beneficio.
function CoachAIUpsell() {
  const features = [
    { icon: "video", l: "Análisis de video", s: "Sube tu match y la AI lo procesa en ~60 seg." },
    { icon: "trending-up", l: "Fortalezas y errores", s: "Qué haces bien y qué corregir, con datos." },
    { icon: "target", l: "Drills personalizados", s: "Un plan para tu próxima sesión de práctica." },
    { icon: "line-chart", l: "Progreso en el tiempo", s: "Tu Score AI match a match." },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {features.map((f) => (
          <div key={f.l} className="card" style={{ padding: 18 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: "rgba(16,185,129,0.12)",
                color: "#047857",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={f.icon} size={16} color="#047857" />
            </span>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 10 }}>{f.l}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>{f.s}</div>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          padding: 22,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          background: "linear-gradient(135deg, #0a0a0a 0%, #064e3b 100%)",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center", flex: 1, minWidth: 240 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: "rgba(16,185,129,0.2)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="lock" size={20} color="#34d399" />
          </div>
          <div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em" }}>
              Coach AI es un beneficio MATCHPOINT+
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>
              Activa tu plan para subir videos y recibir análisis ilimitados.
            </div>
          </div>
        </div>
        <Link href="/dashboard/user/mi-plan" className="btn" style={{ background: "#34d399", color: "#0a0a0a", fontWeight: 800 }}>
          Activar MATCHPOINT+
          <Icon name="arrow-right" size={12} />
        </Link>
      </div>
    </div>
  );
}
