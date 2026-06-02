"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import type { ProfileMatch } from "./profile-types";
import type { ShowcasePins } from "@/lib/profile/showcase-pins";

type OpponentOption = { name: string; played: number; wins: number };
type BadgeOption = { kind: string; label: string; on: boolean };

export function EditShowcasePinsModal({
  initial,
  matches,
  opponents,
  badges,
  onClose,
  onSave,
}: {
  initial: ShowcasePins;
  matches: ProfileMatch[];
  opponents: OpponentOption[];
  badges: BadgeOption[];
  onClose: () => void;
  onSave: (pins: ShowcasePins) => void;
}) {
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "inherit",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="showcase-pins-title"
        className="card"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "min(88vh, 640px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 22,
          background: "#fff",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 id="showcase-pins-title" className="font-heading" style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
            Elegir pins
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn"
            style={{ background: "transparent", border: 0, padding: 4, color: "var(--muted-fg)" }}
            aria-label="Cerrar"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
          Elige qué match, rival e insignia destacar en tu perfil. Se guardan en este dispositivo.
        </p>

        <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 18, paddingRight: 4 }}>
          <PinSection title="Match memorable">
            {matches.length === 0 ? (
              <SectionEmpty text="Aún no tienes matches confirmados." />
            ) : (
              matches.slice(0, 12).map((m) => (
                <PinOption
                  key={m.id}
                  active={draft.matchId === m.id}
                  onSelect={() => setDraft((d) => ({ ...d, matchId: m.id }))}
                  title={`vs. ${m.oppName}`}
                  sub={`${m.result === "win" ? "Victoria" : "Derrota"} · ${new Date(m.playedAt).toLocaleDateString("es-EC", { day: "numeric", month: "short" })}`}
                />
              ))
            )}
          </PinSection>

          <PinSection title="H2H reciente">
            {opponents.length === 0 ? (
              <SectionEmpty text="Juega más partidos para ver rivales frecuentes." />
            ) : (
              opponents.map((o) => (
                <PinOption
                  key={o.name}
                  active={draft.opponentName === o.name}
                  onSelect={() => setDraft((d) => ({ ...d, opponentName: o.name }))}
                  title={o.name}
                  sub={`${o.played} matches · ${o.wins}W`}
                />
              ))
            )}
          </PinSection>

          <PinSection title="Insignia top">
            {badges.length === 0 ? (
              <SectionEmpty text="Completa actividad para desbloquear insignias." />
            ) : (
              badges.map((b) => (
                <PinOption
                  key={b.kind}
                  active={draft.badgeKind === b.kind}
                  onSelect={() => setDraft((d) => ({ ...d, badgeKind: b.kind }))}
                  title={b.label}
                  sub={b.on ? "Conseguida" : "Pendiente"}
                />
              ))
            )}
          </PinSection>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancelar
          </button>
          <button type="button" onClick={() => onSave(draft)} className="btn btn-primary">
            <Icon name="check" size={13} />
            Guardar pins
          </button>
        </div>
      </div>
    </div>
  );
}

function PinSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="label-mp" style={{ marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function PinOption({
  active,
  onSelect,
  title,
  sub,
}: {
  active: boolean;
  onSelect: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 10,
        border: active ? "2px solid var(--primary)" : "1px solid var(--border)",
        background: active ? "rgba(16,185,129,0.08)" : "#fff",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0a0a0a" }}>{title}</div>
      <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--muted-fg)" }}>{sub}</div>
    </button>
  );
}

function SectionEmpty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--muted-fg)", fontStyle: "italic" }}>{text}</div>;
}
