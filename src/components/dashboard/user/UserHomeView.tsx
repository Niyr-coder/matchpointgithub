// Client view of UserHome. Receives data ya fetcheada por el server.
"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
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

export type UserHomeData = {
  meUserId: string | null;
  name: string;
  onboardedAt: string | null;
  currentRating: number;
  rank: number | null;
  matchesTotal: number;
  reservations: ReservationLite[];
  tournaments: TournamentFeatured[];
  ratingHistory: RatingPoint[];
  planTier: "free" | "premium";
  planExpiresAt: string | null;
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ReservasPanel reservations={data.reservations} />
        <TorneosPanel tournaments={data.tournaments} />
      </div>
      <ClubActivityFeed items={buildActivityItems(data)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        <MpRatingWidget currentRating={data.currentRating} history={data.ratingHistory} />
        <MyBadgesSection />
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
            {todayLabel()}
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

  // Guests no ven el banner — primero deben crear cuenta.
  if (data.meUserId === null) return null;
  if (dismissed) return null;

  const remaining = daysUntil(data.planExpiresAt);
  const isFree = data.planTier === "free";
  const isExpiringSoon =
    data.planTier === "premium" && remaining !== null && remaining <= UPGRADE_WARN_DAYS;

  if (!isFree && !isExpiringSoon) return null;

  const renewing = isExpiringSoon;
  const title = renewing ? "Tu Premium está por expirar" : "Activa MatchPoint Premium";
  const lead = renewing
    ? `Tu Premium expira en ${remaining} ${remaining === 1 ? "día" : "días"}. Renueva para no perder beneficios.`
    : "Reservas ilimitadas, estadísticas y más por USD 5/mes.";
  const ctaLabel = renewing ? "Renovar" : "Activar Premium";

  return (
    <div
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
          <Link
            href="/dashboard/user/mi-plan"
            style={{
              background: "#facc15",
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "10px 16px",
              borderRadius: 10,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {ctaLabel} →
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
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

function PanelShell({ title, cta, children }: { title: string; cta: string; children: ReactNode }) {
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
        <a
          href="#"
          style={{
            color: "var(--primary)",
            fontSize: 11,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            textDecoration: "none",
          }}
        >
          {cta} →
        </a>
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
    <PanelShell title="Próximas reservas" cta="Ver todas">
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
    <PanelShell title="Torneos abiertos" cta="Explorar">
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
                    Sin torneo abierto
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
          return (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "44px 1fr 72px",
                alignItems: "center",
                columnGap: 14,
                padding: "14px 20px",
                borderTop: i === 0 ? 0 : "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "#0a0a0a",
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
                    color: "var(--primary)",
                  }}
                >
                  {tagFromFormat(it.format)} · {day} {mon}
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
                  {it.name}
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

function MpRatingWidget({ currentRating, history }: { currentRating: number; history: RatingPoint[] }) {
  // Sintetizar baseline 2.5 si <2 puntos.
  const pts =
    history.length >= 2
      ? history.map((h) => h.rating)
      : [STARTING_RATING_VIEW, currentRating];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const W = 200;
  const H = 40;
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i / (pts.length - 1)) * W},${H - ((v - min) / range) * H}`)
    .join(" ");
  const diff = currentRating - pts[0];
  const trendLabel = diff > 0 ? `↑ ${(diff / 1000).toFixed(2)}` : diff < 0 ? `↓ ${(Math.abs(diff) / 1000).toFixed(2)}` : "= 0.00";
  return (
    <div className="card" style={{ padding: 20 }}>
      <div className="label-mp">MP Rating</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 10 }}>
        <div
          className="font-heading tabular"
          style={{
            fontWeight: 900,
            letterSpacing: "-0.03em",
            fontSize: 40,
            lineHeight: 1,
          }}
        >
          {(currentRating / 1000).toFixed(2)}
        </div>
        <div
          style={{
            color: diff > 0 ? "var(--primary)" : diff < 0 ? "#dc2626" : "var(--muted-fg)",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {trendLabel}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 4 }}>
        {history.length >= 2 ? "Últimas evaluaciones" : "Tu nivel inicial · juega para subir"}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 48, marginTop: 14 }}>
        <path
          d={d}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const BADGES = [
  { label: "1° match", icon: "flag", on: true },
  { label: "Racha 5", icon: "flame", on: true },
  { label: "Top 50", icon: "trophy", on: true },
  { label: "Doblete", icon: "award", on: false },
  { label: "Campeón", icon: "crown", on: false },
];

function MyBadgesSection() {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="label-mp">Insignias</div>
        <span className="tabular" style={{ fontSize: 11, color: "var(--muted-fg)" }}>3 / 12</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 14 }}>
        {BADGES.map((b) => (
          <div
            key={b.label}
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
  { icon: "shuffle", label: "Crear juego · Round Robin", action: "crear-juego" },
  { icon: "user-plus", label: "Invitar amigo", action: "invitar" },
] as const;

function QuickActionsPanel({ inviteSlug }: { inviteSlug: string }) {
  const toast = useToast();
  const handle = (a: (typeof ACTIONS)[number]["action"]) => {
    if (a === "crear-match") window.dispatchEvent(new CustomEvent("mp-open-crear-match"));
    else if (a === "crear-juego") window.dispatchEvent(new CustomEvent("mp-open-crear-juego"));
    else if (a === "reservar") window.dispatchEvent(new CustomEvent("mp-open-reservar"));
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
            <Icon name={a.icon} size={16} color="var(--primary)" />
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
      <PanelShell title="Actividad del club" cta="Ver todo">
        <div
          style={{
            padding: "28px 20px",
            textAlign: "center",
            color: "var(--muted-fg)",
            fontSize: 12,
          }}
        >
          Sin actividad reciente. Cuando tu club publique torneos o liberen horarios, aparecerá acá.
        </div>
      </PanelShell>
    );
  }
  return (
    <PanelShell title="Actividad del club" cta="Ver todo">
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
