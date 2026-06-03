"use client";

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { OwnerBadge } from "@/components/giveaways";
import { MobileHeroStat, MobileMechanicRow, StripedImg } from "@/components/giveaways/handoff";
import type { GiveawayDetailView } from "@/lib/schemas/giveaways";
import type { MechanicKind } from "@/components/giveaways/types";

type Props = {
  data: GiveawayDetailView;
  participating: boolean;
  ended: boolean;
  isOpen: boolean;
  closesLabel: string;
  imageLabel: string;
  pending?: boolean;
  onParticipate: () => void;
  onRefreshMechanics: () => void;
  onMechanicAction: (kind: MechanicKind) => void;
  mechanicActionLabel: (kind: MechanicKind) => string | undefined;
};

/** Pantalla 03 — JoinDetail (gw-join-mobile.jsx) */
export function GiveawayDetailMobile({
  data,
  participating,
  ended,
  isOpen,
  closesLabel,
  imageLabel,
  pending,
  onParticipate,
  onRefreshMechanics,
  onMechanicAction,
  mechanicActionLabel,
}: Props) {
  return (
    <div className="gw-detail-mobile-only" style={{ background: "#fafafa", position: "relative", minHeight: "100%" }}>
      <div className="hero-emerald" style={{ position: "relative", color: "#fff", padding: "14px 18px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <Link
            href={`/dashboard/clubes/${data.clubSlug}`}
            className="btn"
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)", textDecoration: "none" }}
          >
            <Icon name="arrow-left" size={11} color="#fff" />
          </Link>
          <button
            type="button"
            className="btn"
            style={{ padding: "6px 10px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.22)" }}
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.share) {
                void navigator.share({ title: data.title, url: window.location.href });
              }
            }}
          >
            <Icon name="share-2" size={11} color="#fff" />
          </button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <OwnerBadge owner={data.ownerType} name={data.clubName} />
        </div>

        {data.prizeImageUrl ? (
          <div style={{ height: 150, borderRadius: 12, backgroundImage: `url(${data.prizeImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
        ) : (
          <StripedImg label={imageLabel} height={150} dark style={{ borderRadius: 12 }} />
        )}

        <div className="label-mp" style={{ color: "var(--gw-accent-soft)", marginTop: 14 }}>
          El premio
        </div>
        <h1
          className="font-heading"
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: "-0.03em",
            textTransform: "uppercase",
            margin: "4px 0 6px",
            lineHeight: 1,
          }}
        >
          {data.title}
          <span style={{ color: "var(--gw-accent)" }}>.</span>
        </h1>
        {data.subtitle && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.78)", margin: 0, lineHeight: 1.5 }}>
            {data.subtitle}.
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 16 }}>
          <MobileHeroStat label="Participan" value={data.entryCount} />
          <MobileHeroStat label="Cierra" value={closesLabel} />
          <MobileHeroStat label="Max entradas" value={data.maxEntriesPerUser} accent />
        </div>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, paddingBottom: 90 }}>
        <div>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Cómo sumar entradas
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.mechanics.map((m) => (
              <MobileMechanicRow
                key={m.kind}
                kind={m.kind}
                label={m.label}
                weight={m.weight}
                done={participating ? m.done : false}
                pending={participating ? m.pending : false}
                preview={!participating}
                actionLabel={mechanicActionLabel(m.kind)}
                onAction={
                  participating && !m.done && !m.pending && (m.autoVerify || m.kind === "share" || m.kind === "pay")
                    ? () => onMechanicAction(m.kind)
                    : undefined
                }
              />
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div className="label-mp">Sorteo en vivo</div>
          <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 4 }}>
            {data.drawAt ? new Date(data.drawAt).toLocaleString("es-EC") : "Por confirmar"}
            {data.drawChannel ? ` · ${data.drawChannel}` : ""}
          </div>
        </div>
      </div>

      {!ended && isOpen && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "#fff",
            borderTop: "1px solid var(--border)",
            padding: "12px 14px 16px",
            display: "flex",
            gap: 8,
            zIndex: 50,
          }}
        >
          <Link href="/dashboard/user/mis-sorteos" className="btn btn-outline" style={{ padding: 12, textDecoration: "none" }}>
            <Icon name="bookmark" size={13} />
          </Link>
          {participating ? (
            <button type="button" className="btn btn-primary" style={{ flex: 1, padding: 12 }} disabled={pending} onClick={onRefreshMechanics}>
              Sumar más entradas
            </button>
          ) : (
            <button type="button" className="btn btn-primary" style={{ flex: 1, padding: 12 }} disabled={pending} onClick={onParticipate}>
              <Icon name="ticket" size={13} color="#fff" /> Participar gratis
            </button>
          )}
        </div>
      )}
    </div>
  );
}
