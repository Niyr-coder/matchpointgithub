// Espejo visual del EventDetailView del landing, dentro del shell del
// dashboard. Diferencias clave:
//   - Recibe myRegistration y reemplaza el CTA "Inscribirme" por
//     "Estás inscrito · Abandonar" cuando aplica.
//   - No depende del PaywallContext (no estamos en el landing).
//   - Para usuarios no inscritos, el botón Inscribirme delega al flow
//     público en /eventos/[slug] (que ya tiene la lógica completa).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { TournamentDetail } from "@/lib/schemas/tournaments";
import { cancelMyRegistration, registerToTournament } from "@/server/actions/tournaments";
import { useToast } from "@/components/dashboard/ToastProvider";

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
  myRegistration: MyRegistration | null;
  inscritos?: TournamentInscrito[];
  meUserId: string | null;
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

export function TournamentDetailView({ detail, clubName, clubCity, myRegistration: initialReg, inscritos = [], meUserId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [myReg, setMyReg] = useState<MyRegistration | null>(initialReg);
  const [cancelling, startCancel] = useTransition();
  const [registering, startRegister] = useTransition();

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
  const status = t.status as string;
  const isCancelled = status === "cancelled";
  const isFinished = status === "finished" || status === "completed";
  const isClosedState = isCancelled || isFinished;

  const pool = t.prizePoolCents ?? 0;
  const podium = pool > 0
    ? [
        { p: "1°", amount: formatMoney(Math.round(pool * 0.5)), bg: "#fbbf24", col: "#0a0a0a" },
        { p: "2°", amount: formatMoney(Math.round(pool * 0.3)), bg: "#9ca3af", col: "#fff" },
        { p: "3°", amount: formatMoney(Math.round(pool * 0.2)), bg: "#d97706", col: "#fff" },
      ]
    : [];

  // Cronograma: mock — no tenemos schedule en DB.
  const schedule = [
    { d: "Día 1 · acreditación", items: [["18:00", "Acreditación + bienvenida"], ["19:00", "Sorteo de cuadros"]] as [string, string][] },
    { d: "Día 2 · cuadros", items: [["09:00", "Octavos de final"], ["14:00", "Cuartos de final"], ["18:00", "Coctel de jugadores"]] as [string, string][] },
    { d: "Día 3 · final", items: [["10:00", "Semifinales"], ["15:00", "Final"], ["17:00", "Premiación"]] as [string, string][] },
  ];

  // Modal selector de método de pago para torneos con policy='flexible'.
  const [pickPaymentOpen, setPickPaymentOpen] = useState(false);

  // Inscripción real — el dashboard es el único lugar donde se ejecuta.
  // El landing redirige aquí para que la lógica viva en un solo lado.
  const handleRegister = () => {
    if (registering || !meUserId) return;
    // Si el torneo deja al jugador elegir, abrimos el modal.
    if (detail.tournament.paymentPolicy === "flexible") {
      setPickPaymentOpen(true);
      return;
    }
    runRegister();
  };

  const runRegister = (paymentMode?: "online" | "onsite") => {
    if (!meUserId) return;
    startRegister(async () => {
      const res = await registerToTournament({
        tournamentId: detail.tournament.id,
        body: { playerIds: [meUserId] },
        paymentMode,
      });
      if (!res.ok) {
        const code = res.error.code;
        if (code === "TOURNAMENTS.PAYMENT_MODE_REQUIRED") {
          toast({
            icon: "alert-triangle",
            title: "Este torneo pide elegir modo de pago",
            sub: "El selector online/onsite estará disponible en la próxima versión.",
          });
          return;
        }
        if (code === "TOURNAMENTS.ALREADY_REGISTERED") {
          toast({ icon: "check-circle-2", title: "Ya estabas inscrito" });
          router.refresh();
          return;
        }
        toast({
          icon: "alert-triangle",
          title: "No se pudo inscribir",
          sub: res.error.message,
        });
        return;
      }
      const txId = res.data.paidTransactionId ?? null;
      // Diferenciamos por modo efectivo:
      //  - online (explícito o policy=prepay) → /pagos/[id] para subir comprobante.
      //  - onsite → queda inscrito aquí, paga en el club al llegar (sin nav).
      //  - free   → no hay tx, solo confirma.
      const policy = detail.tournament.paymentPolicy;
      const effectiveMode = paymentMode ?? (policy === "prepay" ? "online" : policy === "onsite" ? "onsite" : null);
      if (txId && effectiveMode === "online") {
        toast({ icon: "upload", title: "Inscripción creada", sub: "Sube tu comprobante" });
        router.push(`/pagos/${txId}`);
        return;
      }
      const isOnsite = paymentMode === "onsite";
      toast({
        icon: isOnsite ? "map-pin" : "check",
        title: isOnsite ? "Cupo reservado" : "¡Inscrito!",
        sub: isOnsite ? "Pagas en el club al llegar" : undefined,
      });
      setMyReg({ id: res.data.id, status: res.data.status });
      setPickPaymentOpen(false);
      router.refresh();
    });
  };

  const handleCancel = () => {
    if (!myReg) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm("¿Seguro que quieres abandonar la inscripción? Liberarás tu cupo.");
      if (!ok) return;
    }
    startCancel(async () => {
      const res = await cancelMyRegistration({ registrationId: myReg.id });
      if (res.ok) {
        setMyReg(null);
        router.refresh();
      }
    });
  };

  const renderHeroCta = () => {
    if (isClosedState) {
      return (
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
      );
    }
    if (myReg) {
      return (
        <>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 18px",
              borderRadius: 12,
              background: "rgba(16,185,129,0.18)",
              border: "1px solid rgba(16,185,129,0.45)",
              color: "#fff",
            }}
          >
            <Icon name="check-circle-2" size={16} color="#10b981" />
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Estás inscrito
              </div>
              <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>Status: {myReg.status}</div>
            </div>
          </div>
          <button
            className="btn"
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
              padding: "11px 18px",
              fontSize: 12,
            }}
          >
            <Icon name="x" size={13} color="#fff" />
            {cancelling ? "Cancelando…" : "Abandonar inscripción"}
          </button>
        </>
      );
    }
    return (
      <button
        type="button"
        onClick={handleRegister}
        disabled={registering}
        className="btn btn-primary"
        style={{
          padding: "15px 26px",
          fontSize: 13,
          opacity: registering ? 0.7 : 1,
        }}
      >
        <Icon name="check" size={14} />
        {registering ? "Procesando…" : `Inscribirme${fee > 0 ? ` · $${fee}` : " gratis"}`}
      </button>
    );
  };

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
          borderRadius: 16,
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
        <div style={{ position: "relative", padding: "48px 32px" }}>
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
              fontSize: "clamp(3rem, 7vw, 5rem)",
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
              marginBottom: 28,
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
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {renderHeroCta()}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 24,
        }}
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
            ) : myReg ? (
              <button
                className="btn"
                style={{
                  width: "100%",
                  marginTop: 14,
                  justifyContent: "center",
                  background: "#fff",
                  border: "1px solid var(--border)",
                }}
                onClick={handleCancel}
                disabled={cancelling}
              >
                <Icon name="x" size={13} />
                {cancelling ? "Cancelando…" : "Abandonar inscripción"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRegister}
                disabled={registering}
                className="btn btn-primary"
                style={{
                  width: "100%",
                  marginTop: 14,
                  justifyContent: "center",
                  opacity: registering ? 0.7 : 1,
                }}
              >
                {registering ? "Procesando…" : "Inscribirme"}
                <Icon name="arrow-right" size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      <InscritosList items={inscritos} maxParticipants={t.maxParticipants ?? null} />

      {pickPaymentOpen && (
        <PaymentModePicker
          fee={fee}
          pending={registering}
          onChoose={(mode) => runRegister(mode)}
          onClose={() => setPickPaymentOpen(false)}
        />
      )}
    </>
  );
}

