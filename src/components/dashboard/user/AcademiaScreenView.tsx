// Client view de AcademiaScreen — UI del mock original con data real.
"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { enrollInClass } from "@/server/actions/classes";

export type AcademiaCoach = {
  id: string;
  name: string;
  sport: string;
  level: number;
  rating: number;
  reviews: number;
  students: number;
  hour: number;
  group: number;
  verified: boolean;
  cert: string;
  club: string;
  bio: string;
};

export type AcademiaClass = {
  id: string;
  name: string;
  coachName: string;
  coachId: string;
  sport: string;
  kind: string;
  skillLevel: string | null;
  enrolled: number;
  cap: number;
  full: boolean;
  priceCents: number;
  club: string;
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
];

const CLASS_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#b45309)",
  "linear-gradient(135deg,#0a0a0a,#374151)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#1f2937,#6b7280)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
  "linear-gradient(135deg,#10b981,#047857)",
];

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function priceLabel(cents: number): number {
  return Math.round(cents / 100);
}

export function AcademiaScreenView({
  coaches,
  classes,
}: {
  coaches: AcademiaCoach[];
  classes: AcademiaClass[];
}) {
  const [tab, setTab] = useState<"coaches" | "classes">("coaches");
  // Realtime: clases nuevas, enrollments (cupos cambian).
  useRealtimeRefresh([
    { table: "classes" },
    { table: "class_enrollments" },
  ]);
  const [pending, startTransition] = useTransition();
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  const handleEnroll = (c: AcademiaClass) => {
    setEnrollingId(c.id);
    startTransition(async () => {
      const r = await enrollInClass({ classId: c.id });
      setEnrollingId(null);
      if (!r.ok) {
        const code = r.error.code;
        const msg =
          code === "CLASSES.ALREADY_ENROLLED"
            ? "Ya estás inscrito en esta clase"
            : code === "CLASSES.INACTIVE"
              ? "La clase ya no está activa"
              : code === "AUTH.UNAUTHENTICATED"
                ? "Inicia sesión para inscribirte"
                : r.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo inscribir", sub: msg });
        return;
      }
      const wait = r.data.status === "waitlist";
      toast({
        icon: wait ? "clock" : "check-circle-2",
        title: wait ? "Te agregamos a lista de espera" : "¡Inscrito en la clase!",
        sub: wait ? "Te avisamos si se libera un cupo." : c.name,
      });
      router.refresh();
    });
  };

  return (
    <>
      <PolHero
        tone="dark"
        wm="ACADEMY"
        accent="#f59e0b"
        label="Coaching · MatchPoint Academia"
        title="Sube tu juego"
        sub={
          coaches.length > 0
            ? `${coaches.length} ${coaches.length === 1 ? "coach verificado" : "coaches verificados"} · clases grupales e individuales · de principiante a top-100.`
            : "Estamos sumando coaches a la red. Pronto verás opciones aquí."
        }
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <Icon name="filter" size={12} color="#fff" />
              Filtros
            </button>
            <button className="btn btn-primary">
              <Icon name="zap" size={13} color="#fff" />
              Match coach
            </button>
          </div>
        }
      />

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {[
          { k: "coaches" as const, l: "Coaches", n: coaches.length },
          { k: "classes" as const, l: "Clases abiertas", n: classes.length },
        ].map((t) => {
          const on = tab === t.k;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              style={{
                padding: "12px 22px",
                background: "transparent",
                border: 0,
                borderBottom: "2px solid " + (on ? "#0a0a0a" : "transparent"),
                color: on ? "#0a0a0a" : "var(--muted-fg)",
                fontWeight: on ? 900 : 700,
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: -1,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {t.l}
              <span
                style={{
                  fontSize: 9.5,
                  padding: "1px 7px",
                  borderRadius: 9999,
                  background: on ? "#0a0a0a" : "var(--muted)",
                  color: on ? "#fff" : "var(--muted-fg)",
                }}
              >
                {t.n}
              </span>
            </button>
          );
        })}
      </div>

      {tab === "coaches" &&
        (coaches.length === 0 ? (
          <EmptyState
            icon="graduation-cap"
            title="Aún no hay coaches publicados"
            sub="Pronto sumamos especialistas certificados a la red de Ecuador."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coaches.map((c, i) => (
              <div
                key={c.id}
                className="card grid grid-cols-1 sm:grid-cols-[160px_1fr]"
                style={{
                  padding: 0,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 240,
                  }}
                >
                  <span
                    className="font-heading"
                    style={{
                      fontSize: 56,
                      fontWeight: 900,
                      color: "#fff",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {initials(c.name)}
                  </span>
                  {c.verified && (
                    <div style={{ position: "absolute", top: 10, left: 10 }}>
                      <RSPill bg="rgba(0,0,0,0.45)" color="#fff">
                        Verificado
                      </RSPill>
                    </div>
                  )}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      left: 10,
                      right: 10,
                      padding: "5px 10px",
                      background: "rgba(0,0,0,0.55)",
                      backdropFilter: "blur(8px)",
                      borderRadius: 9999,
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      textAlign: "center",
                    }}
                  >
                    {c.cert}
                  </div>
                </div>
                <div style={{ padding: 18, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div className="font-heading" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em" }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                        {c.sport} · {c.club}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 8px",
                        background: "#fef3c7",
                        borderRadius: 9999,
                        fontSize: 10.5,
                        fontWeight: 800,
                      }}
                    >
                      <Icon name="star" size={10} color="#d97706" />
                      {c.rating.toFixed(1)}
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 11.5,
                      color: "var(--muted-fg)",
                      margin: "10px 0 0",
                      lineHeight: 1.55,
                    }}
                  >
                    {c.bio}
                  </p>
                  <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 10.5, color: "var(--muted-fg)" }}>
                    <span>
                      <b style={{ color: "#0a0a0a" }}>{c.reviews}</b> reseñas
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 8,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: "1px dashed var(--border)",
                    }}
                  >
                    <span
                      className="font-heading"
                      style={{
                        fontSize: 20,
                        fontWeight: 900,
                        color: "var(--primary)",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      ${c.hour}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>
                      / 1 a 1 · ${c.group} grupal
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                    <a
                      href={`/coaches/${c.id}`}
                      className="btn"
                      style={{
                        flex: 1,
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 10.5,
                        textDecoration: "none",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="user" size={11} />
                      Ver perfil
                    </a>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, fontSize: 10.5 }}
                      onClick={() =>
                        toast({
                          icon: "calendar-plus",
                          title: "Reserva 1 a 1 — próximamente",
                          sub: `Te avisamos cuando habilitemos el flujo con ${c.name.split(" ")[0]}.`,
                        })
                      }
                    >
                      <Icon name="calendar-plus" size={11} color="#fff" />
                      Reservar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

      {tab === "classes" &&
        (classes.length === 0 ? (
          <EmptyState
            icon="calendar"
            title="Aún no hay clases abiertas"
            sub="Cuando los coaches publiquen sus clases recurrentes, aparecerán aquí."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((c, i) => (
              <div
                key={c.id}
                className="card"
                style={{ padding: 0, overflow: "hidden", opacity: c.full ? 0.65 : 1 }}
              >
                <div
                  style={{
                    height: 120,
                    background: CLASS_GRADIENTS[i % CLASS_GRADIENTS.length],
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 60%)",
                    }}
                  />
                  <div style={{ position: "absolute", top: 10, left: 10, display: "flex", gap: 5 }}>
                    <RSPill bg="rgba(0,0,0,0.45)" color="#fff">
                      {c.sport}
                    </RSPill>
                    {c.full && <RSPill bg="#fbbf24">LLENA</RSPill>}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      padding: "4px 11px",
                      background: "rgba(0,0,0,0.55)",
                      borderRadius: 9999,
                      color: "#fbbf24",
                      fontFamily: "Plus Jakarta Sans",
                      fontSize: 14,
                      fontWeight: 900,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    ${priceLabel(c.priceCents)}
                  </div>
                  <div style={{ position: "relative", color: "#fff" }}>
                    <div
                      className="font-heading"
                      style={{
                        fontSize: 17,
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.1,
                        textTransform: "uppercase",
                      }}
                    >
                      {c.name}
                      <span style={{ color: "#fbbf24" }}>.</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>
                      con {c.coachName}
                    </div>
                  </div>
                </div>
                <div style={{ padding: 14 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--muted-fg)",
                      marginBottom: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icon name="map-pin" size={11} />
                    {c.club}
                    {c.skillLevel && (
                      <>
                        <span style={{ margin: "0 4px" }}>·</span>
                        Nivel {c.skillLevel}
                      </>
                    )}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10.5,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: "var(--muted-fg)" }}>Cupos</span>
                    <b>
                      {c.enrolled} / {c.cap}
                    </b>
                  </div>
                  <div
                    style={{
                      height: 5,
                      background: "var(--muted)",
                      borderRadius: 9999,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: c.cap > 0 ? (c.enrolled / c.cap) * 100 + "%" : "0",
                        background: c.full ? "#fbbf24" : "var(--primary)",
                      }}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={pending && enrollingId === c.id}
                    style={{
                      width: "100%",
                      justifyContent: "center",
                      marginTop: 12,
                      opacity: pending && enrollingId === c.id ? 0.6 : 1,
                      cursor: pending && enrollingId === c.id ? "wait" : "pointer",
                    }}
                    onClick={() => handleEnroll(c)}
                  >
                    {pending && enrollingId === c.id ? (
                      <>
                        <Icon name="loader" size={12} color="#fff" />
                        Inscribiendo…
                      </>
                    ) : c.full ? (
                      <>
                        <Icon name="clock" size={12} color="#fff" />
                        Lista de espera
                      </>
                    ) : (
                      <>
                        <Icon name="plus" size={12} color="#fff" />
                        Inscribirme
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
    </>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div
      className="card"
      style={{
        padding: 40,
        textAlign: "center",
        color: "var(--muted-fg)",
      }}
    >
      <Icon name={icon} size={32} color="var(--muted-fg)" />
      <div
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 900,
          marginTop: 12,
          color: "#0a0a0a",
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
        <span className="dot">.</span>
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{sub}</p>
    </div>
  );
}
