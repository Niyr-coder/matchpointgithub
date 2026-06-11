"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import {
  publishClubAnnouncement,
  createClubGiveaway,
  drawClubGiveawayWinners,
} from "@/server/actions/club-comms";
import { createClubFeedPost } from "@/server/actions/giveaways";
import type { ClubGiveawayView } from "@/lib/schemas/club-comms";
import { giveawayEligibilityLabel } from "@/lib/clubs/comms-eligibility";

export function ClubFeedPostForm({ clubId }: { clubId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"notice" | "event" | "photo" | "spotlight">("notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createClubFeedPost({
            clubId,
            kind,
            title,
            body: body || undefined,
            mediaUrl: mediaUrl.trim() || null,
            ctaLabel: ctaLabel.trim() || undefined,
            ctaHref: ctaHref.trim() || undefined,
          });
          if (!res.ok) {
            toast({ icon: "alert-triangle", title: "No se pudo publicar", sub: res.error.message });
            return;
          }
          toast({ icon: "rss", title: "Publicado en el feed", sub: "Ya aparece en el perfil del club." });
          setTitle("");
          setBody("");
          setMediaUrl("");
          setCtaLabel("");
          setCtaHref("");
          router.refresh();
        });
      }}
      className="mp-anuncios-form"
    >
      <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={inputStyle}>
        <option value="notice">Aviso</option>
        <option value="event">Torneo / evento</option>
        <option value="photo">Foto</option>
        <option value="spotlight">Spotlight</option>
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" maxLength={120} required style={inputStyle} />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Texto del post…"
        maxLength={4000}
        rows={4}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <input
        value={mediaUrl}
        onChange={(e) => setMediaUrl(e.target.value)}
        placeholder="URL de imagen (opcional)"
        type="url"
        style={inputStyle}
      />
      <div className="mp-tournament-form-grid-2">
        <input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="CTA (opcional)" style={inputStyle} />
        <input value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="Link del CTA" style={inputStyle} />
      </div>
      <button type="submit" disabled={pending || !title.trim()} style={primaryBtn}>
        {pending ? "Publicando…" : "Publicar en feed"}
      </button>
    </form>
  );
}

export function PublishAnnouncementForm({ clubId }: { clubId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await publishClubAnnouncement({ clubId, title, body });
          if (!res.ok) {
            toast({ icon: "alert-triangle", title: "No se pudo publicar", sub: res.error.message });
            return;
          }
          toast({ icon: "megaphone", title: "Anuncio publicado", sub: "Feed + canal de anuncios." });
          setTitle("");
          setBody("");
          router.refresh();
        });
      }}
      className="mp-anuncios-form"
    >
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título del aviso"
        maxLength={120}
        required
        style={inputStyle}
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Mensaje para seguidores y socios…"
        maxLength={4000}
        required
        rows={4}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <button type="submit" disabled={pending || !title.trim() || !body.trim()} style={primaryBtn}>
        {pending ? "Publicando…" : "Publicar anuncio"}
      </button>
    </form>
  );
}

export function CreateGiveawayForm({ clubId }: { clubId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [prizeLabel, setPrizeLabel] = useState("");
  const [description, setDescription] = useState("");
  const [eligibility, setEligibility] = useState<"followers" | "members" | "all">("followers");
  const [maxWinners, setMaxWinners] = useState(1);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createClubGiveaway({
            clubId,
            title,
            prizeLabel,
            description: description || undefined,
            eligibility,
            maxWinners,
            publish: true,
          });
          if (!res.ok) {
            toast({ icon: "alert-triangle", title: "No se pudo crear el sorteo", sub: res.error.message });
            return;
          }
          toast({ icon: "gift", title: "Sorteo publicado", sub: "Ya aparece en el canal de anuncios." });
          setTitle("");
          setPrizeLabel("");
          setDescription("");
          router.refresh();
        });
      }}
      style={{ display: "grid", gap: 10 }}
    >
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nombre del sorteo" required style={inputStyle} />
      <input
        value={prizeLabel}
        onChange={(e) => setPrizeLabel(e.target.value)}
        placeholder="Premio (ej. 1 mes VIP Gold)"
        required
        style={inputStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Detalle opcional…"
        rows={3}
        style={{ ...inputStyle, resize: "vertical" }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 10 }}>
        <select
          value={eligibility}
          onChange={(e) => setEligibility(e.target.value as "followers" | "members" | "all")}
          style={inputStyle}
        >
          <option value="followers">Seguidores y socios</option>
          <option value="members">Solo socios VIP</option>
          <option value="all">Seguidores o socios</option>
        </select>
        <input
          type="number"
          min={1}
          max={20}
          value={maxWinners}
          onChange={(e) => setMaxWinners(Number(e.target.value))}
          title="Ganadores"
          style={inputStyle}
        />
      </div>
      <button type="submit" disabled={pending || !title.trim() || !prizeLabel.trim()} style={primaryBtn}>
        {pending ? "Publicando…" : "Publicar sorteo"}
      </button>
    </form>
  );
}

export function GiveawayRow({ giveaway }: { giveaway: ClubGiveawayView }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const statusLabel: Record<string, string> = {
    draft: "Borrador",
    open: "Abierto",
    closed: "Cerrado",
    drawn: "Sorteado",
    cancelled: "Cancelado",
  };

  return (
    <div className="mp-anuncios-giveaway-row">
      <div className="mp-anuncios-giveaway-row-main">
        <div className="mp-anuncios-giveaway-row-title">{giveaway.title}</div>
        <div className="mp-anuncios-giveaway-row-meta">
          {giveaway.prizeLabel} · {giveawayEligibilityLabel(giveaway.eligibility)} · {giveaway.entryCount} participantes
        </div>
      </div>
      <span className="mp-anuncios-giveaway-row-status">
        {statusLabel[giveaway.status] ?? giveaway.status}
      </span>
      {giveaway.status === "open" ? (
        <button
          type="button"
          disabled={pending}
          className="mp-anuncios-draw-btn"
          onClick={() =>
            start(async () => {
              const res = await drawClubGiveawayWinners({ giveawayId: giveaway.id });
              if (!res.ok) {
                toast({ icon: "alert-triangle", title: "No se pudo sortear", sub: res.error.message });
                return;
              }
              toast({ icon: "gift", title: "Sorteo realizado", sub: "Los ganadores fueron notificados." });
              router.refresh();
            })
          }
          style={primaryBtn}
        >
          Sortear ahora
        </button>
      ) : null}
      {giveaway.status === "drawn" && giveaway.winners.length > 0 ? (
        <span className="mp-anuncios-giveaway-row-winners">
          <Icon name="trophy" size={12} /> {giveaway.winners.map((w) => w.displayName).join(", ")}
        </span>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  fontSize: 13,
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 9999,
  border: 0,
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
};
