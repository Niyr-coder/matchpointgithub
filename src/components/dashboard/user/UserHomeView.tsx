// Client view of UserHome. Receives data ya fetcheada por el server.
"use client";
import Link from "next/link";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { requestPlanUpgrade } from "@/server/actions/player-subscriptions";
import { MatchPointPlusModal } from "./MatchPointPlusModal";
import { RatingSparkline } from "../widgets/RatingSparkline";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { OnboardingWizard } from "./OnboardingWizard";
import type { TournamentFeatured } from "@/lib/schemas/tournaments";

type ReservationLite = {
  id: string;
  during: string;
  courtLabel: string;
  clubLabel: string;
  city: string | null;
  status: string;
};

type RatingPoint = { rating: number; snapshotAt: string };

type BadgeLite = {
  kind: string;
  label: string;
  icon: string;
  on: boolean;
};

export type UserHomeData = {
  meUserId: string | null;
  name: string;
  onboardedAt: string | null;
  currentRating: number;
  rank: number | null;
  matchesTotal: number;
  ratingsByMode: { singles: number | null; doubles: number | null };
  reservations: ReservationLite[];
  tournaments: TournamentFeatured[];
  ratingHistory: RatingPoint[];
  historiesByMode: { singles: RatingPoint[]; doubles: RatingPoint[] };
  planTier: "free" | "premium";
  planExpiresAt: string | null;
  badges: BadgeLite[];
};

const UPGRADE_WARN_DAYS = 7;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function todayLabel(): string {
  const d = new Date();
  return `${DAYS_ES[d.getDay()]} · ${d.getDate()} de ${MONTHS_ES[d.getMonth()].toLowerCase()}`;
}

function ratingDisplay(elo: number): string {
  return (elo / 1000).toFixed(2);
}

