// /clubes/[slug] — migrado 1:1 desde MatchPoint Public.html (líneas 446-501)
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { usePaywall } from "@/components/landing/PublicChromeClient";
import { createClubReview } from "@/server/actions/clubs";
import type { ClubDetail, ClubReview } from "@/lib/schemas/clubs";

type Props = {
  detail: ClubDetail;
  stats: { courtsCount: number; minPriceCents: number | null; rating: number; reviews: number };
  reviews: ClubReview[];
  myReview: ClubReview | null;
  canReview: boolean;
};

// Slots de muestra para la página pública del club. Alineados a la
// convención de booking: cada hora 09:00–21:00 (último start con duración
// mínima 1 h si el club cierra a las 22:00).
const DEFAULT_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

function todayLabel(): string {
  const d = new Date();
  const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

const DEFAULT_AMENITIES = ["Iluminada", "Vestuarios", "Pro shop", "Cafetería", "Parqueo", "Clases"];
const FALLBACK_PAYMENT = "Tarjeta · PayPhone · Efectivo";

export function ClubDetailView({ detail, stats, reviews, myReview, canReview }: Props) {
  const onPaywall = usePaywall();
  const { club, amenities } = detail;
  const price = stats.minPriceCents != null ? Math.round(stats.minPriceCents / 100) : 14;
  const list = amenities.length > 0 ? amenities : DEFAULT_AMENITIES;
  const accent = club.name.split(" ").pop()?.toUpperCase() ?? "CLUB";

  return (
    <>
      <section
        style={{
          position: "relative",
          height: 420,
          background: "linear-gradient(135deg, #064e3b 0%, #047857 60%, #10b981 100%)",
          overflow: "hidden",
          color: "#fff",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.2), transparent 60%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 280,
            color: "rgba(255,255,255,0.06)",
            letterSpacing: "-0.06em",
            transform: "rotate(-6deg) translate(15%, -25%)",
          }}
        >
          {accent}
        </div>
        <div
          className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-22 pb-6 md:pt-25 md:pb-10"
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 12px",
              background: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(8px)",
              borderRadius: 9999,
              fontSize: 9.5,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              alignSelf: "flex-start",
            }}
          >
            ● {club.city}
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: "clamp(3rem, 7vw, 6rem)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: "14px 0 12px",
              lineHeight: 0.92,
            }}
          >
            {club.name}
            <span style={{ color: "#bbf7d0" }}>.</span>
          </h1>
          <div style={{ display: "flex", gap: 22, fontSize: 13, color: "rgba(255,255,255,0.9)", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Icon name="star" size={13} color={stats.reviews > 0 ? "#fbbf24" : "rgba(255,255,255,0.4)"} />
              {stats.reviews > 0 ? (
                <>
                  <b>{stats.rating.toFixed(1)}</b> · {stats.reviews}{" "}
                  {stats.reviews === 1 ? "reseña" : "reseñas"}
                </>
              ) : (
                <span style={{ opacity: 0.7 }}>Sin reseñas aún</span>
              )}
            </span>
            {club.address && (
              <span>
                <Icon name="map-pin" size={12} style={{ display: "inline", marginRight: 4 }} />
                {club.address}
              </span>
            )}
            <span>
              <Icon name="grid-2x2" size={12} style={{ display: "inline", marginRight: 4 }} />
              {stats.courtsCount} canchas
            </span>
          </div>
        </div>
      </section>
      <main
        className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-15 grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-8 md:gap-10"
      >
        <div>
          <div className="label-mp">Sobre el club</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "8px 0 16px",
            }}
          >
            Tu cancha en {club.city}
            <span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted-fg)", lineHeight: 1.65, marginBottom: 24 }}>
            {club.description ??
              `Club con ${stats.courtsCount} canchas profesionales en ${club.city}. Reserva online en 60 segundos, divide el pago entre jugadores y sube tu nivel oficial con cada partido.`}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 40 }}>
            {list.map((a) => (
              <span
                key={a}
                style={{
                  padding: "6px 12px",
                  borderRadius: 9999,
                  background: "var(--muted)",
                  fontSize: 11.5,
                  fontWeight: 800,
                }}
              >
                ● {a}
              </span>
            ))}
          </div>
          <div className="label-mp">Próximos slots disponibles</div>
          <h3
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "8px 0 18px",
            }}
          >
            Hoy · {todayLabel()}
            <span className="dot">.</span>
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {DEFAULT_SLOTS.map((s, i) => {
              const taken = i === 2 || i === 5;
              return (
                <button
                  key={s}
                  onClick={() => !taken && onPaywall("reservar")}
                  disabled={taken}
                  style={{
                    padding: "12px 8px",
                    borderRadius: 8,
                    border: `1px solid ${taken ? "var(--border)" : "rgba(16,185,129,0.3)"}`,
                    background: taken ? "#fafafa" : "#ecfdf5",
                    color: taken ? "var(--muted-fg)" : "#065f46",
                    fontSize: 12.5,
                    fontWeight: 900,
                    cursor: taken ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    textDecoration: taken ? "line-through" : "none",
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ position: "sticky", top: 100, height: "fit-content" }}>
          <div className="card" style={{ padding: 26 }}>
            <div className="label-mp" style={{ color: "var(--primary)" }}>Reservar ahora</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span
                className="font-heading tabular"
                style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.04em" }}
              >
                ${price}
              </span>
              <span style={{ fontSize: 14, color: "var(--muted-fg)" }}>/ hora</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4 }}>
              Indoor +${Math.round(price * 0.3)}/h · weekend +20%
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center", marginTop: 18, padding: "13px 18px" }}
              onClick={() => onPaywall("reservar")}
            >
              <Icon name="calendar-plus" size={14} />
              Reservar cancha
            </button>
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px dashed var(--border)", fontSize: 11.5 }}>
              {([
                ["Horario", "06:00 – 22:00 L-V"],
                ["Sábado", "07:00 – 23:00"],
                ["Cancelación", "Gratis 24h antes"],
                ["Métodos de pago", FALLBACK_PAYMENT],
              ] as const).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "7px 0",
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ color: "var(--muted-fg)" }}>{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <ReviewsSection
          clubId={club.id}
          clubName={club.name}
          reviews={reviews}
          myReview={myReview}
          canReview={canReview}
          onPaywall={() => onPaywall("perfil")}
        />
      </main>
    </>
  );
}

