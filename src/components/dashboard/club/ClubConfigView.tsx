"use client";
// Club Owner · Configuración v2 — command center de ajustes con 7 secciones, cada
// una con UI propia. Migrado del prototipo (ui_kits/dashboard/ClubOwnerConfigScreen.jsx):
// LucideIcon (hack del prototipo) → <Icon>, botones → toast.
//
// ⚠️ DEMO: datos mock, inputs uncontrolled, toggles visuales. Reemplaza la real
// ClubConfigScreen (owner), preservada y des-importada. Ajustes de honestidad:
// métodos de pago al modelo real (Transferencia/DeUna/Saldo MP/Efectivo — sin
// tarjeta/Apple Pay, no hay PSP), marca MATCHPOINT y dominio matchpoint.top.
// Ver 04-placeholders.md y docs/product/02-payments.md.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";

type SectionKey = "identidad" | "horarios" | "tarifas" | "pagos" | "cancel" | "notif" | "reglas";
const SECTIONS: { k: SectionKey; i: string; t: string; sub: string }[] = [
  { k: "identidad", i: "building-2", t: "Identidad", sub: "Logo, portada, redes" },
  { k: "horarios", i: "clock", t: "Horarios", sub: "Apertura y feriados" },
  { k: "tarifas", i: "tag", t: "Tarifas", sub: "Precios y descuentos" },
  { k: "pagos", i: "wallet", t: "Pagos & Payouts", sub: "Banco y comisiones" },
  { k: "cancel", i: "calendar-x", t: "Cancelación", sub: "Política de no-show" },
  { k: "notif", i: "bell", t: "Notificaciones", sub: "Cuándo escribimos" },
  { k: "reglas", i: "scroll-text", t: "Reglas del club", sub: "Lo que se puede y no" },
];

