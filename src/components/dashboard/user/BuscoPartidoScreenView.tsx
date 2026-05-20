"use client";

// Tablón "Busco partido": feed de avisos de la ciudad + publicar + postularse +
// gestionar mis avisos (aceptar postulantes). Ver docs/product/03-match-seeks.md.
//
// Layout responsive híbrido: Tailwind para breakpoints, tokens en inline style.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { PlayerPicker, type Player } from "@/components/dashboard/widgets/PlayerPicker";
import {
  acceptApplicant,
  applyToMatchSeek,
  cancelMatchSeek,
  createMatchSeek,
} from "@/server/actions/match-seeks";
import { cancelMatch, rescheduleMatch } from "@/server/actions/matches";
import type { MatchSeek, MatchSeekApplication } from "@/lib/schemas/match-seeks";
import type { MyApplicationItem } from "@/server/actions/match-seeks";
import { useEnabledSports } from "@/components/SportsProvider";
import { SPORT_META, sportLabel, type Sport } from "@/lib/sports";

type MineItem = { seek: MatchSeek; applications: MatchSeekApplication[] };

type Props = {
  meUserId: string;
  myCity: string | null;
  myPlanTier: "free" | "premium";
  feed: MatchSeek[];
  mine: MineItem[];
  myApplications: MyApplicationItem[];
  focusSeekId: string | null;
};

