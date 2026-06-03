"use client";

import { Icon } from "@/components/Icon";
import { StripedImg } from "./handoff/StripedImg";
import type { FeedPostBadge } from "./types";

type Props = {
  clubName: string;
  postedAt: string;
  badge: FeedPostBadge;
  title: string;
  body: string;
  imageLabel?: string;
  imageUrl?: string | null;
  ctaLabel?: string;
  onCta?: () => void;
  likes?: number;
  comments?: number;
};

/** Feed post mobile — 1:1 con club-mobile.jsx MobileFeedPost */
export function FeedPostMobile({
  clubName,
  postedAt,
  badge,
  title,
  body,
  imageLabel,
  imageUrl,
  ctaLabel,
  onCta,
  likes = 0,
  comments = 0,
}: Props) {
  const badgeColor: Record<FeedPostBadge, string> = {
    GIVEAWAY: "chip-emerald",
    TORNEO: "chip-warn",
    RESULTADO: "chip-info",
    FOTO: "chip-onyx",
    AVISO: "chip-warn",
    SPOTLIGHT: "chip-partner",
  };

  return (
    <div style={{ background: "#fff", borderTop: "6px solid #fafafa" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            background: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 900,
            fontSize: 11,
          }}
        >
          <span style={{ color: "var(--primary)" }}>●</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800 }}>{clubName}</div>
          <div style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 600 }}>{postedAt}</div>
        </div>
        <span className={`chip ${badgeColor[badge]}`} style={{ fontSize: 8.5, padding: "2px 7px" }}>
          {badge}
        </span>
      </div>

      {imageUrl ? (
        <div style={{ height: badge === "FOTO" ? 240 : 170, backgroundImage: `url(${imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }} />
      ) : imageLabel ? (
        <StripedImg label={imageLabel} height={badge === "FOTO" ? 240 : 170} style={{ borderRadius: 0 }} />
      ) : null}

      <div style={{ padding: "12px 14px" }}>
        <h3 className="font-heading" style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", margin: 0, lineHeight: 1.15 }}>
          {title}
          <span style={{ color: "var(--primary)" }}>.</span>
        </h3>
        <p style={{ fontSize: 12, color: "var(--fg)", lineHeight: 1.5, margin: "6px 0 0" }}>{body}</p>
        {ctaLabel ? (
          <button type="button" className="btn btn-onyx" style={{ marginTop: 10, padding: "7px 14px", fontSize: 10.5 }} onClick={onCta}>
            {ctaLabel} <Icon name="arrow-right" size={11} color="#fff" />
          </button>
        ) : null}
      </div>

      <div style={{ display: "flex", padding: "2px 4px", borderTop: "1px solid var(--border)" }}>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 10.5, padding: "7px 10px", color: "var(--muted-fg)" }}>
          <Icon name="heart" size={12} /> {likes}
        </button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 10.5, padding: "7px 10px", color: "var(--muted-fg)" }}>
          <Icon name="message-circle" size={12} /> {comments}
        </button>
        <button type="button" className="btn btn-ghost" style={{ fontSize: 10.5, padding: "7px 10px", color: "var(--muted-fg)" }}>
          <Icon name="share-2" size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn btn-ghost" style={{ fontSize: 10.5, padding: "7px 10px", color: "var(--muted-fg)" }}>
          <Icon name="bookmark" size={12} />
        </button>
      </div>
    </div>
  );
}