// ── Sección de reseñas ──────────────────────────────────────────────────
function ReviewsSection({
  clubId,
  clubName,
  reviews,
  myReview,
  canReview,
  onPaywall,
}: {
  clubId: string;
  clubName: string;
  reviews: ClubReview[];
  myReview: ClubReview | null;
  canReview: boolean;
  onPaywall: () => void;
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number>(myReview?.rating ?? 0);
  const [comment, setComment] = useState<string>(myReview?.comment ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!canReview) {
      onPaywall();
      return;
    }
    if (rating < 1 || rating > 5) {
      setErrorMsg("Elige una calificación de 1 a 5 estrellas.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      const res = await createClubReview({
        clubId,
        rating,
        comment: trimmed.length >= 4 ? trimmed : undefined,
      });
      if (res.ok) {
        router.refresh();
      } else {
        setErrorMsg(res.error.message || "No se pudo enviar la reseña.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const otherReviews = reviews.filter((r) => r.id !== myReview?.id);

  return (
    <section className="max-w-[1240px] mx-auto px-4 md:px-7 pt-6 md:pt-8 pb-10 md:pb-14">
      <h2
        className="font-heading"
        style={{
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          margin: "0 0 18px",
        }}
      >
        Reseñas<span className="dot">.</span>
      </h2>

      <div
        className="card"
        style={{
          padding: 22,
          marginBottom: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800 }}>
          {myReview ? `Tu reseña sobre ${clubName}` : `Deja tu reseña sobre ${clubName}`}
        </div>
        <StarPicker value={rating} onChange={setRating} disabled={submitting} />
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Cómo fue tu experiencia, qué destacarías… (opcional)"
          disabled={submitting}
          style={{
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontFamily: "inherit",
            fontSize: 13,
            resize: "vertical",
          }}
        />
        {errorMsg && (
          <div style={{ fontSize: 11.5, color: "#dc2626" }}>{errorMsg}</div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {canReview
              ? myReview
                ? "Editar reemplaza tu reseña anterior."
                : "Tu reseña será pública con tu nombre."
              : "Inicia sesión para publicar tu reseña."}
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || (canReview && rating === 0)}
            className="btn btn-primary"
            style={{ opacity: submitting || rating === 0 ? 0.6 : 1 }}
          >
            <Icon name="send" size={13} color="#fff" />
            {submitting ? "Publicando…" : myReview ? "Actualizar reseña" : "Publicar reseña"}
          </button>
        </div>
      </div>

      {otherReviews.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: 12,
          }}
        >
          {reviews.length === 0
            ? "Aún no hay reseñas. Sé la primera persona en compartir tu experiencia."
            : "No hay más reseñas por ahora."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {otherReviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </section>
  );
}

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => !disabled && onChange(n)}
          aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
          disabled={disabled}
          style={{
            background: "transparent",
            border: 0,
            cursor: disabled ? "default" : "pointer",
            padding: 4,
            color: n <= value ? "#d97706" : "var(--muted-fg)",
            fontSize: 22,
            lineHeight: 1,
          }}
        >
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: ClubReview }) {
  return (
    <div className="card" style={{ padding: 16, display: "flex", gap: 12 }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "linear-gradient(135deg,#10b981,#047857)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {review.userAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={review.userAvatarUrl}
            alt={review.userDisplayName}
            width={40}
            height={40}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 12, fontWeight: 900 }}>
            {review.userDisplayName.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{review.userDisplayName}</div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {new Date(review.createdAt).toLocaleDateString("es-EC", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        </div>
        <div style={{ color: "#d97706", fontSize: 13, marginTop: 2 }}>
          {"★".repeat(review.rating)}
          <span style={{ color: "var(--muted-fg)" }}>{"☆".repeat(5 - review.rating)}</span>
        </div>
        {review.comment && (
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: "#0a0a0a" }}>
            {review.comment}
          </p>
        )}
      </div>
    </div>
  );
}