function initials(name: string | null): string {
  if (!name) return "??";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatWindow(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);
  const hh = String(start.getHours()).padStart(2, "0");
  const mm = String(start.getMinutes()).padStart(2, "0");
  const dayLabel =
    diff === 0 ? "Hoy" : diff === 1 ? "Mañana" : start.toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });
  let s = `${dayLabel} · ${hh}:${mm}`;
  if (endIso) {
    const end = new Date(endIso);
    s += `–${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
  }
  return s;
}

function skillLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `Nivel ${min.toFixed(1)} – ${max.toFixed(1)}`;
  if (min != null) return `Nivel ≥ ${min.toFixed(1)}`;
  return `Nivel ≤ ${(max as number).toFixed(1)}`;
}

// ── Estado vacío honesto cuando el feature está apagado ──────────────────────
export function BuscoPartidoComingSoon({ reason }: { reason: "flag" | "auth" }) {
  return (
    <div className="card" style={{ padding: 40, textAlign: "center", maxWidth: 560, margin: "40px auto" }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: "#f0fdf4",
          color: "var(--primary)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <Icon name="swords" size={26} />
      </div>
      <h2 className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", margin: 0 }}>
        Busco partido<span style={{ color: "var(--primary)" }}>.</span>
      </h2>
      <p style={{ color: "var(--muted-fg)", fontSize: 13.5, marginTop: 10 }}>
        {reason === "auth"
          ? "Inicia sesión para encontrar rivales cerca de ti."
          : "Estamos afinando esta función para tu ciudad. Muy pronto vas a poder publicar tu búsqueda y encontrar rivales de tu nivel."}
      </p>
    </div>
  );
}

// ── Pantalla principal ───────────────────────────────────────────────────────
export function BuscoPartidoScreenView({ meUserId, myCity, myPlanTier, feed, mine, myApplications, focusSeekId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<"feed" | "mine" | "apps">(focusSeekId ? "mine" : "feed");
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<"singles" | "doubles" | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<MatchSeek | null>(null);

  useRealtimeRefresh(
    [
      { table: "match_seeks" },
      { table: "match_seek_applications" },
    ],
    { enabled: true },
  );

  const filteredFeed = useMemo(
    () =>
      feed.filter(
        (s) =>
          (!sportFilter || s.sport === sportFilter) &&
          (!modeFilter || s.mode === modeFilter) &&
          s.createdBy !== meUserId,
      ),
    [feed, sportFilter, modeFilter, meUserId],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Header
        myCity={myCity}
        feedCount={filteredFeed.length}
        onPublish={() => setPublishOpen(true)}
      />

      <Tabs tab={tab} setTab={setTab} mineCount={mine.length} appsCount={myApplications.length} />

      {tab === "feed" ? (
        <>
          <Filters
            sportFilter={sportFilter}
            setSportFilter={setSportFilter}
            modeFilter={modeFilter}
            setModeFilter={setModeFilter}
          />
          {filteredFeed.length === 0 ? (
            <EmptyFeed onPublish={() => setPublishOpen(true)} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredFeed.map((s) => (
                <FeedCard key={s.id} seek={s} onApply={() => setApplyTarget(s)} />
              ))}
            </div>
          )}
        </>
      ) : tab === "mine" ? (
        <MineList mine={mine} focusSeekId={focusSeekId} onRefresh={() => router.refresh()} />
      ) : (
        <MyApplicationsList apps={myApplications} />
      )}

      {publishOpen && (
        <PublishModal
          myPlanTier={myPlanTier}
          meUserId={meUserId}
          onClose={() => setPublishOpen(false)}
          onDone={() => {
            setPublishOpen(false);
            router.refresh();
          }}
        />
      )}

      {applyTarget && (
        <ApplyModal
          seek={applyTarget}
          meUserId={meUserId}
          onClose={() => setApplyTarget(null)}
          onDone={() => {
            setApplyTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function Header({ myCity, feedCount, onPublish }: { myCity: string | null; feedCount: number; onPublish: () => void }) {
  return (
    <div
      style={{
        background: "#0a0a0a",
        color: "#fff",
        borderRadius: 14.4,
        padding: 24,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at 90% 10%, rgba(16,185,129,0.22), transparent 55%)",
        }}
      />
      <div style={{ position: "relative" }}>
        <div className="chip-green" style={{ marginBottom: 10 }}>
          <span className="chip-dot" />
          {myCity ?? "Tu ciudad"}
        </div>
        <h1
          className="font-heading"
          style={{ fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", fontSize: 34, margin: 0, lineHeight: 0.95 }}
        >
          Busco partido<span className="dot">.</span>
        </h1>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, margin: "8px 0 0" }}>
          {feedCount > 0 ? (
            <>
              <b style={{ color: "#34d399" }}>{feedCount}</b> {feedCount === 1 ? "jugador busca" : "jugadores buscan"} rival cerca de ti.
            </>
          ) : (
            <>Sé el primero en publicar una búsqueda en tu zona.</>
          )}
        </p>
      </div>
      <button className="btn btn-primary" style={{ position: "relative", padding: "11px 18px" }} onClick={onPublish}>
        <Icon name="plus" size={14} color="#fff" />
        Publicar
      </button>
    </div>
  );
}

function Tabs({
  tab,
  setTab,
  mineCount,
  appsCount,
}: {
  tab: "feed" | "mine" | "apps";
  setTab: (t: "feed" | "mine" | "apps") => void;
  mineCount: number;
  appsCount: number;
}) {
  const opts: { k: "feed" | "mine" | "apps"; label: string }[] = [
    { k: "feed", label: "Cerca de ti" },
    { k: "mine", label: `Mis avisos${mineCount ? ` · ${mineCount}` : ""}` },
    { k: "apps", label: `Mis postulaciones${appsCount ? ` · ${appsCount}` : ""}` },
  ];
  return (
    <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#f5f5f5", borderRadius: 9999, alignSelf: "flex-start" }}>
      {opts.map((o) => {
        const active = tab === o.k;
        return (
          <button
            key={o.k}
            onClick={() => setTab(o.k)}
            style={{
              border: 0,
              background: active ? "#0a0a0a" : "transparent",
              color: active ? "#fff" : "#737373",
              padding: "7px 16px",
              borderRadius: 9999,
              fontWeight: 800,
              fontSize: 11.5,
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

function Filters({
  sportFilter,
  setSportFilter,
  modeFilter,
  setModeFilter,
}: {
  sportFilter: string | null;
  setSportFilter: (s: string | null) => void;
  modeFilter: "singles" | "doubles" | null;
  setModeFilter: (m: "singles" | "doubles" | null) => void;
}) {
  const { sports, single } = useEnabledSports();
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {/* Selector de deporte oculto cuando solo hay uno habilitado. */}
      {!single && (
        <>
          <span className="label-mp">Deporte</span>
          {sports.map((s) => {
            const on = sportFilter === s;
            return (
              <Chip key={s} on={on} onClick={() => setSportFilter(on ? null : s)}>
                {SPORT_META[s].label}
              </Chip>
            );
          })}
        </>
      )}
      <span className="label-mp" style={{ marginLeft: single ? 0 : 8 }}>Modalidad</span>
      <Chip on={modeFilter === "singles"} onClick={() => setModeFilter(modeFilter === "singles" ? null : "singles")}>
        Singles
      </Chip>
      <Chip on={modeFilter === "doubles"} onClick={() => setModeFilter(modeFilter === "doubles" ? null : "doubles")}>
        Dobles
      </Chip>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 13px",
        borderRadius: 9999,
        border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
        background: on ? "#ecfdf5" : "#fff",
        color: on ? "#065f46" : "#0a0a0a",
        fontSize: 11.5,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function FeedCard({ seek, onApply }: { seek: MatchSeek; onApply: () => void }) {
  const isDoublesIncomplete = seek.mode === "doubles";
  const statusLabel = seek.mode === "singles" ? "Busca rival" : "Dobles · busca dupla";
  const skill = skillLabel(seek.skillMin, seek.skillMax);
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#10b981,#047857)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 15,
            flexShrink: 0,
          }}
        >
          {initials(seek.authorName)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {seek.authorName ?? "Jugador"}
            </div>
            <span
              style={{
                fontSize: 8.5,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 9999,
                background: isDoublesIncomplete ? "#fffbeb" : "rgba(16,185,129,0.12)",
                color: isDoublesIncomplete ? "#b45309" : "var(--primary)",
                border: isDoublesIncomplete ? "1px solid #fde68a" : "none",
                flexShrink: 0,
              }}
            >
              {statusLabel}
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
            {sportLabel(seek.sport)} · {seek.mode === "singles" ? "Singles" : "Dobles"}
            {seek.ranked ? " · Ranked" : ""}
            {seek.city ? ` · ${seek.city}` : ""}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 11.5, color: "#0a0a0a" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="calendar" size={13} color="var(--muted-fg)" />
          {formatWindow(seek.windowStart, seek.windowEnd)}
        </span>
        {skill && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="zap" size={13} color="var(--muted-fg)" />
            {skill}
          </span>
        )}
      </div>

      {seek.notes && (
        <div style={{ fontSize: 12, color: "#404040", fontStyle: "italic", borderLeft: "3px solid var(--border)", paddingLeft: 10 }}>
          &quot;{seek.notes}&quot;
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
        <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>
          {seek.applicantsCount} {seek.applicantsCount === 1 ? "postulado" : "postulados"}
        </span>
        {seek.myApplicationStatus === "pending" ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              fontSize: 11.5,
              fontWeight: 800,
              color: "var(--primary)",
              background: "#ecfdf5",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: 9999,
            }}
          >
            <Icon name="clock" size={13} color="var(--primary)" />
            Ya te postulaste
          </span>
        ) : seek.myApplicationStatus === "rejected" ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted-fg)" }}>
            No fuiste elegido
          </span>
        ) : (
          <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 11.5 }} onClick={onApply}>
            Postularme
            <Icon name="arrow-right" size={13} color="#fff" />
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyFeed({ onPublish }: { onPublish: () => void }) {
  return (
    <div className="card" style={{ padding: 36, textAlign: "center", color: "var(--muted-fg)" }}>
      <Icon name="radar" size={28} color="var(--muted-fg)" />
      <div style={{ fontSize: 14, fontWeight: 700, color: "#0a0a0a", marginTop: 12 }}>
        Nadie busca rival en tu zona todavía
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>Publica tu búsqueda y deja que te encuentren.</div>
      <button className="btn btn-primary" style={{ marginTop: 16, padding: "9px 16px" }} onClick={onPublish}>
        <Icon name="plus" size={13} color="#fff" />
        Publicar búsqueda
      </button>
    </div>
  );
}

// ── Mis avisos ───────────────────────────────────────────────────────────────
function MineList({ mine, focusSeekId, onRefresh }: { mine: MineItem[]; focusSeekId: string | null; onRefresh: () => void }) {
  if (mine.length === 0) {
    return (
      <div className="card" style={{ padding: 36, textAlign: "center", color: "var(--muted-fg)" }}>
        <div style={{ fontSize: 13 }}>Aún no has publicado ninguna búsqueda.</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {mine.map((item) => (
        <MineCard key={item.seek.id} item={item} highlight={item.seek.id === focusSeekId} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function MineCard({ item, highlight, onRefresh }: { item: MineItem; highlight: boolean; onRefresh: () => void }) {
  const { seek, applications } = item;
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const pendingApps = applications.filter((a) => a.status === "pending");
  const isClosed = seek.status !== "open";

  const cancelTheMatch = () => {
    if (!seek.matchId) return;
    startTransition(async () => {
      const res = await cancelMatch({ matchId: seek.matchId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar el partido", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Partido cancelado", sub: "Tu aviso vuelve a estar abierto." });
      onRefresh();
    });
  };

  const accept = (applicationId: string) => {
    startTransition(async () => {
      const res = await acceptApplicant({ seekId: seek.id, applicationId });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo aceptar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "¡Partido creado!", sub: "Te llevamos al chat para coordinar." });
      // Post-creación → al chat del partido (convención: navegar al detalle).
      if (res.data.conversationId) {
        router.push(`/dashboard/user/chat?conv=${res.data.conversationId}`);
      } else {
        onRefresh();
      }
    });
  };

  const cancel = () => {
    startTransition(async () => {
      const res = await cancelMatchSeek({ seekId: seek.id });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Aviso cancelado" });
      onRefresh();
    });
  };

  return (
    <div className="card" style={{ padding: 18, border: highlight ? "2px solid var(--primary)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {sportLabel(seek.sport)} · {seek.mode === "singles" ? "Singles" : "Dobles"}
            {seek.ranked ? " · Ranked" : ""}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
            {formatWindow(seek.windowStart, seek.windowEnd)}
            {skillLabel(seek.skillMin, seek.skillMax) ? ` · ${skillLabel(seek.skillMin, seek.skillMax)}` : ""}
          </div>
        </div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "4px 10px",
            borderRadius: 9999,
            background: isClosed ? "var(--muted)" : "rgba(16,185,129,0.12)",
            color: isClosed ? "var(--muted-fg)" : "var(--primary)",
          }}
        >
          {seek.status === "open" ? "Abierto" : seek.status === "matched" ? "Emparejado" : seek.status === "expired" ? "Expirado" : "Cancelado"}
        </span>
      </div>

      {seek.status === "open" && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>
            Postulantes {pendingApps.length > 0 ? `· ${pendingApps.length}` : ""}
          </div>
          {pendingApps.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted-fg)" }}>Sin postulantes todavía.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pendingApps.map((a) => (
                <div
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: 10,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg,#0a0a0a,#374151)",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {initials(a.applicantName)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{a.applicantName ?? "Jugador"}</div>
                    {a.message && (
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {a.message}
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ padding: "7px 14px", fontSize: 11, opacity: pending ? 0.6 : 1 }}
                    disabled={pending}
                    onClick={() => accept(a.id)}
                  >
                    {pending ? "…" : "Aceptar"}
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={cancel}
            disabled={pending}
            style={{
              marginTop: 12,
              background: "transparent",
              border: "1px solid var(--border)",
              color: "#dc2626",
              padding: "7px 14px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 800,
              cursor: pending ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancelar aviso
          </button>
        </div>
      )}

      {seek.status === "matched" && seek.matchId && (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginBottom: 10 }}>
            Partido agendado. Si algo cambia, puedes reprogramarlo o cancelarlo —
            si lo cancelas, tu aviso vuelve a abrirse.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setRescheduleOpen(true)}
              disabled={pending}
              className="btn"
              style={{ background: "#fff", border: "1px solid var(--border)", padding: "7px 14px", fontSize: 11 }}
            >
              <Icon name="calendar-clock" size={13} />
              Reprogramar
            </button>
            <button
              onClick={cancelTheMatch}
              disabled={pending}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                color: "#dc2626",
                padding: "7px 14px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 800,
                cursor: pending ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {pending ? "Cancelando…" : "Cancelar partido"}
            </button>
          </div>
        </div>
      )}

      {rescheduleOpen && seek.matchId && (
        <RescheduleModal
          matchId={seek.matchId}
          onClose={() => setRescheduleOpen(false)}
          onDone={() => {
            setRescheduleOpen(false);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ── Modal: reprogramar partido ───────────────────────────────────────────────
function RescheduleModal({ matchId, onClose, onDone }: { matchId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");

  const submit = () => {
    if (!date) {
      toast({ icon: "alert-triangle", title: "Elige una fecha" });
      return;
    }
    const playedAt = new Date(`${date}T${time}:00`).toISOString();
    startTransition(async () => {
      const res = await rescheduleMatch({ matchId, playedAt });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo reprogramar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Partido reprogramado", sub: "Avisamos al otro jugador." });
      onDone();
    });
  };

  return (
    <ModalShell title="Reprogramar partido" onClose={onClose}>
      <Field label="Nueva fecha y hora">
        <div style={{ display: "flex", gap: 8 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inputStyle, maxWidth: 120 }} />
        </div>
      </Field>
      <ModalFooter>
        <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={submit} style={{ opacity: pending ? 0.6 : 1 }}>
          {pending ? "Guardando…" : "Reprogramar"}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

// ── Mis postulaciones (las que YO envié) ─────────────────────────────────────
function MyApplicationsList({ apps }: { apps: MyApplicationItem[] }) {
  const router = useRouter();
  if (apps.length === 0) {
    return (
      <div className="card" style={{ padding: 36, textAlign: "center", color: "var(--muted-fg)" }}>
        <div style={{ fontSize: 13 }}>
          Aún no te postulaste a ningún partido. Mira el tablón &quot;Cerca de ti&quot;.
        </div>
      </div>
    );
  }

  const META: Record<MyApplicationItem["status"], { label: string; color: string; bg: string }> = {
    pending: { label: "Pendiente", color: "#b45309", bg: "#fffbeb" },
    accepted: { label: "Aceptado", color: "var(--primary)", bg: "#ecfdf5" },
    rejected: { label: "No te eligieron", color: "var(--muted-fg)", bg: "var(--muted)" },
    withdrawn: { label: "Retiraste", color: "var(--muted-fg)", bg: "var(--muted)" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {apps.map((a) => {
        const meta = META[a.status];
        return (
          <div key={a.applicationId} className="card" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800 }}>
                {sportLabel(a.sport)} · {a.mode === "singles" ? "Singles" : "Dobles"}
                {a.ranked ? " · Ranked" : ""}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 2 }}>
                {a.authorName ?? "Jugador"} · {formatWindow(a.windowStart, a.windowEnd)}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "4px 10px",
                  borderRadius: 9999,
                  background: meta.bg,
                  color: meta.color,
                }}
              >
                {meta.label}
              </span>
              {a.status === "accepted" && a.conversationId && (
                <button
                  className="btn btn-primary"
                  style={{ padding: "7px 14px", fontSize: 11 }}
                  onClick={() => router.push(`/dashboard/user/chat?conv=${a.conversationId}`)}
                >
                  <Icon name="message-circle" size={13} color="#fff" />
                  Ir al chat
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Modal: publicar ──────────────────────────────────────────────────────────
function PublishModal({
  myPlanTier,
  meUserId,
  onClose,
  onDone,
}: {
  myPlanTier: "free" | "premium";
  meUserId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { sports, single } = useEnabledSports();
  const [pending, startTransition] = useTransition();
  const [sport, setSport] = useState<Sport>(sports[0]);
  const [mode, setMode] = useState<"singles" | "doubles">("singles");
  const [partner, setPartner] = useState<Player | null>(null);
  const [skillMin, setSkillMin] = useState<string>("");
  const [skillMax, setSkillMax] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("19:00");
  const [ranked, setRanked] = useState(true);
  const [notes, setNotes] = useState("");

  const submit = () => {
    if (!date) {
      toast({ icon: "alert-triangle", title: "Elige una fecha" });
      return;
    }
    if (mode === "doubles" && !partner) {
      toast({ icon: "alert-triangle", title: "Elige tu partner para dobles" });
      return;
    }
    const windowStart = new Date(`${date}T${time}:00`).toISOString();
    startTransition(async () => {
      const res = await createMatchSeek({
        sport,
        mode,
        partnerId: mode === "doubles" ? partner?.id : null,
        skillMin: skillMin ? Number(skillMin) : null,
        skillMax: skillMax ? Number(skillMax) : null,
        ranked,
        windowStart,
        notes: notes || null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo publicar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Aviso publicado", sub: "Te avisamos cuando alguien se postule." });
      onDone();
    });
  };

  return (
    <ModalShell title="Publicar · Busco partido" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!single && (
          <Field label="Deporte">
            <div style={{ display: "flex", gap: 8 }}>
              {sports.map((s) => (
                <Chip key={s} on={sport === s} onClick={() => setSport(s)}>
                  {SPORT_META[s].label}
                </Chip>
              ))}
            </div>
          </Field>
        )}

        <Field label="Modalidad">
          <div style={{ display: "flex", gap: 8 }}>
            <Chip on={mode === "singles"} onClick={() => { setMode("singles"); setPartner(null); }}>
              Singles · 1v1
            </Chip>
            <Chip on={mode === "doubles"} onClick={() => setMode("doubles")}>
              Dobles · 2v2
            </Chip>
          </div>
        </Field>

        {mode === "doubles" && (
          <Field label="Tu partner">
            <PlayerPicker
              label="Con quién juegas"
              max={1}
              selected={partner ? [partner] : []}
              onChange={(arr) => setPartner(arr[0] ?? null)}
              excludeIds={[meUserId]}
            />
          </Field>
        )}

        <Field label="Nivel del rival (opcional)">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <NumberInput value={skillMin} onChange={setSkillMin} placeholder="mín" />
            <span style={{ color: "var(--muted-fg)" }}>–</span>
            <NumberInput value={skillMax} onChange={setSkillMax} placeholder="máx" />
          </div>
        </Field>

        <Field label="¿Cuándo?">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={inputStyle}
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ ...inputStyle, maxWidth: 120 }}
            />
          </div>
        </Field>

        <button
          onClick={() => setRanked(!ranked)}
          style={{
            padding: 12,
            borderRadius: 10,
            border: ranked ? "2px solid var(--primary)" : "1px solid var(--border)",
            background: ranked ? "#ecfdf5" : "#fff",
            cursor: "pointer",
            fontFamily: "inherit",
            textAlign: "left",
            display: "flex",
            gap: 11,
            alignItems: "center",
          }}
        >
          <Toggle on={ranked} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>Cuenta para el ranking</div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
              {myPlanTier === "premium"
                ? "Tu nivel sube o baja según el resultado."
                : "Será ranked solo si tienes MATCHPOINT+ al momento de jugar."}
            </div>
          </div>
        </button>

        <Field label="Mensaje (opcional)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 280))}
            placeholder="Ej. busco alguien de mi nivel para revancha…"
            style={{ ...inputStyle, minHeight: 64, resize: "none" }}
          />
        </Field>
      </div>

      <ModalFooter>
        <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={submit} style={{ opacity: pending ? 0.6 : 1 }}>
          {pending ? "Publicando…" : "Publicar aviso"}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

// ── Modal: postularse ──────────────────────────────────────────────────────
function ApplyModal({
  seek,
  meUserId,
  onClose,
  onDone,
}: {
  seek: MatchSeek;
  meUserId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [partner, setPartner] = useState<Player | null>(null);
  const [message, setMessage] = useState("");

  const submit = () => {
    if (seek.mode === "doubles" && !partner) {
      toast({ icon: "alert-triangle", title: "En dobles debes traer tu partner" });
      return;
    }
    startTransition(async () => {
      const res = await applyToMatchSeek({
        seekId: seek.id,
        partnerId: seek.mode === "doubles" ? partner?.id : null,
        message: message || null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo postular", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "¡Postulación enviada!", sub: `${seek.authorName ?? "El autor"} la recibirá.` });
      onDone();
    });
  };

  return (
    <ModalShell title={`Postularte · ${seek.authorName ?? "Jugador"}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 12, background: "#fafafa" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
            {sportLabel(seek.sport)} · {seek.mode === "singles" ? "Singles" : "Dobles"} · {formatWindow(seek.windowStart, seek.windowEnd)}
          </div>
          {seek.notes && <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4 }}>&quot;{seek.notes}&quot;</div>}
        </div>

        {seek.mode === "doubles" && (
          <Field label="Tu partner">
            <PlayerPicker
              label="Con quién juegas"
              max={1}
              selected={partner ? [partner] : []}
              onChange={(arr) => setPartner(arr[0] ?? null)}
              excludeIds={[meUserId]}
            />
          </Field>
        )}

        <Field label="Mensaje (opcional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 280))}
            placeholder="Preséntate o propón hora/cancha…"
            style={{ ...inputStyle, minHeight: 64, resize: "none" }}
          />
        </Field>
      </div>

      <ModalFooter>
        <button className="btn" style={{ background: "#fff", border: "1px solid var(--border)" }} onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" disabled={pending} onClick={submit} style={{ opacity: pending ? 0.6 : 1 }}>
          {pending ? "Enviando…" : "Enviar postulación"}
        </button>
      </ModalFooter>
    </ModalShell>
  );
}

// ── Primitivas de UI ─────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12.5,
  fontFamily: "inherit",
  background: "#fff",
};

function NumberInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="number"
      min={1}
      max={7}
      step={0.1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ ...inputStyle, maxWidth: 100 }}
    />
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{ width: 32, height: 18, borderRadius: 9999, background: on ? "var(--primary)" : "#d4d4d8", position: "relative", flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 2,
          left: on ? 16 : 2,
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
          transition: "left 0.18s var(--ease-out, ease)",
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="label-mp">{label}</span>
      {children}
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Cierra con ESC. Animación de entrada Emil-compliant (scale 0.96 → 1).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="mp-modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,10,10,0.7)",
        backdropFilter: "blur(6px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card mp-modal-pop"
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "92vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          background: "#fff",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: 15, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
            {title}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--muted)", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
      {children}
    </div>
  );
}
