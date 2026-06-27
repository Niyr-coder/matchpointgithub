"use client";

import { useState } from "react";

export type PartnerTorneoGestionTab = "operacion" | "configuracion" | "inscritos";

const TABS: { id: PartnerTorneoGestionTab; label: string }[] = [
  { id: "operacion", label: "Operación" },
  { id: "configuracion", label: "Configuración" },
  { id: "inscritos", label: "Inscritos" },
];

export function PartnerTorneoGestionShell({
  defaultTab = "operacion",
  operacion,
  configuracion,
  inscritos,
  rail,
}: {
  defaultTab?: PartnerTorneoGestionTab;
  operacion: React.ReactNode;
  configuracion: React.ReactNode;
  inscritos: React.ReactNode;
  rail: React.ReactNode;
}) {
  const [tab, setTab] = useState<PartnerTorneoGestionTab>(defaultTab);

  return (
    <div className="mp-partner-torneo-gestion-shell">
      <div className="mp-partner-torneo-gestion-grid">
        <div className="mp-partner-torneo-gestion-main">
          <div
            className="mp-partner-torneo-gestion-tabs"
            role="tablist"
            aria-label="Secciones de gestión"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`mp-partner-torneo-gestion-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mp-partner-torneo-gestion-panel" role="tabpanel">
            {tab === "operacion"
              ? operacion
              : tab === "configuracion"
                ? configuracion
                : inscritos}
          </div>
        </div>
        <aside className="mp-partner-torneo-gestion-rail" aria-label="Resumen y acciones">
          {rail}
        </aside>
      </div>
    </div>
  );
}
