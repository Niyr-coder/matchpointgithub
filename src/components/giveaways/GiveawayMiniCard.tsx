"use client";

import { Icon } from "@/components/Icon";
import { Countdown } from "./Countdown";
import { StripedImg } from "./handoff/StripedImg";

type Props = {
  title: string;
  entryCount: number;
  myEntries?: number;
  urgent?: boolean;
  closesIn?: { days: number; hours: number };
  imageLabel?: string;
  imageUrl?: string | null;
  onParticipate?: () => void;
  participateLabel?: string;
};

/** Mini card del rail — 1:1 con club-web.jsx GiveawayMiniCard */
export function GiveawayMiniCard({
  title,
  entryCount,
  myEntries = 0,
  urgent = false,
  closesIn,
  imageLabel = "SORTEO · MATCHPOINT",
  imageUrl,
  onParticipate,
  participateLabel,
}: Props) {
  const cta = participateLabel ?? (myEntries > 0 ? "Sumar entradas" : "Participar");

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: urgent ? "var(--destructive-border)" : "var(--border)",
      }}
    >
      {imageUrl ? (
        <div
          style={{
            height: 80,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ) : (
        <StripedImg label={imageLabel} height={80} style={{ borderRadius: 0 }} />
      )}
      <div style={{ padding: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 6,
            marginBottom: 6,
          }}
        >
          <span className="chip chip-emerald" style={{ fontSize: 9 }}>
            SORTEO
          </span>
          {closesIn ? <Countdown days={closesIn.days} hours={closesIn.hours} urgent={urgent} /> : null}
        </div>
        <div
          className="font-heading"
          style={{ fontSize: 13.5, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.15 }}
        >
          {title}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4, fontWeight: 600 }}>
          {entryCount} participantes
          {myEntries > 0 ? (
            <span style={{ color: "var(--primary-dark)", fontWeight: 900 }}> · {myEntries} entradas tuyas</span>
          ) : null}
        </div>
        <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10, width: "100%" }} onClick={onParticipate}>
          {cta}
        </button>
      </div>
    </div>
  );
}