export function ClubConfigView() {
  const toast = useToast();
  const [active, setActive] = useState<SectionKey>("identidad");
  const cur = SECTIONS.find((s) => s.k === active)!;
  const soon = (title: string) => toast({ icon: "sparkles", title });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PolHero
        tone="dark"
        wm="CLUB"
        label="Club · Configuración"
        title="Ajustes del club"
        sub="Identidad, horarios, tarifas, pagos y políticas. Tu club, tus reglas — todo se publica al instante en MATCHPOINT."
        right={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }} onClick={() => soon("Ver perfil público · próximamente")}>
              <Icon name="eye" size={13} color="#fff" />Ver perfil público
            </button>
            <button className="btn btn-primary" onClick={() => toast({ icon: "check-circle-2", title: "Cambios guardados (demo)" })}>
              <Icon name="save" size={13} color="#fff" />Guardar cambios
            </button>
          </div>
        }
      />

      <div className="mp-ccfg-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "flex-start" }}>
        {/* LEFT RAIL */}
        <div className="mp-ccfg-rail" style={{ display: "flex", flexDirection: "column", gap: 12, position: "sticky", top: 80 }}>
          <div className="card" style={{ padding: 8 }}>
            {SECTIONS.map((s) => {
              const on = active === s.k;
              return (
                <button key={s.k} onClick={() => setActive(s.k)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 12px", borderRadius: 8, background: on ? "#ecfdf5" : "transparent", border: 0, borderLeft: on ? "3px solid var(--primary)" : "3px solid transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", marginBottom: 2 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 7, background: on ? "var(--primary)" : "var(--muted)", color: on ? "#fff" : "#0a0a0a", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={s.i} size={14} color={on ? "#fff" : undefined} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: on ? 900 : 800, color: "#0a0a0a" }}>{s.t}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{s.sub}</div>
                  </div>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? "var(--primary)" : "transparent", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>

          <div className="card" style={{ padding: 14, background: "#0a0a0a", color: "#fff" }}>
            <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>● Salud del perfil</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
              <span className="font-heading tabular" style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.035em", color: "var(--primary)" }}>88</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>/ 100</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.1)", borderRadius: 9999, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "88%", background: "var(--primary)" }} />
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.4 }}>
              Falta: <b style={{ color: "#fbbf24" }}>foto de portada en alta resolución</b> y <b style={{ color: "#fbbf24" }}>3 reglas más</b> para llegar a 100.
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={cur.i} size={22} color="#fff" />
            </div>
            <div>
              <div className="label-mp">Sección · {cur.sub}</div>
              <h2 className="font-heading" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", margin: 0 }}>{cur.t}<span className="dot">.</span></h2>
            </div>
          </div>

          <div style={{ minHeight: 200 }}>
            {active === "identidad" && <IdentidadSection onAction={soon} />}
            {active === "horarios" && <HorariosSection onAction={soon} />}
            {active === "tarifas" && <TarifasSection onAction={soon} />}
            {active === "pagos" && <PagosSection onAction={soon} />}
            {active === "cancel" && <CancelacionSection onAction={soon} />}
            {active === "notif" && <NotificacionesSection onAction={soon} />}
            {active === "reglas" && <ReglasSection onAction={soon} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ l, v, hint, type = "text", icon }: { l: string; v: string; hint?: string; type?: string; icon?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 800, color: "#0a0a0a", letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>{l}</label>
      <div style={{ position: "relative" }}>
        {icon && <Icon name={icon} size={14} color="var(--muted-fg)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />}
        <input defaultValue={v} type={type} style={{ width: "100%", padding: "9px 12px", paddingLeft: icon ? 34 : 12, border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "inherit", background: "#fff" }} />
      </div>
      {hint && <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function VisualToggle({ on, w = 36, h = 20 }: { on: boolean; w?: number; h?: number }) {
  const k = h - 4;
  return (
    <div style={{ width: w, height: h, borderRadius: 9999, background: on ? "var(--primary)" : "var(--muted)", position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: on ? w - k - 2 : 2, width: k, height: k, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );
}

function IdentidadSection({ onAction }: { onAction: (t: string) => void }) {
  return (
    <div className="mp-ccfg-ident" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "flex-start" }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ marginBottom: 22 }}>
          <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Foto de portada</label>
          <div style={{ position: "relative", height: 180, borderRadius: 12, overflow: "hidden", background: "linear-gradient(135deg, #166534, #10b981 60%, #34d399)" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 25% 80%, rgba(255,255,255,0.18), transparent 50%)" }} />
            <div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", gap: 6 }}>
              <button className="btn" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontSize: 10 }} onClick={() => onAction("Cambiar portada · próximamente")}><Icon name="upload" size={12} color="#fff" />Cambiar</button>
              <button className="btn" style={{ background: "rgba(0,0,0,0.6)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", fontSize: 10 }} onClick={() => onAction("Encuadrar · próximamente")}><Icon name="crop" size={12} color="#fff" />Encuadrar</button>
            </div>
            <div style={{ position: "absolute", left: 18, bottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 64, height: 64, borderRadius: 14, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
                <span className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em" }}>CN</span>
              </div>
              <div style={{ color: "#fff" }}>
                <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>Club Norte Pickleball</div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>Cumbayá · Pichincha</div>
              </div>
            </div>
            <span style={{ position: "absolute", top: 12, left: 12, padding: "3px 10px", borderRadius: 9999, background: "rgba(0,0,0,0.65)", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.15em" }}>● PREVIEW HEADER</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 14, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.02em", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Logo</label>
            <button onClick={() => onAction("Cambiar logo · próximamente")} style={{ width: 100, height: 100, borderRadius: 14, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: 0 }}>
              <span className="font-heading" style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em" }}>CN</span>
            </button>
          </div>
          <div>
            <Field l="Nombre comercial" v="Club Norte Pickleball" hint="Aparece en el browse y en compartidos sociales." />
            <Field l="Razón social (factura)" v="Club Norte Pickleball S.A." hint="RUC 1791234567001" />
          </div>
        </div>

        <Field l="Descripción corta" v="Pickleball indoor & outdoor en Cumbayá. 5 canchas, coaches certificados, comunidad fuerte." hint="Máx. 140 caracteres · 96 / 140" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field l="Teléfono" v="+593 2 244 1208" icon="phone" />
          <Field l="WhatsApp" v="+593 99 824 1208" icon="message-circle" />
          <Field l="Email" v="hola@clubnorte.ec" icon="mail" />
          <Field l="Website" v="clubnorte.ec" icon="globe" />
          <Field l="Instagram" v="@clubnortepickle" icon="at-sign" />
          <Field l="TikTok" v="@clubnortepickle" icon="music" />
        </div>

        <div style={{ marginTop: 18, padding: 14, background: "var(--muted)", borderRadius: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Icon name="map-pin" size={14} color="var(--primary)" />
            <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>Ubicación física</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field l="Dirección" v="Av. Interoceánica km 12, Cumbayá" />
            <Field l="Referencia" v="Junto al CC La Esquina, frente al parque" />
          </div>
          <div style={{ height: 110, borderRadius: 8, background: "linear-gradient(135deg, #d4f1de 0%, #bbf7d0 60%, #ecfdf5 100%)", position: "relative", overflow: "hidden", marginTop: 4 }}>
            <svg viewBox="0 0 400 110" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} aria-hidden>
              <path d="M0 60 Q 80 30, 160 70 T 320 50 T 480 80" stroke="#10b981" strokeWidth="2" fill="none" strokeDasharray="4 3" opacity="0.4" />
              <path d="M0 90 Q 100 60, 200 95 T 400 70" stroke="#0a0a0a" strokeWidth="1.5" fill="none" opacity="0.2" />
            </svg>
            <div style={{ position: "absolute", left: "42%", top: "40%", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--primary)", display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
                <Icon name="map-pin" size={14} color="#fff" />
              </div>
              <div style={{ width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "8px solid var(--primary)", marginTop: -2 }} />
            </div>
            <button className="btn" style={{ position: "absolute", right: 10, bottom: 10, background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Editar en mapa · próximamente")}>Editar en mapa</button>
          </div>
        </div>
      </div>

      <div className="mp-ccfg-preview" style={{ position: "sticky", top: 80 }}>
        <div className="label-mp" style={{ marginBottom: 8 }}>● Vista previa pública</div>
        <div className="card" style={{ padding: 0, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}>
          <div style={{ height: 120, background: "linear-gradient(135deg, #166534, #10b981 60%, #34d399)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 25% 80%, rgba(255,255,255,0.18), transparent 50%)" }} />
          </div>
          <div style={{ padding: 16, position: "relative" }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "#0a0a0a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", marginTop: -40, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
              <span className="font-heading" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.03em" }}>CN</span>
            </div>
            <div className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.025em", textTransform: "uppercase", marginTop: 10 }}>Club Norte Pickleball<span className="dot">.</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
              <Icon name="map-pin" size={11} />Cumbayá · Pichincha
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 8, lineHeight: 1.45 }}>Pickleball indoor & outdoor en Cumbayá. 5 canchas, coaches certificados, comunidad fuerte.</div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {["🏓 PICKLEBALL", "5 CANCHAS", "INDOOR + OUTDOOR"].map((c) => (
                <span key={c} style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", padding: "3px 8px", borderRadius: 9999, background: "var(--muted)", color: "#0a0a0a" }}>{c}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }} onClick={() => onAction("Reservar · vista previa")}>Reservar</button>
              <button className="btn" style={{ flex: 1, background: "#fff", border: "1px solid var(--border)", fontSize: 11 }} onClick={() => onAction("Ver canchas · vista previa")}>Ver canchas</button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", fontSize: 10 }}>
              <div><b style={{ color: "#fbbf24" }}>★ 4.8</b> <span style={{ color: "var(--muted-fg)" }}>· 142 reseñas</span></div>
              <div style={{ color: "var(--muted-fg)" }}>● Abierto · cierra 22:00</div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 10, textAlign: "center", lineHeight: 1.4 }}>
          Así te verán los jugadores en <b>matchpoint.top/clubes</b>
        </div>
      </div>
    </div>
  );
}

function HorariosSection({ onAction }: { onAction: (t: string) => void }) {
  const week = [
    { d: "Lunes", o: 6, c: 22, on: true, peak: null as [number, number] | null },
    { d: "Martes", o: 6, c: 22, on: true, peak: null },
    { d: "Miércoles", o: 6, c: 22, on: true, peak: null },
    { d: "Jueves", o: 6, c: 22, on: true, peak: null },
    { d: "Viernes", o: 6, c: 23, on: true, peak: [17, 22] as [number, number] },
    { d: "Sábado", o: 7, c: 23, on: true, peak: [9, 21] as [number, number] },
    { d: "Domingo", o: 7, c: 20, on: true, peak: [9, 19] as [number, number] },
  ];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Apertura · semana típica</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Cuándo está abierto el club<span className="dot">.</span></h3>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Aplicar L–V · próximamente")}><Icon name="copy" size={11} />Aplicar L–V</button>
            <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Nueva excepción · próximamente")}><Icon name="plus" size={11} color="#fff" />Excepción</button>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 560 }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 80px", gap: 12, alignItems: "center", marginBottom: 6, fontSize: 9, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <span>Día</span>
              <span style={{ textAlign: "center" }}>Abierto</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 1 }}>
                {hours.map((h) => (
                  <div key={h} style={{ textAlign: "center", fontSize: 8 }}>{h % 4 === 0 ? h : ""}</div>
                ))}
              </div>
              <span style={{ textAlign: "right" }}>Pico</span>
            </div>

            {week.map((d, i) => (
              <div key={d.d} style={{ display: "grid", gridTemplateColumns: "90px 80px 1fr 80px", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i === 0 ? "1px solid var(--border)" : "1px dashed var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{d.d}</div>
                <div style={{ justifySelf: "center" }}><VisualToggle on={d.on} w={30} h={18} /></div>
                <div style={{ position: "relative", height: 22, background: "#fafafa", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, bottom: 0, left: (d.o / 24) * 100 + "%", width: ((d.c - d.o) / 24) * 100 + "%", background: "linear-gradient(90deg, var(--primary), #34d399)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px", fontSize: 9, fontWeight: 900, color: "#fff" }}>
                    <span>{String(d.o).padStart(2, "0")}:00</span>
                    <span>{String(d.c).padStart(2, "0")}:00</span>
                  </div>
                  {d.peak && <div style={{ position: "absolute", top: 0, bottom: 0, left: (d.peak[0] / 24) * 100 + "%", width: ((d.peak[1] - d.peak[0]) / 24) * 100 + "%", borderTop: "2px solid #fbbf24", borderBottom: "2px solid #fbbf24", pointerEvents: "none" }} />}
                </div>
                <div style={{ textAlign: "right", fontSize: 10, color: d.peak ? "#0a0a0a" : "var(--muted-fg)", fontWeight: d.peak ? 900 : 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{d.peak ? `${d.peak[0]}:00–${d.peak[1]}:00` : "—"}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", fontSize: 10, color: "var(--muted-fg)", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 8, background: "linear-gradient(90deg, var(--primary), #34d399)", borderRadius: 2 }} /> Horario abierto</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><div style={{ width: 14, height: 8, borderTop: "2px solid #fbbf24", borderBottom: "2px solid #fbbf24" }} /> Pico (surge +20%)</div>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
          <div>
            <div className="label-mp">Excepciones · 2026</div>
            <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Feriados y cierres especiales<span className="dot">.</span></h3>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Añadir feriado · próximamente")}><Icon name="plus" size={11} color="#fff" />Añadir</button>
        </div>
        {[
          { d: "24 may 2026", n: "Batalla de Pichincha", h: "Horario especial · 09:00–18:00", icon: "flag", color: "#fbbf24" },
          { d: "10 ago 2026", n: "Primer Grito", h: "Horario especial · 10:00–17:00", icon: "flag", color: "#fbbf24" },
          { d: "24 dic 2026", n: "Nochebuena", h: "Cerrado desde 14:00", icon: "moon", color: "#dc2626" },
          { d: "25 dic 2026", n: "Navidad", h: "Cerrado todo el día", icon: "calendar-x", color: "#dc2626" },
          { d: "31 dic 2026", n: "Fin de año", h: "Cerrado desde 16:00", icon: "moon", color: "#dc2626" },
        ].map((f, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr 120px 60px", gap: 12, alignItems: "center", padding: "11px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: f.color === "#dc2626" ? "rgba(220,38,38,0.1)" : "rgba(251,191,36,0.15)", color: f.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={f.icon} size={14} color={f.color} />
            </div>
            <div className="font-heading tabular" style={{ fontSize: 11, fontWeight: 900, color: "#0a0a0a" }}>{f.d}</div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{f.n}</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{f.h}</div>
            <div style={{ textAlign: "right" }}>
              <button onClick={() => onAction("Editar feriado · próximamente")} style={{ width: 26, height: 26, borderRadius: 6, background: "var(--muted)", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Icon name="pencil" size={11} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TarifasSection({ onAction }: { onAction: (t: string) => void }) {
  const cols = [
    { k: "mañana", l: "Mañana", sub: "06:00–12:00", icon: "sunrise", highlight: false },
    { k: "tarde", l: "Tarde", sub: "12:00–17:00", icon: "sun", highlight: false },
    { k: "pico", l: "Pico", sub: "17:00–22:00", icon: "flame", highlight: true },
    { k: "weekend", l: "Fin de semana", sub: "Sáb + Dom", icon: "calendar-days", highlight: true },
  ];
  const rows = [
    { k: "std", l: "Cancha estándar", sub: "5 canchas outdoor", color: "#10b981", prices: { mañana: 12, tarde: 14, pico: 18, weekend: 20 } as Record<string, number> },
    { k: "indoor", l: "Cancha indoor", sub: "1 cancha · Centro", color: "#0a0a0a", prices: { mañana: 14, tarde: 16, pico: 22, weekend: 24 } as Record<string, number> },
    { k: "sky", l: "Cancha Sky VIP", sub: "Rooftop · 1 cancha", color: "#fbbf24", prices: { mañana: 18, tarde: 22, pico: 28, weekend: 32 } as Record<string, number> },
  ];
  const tiers = [
    { t: "Socio Plus", p: "$29/mes", d: "15% off", ben: ["Reserva 14 días antes", "2 invitados/mes", "Sin recargo no-show 1×"], color: "#10b981", count: 86, popular: false },
    { t: "Socio Pro", p: "$59/mes", d: "25% off", ben: ["Reserva 21 días antes", "5 invitados/mes", "Locker privado", "Hora gratis semanal"], color: "#0a0a0a", count: 41, popular: true },
    { t: "Family", p: "$89/mes", d: "20% off", ben: ["Hasta 4 miembros", "4 horas/sem incluidas", "Clases infantiles 50% off"], color: "#fbbf24", count: 15, popular: false },
  ];
  return (
    <>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Tarifas · USD por hora</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Matriz de precios<span className="dot">.</span></h3>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>Toca cualquier celda para editar. Los cambios entran en vigor para reservas <b>nuevas</b> desde el guardado.</div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Editor avanzado de tarifas · próximamente")}><Icon name="zap" size={11} color="#fff" />Editor avanzado</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 620, display: "grid", gridTemplateColumns: "200px repeat(4, 1fr)", gap: 6 }}>
            <div />
            {cols.map((c) => (
              <div key={c.k} style={{ padding: "10px 12px", background: c.highlight ? "rgba(251,191,36,0.1)" : "var(--muted)", borderRadius: 8, textAlign: "center", border: c.highlight ? "1px solid rgba(251,191,36,0.4)" : "1px solid transparent" }}>
                <Icon name={c.icon} size={14} color={c.highlight ? "#92400e" : "var(--muted-fg)"} />
                <div style={{ fontSize: 10.5, fontWeight: 900, marginTop: 4, color: c.highlight ? "#78350f" : "#0a0a0a" }}>{c.l}</div>
                <div style={{ fontSize: 9, color: c.highlight ? "#92400e" : "var(--muted-fg)", marginTop: 1 }}>{c.sub}</div>
              </div>
            ))}
            {rows.map((r) => (
              <div key={r.k} style={{ display: "contents" }}>
                <div style={{ padding: "14px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: r.color, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="land-plot" size={13} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 900 }}>{r.l}</div>
                    <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>{r.sub}</div>
                  </div>
                </div>
                {cols.map((c) => (
                  <button key={c.k} onClick={() => onAction(`Editar tarifa ${r.l} · ${c.l} · próximamente`)} style={{ padding: "14px 12px", background: c.highlight ? "#fffbeb" : "#fff", border: "1px solid var(--border)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <span className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", color: c.highlight ? "#92400e" : "#0a0a0a" }}>${r.prices[c.k]}</span>
                    <span style={{ fontSize: 8.5, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>/ hora</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, padding: 14, background: "rgba(251,191,36,0.08)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10, border: "1px solid rgba(251,191,36,0.25)" }}>
          <Icon name="zap" size={16} color="#92400e" />
          <div style={{ flex: 1, fontSize: 11, color: "#78350f" }}>
            <b>Surge automático activado.</b> Cuando la ocupación supera el 80% en franja pico, las tarifas suben +20% por 1 hora.{" "}
            <button onClick={() => onAction("Configurar surge · próximamente")} style={{ background: "transparent", border: 0, color: "#92400e", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Configurar →</button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 10 }}>
          <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0 }}>Membresías y descuentos<span className="dot">.</span></h3>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>3 tiers · 142 socios activos</span>
        </div>
        <div className="mp-ccfg-tiers" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {tiers.map((m) => (
            <div key={m.t} className="card" style={{ padding: 18, position: "relative", borderColor: m.popular ? "var(--primary)" : "var(--border)", borderWidth: m.popular ? 2 : 1 }}>
              {m.popular && <span style={{ position: "absolute", top: -10, right: 14, padding: "3px 10px", borderRadius: 9999, background: "var(--primary)", color: "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em" }}>● MÁS POPULAR</span>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 8px", borderRadius: 9999, background: m.color, color: m.color === "#fbbf24" ? "#78350f" : "#fff", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>{m.t}</div>
                  <div className="font-heading" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.035em", marginTop: 8 }}>{m.p}</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: "var(--primary)", marginTop: 2 }}>● {m.d} en todas las reservas</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="label-mp">Socios</div>
                  <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{m.count}</div>
                </div>
              </div>
              <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
                {m.ben.map((b) => (
                  <li key={b} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 11, color: "#0a0a0a" }}>
                    <Icon name="check" size={13} color="var(--primary)" style={{ flexShrink: 0 }} />{b}
                  </li>
                ))}
              </ul>
              <button className="btn" style={{ width: "100%", marginTop: 12, background: "#fff", border: "1px solid var(--border)", fontSize: 10.5 }} onClick={() => onAction(`Editar ${m.t} · próximamente`)}>Editar tier</button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function PagosSection({ onAction }: { onAction: (t: string) => void }) {
  const methods = [
    { l: "Transferencia", on: true, icon: "arrow-left-right" },
    { l: "DeUna", on: true, icon: "smartphone" },
    { l: "Saldo MP", on: true, icon: "wallet" },
    { l: "Efectivo en caja", on: true, icon: "banknote" },
    { l: "Tarjeta (próximo)", on: false, icon: "credit-card" },
    { l: "Crédito MP", on: false, icon: "gift" },
  ];
  const schedule = [
    { k: "daily", l: "Diario", sub: "Cada día hábil · sin mínimo", on: false, recommended: false },
    { k: "weekly", l: "Semanal", sub: "Lunes 09:00 · todo el balance", on: true, recommended: true },
    { k: "biw", l: "Quincenal", sub: "Días 1 y 16 · todo el balance", on: false, recommended: false },
    { k: "manual", l: "Bajo demanda", sub: "Solo cuando lo solicitas", on: false, recommended: false },
  ];
  return (
    <div className="mp-ccfg-pagos" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div className="card" style={{ padding: 22, gridColumn: "span 2" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Cuenta receptora</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Dónde recibes tus payouts<span className="dot">.</span></h3>
          </div>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Añadir cuenta · próximamente")}><Icon name="plus" size={11} />Añadir cuenta</button>
        </div>
        <div className="mp-ccfg-banks" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ padding: 22, borderRadius: 14, background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", top: 14, right: 14, padding: "3px 9px", borderRadius: 9999, background: "var(--primary)", color: "#fff", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.14em" }}>● ACTIVA</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <div style={{ width: 42, height: 28, borderRadius: 5, background: "#fff", color: "#0a0a0a", fontSize: 9, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.1em" }}>BP</div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>Banco Pichincha</div>
            </div>
            <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.05em", marginBottom: 18 }}>···· ···· ···· 5421</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <div>
                <div style={{ fontSize: 8 }}>Titular</div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", marginTop: 2, letterSpacing: "0.01em" }}>Club Norte Pickleball S.A.</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8 }}>Tipo</div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#fff", marginTop: 2, letterSpacing: "0.01em" }}>Ahorros</div>
              </div>
            </div>
          </div>
          <div style={{ padding: 22, borderRadius: 14, background: "#fafafa", color: "#0a0a0a", border: "1.5px dashed var(--border)", position: "relative" }}>
            <span style={{ position: "absolute", top: 14, right: 14, padding: "3px 9px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.14em" }}>○ BACKUP</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
              <div style={{ width: 42, height: 28, borderRadius: 5, background: "#0a0a0a", color: "#fff", fontSize: 9, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.1em" }}>PR</div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>Produbanco</div>
            </div>
            <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.05em", marginBottom: 18, color: "var(--muted-fg)" }}>···· ···· ···· 8124</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <div>
                <div style={{ fontSize: 8 }}>Titular</div>
                <div style={{ fontSize: 11, fontWeight: 900, color: "#0a0a0a", marginTop: 2, letterSpacing: "0.01em" }}>Andrés Calderón</div>
              </div>
              <button onClick={() => onAction("Activar cuenta backup · próximamente")} style={{ background: "transparent", border: 0, color: "var(--primary)", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>Activar →</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp">Esquema de payout</div>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Cuándo te depositamos<span className="dot">.</span></h3>
        {schedule.map((o) => (
          <button key={o.k} onClick={() => onAction(`Payout ${o.l} · próximamente`)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: o.on ? "#ecfdf5" : "transparent", border: o.on ? "1px solid rgba(16,185,129,0.3)" : "1px solid transparent", cursor: "pointer", marginBottom: 6, width: "100%", textAlign: "left", fontFamily: "inherit" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid", borderColor: o.on ? "var(--primary)" : "var(--border)", background: o.on ? "var(--primary)" : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {o.on && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#fff" }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8 }}>{o.l}{o.recommended && <span style={{ fontSize: 8, fontWeight: 900, padding: "2px 6px", borderRadius: 9999, background: "var(--primary)", color: "#fff", letterSpacing: "0.12em" }}>RECOMENDADO</span>}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{o.sub}</div>
            </div>
          </button>
        ))}
        <div style={{ marginTop: 6, padding: 12, background: "var(--muted)", borderRadius: 8, fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Mínimo retiro: <b style={{ color: "#0a0a0a" }}>$50</b>. Por debajo se acumula al siguiente ciclo.
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="label-mp">Comisión MATCHPOINT</div>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Lo que cobramos<span className="dot">.</span></h3>
        <div style={{ padding: 16, background: "linear-gradient(135deg, #0a0a0a, #1f2937)", borderRadius: 12, color: "#fff", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Comisión por transacción</div>
              <div className="font-heading tabular" style={{ fontSize: 34, fontWeight: 900, letterSpacing: "-0.04em", marginTop: 6, color: "var(--primary)" }}>10%</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Plan Estándar · sin contrato</div>
            </div>
            <Icon name="info" size={18} color="rgba(255,255,255,0.5)" />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 14, borderTop: "1px dashed rgba(255,255,255,0.15)", fontSize: 10 }}>
            <div>
              <div style={{ color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>Vol. 30d</div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, marginTop: 2 }}>$14,840</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 800 }}>Pagado a MP</div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, marginTop: 2, color: "#dc2626" }}>–$1,484</div>
            </div>
          </div>
        </div>
        <button className="btn" style={{ width: "100%", background: "#fff", border: "1px solid var(--border)", fontSize: 11 }} onClick={() => onAction("Subir a Plan Pro · próximamente")}><Icon name="trending-up" size={12} />Subir a Plan Pro · 7%</button>

        <div className="label-mp" style={{ marginTop: 20, marginBottom: 10 }}>Métodos de pago aceptados</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {methods.map((m) => (
            <div key={m.l} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, background: m.on ? "#ecfdf5" : "var(--muted)", border: m.on ? "1px solid rgba(16,185,129,0.2)" : "1px solid transparent" }}>
              <Icon name={m.icon} size={12} color={m.on ? "var(--primary)" : "var(--muted-fg)"} />
              <span style={{ fontSize: 10.5, fontWeight: 800, color: m.on ? "#0a0a0a" : "var(--muted-fg)", flex: 1 }}>{m.l}</span>
              <span style={{ fontSize: 8.5, fontWeight: 900, color: m.on ? "var(--primary)" : "var(--muted-fg)", letterSpacing: "0.1em" }}>{m.on ? "● ON" : "○ OFF"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CancelacionSection({ onAction }: { onAction: (t: string) => void }) {
  const steps = [
    { hrs: "+24h", l: "24 h o más antes", r: "100%", color: "var(--primary)", sub: "Reembolso íntegro al método de pago" },
    { hrs: "24–12h", l: "Entre 24 y 12 h", r: "75%", color: "#34d399", sub: "25% se queda como crédito MP" },
    { hrs: "12–4h", l: "Entre 12 y 4 h", r: "50%", color: "#fbbf24", sub: "Mitad como crédito MP, mitad para el club" },
    { hrs: "–4h", l: "Menos de 4 h", r: "0%", color: "#dc2626", sub: "Sin reembolso — la cancha ya se separó" },
    { hrs: "No-show", l: "No se presentó", r: "–$5", color: "#7c1d1d", sub: "Penalización de $5 + bloqueo 24h para reservar" },
  ];
  const rules = [
    { l: "Lluvia en canchas outdoor", sub: "100% reembolso siempre · automático cuando el sensor activa", on: true },
    { l: "Cierre por mantenimiento", sub: "Si tú cancelas: 100% reembolso + crédito de 1 hora cortesía", on: true },
    { l: "Socios Plus / Pro", sub: "Primer no-show del mes sin penalización", on: true },
    { l: "Reservas grupales (6+)", sub: "Política especial: 48h para cancelar al 100%", on: false },
  ];
  return (
    <>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="label-mp">Política · reservas regulares</div>
            <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Línea de tiempo de cancelación<span className="dot">.</span></h3>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>Cuánto le devuelves a un jugador según cuánto antes cancele.</div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Política agresiva · próximamente")}><Icon name="zap" size={11} color="#fff" />Política agresiva</button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 560, position: "relative", padding: "20px 0 40px" }}>
            <div style={{ position: "absolute", top: 36, left: "5%", right: "5%", height: 4, borderRadius: 9999, background: "linear-gradient(90deg, var(--primary) 0%, #34d399 25%, #fbbf24 50%, #dc2626 75%, #7c1d1d 100%)" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, position: "relative" }}>
              {steps.map((s, i) => (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: s.color, color: "#fff", margin: "0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff", boxShadow: "0 0 0 1px " + s.color, position: "relative", zIndex: 1 }}>
                    <span className="font-heading" style={{ fontSize: 11, fontWeight: 900, letterSpacing: "-0.01em" }}>{s.hrs.replace("No-show", "N/S")}</span>
                  </div>
                  <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 10, color: s.color }}>{s.r}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 900, color: "#0a0a0a", marginTop: 2 }}>{s.l}</div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.35 }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
          {[{ l: "Reservas /mes", v: "412", sub: "reservas pagas" }, { l: "Cancelaciones", v: "8.3%", sub: "34 cancelaciones" }, { l: "No-shows", v: "2.1%", sub: "9 multas cobradas" }].map((k) => (
            <div key={k.l} style={{ padding: 12, background: "var(--muted)", borderRadius: 8 }}>
              <div className="label-mp">{k.l}</div>
              <div className="font-heading tabular" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 4 }}>{k.v}</div>
              <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginTop: 14 }}>
        <div className="label-mp">Excepciones · reglas finas</div>
        <h3 className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 14px" }}>Casos especiales<span className="dot">.</span></h3>
        {rules.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i === 0 ? 0 : "1px dashed var(--border)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{r.l}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{r.sub}</div>
            </div>
            <VisualToggle on={r.on} />
          </div>
        ))}
      </div>
    </>
  );
}

function NotificacionesSection({ onAction }: { onAction: (t: string) => void }) {
  const events = [
    { k: "res_new", l: "Reserva confirmada", sub: "Cuando se completa el pago", critical: true },
    { k: "res_rem", l: "Recordatorio 24h", sub: "24 horas antes del juego", critical: false },
    { k: "res_rem1", l: "Recordatorio 1h", sub: "1 hora antes del juego", critical: false },
    { k: "res_cancel", l: "Reserva cancelada", sub: "Por el jugador o por el club", critical: true },
    { k: "pay_ok", l: "Pago recibido", sub: "Confirmación a la caja", critical: false },
    { k: "rain", l: "Cierre por lluvia", sub: "Cuando el sensor activa", critical: true },
    { k: "event_new", l: "Inscripción a evento", sub: "Nuevo participante", critical: false },
    { k: "membership", l: "Renovación de membresía", sub: "7 días antes de vencer", critical: false },
  ];
  const channels = [
    { k: "push", l: "Push", icon: "bell" },
    { k: "email", l: "Email", icon: "mail" },
    { k: "sms", l: "SMS", icon: "message-square" },
    { k: "wa", l: "WhatsApp", icon: "message-circle" },
  ];
  const matrix: Record<string, Record<string, "all" | "staff" | "off">> = {
    res_new: { push: "staff", email: "all", sms: "off", wa: "all" },
    res_rem: { push: "all", email: "all", sms: "off", wa: "all" },
    res_rem1: { push: "all", email: "off", sms: "all", wa: "off" },
    res_cancel: { push: "all", email: "all", sms: "all", wa: "all" },
    pay_ok: { push: "staff", email: "staff", sms: "off", wa: "off" },
    rain: { push: "all", email: "all", sms: "all", wa: "all" },
    event_new: { push: "staff", email: "staff", sms: "off", wa: "off" },
    membership: { push: "all", email: "all", sms: "off", wa: "all" },
  };
  const states = {
    all: { l: "Todos", bg: "var(--primary)", fg: "#fff" },
    staff: { l: "Staff", bg: "#0a0a0a", fg: "#fff" },
    off: { l: "○", bg: "var(--muted)", fg: "var(--muted-fg)" },
  };
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp">Matriz · evento × canal</div>
          <h3 className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: "4px 0 0" }}>Cuándo escribimos a quién<span className="dot">.</span></h3>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>Toca una celda para alternar entre <b>Todos / Staff / Off</b>.</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Plantilla mínima · próximamente")}>Plantilla mínima</button>
          <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }} onClick={() => onAction("Plantilla completa · próximamente")}>Plantilla completa</button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr) 80px", gap: 6, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div className="label-mp">Evento</div>
            {channels.map((c) => (
              <div key={c.k} style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <Icon name={c.icon} size={13} color="var(--muted-fg)" />
                <span className="label-mp" style={{ fontSize: 9 }}>{c.l}</span>
              </div>
            ))}
            <div className="label-mp" style={{ textAlign: "center", fontSize: 9 }}>Crítico</div>
          </div>

          {events.map((e) => (
            <div key={e.k} style={{ display: "grid", gridTemplateColumns: "1.6fr repeat(4, 1fr) 80px", gap: 6, alignItems: "center", padding: "12px 0", borderTop: "1px dashed var(--border)" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{e.l}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>{e.sub}</div>
              </div>
              {channels.map((c) => {
                const s = states[matrix[e.k][c.k]];
                return (
                  <div key={c.k} style={{ textAlign: "center" }}>
                    <button onClick={() => onAction(`${e.l} · ${c.l} · próximamente`)} style={{ padding: "6px 10px", borderRadius: 8, background: s.bg, color: s.fg, border: 0, fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", minWidth: 56, fontFamily: "inherit" }}>{s.l}</button>
                  </div>
                );
              })}
              <div style={{ textAlign: "center" }}>
                {e.critical && <span style={{ fontSize: 9, fontWeight: 900, padding: "3px 8px", borderRadius: 9999, background: "rgba(220,38,38,0.1)", color: "#dc2626", letterSpacing: "0.1em" }}>● ALWAYS</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 12, background: "var(--muted)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="info" size={14} color="var(--muted-fg)" />
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
          Los SMS tienen un costo de <b style={{ color: "#0a0a0a" }}>$0.04/mensaje</b>. WhatsApp Business es gratis para confirmaciones e ilimitado para socios Plus/Pro.
        </div>
      </div>
    </div>
  );
}

function ReglasSection({ onAction }: { onAction: (t: string) => void }) {
  const reglas = [
    { l: "Edad mínima sin acompañante", d: "14 años. Menores entran con un adulto.", icon: "baby", on: true },
    { l: "Vestimenta deportiva", d: "Obligatoria. Sin jeans ni ropa de calle.", icon: "shirt", on: true },
    { l: "Calzado de cancha", d: "Sin marcas en la cancha. Suela limpia.", icon: "footprints", on: true },
    { l: "Mascotas", d: "No permitidas en zona de juego.", icon: "paw-print", on: false },
    { l: "Bebidas alcohólicas", d: "Solo en cafetería. Cero en cancha.", icon: "wine", on: true },
    { l: "Música externa", d: "Con audífonos. Sin parlantes Bluetooth.", icon: "music", on: true },
    { l: "Fotos & videos", d: "OK en zonas comunes. Avisa antes de filmar.", icon: "camera", on: true },
    { l: "Llegada tardía", d: "Tu hora corre desde el momento reservado.", icon: "timer-off", on: true },
    { l: "Invitados externos", d: "Máx 1 invitado/socio · paga walk-in.", icon: "user-plus", on: true },
  ];
  return (
    <>
      <div className="mp-ccfg-reglas" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {reglas.map((r, i) => (
          <div key={i} className="card" style={{ padding: 16, opacity: r.on ? 1 : 0.55 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: r.on ? "rgba(16,185,129,0.1)" : "var(--muted)", color: r.on ? "var(--primary)" : "var(--muted-fg)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name={r.icon} size={16} color={r.on ? "var(--primary)" : "var(--muted-fg)"} />
              </div>
              <VisualToggle on={r.on} w={32} h={18} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 900, lineHeight: 1.25 }}>{r.l}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.4 }}>{r.d}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 16, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--muted)", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="plus-circle" size={18} color="var(--primary)" />
          <div>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Añadir regla personalizada</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 1 }}>Hasta 12 reglas en total. Llevas {reglas.filter((r) => r.on).length} activas.</div>
          </div>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 10 }} onClick={() => onAction("Nueva regla · próximamente")}>Nueva regla<Icon name="arrow-right" size={11} color="#fff" /></button>
      </div>
    </>
  );
}
