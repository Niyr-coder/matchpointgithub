"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import {
  CLUB_PROMO_TEMPLATES,
  type ClubPromoTemplate,
  type ClubPromoTemplateKey,
} from "@/lib/marketing/club-promo-templates";

type Props = {
  open: boolean;
  busy?: boolean;
  existingTemplateKeys: string[];
  onClose: () => void;
  onCreate: (templateKey: ClubPromoTemplateKey, maxUses: number) => void;
};

export function CreateClubPromoModal({
  open,
  busy,
  existingTemplateKeys,
  onClose,
  onCreate,
}: Props) {
  const [selected, setSelected] = useState<ClubPromoTemplateKey | null>(null);
  const [maxUses, setMaxUses] = useState<number>(100);

  if (!open) return null;

  const tpl = selected ? CLUB_PROMO_TEMPLATES.find((t) => t.key === selected) : null;

  const pick = (t: ClubPromoTemplate) => {
    if (existingTemplateKeys.includes(t.key)) return;
    setSelected(t.key);
    setMaxUses(t.defaultMax);
  };

  const submit = () => {
    if (!selected || !tpl) return;
    onCreate(selected, maxUses);
  };

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(10,10,10,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-labelledby="create-promo-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div className="label-mp">Nueva campaña</div>
            <div
              id="create-promo-title"
              className="font-heading"
              style={{
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Elige una plantilla
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: 0,
              fontSize: 22,
              cursor: "pointer",
              color: "var(--muted-fg)",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {CLUB_PROMO_TEMPLATES.map((t) => {
              const taken = existingTemplateKeys.includes(t.key);
              const active = selected === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={taken || busy}
                  onClick={() => pick(t)}
                  style={{
                    textAlign: "left",
                    padding: 0,
                    border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
                    borderRadius: 12,
                    overflow: "hidden",
                    cursor: taken ? "not-allowed" : "pointer",
                    opacity: taken ? 0.45 : 1,
                    background: "#fff",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      height: 72,
                      background: t.bg,
                      padding: 12,
                      color: "#fff",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                    }}
                  >
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.14em", opacity: 0.8 }}>
                      {t.kind}
                    </div>
                    <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>
                      {t.title}
                    </div>
                  </div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.4 }}>{t.description}</div>
                    <div
                      style={{
                        marginTop: 8,
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 11,
                        fontWeight: 900,
                      }}
                    >
                      {t.code}
                    </div>
                    {taken && (
                      <div style={{ marginTop: 6, fontSize: 10, color: "#dc2626", fontWeight: 800 }}>
                        Ya tienes esta campaña
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {tpl && (
            <div style={{ padding: 14, background: "var(--muted)", borderRadius: 10 }}>
              <label
                htmlFor="promo-max-uses"
                style={{
                  display: "block",
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Límite de usos
              </label>
              <input
                id="promo-max-uses"
                type="number"
                min={1}
                max={10000}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, Number(e.target.value) || tpl.defaultMax))}
                style={{
                  width: "100%",
                  maxWidth: 160,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontFamily: "inherit",
                  fontSize: 13,
                }}
              />
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 6 }}>
                Vence en {tpl.defaultDays} días · se envía in-app a clientes con reservas en tu club
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selected || busy}
              onClick={submit}
            >
              <Icon name="plus" size={13} color="#fff" />
              {busy ? "Creando…" : "Crear campaña"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