function PaymentModePicker({
  fee,
  pending,
  onChoose,
  onClose,
}: {
  fee: number;
  pending: boolean;
  onChoose: (mode: "online" | "onsite") => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={() => !pending && onClose()}
      className="mp-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.6)",
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
          width: "min(460px, 100%)",
          padding: "26px 24px 22px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
      >
        <div className="label-mp">Cómo querés pagar</div>
        <h3
          className="font-heading"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
            margin: "6px 0 6px",
          }}
        >
          Elige tu método<span className="dot">.</span>
        </h3>
        <p style={{ fontSize: 12.5, color: "var(--muted-fg)", margin: "0 0 18px" }}>
          Inscripción USD {fee}. Después de elegir te llevamos al paso siguiente.
        </p>

        <button
          type="button"
          onClick={() => !pending && onChoose("online")}
          disabled={pending}
          className="mp-pay-option"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: "#fff",
            border: "1.5px solid var(--border)",
            cursor: pending ? "wait" : "pointer",
            marginBottom: 10,
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(16,185,129,0.12)",
              color: "var(--primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="upload" size={16} color="var(--primary)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900 }}>Pagar online</div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
              Transferencia o DeUna · subes comprobante en el siguiente paso
            </div>
          </div>
          <span className="mp-pay-option-arrow" style={{ display: "inline-flex" }}>
            <Icon name="arrow-right" size={14} color="var(--muted-fg)" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => !pending && onChoose("onsite")}
          disabled={pending}
          className="mp-pay-option"
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 16px",
            borderRadius: 12,
            background: "#fff",
            border: "1.5px solid var(--border)",
            cursor: pending ? "wait" : "pointer",
            marginBottom: 14,
            fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(251,191,36,0.18)",
              color: "#d97706",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon name="map-pin" size={16} color="#d97706" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900 }}>Pagar en el club</div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
              Reservas el cupo ahora y pagas en el local al llegar
            </div>
          </div>
          <span className="mp-pay-option-arrow" style={{ display: "inline-flex" }}>
            <Icon name="arrow-right" size={14} color="var(--muted-fg)" />
          </span>
        </button>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              background: "transparent",
              border: 0,
              padding: "8px 12px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted-fg)",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
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
        <div style={{ padding: "40px 22px", textAlign: "center", color: "var(--muted-fg)", fontSize: 13 }}>
          <Icon name="users" size={28} color="var(--muted-fg)" />
          <div style={{ marginTop: 10 }}>Sé el primero en inscribirte.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 0 }}>
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
                <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>{p.city ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
