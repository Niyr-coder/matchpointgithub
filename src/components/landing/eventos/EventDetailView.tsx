// /eventos/[slug] — migrado 1:1 desde MatchPoint Public.html (líneas 504-580)
"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { usePaywall, useLandingAuth } from "@/components/landing/PublicChromeClient";
import { useToast } from "@/components/dashboard/ToastProvider";
import { cancelMyRegistration } from "@/server/actions/tournaments";
import type { TournamentDetail } from "@/lib/schemas/tournaments";

export type MyRegistration = {
  id: string;
  status: string;
};

export type TournamentInscrito = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  city: string | null;
  registeredAt: string;
};

type Props = {
  detail: TournamentDetail;
  clubName: string | null;
  clubCity: string | null;
  myRegistration?: MyRegistration | null;
  inscritos?: TournamentInscrito[];
};

const MONTHS_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

function sportLabel(sport: string): string {
  if (sport === "tennis") return "Tenis";
  if (sport === "padel") return "Pádel";
  return "Pickleball";
}

function formatLabel(format: string): string {
  switch (format) {
    case "single_elim": return "Eliminación directa";
    case "double_elim": return "Doble eliminación";
    case "round_robin": return "Round robin";
    case "swiss": return "Suizo";
    case "groups_to_knockout": return "Grupos + llave";
    default: return "Eliminación";
  }
}

function tagFromFormat(format: string): string {
  if (format === "round_robin" || format === "swiss") return "LIGA";
  if (format === "groups_to_knockout") return "ESTELAR";
  return "TORNEO";
}

function dateLabel(startsAt: string, endsAt: string | null): { d: string; m: string; full: string } {
  const s = new Date(startsAt);
  const e = endsAt ? new Date(endsAt) : s;
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const m = MONTHS_ES[s.getUTCMonth()];
  const year = s.getUTCFullYear();
  const d = sameMonth && sd !== ed ? `${sd}-${ed}` : `${sd}`;
  const fullM = m.charAt(0) + m.slice(1).toLowerCase();
  const full = sameMonth && sd !== ed ? `${sd}-${ed} ${fullM} ${year}` : `${sd} ${fullM} ${year}`;
  return { d, m, full };
}

