"use client";

import { Icon } from "@/components/Icon";
import type { CSSProperties } from "react";
import type { FeedCommentPreview, FeedPostBadge } from "./types";

type Props = {
  clubName: string;
  clubHandle: string;
  postedAt: string;
  badge: FeedPostBadge;
  title: string;
  body: string;
  imageLabel?: string;
  imageUrl?: string | null;
  imageHeight?: number;
  chips?: string[];
  ctaLabel?: string;
  onCta?: () => void;
  likes?: number;
  comments?: number;
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onBookmark?: () => void;
  onMore?: () => void;
  showComments?: boolean;
  commentPreviews?: FeedCommentPreview[];
  commentPlaceholder?: string;
  onCommentSubmit?: (text: string) => void;
  className?: string;
};

const BADGE_CHIP: Record<FeedPostBadge, string> = {
  GIVEAWAY: "chip-emerald",
  TORNEO: "chip-warn",
  RESULTADO: "chip-info",
  FOTO: "chip-onyx",
  AVISO: "chip-warn",
  SPOTLIGHT: "chip-partner",
};

function FeedImage({
  label,
  imageUrl,
  height,
  style,
}: {
  label?: string;
  imageUrl?: string | null;
  height: number;
  style?: CSSProperties;
}) {
  if (imageUrl) {
    return (
      <div
        style={{
          height,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          ...style,
        }}
        role="img"
        aria-label={label ?? "Imagen del post"}
      />
    );
  }

  return (
    <div className="img-slot" style={{ height, borderRadius: 0, ...style }}>
      {label}
    </div>
  );
}

export function FeedPostCard({
  clubName,
  clubHandle,
  postedAt,
  badge,
  title,
  body,
  imageLabel,
  imageUrl,
  imageHeight,
  chips,
  ctaLabel,
  onCta,
  likes = 0,
  comments = 0,
  onLike,
  onComment,
  onShare,
  onBookmark,
  onMore,
  showComments = false,
  commentPreviews = [],
  commentPlaceholder = "Comenta como tú…",
  onCommentSubmit,
  className,
}: Props) {
  const badgeClass = BADGE_CHIP[badge] ?? "chip-onyx";
  const mediaHeight = imageHeight ?? (badge === "FOTO" ? 320 : 220);

  return (
    <div className={`card pv-rise${className ? ` ${className}` : ""}`} style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "#0a0a0a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 900,
            fontSize: 12,
          }}
          aria-hidden
        >
          <span style={{ color: "var(--primary)" }}>●</span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>{clubName}</div>
          <div
            style={{
              fontSize: 10.5,
              color: "var(--muted-fg)",
              fontWeight: 600,
              display: "flex",
              gap: 6,
            }}
          >
            {clubHandle}
            <span aria-hidden>·</span>
            {postedAt}
          </div>
        </div>

        <span className={`chip ${badgeClass}`}>{badge}</span>

        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: 6 }}
          onClick={onMore}
          aria-label="Más opciones"
        >
          <Icon name="more-horizontal" size={14} />
        </button>
      </div>

      {imageLabel || imageUrl ? (
        <FeedImage
          label={imageLabel}
          imageUrl={imageUrl}
          height={mediaHeight}
          style={{
            borderTop: "1px solid var(--border)",
            borderBottom: "1px solid var(--border)",
          }}
        />
      ) : null}

      <div style={{ padding: "14px 16px" }}>
        <h3
          className="font-heading"
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 1.15,
          }}
        >
          {title}
          <span style={{ color: "var(--primary)" }}>.</span>
        </h3>
        <p style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.55, margin: "8px 0 0" }}>
          {body}
        </p>

        {chips && chips.length > 0 ? (
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {chips.map((chip) => (
              <span key={chip} className="chip">
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        {ctaLabel ? (
          <button type="button" className="btn btn-onyx" style={{ marginTop: 12 }} onClick={onCta}>
            {ctaLabel} <Icon name="arrow-right" size={12} color="#fff" />
          </button>
        ) : null}
      </div>

      <div style={{ display: "flex", padding: "4px 8px", borderTop: "1px solid var(--border)" }}>
        <ActionButton icon="heart" label={String(likes)} onClick={onLike} />
        <ActionButton icon="message-circle" label={String(comments)} onClick={onComment} />
        <ActionButton icon="share-2" label="Compartir" onClick={onShare} />
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost"
          style={{ fontSize: 11, color: "var(--muted-fg)" }}
          onClick={onBookmark}
          aria-label="Guardar"
        >
          <Icon name="bookmark" size={13} />
        </button>
      </div>

      {showComments && comments > 0 ? (
        <CommentSection
          previews={commentPreviews}
          placeholder={commentPlaceholder}
          onSubmit={onCommentSubmit}
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ fontSize: 11, color: "var(--muted-fg)" }}
      onClick={onClick}
    >
      <Icon name={icon} size={13} /> {label}
    </button>
  );
}

function CommentSection({
  previews,
  placeholder,
  onSubmit,
}: {
  previews: FeedCommentPreview[];
  placeholder: string;
  onSubmit?: (text: string) => void;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        padding: "10px 14px",
        background: "#fafafa",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {previews.map((c) => (
        <div key={`${c.author}-${c.body}`} style={{ display: "flex", gap: 8, fontSize: 12 }}>
          <b>{c.author}</b>
          <span style={{ color: "var(--fg)" }}>{c.body}</span>
        </div>
      ))}

      <CommentForm placeholder={placeholder} onSubmit={onSubmit} />
    </div>
  );
}

function CommentForm({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit?: (text: string) => void;
}) {
  return (
    <form
      style={{ display: "flex", gap: 8, marginTop: 4 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const text = String(fd.get("comment") ?? "").trim();
        if (!text) return;
        onSubmit?.(text);
        e.currentTarget.reset();
      }}
    >
      <input
        name="comment"
        placeholder={placeholder}
        style={{
          flex: 1,
          padding: "7px 12px",
          border: "1px solid var(--border)",
          borderRadius: 9999,
          fontSize: 12,
          fontFamily: "inherit",
          background: "#fff",
        }}
      />
      <button type="submit" className="btn btn-primary btn-sm">
        Enviar
      </button>
    </form>
  );
}
