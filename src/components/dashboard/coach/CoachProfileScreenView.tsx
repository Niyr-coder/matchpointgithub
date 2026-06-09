// Client view de CoachProfileScreen — layout del mock 1:1 (CoachingScreens.jsx 4-143).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { updateCoachProfile } from "@/server/actions/coaches";

export type Avail = "open" | "limited" | "closed";

export type Specialty = {
  label: string;
  proficiency: number; // 0..100
};

export type ScheduleRow = {
  day: string;
  hours: string;
  avail: Avail;
};

export type ReviewRow = {
  id: string;
  name: string;
  comment: string;
  rating: number;
  when: string;
};

export type CoachProfileData = {
  coachId: string | null;
  name: string;
  handle: string;
  sport: string;
  city: string;
  primaryClubName: string | null;
  bio: string | null;
  certifications: string[];
  hourlyRateCents: number | null;
  rating: number | null;
  reviewCount: number;
  studentsActive: number;
  classesGiven: number;
  hasCoachProfile: boolean;
  specialties: Specialty[];
  schedule: ScheduleRow[];
  reviews: ReviewRow[];
};

const AVAIL_COLOR: Record<Avail, string> = {
  open: "var(--primary)",
  limited: "#fbbf24",
  closed: "var(--muted-fg)",
};
const AVAIL_LABEL: Record<Avail, string> = {
  open: "Disponible",
  limited: "Limitado",
  closed: "Cerrado",
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtUSD(cents: number | null): string {
  if (cents == null) return "$—";
  return `$${Math.round(cents / 100)}`;
}

const SPECIALTY_PLACEHOLDER_COUNT = 4;
const REVIEW_PLACEHOLDER_COUNT = 3;

function SpecialtyPlaceholder() {
  return (
    <div style={{ marginBottom: 12, opacity: 0.6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11.5,
          marginBottom: 4,
        }}
      >
        <b style={{ color: "var(--muted-fg)" }}>Sin especialidad</b>
        <span style={{ color: "var(--muted-fg)" }}>—</span>
      </div>
      <div
        style={{
          height: 5,
          background: "var(--muted)",
          borderRadius: 9999,
          overflow: "hidden",
          border: "1px dashed var(--border)",
        }}
      >
        <div style={{ height: "100%", width: "0%", background: "var(--border)" }} />
      </div>
    </div>
  );
}

function ReviewPlaceholder() {
  return (
    <div
      style={{
        padding: 14,
        background: "#fafafa",
        borderRadius: 10,
        borderLeft: "3px dashed var(--border)",
        border: "1px dashed var(--border)",
        opacity: 0.6,
      }}
    >
      <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Icon key={s} name="star" size={11} color="var(--muted-fg)" />
        ))}
      </div>
      <p style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0, fontStyle: "italic", color: "var(--muted-fg)" }}>
        &quot;Sin reseñas aún.&quot;
      </p>
      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 8, fontWeight: 700 }}>
        — — · —
      </div>
    </div>
  );
}

