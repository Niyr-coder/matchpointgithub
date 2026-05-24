"use client";
// Club Owner · Configuración v2 — 7 secciones en sidebar lateral. Cada
// sección vive en su propio archivo en owner/config-sections/. La fase
// de cableado a backend la hicieron 4 agentes en paralelo, uno por par
// de secciones.
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "@/components/dashboard/widgets/PolHero";
import { useToast } from "@/components/dashboard/ToastProvider";
import { IdentidadSection, type IdentidadData } from "@/components/dashboard/owner/config-sections/IdentidadSection";
import { HorariosSection, type HorariosData } from "@/components/dashboard/owner/config-sections/HorariosSection";
import { TarifasSection, type TarifasData } from "@/components/dashboard/owner/config-sections/TarifasSection";
import { PagosSection, type PagosData } from "@/components/dashboard/owner/config-sections/PagosSection";
import { CancelacionSection, type CancelacionData } from "@/components/dashboard/owner/config-sections/CancelacionSection";
import { NotificacionesSection, type NotificacionesData } from "@/components/dashboard/owner/config-sections/NotificacionesSection";
import { ReglasSection, type ReglasData } from "@/components/dashboard/owner/config-sections/ReglasSection";

export type ClubConfigData = {
  clubId: string | null;
  identidad?: IdentidadData;
  horarios?: HorariosData;
  tarifas?: TarifasData;
  pagos?: PagosData;
  cancelacion?: CancelacionData;
  notificaciones?: NotificacionesData;
  reglas?: ReglasData;
  healthScore: number;
  healthMissing: string[];
};

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

export function ClubConfigView({ data }: { data?: ClubConfigData }) {
  const toast = useToast();
  const [active, setActive] = useState<SectionKey>("identidad");
  const cur = SECTIONS.find((s) => s.k === active)!;
  const soon = (title: string) => toast({ icon: "sparkles", title });

  const healthScore = data?.healthScore ?? 88;
  const healthMissing = data?.healthMissing ?? [
    "foto de portada en alta resolución",
    "3 reglas más",
  ];

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
            <button className="btn btn-primary" onClick={() => toast({ icon: "check-circle-2", title: "Cambios guardados" })}>
              <Icon name="save" size={13} color="#fff" />Guardar cambios
            </button>
          </div>
        }
      />

      <div className="mp-ccfg-grid" style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "flex-start" }}>
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
              <span className="font-heading tabular" style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.035em", color: "var(--primary)" }}>{healthScore}</span>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>/ 100</span>
            </div>
            <div style={{ height: 5, background: "rgba(255,255,255,0.1)", borderRadius: 9999, marginTop: 8, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${healthScore}%`, background: "var(--primary)" }} />
            </div>
            {healthMissing.length > 0 && (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 10, lineHeight: 1.4 }}>
                Falta: {healthMissing.map((m, i) => (
                  <span key={i}>
                    <b style={{ color: "#fbbf24" }}>{m}</b>
                    {i < healthMissing.length - 1 ? (i === healthMissing.length - 2 ? " y " : ", ") : ""}
                  </span>
                ))} para llegar a 100.
              </div>
            )}
          </div>
        </div>

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
            {active === "identidad" && <IdentidadSection onAction={soon} data={data?.identidad} />}
            {active === "horarios" && <HorariosSection onAction={soon} data={data?.horarios} clubId={data?.clubId ?? undefined} />}
            {active === "tarifas" && <TarifasSection onAction={soon} data={data?.tarifas} />}
            {active === "pagos" && <PagosSection onAction={soon} data={data?.pagos} />}
            {active === "cancel" && <CancelacionSection onAction={soon} data={data?.cancelacion} clubId={data?.clubId ?? undefined} />}
            {active === "notif" && <NotificacionesSection onAction={soon} data={data?.notificaciones} />}
            {active === "reglas" && <ReglasSection onAction={soon} data={data?.reglas} clubId={data?.clubId} />}
          </div>
        </div>
      </div>
    </div>
  );
}