function relWhen(iso: string): string {
  // Parse tstzrange like '["2025-01-15 18:00:00+00","2025-01-15 19:00:00+00")'
  const m = iso.match(/^[[(]"?([^",)]+)/);
  const startStr = m ? m[1] : iso;
  const start = new Date(startStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.round((startDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  if (diff === 0) return `Hoy · ${hh}:${mm}`;
  if (diff === 1) return `Mañana · ${hh}:${mm}`;
  if (diff > 1 && diff < 7) return `${DAYS_ES[start.getDay()]} · ${hh}:${mm}`;
  return `${start.getDate()} ${MONTHS_ES[start.getMonth()]} · ${hh}:${mm}`;
}

function tournamentRowDate(startsAt: string): { day: string; mon: string } {
  const d = new Date(startsAt);
  return { day: String(d.getUTCDate()).padStart(2, "0"), mon: MONTHS_ES[d.getUTCMonth()].toLowerCase() };
}

function tagFromFormat(format: string): string {
  if (format === "round_robin" || format === "swiss") return "Liga";
  if (format === "groups_to_knockout") return "Estelar";
  return "Torneo";
}

function levelLabel(_t: TournamentFeatured): string {
  // TODO: derive from tournament_categories once we wire them through.
  return "Open · Todos los niveles";
}

function spotsLabel(t: TournamentFeatured): string {
  return t.maxParticipants != null ? `${t.registrationsCount} / ${t.maxParticipants}` : `${t.registrationsCount}`;
}

export function UserHomeView({ data }: { data: UserHomeData }) {
  // El wizard aparece SOLO si el user está autenticado y no marcó onboarded.
  // Usamos state local para poder cerrarlo optimísticamente sin esperar refresh.
  const [wizardClosed, setWizardClosed] = useState(false);
  const showWizard = !!data.meUserId && !data.onboardedAt && !wizardClosed;

  // Realtime: mis reservas + ranking + matches + torneos donde estoy inscrito.
  useRealtimeRefresh(
    data.meUserId
      ? [
          { table: "reservations", filter: `organizer_id=eq.${data.meUserId}` },
          { table: "ranking_snapshots", filter: `user_id=eq.${data.meUserId}` },
          { table: "player_stats", filter: `user_id=eq.${data.meUserId}` },
          { table: "tournaments" },
          // Cuando me inscribo a un torneo, el conteo de participantes y el
          // panel "Torneos featured" deben actualizarse sin recargar.
          // Gap cross-domain detectado en audit.
          { table: "registrations" },
        ]
      : [],
    { enabled: !!data.meUserId },
  );

  return (
    <>
      <WelcomeBanner data={data} />
      <UpgradeBanner data={data} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
        <ReservasPanel reservations={data.reservations} />
        <TorneosPanel tournaments={data.tournaments} />
      </div>
      <ClubActivityFeed items={buildActivityItems(data)} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        <MpRatingWidget
          ratingsByMode={data.ratingsByMode}
          historiesByMode={data.historiesByMode}
        />
        <MyBadgesSection badges={data.badges} />
        <QuickActionsPanel inviteSlug={data.name.toLowerCase().split(" ")[0]} />
      </div>
      {showWizard && (
        <OnboardingWizard
          defaultCity={null}
          onClose={() => setWizardClosed(true)}
        />
      )}
    </>
  );
}

function ClientTodayLabel() {
  // El label depende del timezone del browser, así que server y client pueden
  // discrepar (server suele estar en UTC, user en UTC-5). Renderizamos vacío
  // en SSR y el valor real solo después de mount para evitar el mismatch.
  const [label, setLabel] = useState("");
  useEffect(() => {
    setLabel(todayLabel());
  }, []);
  return <>{label}</>;
}

function WelcomeBanner({ data }: { data: UserHomeData }) {
  const firstName = data.name.split(" ")[0];
  const rankStr = data.rank != null ? `#${data.rank}` : "—";
  return (
    <div
      style={{
        background: "#0a0a0a",
        color: "#fff",
        borderRadius: 14.4,
        padding: 28,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 85% 20%, rgba(16,185,129,0.25), transparent 55%)",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 24,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="chip-green" style={{ marginBottom: 12 }}>
            <span className="chip-dot" />
            <ClientTodayLabel />
          </div>
          <h1
            className="font-heading"
            style={{
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              lineHeight: 0.95,
              fontSize: 44,
              margin: 0,
            }}
          >
            Hola, {firstName}<span className="dot">.</span>
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: "10px 0 0", maxWidth: 420 }}>
            {data.reservations.length > 0 ? (
              <>
                Tienes <b style={{ color: "#fff" }}>{data.reservations.length} {data.reservations.length === 1 ? "reserva" : "reservas"}</b> próximas
                {data.tournaments.length > 0 && (
                  <> y <b style={{ color: "#34d399" }}>{data.tournaments.length} {data.tournaments.length === 1 ? "torneo abierto" : "torneos abiertos"}</b></>
                )}
                .
              </>
            ) : (
              <>Sin reservas próximas. <b style={{ color: "#34d399" }}>Reserva una cancha</b> para empezar.</>
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <Stat n={String(data.matchesTotal)} l="Partidos jugados" />
          <Stat n={ratingDisplay(data.currentRating)} l="MP Rating" accent />
          <Stat n={rankStr} l="Ranking nacional" />
        </div>
      </div>
    </div>
  );
}

function UpgradeBanner({ data }: { data: UserHomeData }) {
  const [dismissed, setDismissed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  // Guests no ven el banner — primero deben crear cuenta.
  if (data.meUserId === null) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => setDismissed(true), 240);
  };

  const doUpgrade = () => {
    if (pending) return;
    startTransition(async () => {
      const r = await requestPlanUpgrade({ tier: "premium", durationMonths: 1 });
      if (!r.ok) {
        const msg =
          r.error.code === "PLAN.PENDING_EXISTS"
            ? "Ya tienes una solicitud pendiente. Sube el comprobante o espera la aprobación."
            : r.error.message || "No se pudo crear la solicitud.";
        toast({ icon: "alert-triangle", title: "No se pudo activar", sub: msg });
        return;
      }
      toast({
        icon: "check-circle-2",
        title: "Solicitud creada",
        sub: "Sube tu comprobante para activar Premium.",
      });
      setModalOpen(false);
      router.push(`/pagos/${r.data.transactionId}`);
    });
  };

  const remaining = daysUntil(data.planExpiresAt);
  const isFree = data.planTier === "free";
  const isExpiringSoon =
    data.planTier === "premium" && remaining !== null && remaining <= UPGRADE_WARN_DAYS;

  if (!isFree && !isExpiringSoon) return null;

  const renewing = isExpiringSoon;
  const title = renewing ? "Tu MatchPoint+ está por expirar" : "Activa MatchPoint+";
  const lead = renewing
    ? `Tu MatchPoint+ expira en ${remaining} ${remaining === 1 ? "día" : "días"}. Renueva para no perder beneficios.`
    : "Reservas ilimitadas, estadísticas y más por USD 5/mes.";
  const ctaLabel = renewing ? "Renovar" : "Activar MatchPoint+";

  return (
    <div
      className="mp-upgrade-banner"
      data-closing={closing ? "true" : "false"}
      style={{
        marginTop: 16,
        background:
          "linear-gradient(135deg, #0a0a0a 0%, #111827 55%, #0a0a0a 100%)",
        color: "#fff",
        borderRadius: 14.4,
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 90% 30%, rgba(250,204,21,0.18), transparent 55%), radial-gradient(ellipse at 10% 80%, rgba(16,185,129,0.14), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <div
            className="mp-upgrade-crown"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(250,204,21,0.14)",
              color: "#facc15",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid rgba(250,204,21,0.3)",
              flexShrink: 0,
            }}
          >
            <Icon name="crown" size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              className="font-heading"
              style={{
                fontWeight: 900,
                fontSize: 16,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              {title}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "rgba(255,255,255,0.65)",
                marginTop: 4,
              }}
            >
              {lead}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="mp-upgrade-cta"
            style={{
              background: "#facc15",
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "10px 16px",
              borderRadius: 10,
              border: 0,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >
            {ctaLabel} →
          </button>
          <button
            type="button"
            className="mp-upgrade-close"
            onClick={handleDismiss}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              color: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
            }}
          >
            ×
          </button>
        </div>
      </div>

      {modalOpen && (
        <MatchPointPlusModal
          mode={renewing ? "renew" : "activate"}
          pending={pending}
          onConfirm={doUpgrade}
          onCancel={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

function Stat({ n, l, accent }: { n: string; l: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="font-heading tabular"
        style={{
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          fontSize: 32,
          color: accent ? "#34d399" : "#fff",
        }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.5)",
          marginTop: 6,
        }}
      >
        {l}
      </div>
    </div>
  );
}

function PanelShell({
  title,
  cta,
  ctaHref,
  children,
}: {
  title: string;
  cta: string;
  ctaHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          className="font-heading"
          style={{
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        {ctaHref && (
          <Link href={ctaHref} className="mp-panel-cta">
            <span>{cta}</span>
            <span className="mp-panel-cta-arrow" aria-hidden>
              →
            </span>
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

const MIN_RESERVAS = 3;

function ReservasPanel({ reservations }: { reservations: ReservationLite[] }) {
  const padded: (ReservationLite | { placeholder: true; key: string })[] = [...reservations];
  while (padded.length < MIN_RESERVAS) {
    padded.push({ placeholder: true, key: `ph-${padded.length}` });
  }
  return (
    <PanelShell title="Próximas reservas" cta="Ver todas" ctaHref="/dashboard/user/mis-reservas">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {padded.map((it, i) => {
          if ("placeholder" in it) {
            return (
              <div
                key={it.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr auto",
                  columnGap: 14,
                  alignItems: "center",
                  padding: "14px 20px",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  opacity: 0.5,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "#fafafa",
                    color: "var(--muted-fg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px dashed var(--border)",
                  }}
                >
                  <Icon name="calendar" size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: "var(--muted-fg)",
                    }}
                  >
                    Disponible
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: "var(--muted-fg)" }}>
                    Reserva una cancha
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>—</div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    padding: "4px 10px",
                    borderRadius: 9999,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    background: "var(--muted)",
                    color: "var(--muted-fg)",
                  }}
                >
                  —
                </span>
              </div>
            );
          }
          const confirmed = it.status === "booked" || it.status === "checked_in";
          const courtSub = [it.courtLabel, it.clubLabel].filter(Boolean).join(" · ");
          return (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr auto",
                columnGap: 14,
                alignItems: "center",
                padding: "14px 20px",
                borderTop: i === 0 ? 0 : "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "#f0fdf4",
                  color: "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="calendar" size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: "var(--primary)",
                  }}
                >
                  {relWhen(it.during)}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {courtSub || "Reserva"}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                  {it.city ?? "Organizador"}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  padding: "4px 10px",
                  borderRadius: 9999,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  background: confirmed ? "rgba(16,185,129,0.12)" : "#fffbeb",
                  color: confirmed ? "var(--primary)" : "#b45309",
                  border: confirmed ? "none" : "1px solid #fde68a",
                }}
              >
                {confirmed ? "Confirmada" : "Pendiente"}
              </span>
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

const MIN_TORNEOS = 3;

function TorneosPanel({ tournaments }: { tournaments: TournamentFeatured[] }) {
  const padded: (TournamentFeatured | { placeholder: true; key: string })[] = [...tournaments];
  while (padded.length < MIN_TORNEOS) {
    padded.push({ placeholder: true, key: `ph-${padded.length}` });
  }
  return (
    <PanelShell title="Mis torneos" cta="Explorar" ctaHref="/dashboard/user/eventos">
      <div style={{ display: "flex", flexDirection: "column" }}>
        {padded.map((it, i) => {
          if ("placeholder" in it) {
            return (
              <div
                key={it.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr 72px",
                  alignItems: "center",
                  columnGap: 14,
                  padding: "14px 20px",
                  borderTop: i === 0 ? 0 : "1px solid var(--border)",
                  opacity: 0.5,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: "#fafafa",
                    color: "var(--muted-fg)",
                    border: "1px dashed var(--border)",
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      color: "var(--muted-fg)",
                    }}
                  >
                    Próximamente
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: "var(--muted-fg)" }}>
                    Aún sin inscripción
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>—</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tabular" style={{ fontSize: 12, fontWeight: 900, color: "var(--muted-fg)" }}>
                    —
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>cupos</div>
                </div>
              </div>
            );
          }
          const { day, mon } = tournamentRowDate(it.startsAt);
          const isCancelled = it.status === "cancelled";
          const isFinished = it.status === "finished";
          return (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 72px",
                alignItems: "center",
                columnGap: 14,
                padding: "14px 20px",
                borderTop: i === 0 ? 0 : "1px solid var(--border)",
                opacity: isCancelled ? 0.6 : 1,
              }}
            >
              <Link
                href={`/dashboard/eventos/${it.slug}`}
                className="mp-tournament-link"
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr",
                  alignItems: "center",
                  columnGap: 14,
                  textDecoration: "none",
                  color: "inherit",
                  minWidth: 0,
                }}
              >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: isCancelled ? "#dc2626" : "#0a0a0a",
                  color: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                  }}
                >
                  {mon}
                </span>
                <span
                  className="font-heading"
                  style={{ fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em", lineHeight: 1 }}
                >
                  {day}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: isCancelled
                      ? "#dc2626"
                      : isFinished
                        ? "var(--muted-fg)"
                        : "var(--primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {isCancelled ? (
                    <>
                      <span
                        style={{
                          padding: "2px 6px",
                          background: "#dc2626",
                          color: "#fff",
                          borderRadius: 4,
                          fontSize: 9,
                          letterSpacing: "0.08em",
                        }}
                      >
                        CANCELADO
                      </span>
                      {day} {mon}
                    </>
                  ) : isFinished ? (
                    <>FINALIZADO · {day} {mon}</>
                  ) : (
                    <>{tagFromFormat(it.format)} · {day} {mon}</>
                  )}
                </div>
                <div
                  className="mp-tournament-name"
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    maxWidth: "100%",
                  }}
                >
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textDecoration: isCancelled ? "line-through" : "none",
                    }}
                  >
                    {it.name}
                  </span>
                  <span
                    className="mp-tournament-arrow"
                    aria-hidden
                    style={{ display: "inline-flex", flexShrink: 0 }}
                  >
                    →
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted-fg)",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {levelLabel(it)}
                </div>
              </div>
            </Link>
            <div style={{ textAlign: "right" }}>
              <div className="tabular" style={{ fontSize: 12, fontWeight: 900 }}>
                {spotsLabel(it)}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>cupos</div>
            </div>
          </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

