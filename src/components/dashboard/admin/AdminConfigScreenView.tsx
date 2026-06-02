// Client view de AdminConfigScreen — layout 1:1 (RoleScreensPolish.jsx 467-558).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { setMultisportEnabled } from "@/server/actions/platform-config";

type Item = [string, string] | [string, string, "critical"];
type Section = { i: string; t: string; items: Item[] };

export type ConfigData = {
  adminCount: number;
  multisportEnabled: boolean;
};

export function AdminConfigScreenView({ data }: { data: ConfigData }) {
  useRealtimeRefresh([{ table: "role_assignments" }], { debounceMs: 4000 });

  // Constantes del producto + counts derivados. Filas sin modelo backend → `—`.
  const SECTIONS: Record<string, Section> = {
    general: {
      i: "sliders-horizontal",
      t: "General",
      items: [
        ["Nombre de la plataforma", "MATCHPOINT"],
        ["País", "🇪🇨 Ecuador"],
        ["Moneda por defecto", "USD ($)"],
        ["Locale", "es-EC"],
        ["Zona horaria", "America/Guayaquil (UTC-5)"],
        ["Dominio", "matchpoint.app"],
      ],
    },
    deportes: {
      i: "trophy",
      t: "Deportes",
      items: [], // render custom (toggle multideporte)
    },
    pagos: {
      i: "wallet",
      t: "Pagos",
      items: [
        ["Comisión MATCHPOINT", "10%", "critical"],
        ["Procesador", "—"],
        ["Payout schedule", "—"],
        ["Mínimo payout", "—"],
        ["Retención fiscal Ecuador", "—"],
        ["Reembolsos automáticos", "—"],
      ],
    },
    mod: {
      i: "shield-alert",
      t: "Moderación",
      items: [
        ["Auto-ban tras N reportes", "—", "critical"],
        ["Filtro de palabras", "—"],
        ["SLA severidad alta", "—"],
        ["SLA severidad media", "—"],
        ["Moderadores activos", `${data.adminCount} ${data.adminCount === 1 ? "usuario" : "usuarios"}`],
        ["Apelaciones", "—"],
      ],
    },
    eventos: {
      i: "trophy",
      t: "Eventos",
      items: [
        ["Premio mínimo", "—"],
        ["Cupos máximos", "—"],
        ["Pago obligatorio para inscripción", "—"],
        ["Cuota MP en eventos", "Misma que reservas · 10%"],
        ["Edición tras publicación", "—"],
      ],
    },
    integraciones: {
      i: "plug",
      t: "Integraciones",
      items: [
        ["PSP de pagos", "○ No implementado"],
        ["Google Maps", "○ Sin configurar"],
        ["OneSignal Push", "○ Sin configurar"],
        ["Mailgun (email)", "○ Sin configurar"],
        ["Twilio (SMS)", "○ Sin configurar"],
        ["Slack (alerts)", "○ Sin configurar"],
      ],
    },
  };
  const SECTION_KEYS = Object.keys(SECTIONS);

  const [active, setActive] = useState<string>("general");
  const cur = SECTIONS[active];

  const router = useRouter();
  const toast = useToast();
  const [savingMultisport, startMultisport] = useTransition();
  const toggleMultisport = () => {
    const next = !data.multisportEnabled;
    startMultisport(async () => {
      const res = await setMultisportEnabled({ enabled: next });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: next ? "Multideporte activado" : "Solo Pickleball",
        sub: next ? "Pádel y Tenis disponibles en toda la app." : "Pádel y Tenis ocultos.",
      });
      router.refresh();
    });
  };

  return (
    <>
      <PolHero
        tone="dark"
        wm="SETUP"
        accent="#dc2626"
        label="Plataforma · Configuración"
        title="Settings de la plataforma"
        sub="Cambios aquí afectan a toda la app. Pisa con cuidado."
        right={
          <button className="btn btn-primary">
            <Icon name="save" size={13} />
            Guardar cambios
          </button>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px 1fr",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        <div className="card" style={{ padding: 8 }}>
          {SECTION_KEYS.map((k) => {
            const s = SECTIONS[k];
            const on = active === k;
            return (
              <button
                key={k}
                onClick={() => setActive(k)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "11px 12px",
                  borderRadius: 8,
                  background: on ? "#ecfdf5" : "transparent",
                  border: 0,
                  borderLeft: on ? "3px solid var(--primary)" : "3px solid transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 7,
                    background: on ? "var(--primary)" : "var(--muted)",
                    color: on ? "#fff" : "#0a0a0a",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={s.i} size={13} />
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: on ? 900 : 700,
                    color: on ? "#0a0a0a" : "var(--muted-fg)",
                  }}
                >
                  {s.t}
                </div>
                {on && (
                  <span style={{ marginLeft: "auto" }}>
                    <Icon name="chevron-right" size={13} color="var(--muted-fg)" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              paddingBottom: 16,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 11,
                background: "var(--primary)",
                color: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name={cur.i} size={20} />
            </div>
            <div>
              <div className="label-mp">Configuración</div>
              <h2
                className="font-heading"
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {cur.t}
                <span className="dot">.</span>
              </h2>
            </div>
          </div>
          {active === "deportes" ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                padding: "16px 0",
              }}
            >
              <div style={{ maxWidth: 460 }}>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Multideporte</div>
                <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.5 }}>
                  Si está apagado, solo <b>Pickleball</b> aparece en toda la plataforma
                  (selectores, formularios, filtros). Al activarlo se habilitan
                  <b> Pádel</b> y <b>Tenis</b>.
                </div>
              </div>
              <button
                role="switch"
                aria-checked={data.multisportEnabled}
                onClick={toggleMultisport}
                disabled={savingMultisport}
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 9999,
                  background: data.multisportEnabled ? "var(--primary)" : "#d4d4d8",
                  position: "relative",
                  border: 0,
                  cursor: savingMultisport ? "not-allowed" : "pointer",
                  flexShrink: 0,
                  transition: "background 180ms var(--ease-out, ease)",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: data.multisportEnabled ? 23 : 3,
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: "#fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transition: "left 180ms var(--ease-out, ease)",
                  }}
                />
              </button>
            </div>
          ) : (
          cur.items.map(([k, v, critical], i) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 0",
                borderTop: i === 0 ? 0 : "1px dashed var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{k}</div>
                {critical && (
                  <div
                    style={{
                      fontSize: 9.5,
                      color: "#dc2626",
                      fontWeight: 900,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      marginTop: 3,
                    }}
                  >
                    ⚠ Cambio crítico
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 900,
                    color: v.startsWith("●")
                      ? "var(--primary)"
                      : v.startsWith("○") || v === "—"
                      ? "var(--muted-fg)"
                      : "#0a0a0a",
                  }}
                >
                  {v}
                </span>
                <button
                  className="btn"
                  style={{
                    background: "#fff",
                    border: "1px solid var(--border)",
                    padding: "5px 12px",
                    fontSize: 10,
                  }}
                >
                  Editar
                </button>
              </div>
            </div>
          ))
          )}
        </div>
      </div>
    </>
  );
}