export function CoachProfileScreenView({ data }: { data: CoachProfileData }) {
  useRealtimeRefresh(
    data.coachId
      ? [
          { table: "coach_profiles", filter: `id=eq.${data.coachId}` },
          { table: "coach_specialties", filter: `coach_id=eq.${data.coachId}` },
          { table: "coach_certifications", filter: `coach_id=eq.${data.coachId}` },
          { table: "coach_availability", filter: `coach_id=eq.${data.coachId}` },
          { table: "coach_reviews", filter: `coach_id=eq.${data.coachId}` },
        ]
      : [],
    { enabled: !!data.coachId },
  );

  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleEdit = async () => {
    const headline = await ask({
      title: "Editar perfil · 1/3",
      label: "Titular (opcional)",
      initialValue: data.bio?.slice(0, 60) ?? "",
      placeholder: "ej. Coach certificado IPTPA · Quito",
      helper: "Máximo 60 caracteres recomendado.",
      confirmLabel: "Siguiente",
    });
    if (headline == null) return;
    const bio = await ask({
      title: "Editar perfil · 2/3",
      label: "Bio breve",
      initialValue: data.bio ?? "",
      placeholder: "Cuenta tu estilo y experiencia",
      multiline: true,
      confirmLabel: "Siguiente",
    });
    if (bio == null) return;
    const rateStr = await ask({
      title: "Editar perfil · 3/3",
      label: "Tarifa 1 a 1 por hora (USD)",
      initialValue: data.hourlyRateCents != null ? String(Math.round(data.hourlyRateCents / 100)) : "",
      placeholder: "ej. 35",
      helper: "Deja vacío si todavía no quieres publicarla.",
      validate: (v) => {
        const t = v.trim();
        if (!t) return null;
        return /^\d+(\.\d+)?$/.test(t) ? null : "Solo números";
      },
      confirmLabel: "Guardar",
    });
    if (rateStr == null) return;
    const hourlyRateCents = rateStr.trim() ? Math.round(Number(rateStr) * 100) : undefined;
    startTransition(async () => {
      const res = await updateCoachProfile({
        headline: headline || undefined,
        bio: bio || undefined,
        hourlyRateCents,
        currency: "USD",
      });
      if (res.ok) toast({ icon: "check", title: "Perfil actualizado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const hasSpecialties = data.specialties.length > 0;
  const hasReviews = data.reviews.length > 0;
  const hasCerts = data.certifications.length > 0;

  const stats: { l: string; v: string; sub: string; c: string }[] = [
    {
      l: "Alumnos activos",
      v: String(data.studentsActive),
      sub: data.studentsActive > 0 ? "últimos 90 días" : "sin alumnos",
      c: "#0a0a0a",
    },
    {
      l: "Clases dadas",
      v: String(data.classesGiven),
      sub: data.classesGiven > 0 ? "sesiones completadas" : "sin clases",
      c: "var(--primary)",
    },
    { l: "Win rate alumnos", v: "—", sub: "sin tracking aún", c: "var(--muted-fg)" },
    {
      l: "Tarifa 1 a 1",
      v: fmtUSD(data.hourlyRateCents),
      sub: data.hourlyRateCents != null ? "por hora" : "sin tarifa",
      c: data.hourlyRateCents != null ? "#0ea5e9" : "var(--muted-fg)",
    },
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="COACH"
        accent="#f59e0b"
        label="Coach · perfil público"
        title="Tu perfil"
        sub="Así te ven los jugadores cuando entran a tu página. Mantén la info y las fotos al día — convierten más alumnos."
        right={
          <button className="btn btn-primary" onClick={handleEdit} disabled={isPending}>
            <Icon name="pencil" size={13} color="#fff" />
            {isPending ? "Guardando…" : "Editar perfil"}
          </button>
        }
      />

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            height: 160,
            background: "linear-gradient(135deg, #f59e0b 0%, #b45309 50%, #0a0a0a 100%)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(ellipse at 75% 30%, rgba(251,191,36,0.4), transparent 60%)",
            }}
          />
          <div style={{ position: "absolute", top: 16, right: 16 }}>
            <button
              className="btn"
              style={{
                background: "rgba(0,0,0,0.4)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
            >
              <Icon name="camera" size={12} color="#fff" />
              Portada
            </button>
          </div>
          <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 6 }}>
            <RSPill bg="rgba(0,0,0,0.4)" color="#fff">
              ★ COACH {data.hasCoachProfile ? "VERIFICADO" : "PENDIENTE"}
            </RSPill>
            <RSPill bg="var(--primary)">● ACEPTANDO ALUMNOS</RSPill>
          </div>
        </div>
        <div
          style={{
            padding: "0 28px 24px",
            display: "flex",
            gap: 22,
            alignItems: "flex-start",
          }}
        >
          <div style={{ position: "relative", marginTop: -60 }}>
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "6px solid #fff",
                boxShadow: "0 8px 20px rgba(0,0,0,0.15)",
              }}
            >
              <span
                className="font-heading"
                style={{ fontSize: 38, fontWeight: 900, letterSpacing: "-0.02em" }}
              >
                {initials(data.name)}
              </span>
            </div>
          </div>
          <div style={{ flex: 1, paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <h2
                className="font-heading"
                style={{
                  fontSize: 30,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {data.name}
                <span className="dot">.</span>
              </h2>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 9px",
                  background: "#0a0a0a",
                  color: "#fff",
                  borderRadius: 9999,
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                <Icon name="zap" size={10} color="#fbbf24" />
                Nivel —
              </span>
              <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>{data.handle}</span>
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--muted-fg)",
                marginTop: 8,
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="trophy" size={11} /> {data.sport}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="building-2" size={11} /> {data.primaryClubName ?? "—"}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="map-pin" size={11} /> {data.city}
              </span>
            </div>
            <p
              style={{
                fontSize: 13,
                color: data.bio ? "#0a0a0a" : "var(--muted-fg)",
                maxWidth: 620,
                marginTop: 14,
                lineHeight: 1.55,
                fontStyle: data.bio ? "normal" : "italic",
              }}
            >
              {data.bio ?? "Sin bio aún. Cuenta a tus alumnos quién eres y cómo enseñas."}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {hasCerts ? (
                data.certifications.map((c) => (
                  <span
                    key={c}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "4px 10px",
                      background: "var(--muted)",
                      borderRadius: 9999,
                      fontSize: 10.5,
                      fontWeight: 800,
                    }}
                  >
                    <Icon name="badge-check" size={11} color="var(--primary)" />
                    {c}
                  </span>
                ))
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "4px 10px",
                    background: "#fafafa",
                    border: "1px dashed var(--border)",
                    borderRadius: 9999,
                    fontSize: 10.5,
                    fontWeight: 800,
                    color: "var(--muted-fg)",
                    opacity: 0.6,
                  }}
                >
                  <Icon name="badge-check" size={11} color="var(--muted-fg)" />
                  Sin certificaciones
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              paddingTop: 18,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "5px 12px",
                background: data.rating != null ? "#fef3c7" : "#fafafa",
                borderRadius: 9999,
                fontSize: 11.5,
                fontWeight: 800,
                border: data.rating != null ? "0" : "1px dashed var(--border)",
                opacity: data.rating != null ? 1 : 0.6,
              }}
            >
              <Icon name="star" size={12} color={data.rating != null ? "#d97706" : "var(--muted-fg)"} />
              {data.rating != null ? data.rating.toFixed(1) : "—"}{" "}
              <span style={{ color: "#92400e", fontSize: 10 }}>· {data.reviewCount} reseñas</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mp-partner-torneo-kpis">
        {stats.map((k) => (
          <div key={k.l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{k.l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 30,
                fontWeight: 900,
                marginTop: 8,
                color: k.c,
                letterSpacing: "-0.03em",
              }}
            >
              {k.v}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="mp-coach-profile-split">
        <div className="card" style={{ padding: 22 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              textTransform: "uppercase",
              margin: "0 0 14px",
            }}
          >
            Especialidades<span className="dot">.</span>
          </h2>
          {hasSpecialties
            ? data.specialties.map((s) => (
                <div key={s.label} style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 11.5,
                      marginBottom: 4,
                    }}
                  >
                    <b>{s.label}</b>
                    <span style={{ color: "var(--muted-fg)" }}>{s.proficiency}%</span>
                  </div>
                  <div
                    style={{
                      height: 5,
                      background: "var(--muted)",
                      borderRadius: 9999,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ height: "100%", width: s.proficiency + "%", background: "#f59e0b" }} />
                  </div>
                </div>
              ))
            : Array.from({ length: SPECIALTY_PLACEHOLDER_COUNT }).map((_, k) => (
                <SpecialtyPlaceholder key={k} />
              ))}
        </div>

        <div className="card" style={{ padding: 22 }}>
          <h2
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              textTransform: "uppercase",
              margin: "0 0 14px",
            }}
          >
            Disponibilidad regular<span className="dot">.</span>
          </h2>
          {data.schedule.map((row, i) => (
            <div
              key={row.day}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "9px 0",
                borderTop: i === 0 ? "0" : "1px dashed var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{row.day}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{row.hours}</div>
              </div>
              <RSPill bg={AVAIL_COLOR[row.avail]}>{AVAIL_LABEL[row.avail]}</RSPill>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 14,
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Últimas reseñas<span className="dot">.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {data.reviewCount} reseña{data.reviewCount === 1 ? "" : "s"} ·{" "}
            {data.rating != null ? `promedio ${data.rating.toFixed(1)}` : "promedio —"}
          </span>
        </div>
        <div className="mp-tournament-form-grid-3" style={{ gap: 12 }}>
          {hasReviews
            ? data.reviews.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  style={{
                    padding: 14,
                    background: "var(--muted)",
                    borderRadius: 10,
                    borderLeft: "3px solid #fbbf24",
                  }}
                >
                  <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Icon
                        key={s}
                        name="star"
                        size={11}
                        color={s <= r.rating ? "#d97706" : "var(--border)"}
                      />
                    ))}
                  </div>
                  <p
                    style={{
                      fontSize: 11.5,
                      lineHeight: 1.5,
                      margin: 0,
                      fontStyle: "italic",
                    }}
                  >
                    &quot;{r.comment}&quot;
                  </p>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted-fg)",
                      marginTop: 8,
                      fontWeight: 700,
                    }}
                  >
                    — {r.name} · {r.when}
                  </div>
                </div>
              ))
            : Array.from({ length: REVIEW_PLACEHOLDER_COUNT }).map((_, k) => (
                <ReviewPlaceholder key={k} />
              ))}
        </div>
      </div>
    </>
  );
}