const STARTING_RATING_VIEW = 2500;

type WidgetMode = "singles" | "doubles";

function MpRatingWidget({
  ratingsByMode,
  historiesByMode,
}: {
  ratingsByMode: { singles: number | null; doubles: number | null };
  historiesByMode: { singles: RatingPoint[]; doubles: RatingPoint[] };
}) {
  // Default: singles si existe, sino doubles, sino singles igual.
  const initial: WidgetMode = ratingsByMode.singles != null
    ? "singles"
    : ratingsByMode.doubles != null
      ? "doubles"
      : "singles";
  const [mode, setMode] = useState<WidgetMode>(initial);

  const rawRating = ratingsByMode[mode];
  const hasRating = rawRating != null;
  const currentRating = rawRating ?? STARTING_RATING_VIEW;
  const history = historiesByMode[mode] ?? [];

  // Sintetizar baseline si <2 puntos para que el sparkline siempre tenga forma.
  const sparkPoints =
    history.length >= 2
      ? history
      : [
          { rating: STARTING_RATING_VIEW, snapshotAt: new Date(Date.now() - 30 * 86400_000).toISOString() },
          { rating: currentRating, snapshotAt: new Date().toISOString() },
        ];
  const first = sparkPoints[0].rating;
  const diff = currentRating - first;
  const trendLabel = diff > 0 ? `↑ ${(diff / 1000).toFixed(2)}` : diff < 0 ? `↓ ${(Math.abs(diff) / 1000).toFixed(2)}` : "= 0.00";

  const modeLabel = mode === "singles" ? "singles" : "dobles";
  const subText = !hasRating
    ? `Sin partidos en ${modeLabel} todavía`
    : history.length >= 2
      ? "Pasa el mouse para ver fecha y rating"
      : "Tu nivel inicial · juega para subir";

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="label-mp">MP Rating</div>
        <ModeToggle value={mode} onChange={setMode} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <div
          className="font-heading tabular"
          style={{
            fontWeight: 900,
            letterSpacing: "-0.03em",
            fontSize: 40,
            lineHeight: 1,
            color: hasRating ? undefined : "var(--muted-fg)",
          }}
        >
          {hasRating ? (currentRating / 1000).toFixed(2) : "—"}
        </div>
        {hasRating && (
          <div
            style={{
              color: diff > 0 ? "var(--primary)" : diff < 0 ? "#dc2626" : "var(--muted-fg)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {trendLabel}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>{subText}</div>
      <div style={{ marginTop: 14 }}>
        <RatingSparkline points={sparkPoints} width={200} height={48} withArea={false} strokeWidth={2} />
      </div>
    </div>
  );
}

function ModeToggle({
  value,
  onChange,
}: {
  value: WidgetMode;
  onChange: (v: WidgetMode) => void;
}) {
  const opts: { k: WidgetMode; label: string }[] = [
    { k: "singles", label: "Singles" },
    { k: "doubles", label: "Dobles" },
  ];
  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        background: "#f5f5f5",
        borderRadius: 9999,
      }}
    >
      {opts.map((o) => {
        const active = value === o.k;
        return (
          <button
            key={o.k}
            onClick={() => onChange(o.k)}
            style={{
              border: 0,
              background: active ? "#0a0a0a" : "transparent",
              color: active ? "#fff" : "#737373",
              padding: "4px 10px",
              borderRadius: 9999,
              fontWeight: 800,
              fontSize: 9.5,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MyBadgesSection({ badges }: { badges: BadgeLite[] }) {
  // Data viene del catálogo `badges` + `player_badges` del user (mig 108).
  // Si por alguna razón no hay badges (instancia recién creada), no mostramos
  // estado vacío explícito — la card simplemente queda con 0/0.
  const total = badges.length;
  const unlocked = badges.filter((b) => b.on).length;
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="label-mp">Insignias</div>
        <span className="tabular" style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          {unlocked} / {total}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 14 }}>
        {badges.map((b) => (
          <div
            key={b.kind}
            style={{
              aspectRatio: "1",
              borderRadius: 10,
              background: b.on ? "#f0fdf4" : "#f5f5f5",
              color: b.on ? "var(--primary)" : "#d4d4d4",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              border: b.on ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--border)",
            }}
          >
            <Icon name={b.icon} size={16} />
            <span
              style={{
                fontSize: 8,
                fontWeight: 900,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textAlign: "center",
              }}
            >
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ACTIONS = [
  { icon: "calendar-plus", label: "Reservar cancha", action: "reservar" },
  { icon: "users", label: "Crear match", action: "crear-match" },
  { icon: "swords", label: "Busco partido", action: "buscar-partido" },
  { icon: "shuffle", label: "Crear juego · Round Robin", action: "crear-juego" },
  { icon: "user-plus", label: "Invitar amigo", action: "invitar" },
] as const;

function QuickActionsPanel({ inviteSlug }: { inviteSlug: string }) {
  const toast = useToast();
  const router = useRouter();
  const handle = (a: (typeof ACTIONS)[number]["action"]) => {
    if (a === "crear-match") window.dispatchEvent(new CustomEvent("mp-open-crear-match"));
    else if (a === "crear-juego") window.dispatchEvent(new CustomEvent("mp-open-crear-juego"));
    else if (a === "reservar") window.dispatchEvent(new CustomEvent("mp-open-reservar"));
    else if (a === "buscar-partido") router.push("/dashboard/user/busco-partido");
    else if (a === "invitar") {
      const url = `matchpoint.app/invite/${inviteSlug}`;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
      toast({
        icon: "copy",
        title: "Link de invitación copiado",
        sub: `${url} · pégalo en WhatsApp`,
      });
    }
  };
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-mp">Acciones rápidas</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            className="mp-quick-action"
            onClick={() => handle(a.action)}
            style={{
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <span className="mp-quick-action-icon">
              <Icon name={a.icon} size={16} color="var(--primary)" />
            </span>
            <span style={{ fontSize: 12, fontWeight: 700 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type ActivityItem = { id: string; who: string; what: string; when: string; icon?: string };

function relTimeFromNow(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const days = Math.round(hr / 24);
  if (days < 7) return `hace ${days}d`;
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()].toLowerCase()}`;
}

function buildActivityItems(data: UserHomeData): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const t of data.tournaments.slice(0, 3)) {
    out.push({
      id: `t-${t.id}`,
      who: t.clubName ?? "Un club",
      what: `publicó el torneo "${t.name}"`,
      when: relTimeFromNow(t.startsAt),
      icon: "trophy",
    });
  }
  for (const r of data.reservations.slice(0, 2)) {
    out.push({
      id: `r-${r.id}`,
      who: r.clubLabel || "Tu club",
      what: `tienes una reserva en ${r.courtLabel}`,
      when: relWhen(r.during),
      icon: "calendar",
    });
  }
  return out.slice(0, 4);
}

function ClubActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <PanelShell title="Actividad del club" cta="Ver todo" ctaHref="/dashboard/user/team">
        <div
          style={{
            padding: "28px 20px",
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 12,
          }}
        >
          Sin actividad reciente. Cuando tu club publique torneos o liberen horarios, aparecerá aquí.
        </div>
      </PanelShell>
    );
  }
  return (
    <PanelShell title="Actividad del club" cta="Ver todo" ctaHref="/dashboard/user/team">
      <div>
        {items.map((it, i) => (
          <div
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 20px",
              borderTop: i === 0 ? 0 : "1px solid var(--border)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#f5f5f5",
                color: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={it.icon ?? "bell"} size={14} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {it.who} <span style={{ fontWeight: 400, color: "var(--muted-fg)" }}>{it.what}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{it.when}</div>
            </div>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
