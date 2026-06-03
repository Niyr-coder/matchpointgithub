"use client";

import { Icon } from "@/components/Icon";

type Props = {
  clubName: string;
  followClub: boolean;
  acceptRules: boolean;
  pending?: boolean;
  onFollowChange: (v: boolean) => void;
  onAcceptChange: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Sheet iOS — JoinPrereqs (gw-join-mobile.jsx) */
export function GiveawayPrereqSheet({
  clubName,
  followClub,
  acceptRules,
  pending,
  onFollowChange,
  onAcceptChange,
  onCancel,
  onConfirm,
}: Props) {
  const rows = [
    {
      label: `Seguir a ${clubName}`,
      sub: "Para verlos en tu feed y recibir avisos",
      icon: "heart" as const,
      checked: followClub,
      onChange: onFollowChange,
    },
    {
      label: "Acepto las reglas del sorteo",
      sub: "Sorteo válido según términos del club",
      icon: "file-check" as const,
      checked: acceptRules,
      onChange: onAcceptChange,
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(10,10,10,0.45)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fff",
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          padding: "12px 0 16px",
          display: "flex",
          flexDirection: "column",
          maxHeight: "82%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: "#d4d4d4" }} />
        </div>

        <div style={{ padding: "0 18px 4px" }}>
          <div className="label-mp">Antes de participar</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              margin: "4px 0 4px",
              lineHeight: 1.1,
            }}
          >
            Casi listo<span style={{ color: "var(--primary)" }}>.</span>
          </h2>
          <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>
            Necesitas seguir a {clubName} y aceptar las reglas. Después, vas directo al sorteo con tu primera entrada.
          </div>
        </div>

        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <button
              key={r.label}
              type="button"
              className="card"
              style={{
                padding: 12,
                display: "grid",
                gridTemplateColumns: "34px 1fr 44px",
                gap: 10,
                alignItems: "center",
                borderColor: r.checked ? "var(--primary)" : "var(--border)",
                cursor: "pointer",
                textAlign: "left",
                background: "#fff",
              }}
              onClick={() => r.onChange(!r.checked)}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: "var(--primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name={r.icon} size={15} color="var(--primary-dark)" />
              </div>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{r.label}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 2 }}>{r.sub}</div>
              </div>
              <div
                style={{
                  width: 38,
                  height: 22,
                  borderRadius: 9999,
                  position: "relative",
                  background: r.checked ? "var(--primary)" : "var(--muted)",
                  transition: "background 0.15s",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 2,
                    left: r.checked ? 18 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 0.15s",
                  }}
                />
              </div>
            </button>
          ))}
        </div>

        <div style={{ padding: "0 18px", fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Al continuar autorizas que MATCHPOINT use tu usuario en la transmisión del sorteo y te contacte si ganas.
        </div>

        <div style={{ padding: "14px 18px 0", display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-outline" style={{ flex: 1, padding: 12 }} onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 2, padding: 12 }} disabled={pending} onClick={onConfirm}>
            <Icon name="check" size={12} color="#fff" /> Seguir y participar
          </button>
        </div>
      </div>
    </div>
  );
}