function formatMoney(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return "—";
  const n = Math.round(cents / 100);
  return n >= 1000 ? `$${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `$${n}`;
}

function levelRange(cats: TournamentDetail["categories"]): string | null {
  const levels = cats.map((c) => c.level).filter((l): l is NonNullable<typeof l> => l != null);
  if (levels.length === 0) return null;
  if (levels.length === 1) return levels[0];
  return `${levels[0]}–${levels[levels.length - 1]}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function InscritosList({
  items,
  maxParticipants,
}: {
  items: TournamentInscrito[];
  maxParticipants: number | null;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          padding: "16px 22px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div className="label-mp">Inscritos</div>
          <div
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            {items.length}
            {maxParticipants != null && (
              <span style={{ color: "var(--muted-fg)", fontSize: 14, fontWeight: 600 }}>
                {" "}/ {maxParticipants}
              </span>
            )}
            <span className="dot">.</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: "40px 22px",
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 13,
          }}
        >
          <Icon name="users" size={28} color="var(--muted-fg)" />
          <div style={{ marginTop: 10 }}>
            Sé el primero en inscribirte. Las inscripciones recientes aparecen aquí.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 0,
          }}
        >
          {items.map((p, i) => (
            <div
              key={p.userId + "-" + i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 18px",
                borderTop: "1px solid var(--border)",
                borderRight: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: p.avatarUrl
                    ? `url(${p.avatarUrl}) center/cover`
                    : "linear-gradient(135deg, #10b981, #047857)",
                  color: "#fff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 900,
                  flexShrink: 0,
                }}
              >
                {!p.avatarUrl && initialsOf(p.displayName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.displayName}
                </div>
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                  {p.city ?? "—"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CancelConfirmModal({
  tournamentName,
  cancelling,
  onConfirm,
  onClose,
}: {
  tournamentName: string;
  cancelling: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // ESC cierra. Bloqueo de scroll mientras está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !cancelling) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, cancelling]);

  return (
    <div
      onClick={() => !cancelling && onClose()}
      className="mp-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.62)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mp-modal-panel"
        style={{
          background: "#fff",
          borderRadius: 16,
          width: "min(440px, 100%)",
          padding: "28px 26px 22px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "rgba(220,38,38,0.12)",
            color: "#dc2626",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <Icon name="alert-triangle" size={22} color="#dc2626" />
        </div>
        <h3
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
            margin: "0 0 8px",
            lineHeight: 1.1,
          }}
        >
          Cancelar inscripción<span className="dot">.</span>
        </h3>
        <p style={{ fontSize: 13, color: "#404040", lineHeight: 1.55, margin: "0 0 18px" }}>
          Vas a salir de <b style={{ color: "#0a0a0a" }}>{tournamentName}</b>.
          Liberás tu cupo y otro jugador puede tomarlo. Si querés volver,
          tendrás que inscribirte de nuevo y respetar el orden.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            className="btn"
            onClick={onClose}
            disabled={cancelling}
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
          >
            Volver
          </button>
          <button
            className="btn"
            onClick={onConfirm}
            disabled={cancelling}
            style={{
              background: "#dc2626",
              color: "#fff",
              border: 0,
              fontSize: 12,
              padding: "11px 18px",
              opacity: cancelling ? 0.7 : 1,
            }}
          >
            <Icon name="x" size={13} color="#fff" />
            {cancelling ? "Cancelando…" : "Sí, cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function EventDetailView({ detail, clubName, clubCity, myRegistration: initialReg, inscritos = [] }: Props) {
  const onPaywall = usePaywall();
  const auth = useLandingAuth();
  const router = useRouter();
  const toast = useToast();
  const [cancelling, startCancel] = useTransition();
  const [myReg, setMyReg] = useState<MyRegistration | null>(initialReg ?? null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const registered = myReg != null;
  const { tournament: t, categories, registrationCount } = detail;
  const date = dateLabel(t.startsAt, t.endsAt);
  const sport = sportLabel(t.sport);
  const fmt = formatLabel(t.format);
  const tag = tagFromFormat(t.format);
  const level = levelRange(categories);
  const slots = t.maxParticipants ?? 0;
  const insc = registrationCount;
  const pct = slots > 0 ? Math.min(100, (insc / slots) * 100) : 0;
  const remaining = slots > 0 ? slots - insc : null;
  const accent = (t.name.split(" ")[0] ?? "OPEN").toUpperCase().slice(0, 6);
  const club = [clubName, clubCity].filter(Boolean).join(" · ") || "Multi-club";
  const fee = Math.round(t.entryFeeCents / 100);
  // Estados terminales: cancelado/finalizado → bloquear inscripción + banner.
  const status = t.status as string;
  const isCancelled = status === "cancelled";
  const isFinished = status === "finished" || status === "completed";
  const isClosedState = isCancelled || isFinished;

  // Click en "Inscribirme":
  //  - Anónimo → abre el paywall/auth modal (como antes).
  //  - Logueado → llama al endpoint de registro directo. Si pide pago,
  //    redirige a /pagos/[id]; si es gratis, muestra toast de confirmación.
  // El flow de inscripción vive solo en el dashboard. Desde el landing
  // el botón redirige ahí: guests pasan por paywall (auth) primero.
  // navigating queda en true mientras router.push despacha — da feedback.
  const [navigating, setNavigating] = useState(false);
  const handleInscribirme = () => {
    if (!auth) {
      onPaywall("inscripcion");
      return;
    }
    if (navigating) return;
    setNavigating(true);
    router.push(`/dashboard/eventos/${detail.tournament.slug}`);
  };

  // Confirmación + cancelación de inscripción.
  const handleCancelConfirm = () => {
    if (!myReg || cancelling) return;
    startCancel(async () => {
      const res = await cancelMyRegistration({ registrationId: myReg.id });
      if (!res.ok) {
        toast({
          icon: "alert-triangle",
          title: "No se pudo cancelar",
          sub: res.error.message,
        });
        return;
      }
      toast({ icon: "check", title: "Inscripción cancelada" });
      setMyReg(null);
      setConfirmCancelOpen(false);
      router.refresh();
    });
  };

  // Split prize pool 50% / 30% / 20% para el podio.
  const pool = t.prizePoolCents ?? 0;
  const podium = pool > 0
    ? [
        { p: "1°", amount: formatMoney(Math.round(pool * 0.5)), bg: "#fbbf24", col: "#0a0a0a" },
        { p: "2°", amount: formatMoney(Math.round(pool * 0.3)), bg: "#9ca3af", col: "#fff" },
        { p: "3°", amount: formatMoney(Math.round(pool * 0.2)), bg: "#d97706", col: "#fff" },
      ]
    : [];

  // Cronograma: mock por ahora (no tenemos schedule en DB).
  const schedule = [
    { d: "Día 1 · acreditación", items: [["18:00", "Acreditación + bienvenida"], ["19:00", "Sorteo de cuadros"]] as [string, string][] },
    { d: "Día 2 · cuadros", items: [["09:00", "Octavos de final"], ["14:00", "Cuartos de final"], ["18:00", "Coctel de jugadores"]] as [string, string][] },
    { d: "Día 3 · final", items: [["10:00", "Semifinales"], ["15:00", "Final"], ["17:00", "Premiación"]] as [string, string][] },
  ];

  return (
    <>
      {isClosedState && (
        <div
          style={{
            background: isCancelled ? "#dc2626" : "#0a0a0a",
            color: "#fff",
            padding: "12px 16px",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: "0.04em",
          }}
        >
          <Icon name={isCancelled ? "alert-triangle" : "flag"} size={14} color="#fff" />{" "}
          {isCancelled
            ? "Este torneo fue cancelado por el organizador. Si pagaste cuota, te será devuelta."
            : "Este torneo ya finalizó. Las inscripciones están cerradas."}
        </div>
      )}
      <section
        style={{
          position: "relative",
          minHeight: 480,
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 340,
            color: "rgba(16,185,129,0.07)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -15%)",
          }}
        >
          {accent}
        </div>
        <div className="relative max-w-[1280px] mx-auto px-4 md:px-8 pt-22 pb-10 md:pt-25 md:pb-15">
          <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "4px 12px",
                background: "var(--primary)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              ★ EVENTO {tag}
            </span>
            <span
              style={{
                padding: "4px 12px",
                background: "rgba(255,255,255,0.15)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              {sport}
            </span>
            {level && (
              <span
                style={{
                  padding: "4px 12px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Nivel {level}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
            <span
              className="font-heading"
              style={{ fontSize: 96, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9 }}
            >
              {date.d}
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {date.m}
            </span>
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: "clamp(3rem, 7vw, 5.5rem)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: "0 0 18px",
              lineHeight: 0.92,
              maxWidth: 900,
            }}
          >
            {t.name}
            <span style={{ color: "#10b981" }}>.</span>
          </h1>
          <div
            style={{
              display: "flex",
              gap: 26,
              fontSize: 14,
              color: "rgba(255,255,255,0.85)",
              flexWrap: "wrap",
              marginBottom: 36,
            }}
          >
            <span>
              <Icon name="map-pin" size={13} style={{ display: "inline", marginRight: 5 }} />
              {club}
            </span>
            {pool > 0 && (
              <span>
                <Icon name="trophy" size={13} style={{ display: "inline", marginRight: 5 }} />
                <b style={{ color: "var(--primary)" }}>{formatMoney(pool)}</b> en premios
              </span>
            )}
            {slots > 0 && (
              <span>
                <Icon name="users" size={13} style={{ display: "inline", marginRight: 5 }} />
                {insc} / {slots} parejas
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {isClosedState ? (
              <button
                className="btn"
                disabled
                style={{
                  padding: "15px 26px",
                  fontSize: 13,
                  background: "rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.6)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "not-allowed",
                }}
              >
                <Icon name={isCancelled ? "x" : "flag"} size={14} color="rgba(255,255,255,0.6)" />
                {isCancelled ? "Torneo cancelado" : "Torneo finalizado"}
              </button>
            ) : registered ? (
              <button
                className="btn"
                style={{
                  padding: "15px 26px",
                  fontSize: 13,
                  background: "rgba(220,38,38,0.15)",
                  color: "#fff",
                  border: "1px solid rgba(220,38,38,0.5)",
                }}
                onClick={() => setConfirmCancelOpen(true)}
                disabled={cancelling}
              >
                <Icon name="x" size={14} color="#fff" />
                {cancelling ? "Cancelando…" : "Cancelar inscripción"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{
                  padding: "15px 26px",
                  fontSize: 13,
                  opacity: navigating ? 0.7 : 1,
                  cursor: navigating ? "wait" : "pointer",
                }}
                onClick={handleInscribirme}
                disabled={navigating}
              >
                <Icon name={navigating ? "loader" : "check"} size={14} />
                {navigating
                  ? "Abriendo tu panel…"
                  : auth
                    ? `Continuar inscripción${fee > 0 ? ` · $${fee}` : ""}`
                    : `Inscribirme${fee > 0 ? ` · $${fee}` : " gratis"}`}
              </button>
            )}
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              onClick={() => {
                if (typeof window !== "undefined" && navigator.share) {
                  navigator.share({ title: t.name, url: window.location.href }).catch(() => {});
                }
              }}
            >
              <Icon name="share-2" size={13} />
              Compartir
            </button>
          </div>
          {slots > 0 && (
            <div style={{ marginTop: 28, maxWidth: 480 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                  marginBottom: 6,
                }}
              >
                <span>Cupos restantes</span>
                {remaining != null && remaining > 0 && remaining <= 6 && (
                  <span style={{ color: "#fbbf24", fontWeight: 800 }}>¡Solo {remaining}!</span>
                )}
              </div>
              <div
                style={{
                  height: 6,
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: 9999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    background: "linear-gradient(90deg, #10b981, #fbbf24)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>
      <main
        className="max-w-[1280px] mx-auto px-4 md:px-8 py-10 md:py-15 grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6 md:gap-8"
      >
        <div>
          <div className="label-mp">Sobre el evento</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "8px 0 14px",
            }}
          >
            {date.full}
            <span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#0a0a0a", marginBottom: 32 }}>
            {t.description ??
              `${fmt}. Inscripción ${fee > 0 ? `desde $${fee} por jugador` : "gratis"}. Premios para top 3 y kit oficial MatchPoint para todos los inscritos.`}
          </p>
          <div className="label-mp">Cronograma</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              textTransform: "uppercase",
              margin: "8px 0 18px",
            }}
          >
            Tres días, una sola corona<span className="dot">.</span>
          </h2>
          {schedule.map((day) => (
            <div key={day.d} style={{ marginBottom: 24 }}>
              <div className="label-mp" style={{ color: "var(--primary)", marginBottom: 10 }}>
                {day.d}
              </div>
              {day.items.map(([time, evt], i) => (
                <div
                  key={time}
                  style={{
                    display: "flex",
                    gap: 18,
                    padding: "10px 0",
                    borderTop: i === 0 ? "0" : "1px solid var(--border)",
                  }}
                >
                  <div
                    className="font-heading"
                    style={{
                      fontSize: 16,
                      fontWeight: 900,
                      color: "var(--primary)",
                      minWidth: 70,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {time}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{evt}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div>
          <div className="card" style={{ padding: 22, position: "sticky", top: 100 }}>
            <div className="label-mp">Premios</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 22,
                fontWeight: 900,
                margin: "6px 0 14px",
                textTransform: "uppercase",
              }}
            >
              {formatMoney(pool)} pozo<span className="dot">.</span>
            </h3>
            {podium.length > 0
              ? podium.map((row) => (
                  <div
                    key={row.p}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 8,
                      background: "var(--muted)",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: row.bg,
                        color: row.col,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "Plus Jakarta Sans",
                        fontWeight: 900,
                        fontSize: 14,
                      }}
                    >
                      {row.p}
                    </div>
                    <div style={{ flex: 1, fontSize: 11, color: "var(--muted-fg)" }}>+ trofeo + kit</div>
                    <div className="font-heading" style={{ fontSize: 17, fontWeight: 900 }}>
                      {row.amount}
                    </div>
                  </div>
                ))
              : (
                <p style={{ fontSize: 12, color: "var(--muted-fg)", margin: "8px 0" }}>
                  Premios por anunciar. Inscríbete para asegurar tu cupo.
                </p>
              )}
            {isClosedState ? (
              <button
                className="btn"
                disabled
                style={{
                  width: "100%",
                  marginTop: 14,
                  justifyContent: "center",
                  background: "var(--muted)",
                  color: "var(--muted-fg)",
                  border: "1px solid var(--border)",
                  cursor: "not-allowed",
                }}
              >
                <Icon name={isCancelled ? "x" : "flag"} size={13} />
                {isCancelled ? "Torneo cancelado" : "Torneo finalizado"}
              </button>
            ) : registered ? (
              <button
                className="btn"
                style={{
                  width: "100%",
                  marginTop: 14,
                  justifyContent: "center",
                  background: "#fff",
                  color: "#dc2626",
                  border: "1px solid rgba(220,38,38,0.4)",
                }}
                onClick={() => setConfirmCancelOpen(true)}
                disabled={cancelling}
              >
                <Icon name="x" size={13} color="#dc2626" />
                {cancelling ? "Cancelando…" : "Cancelar inscripción"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{
                  width: "100%",
                  marginTop: 14,
                  justifyContent: "center",
                  opacity: navigating ? 0.7 : 1,
                  cursor: navigating ? "wait" : "pointer",
                }}
                onClick={handleInscribirme}
                disabled={navigating}
              >
                {navigating
                  ? "Abriendo tu panel…"
                  : auth
                    ? "Continuar inscripción"
                    : "Inscribirme"}
                <Icon name={navigating ? "loader" : "arrow-right"} size={13} />
              </button>
            )}
          </div>
        </div>
      </main>

      <section className="max-w-[1280px] mx-auto px-4 md:px-8 pb-10 md:pb-15">
        <InscritosList items={inscritos} maxParticipants={t.maxParticipants ?? null} />
      </section>

      {confirmCancelOpen && (
        <CancelConfirmModal
          tournamentName={t.name}
          cancelling={cancelling}
          onConfirm={handleCancelConfirm}
          onClose={() => setConfirmCancelOpen(false)}
        />
      )}
    </>
  );
}
