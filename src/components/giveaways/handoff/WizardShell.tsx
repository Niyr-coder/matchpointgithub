"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { GiveawayWizardSteps } from "../GiveawayWizardSteps";
import { SectionHead } from "./SectionHead";

type Props = {
  step: number;
  children: ReactNode;
  primaryLabel?: string;
  onBack?: () => void;
  onPrimary?: () => void;
  onSaveDraft?: () => void;
  pending?: boolean;
};

const WIZARD_ITEMS = ["Premio", "Mecánica", "Reglas y fechas", "Publicar"] as const;

export function WizardShell({
  step,
  children,
  primaryLabel = "Continuar",
  onBack,
  onPrimary,
  onSaveDraft,
  pending,
}: Props) {
  return (
    <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
        <Icon name="arrow-left" size={11} /> Sorteos del club
        <Icon name="chevron-right" size={10} />
        <span style={{ color: "var(--fg)" }}>Nuevo sorteo</span>
      </div>
      <SectionHead
        kicker={`Paso ${step} de 4 · Crear sorteo`}
        title={WIZARD_ITEMS[step - 1] ?? "Sorteo"}
        sub="El sorteo se publica solo cuando completes los 4 pasos. Puedes guardar como borrador en cualquier momento."
      />
      <div className="card" style={{ padding: 18 }}>
        <GiveawayWizardSteps step={step} items={[...WIZARD_ITEMS]} />
      </div>
      <div className="card" style={{ padding: 24 }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button type="button" className="btn btn-ghost" onClick={onSaveDraft} disabled={pending}>
          <Icon name="save" size={12} /> Guardar borrador
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {step > 1 && onBack ? (
            <button type="button" className="btn btn-outline" onClick={onBack} disabled={pending}>
              Atrás
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onPrimary} disabled={pending}>
            {primaryLabel} <Icon name="arrow-right" size={12} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}
