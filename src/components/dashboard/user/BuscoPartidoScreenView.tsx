"use client";

// Busco partido — lobby funcional de avisos abiertos. Mantiene el lenguaje visual
// del mock (scoreboard, slots, cards), pero usa match_seeks reales.
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { PlayerPicker, type Player } from "../widgets/PlayerPicker";
import { acceptApplicant, applyToMatchSeek, cancelMatchSeek, createMatchSeek, respondMatchSeekPartner, updateMatchSeek, withdrawApplication } from "@/server/actions/match-seeks";
import { cancelMatch, rescheduleMatch } from "@/server/actions/matches";
import { useEnabledSports } from "@/components/SportsProvider";
import { SPORT_META, sportLabel } from "@/lib/sports";
import { fmtShortDateEc, fmtTimeEc } from "@/lib/api/format";
import {
  SKILL_LEVEL_BANDS,
  SKILL_LEVEL_MAX,
  SKILL_LEVEL_MIN,
  SKILL_LEVEL_PRESETS,
  SKILL_LEVEL_SPAN,
  SKILL_LEVEL_STEP,
  SKILL_LEVEL_TICKS,
  formatSkillLevel,
  normalizeSkillLevel,
  rangeBandSummary,
  skillLevelToPercent,
} from "@/lib/mpr/skill-level-bands";
import type { MatchSeek, MatchSeekApplication } from "@/lib/schemas/match-seeks";

type MatchPlayer = { a: string; b: string; title?: string };
type Match = {
  id: string;
  seek: MatchSeek;
  host: string;
  hostAv: string;
  hostBg: string;
  hostLevel: number | null;
  sport: string;
  mode: string;
  club: string;
  dist: string;
  date: string;
  time: string;
  startsIn: string;
  urgency: "hot" | "today" | "tomorrow" | "later";
  levelRange: [number, number];
  slotsTotal: number;
  players: MatchPlayer[];
  ranked: boolean;
  fit: number | null;
  viewing: number;
  featured?: boolean;
};

type Scope = "para-ti" | "nivel" | "club" | "cerca" | "vacante1" | "ranked";
type Tab = "feed" | "mine" | "apps";
type View = "cards" | "map";
type SortBy = "relevancia" | "hora" | "ciudad";
type LevelMode = "all" | "strict" | "flex";
type Tweaks = Partial<{ view: View; sortBy: SortBy; levelMode: LevelMode }>;
type MineItem = { seek: MatchSeek; applications: MatchSeekApplication[] };
type MyApplicationItem = {
  applicationId: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  createdAt: string;
  seekId: string;
  sport: MatchSeek["sport"];
  mode: MatchSeek["mode"];
  windowStart: string;
  windowEnd: string | null;
  ranked: boolean;
  authorName: string | null;
  conversationId: string | null;
};

type Props = {
  tweaks?: Tweaks;
  meUserId?: string;
  myCity?: string | null;
  myPlanTier?: "free" | "premium";
  feed?: MatchSeek[];
  mine?: MineItem[];
  myApplications?: MyApplicationItem[];
  partnerInvites?: MatchSeek[];
  focusSeekId?: string | null;
};

const MAIN_TABS = [
  { k: "feed" as const, l: "Todos los avisos", lShort: "Todos", i: "globe" },
  { k: "mine" as const, l: "Mis avisos", lShort: "Avisos", i: "clipboard-list" },
  { k: "apps" as const, l: "Mis postulaciones", lShort: "Postulé", i: "send" },
];

const SCOPE_CHIPS: { k: Scope; l: string; i: string }[] = [
  { k: "para-ti", l: "Para ti", i: "sparkles" },
  { k: "nivel", l: "Con nivel", i: "zap" },
  { k: "club", l: "Con club", i: "building-2" },
  { k: "cerca", l: "Tu ciudad", i: "map-pin" },
  { k: "vacante1", l: "Falta 1", i: "user-plus" },
  { k: "ranked", l: "MPR", i: "trophy" },
];

const FEED_VIEW_OPTIONS = [
  { k: "cards", i: "layout-grid" },
  { k: "map", i: "map" },
] as const;

function normalizeFeedView(v?: string): View {
  return v === "map" ? "map" : "cards";
}

function Lucide({ name, style }: { name: string; style?: React.CSSProperties }) {
  const width = typeof style?.width === "number" ? style.width : undefined;
  const height = typeof style?.height === "number" ? style.height : undefined;
  const color = typeof style?.color === "string" ? style.color : undefined;
  return <Icon name={name} size={width ?? height ?? 16} color={color} style={style} />;
}

export function BuscoPartidoComingSoon({ reason = "flag" }: { reason?: "flag" | "auth" }) {
  return <BuscarMatchScreen unavailableReason={reason} />;
}

export function BuscoPartidoScreenView(props: Props) {
  return <BuscarMatchScreen {...props} />;
}

function BuscarMatchScreen({
  tweaks = {},
  meUserId,
  myCity,
  myPlanTier = "free",
  feed = [],
  mine = [],
  myApplications = [],
  partnerInvites = [],
  focusSeekId,
  unavailableReason,
}: Props & { unavailableReason?: "flag" | "auth" }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, ask } = usePromptModal();
  const { sports: enabledSports, single: singleSport } = useEnabledSports();
  const sportFilterOptions = useMemo(
    () => [{ k: "all", l: "Todos" }, ...enabledSports.map((s) => ({ k: s, l: SPORT_META[s].label }))],
    [enabledSports],
  );
  const [scope, setScope] = useState<Scope>("para-ti");
  const [tab, setTab] = useState<Tab>("feed");
  const [view, setView] = useState<View>(normalizeFeedView(tweaks.view));
  const [sortBy, setSortBy] = useState<SortBy>(tweaks.sortBy || "relevancia");
  const [levelMode, setLevelMode] = useState<LevelMode>(tweaks.levelMode || "flex");
  const [sport, setSport] = useState<"all" | MatchSeek["sport"]>("all");
  const [mode, setMode] = useState("all");
  const [day, setDay] = useState("cualquier");
  const [publishOpen, setPublishOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<MatchSeek | null>(null);
  const [partnerInviteTarget, setPartnerInviteTarget] = useState<MatchSeek | null>(null);
  const [editTarget, setEditTarget] = useState<{ seek: MatchSeek; pendingApplications: number } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const openEditSeek = (seek: MatchSeek) => {
    const item = mine.find((m) => m.seek.id === seek.id);
    const pendingApplications =
      item?.applications.filter((a) => a.status === "pending" || a.status === "accepted").length ?? 0;
    setEditTarget({ seek, pendingApplications });
  };
  const [managedSeekId, setManagedSeekId] = useState<string | null>(null);
  const [actionPending, startAction] = useTransition();

  useEffect(() => {
    if (!focusSeekId) return;
    const partnerInvite = partnerInvites.find((s) => s.id === focusSeekId);
    if (partnerInvite) {
      setPartnerInviteTarget(partnerInvite);
      return;
    }
    if (mine.some((m) => m.seek.id === focusSeekId)) {
      setTab("mine");
      setManagedSeekId(focusSeekId);
    }
  }, [focusSeekId, partnerInvites, mine]);

  useRealtimeRefresh(
    [
      { table: "match_seeks" },
      { table: "match_seek_applications" },
      { table: "matches" },
    ],
    { enabled: !unavailableReason, debounceMs: 1200 },
  );

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setView(normalizeFeedView(tweaks.view)); }, [tweaks.view]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSortBy(tweaks.sortBy || "relevancia"); }, [tweaks.sortBy]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setLevelMode(tweaks.levelMode || "flex"); }, [tweaks.levelMode]);

  const me = { level: null as number | null, name: "Tú", club: myCity ?? "Tu ciudad" };
  const isUnavailable = !!unavailableReason;
  const allMatches = useMemo(() => feed.map((seek) => toMatch(seek, myCity)), [feed, myCity]);
  const matchesLevel = (m: Match) => {
    if (levelMode === "all") return true;
    if (m.seek.skillMin == null && m.seek.skillMax == null) return levelMode === "flex";
    return true;
  };
  const matchesScope = (m: Match) => {
    if (scope === "para-ti") return true;
    if (scope === "nivel") return m.seek.skillMin != null || m.seek.skillMax != null;
    if (scope === "club") return !!m.seek.clubId;
    if (scope === "cerca") return myCity ? m.seek.city === myCity : true;
    if (scope === "vacante1") return m.slotsTotal - m.players.length === 1;
    if (scope === "ranked") return m.ranked;
    return true;
  };
  const matchesDay = (m: Match) => day === "cualquier" ? true : (day === "hoy" ? m.date === "Hoy" : day === "mañana" ? m.date === "Mañana" : true);
  const matchesMode = (m: Match) => mode === "all" ? true : m.seek.mode === mode;
  const matchesSport = (m: Match) => sport === "all" ? true : m.seek.sport === sport;

  const filtered = allMatches.filter((m) => matchesLevel(m) && matchesScope(m) && matchesDay(m) && matchesMode(m) && matchesSport(m));
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "hora") {
      return new Date(a.seek.windowStart).getTime() - new Date(b.seek.windowStart).getTime();
    }
    if (sortBy === "ciudad") return a.dist.localeCompare(b.dist);
    const aNear = myCity && a.seek.city === myCity ? 0 : 1;
    const bNear = myCity && b.seek.city === myCity ? 0 : 1;
    if (aNear !== bNear) return aNear - bNear;
    return new Date(a.seek.windowStart).getTime() - new Date(b.seek.windowStart).getTime();
  });

  const featured = sorted[0] ?? allMatches[0] ?? null;
  const rest = featured ? sorted.filter((m) => m.id !== featured.id) : [];
  const mineActive = useMemo(
    () => mine.filter(({ seek }) => seek.status === "open" || seek.status === "matched"),
    [mine],
  );

  const counts: Record<Scope, number> = {
    "para-ti": allMatches.length,
    nivel: allMatches.filter((m) => m.seek.skillMin != null || m.seek.skillMax != null).length,
    club: allMatches.filter((m) => !!m.seek.clubId).length,
    cerca: allMatches.filter((m) => !myCity || m.seek.city === myCity).length,
    vacante1: allMatches.filter((m) => m.slotsTotal - m.players.length === 1).length,
    ranked: allMatches.filter((m) => m.ranked).length,
  };
  const hoyCount = allMatches.filter((m) => m.date === "Hoy").length;

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (scope !== "para-ti") n += 1;
    if (sport !== "all") n += 1;
    if (mode !== "all") n += 1;
    if (day !== "cualquier") n += 1;
    if (sortBy !== "relevancia") n += 1;
    return n;
  }, [scope, sport, mode, day, sortBy]);

  const resetFilters = () => {
    setScope("para-ti");
    setSport("all");
    setMode("all");
    setDay("cualquier");
    setSortBy("relevancia");
  };

  const scopeLabel = (chip: (typeof SCOPE_CHIPS)[number]) =>
    chip.k === "cerca" ? (myCity ? "Tu ciudad" : "Todas las ciudades") : chip.l;

  const apply = (seek: MatchSeek) => {
    if (seek.createdBy === meUserId) {
      toast({ icon: "info", title: "Este aviso es tuyo", sub: "Revísalo desde Mis avisos." });
      setTab("mine");
      return;
    }
    setApplyTarget(seek);
  };
  const cancelSeek = async (seek: MatchSeek) => {
    const ok = await confirm({
      title: "Cancelar aviso",
      body: "Tu aviso dejará de aparecer en el lobby. Puedes publicar otro cuando quieras.",
      confirmLabel: "Cancelar aviso",
      destructive: true,
    });
    if (!ok) return;
    startAction(async () => {
      const res = await cancelMatchSeek({ seekId: seek.id });
      if (res.ok) {
        toast({ icon: "check", title: "Aviso cancelado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
      }
    });
  };
  const accept = async (seek: MatchSeek, app: MatchSeekApplication) => {
    const ok = await confirm({
      title: "Aceptar postulación",
      body: `Se creará un match ${modeLabel(seek.mode).toLowerCase()} y se abrirá el chat del partido.`,
      confirmLabel: "Aceptar",
    });
    if (!ok) return;
    startAction(async () => {
      const res = await acceptApplicant({ seekId: seek.id, applicationId: app.id });
      if (res.ok) {
        toast({ icon: "check-circle-2", title: "Match creado", sub: "Ya puedes coordinar por el chat." });
        router.refresh();
        if (res.data.conversationId) router.push(`/dashboard/user/chat?conv=${res.data.conversationId}`);
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo aceptar", sub: res.error.message });
      }
    });
  };
  const withdraw = async (app: MyApplicationItem) => {
    const ok = await confirm({
      title: "Retirar postulación",
      body: "El autor ya no podrá aceptarte para este aviso.",
      confirmLabel: "Retirar",
    });
    if (!ok) return;
    startAction(async () => {
      const res = await withdrawApplication({ applicationId: app.applicationId });
      if (res.ok) {
        toast({ icon: "check", title: "Postulación retirada" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo retirar", sub: res.error.message });
      }
    });
  };
  const respondPartnerInvite = (seek: MatchSeek, accept: boolean) => {
    startAction(async () => {
      const res = await respondMatchSeekPartner({ seekId: seek.id, accept });
      if (res.ok) {
        toast({
          icon: accept ? "check-circle-2" : "info",
          title: accept ? "Dupla confirmada" : "Invitación rechazada",
          sub: accept
            ? "El aviso ya aparece en el lobby para otros jugadores."
            : "El aviso quedó cancelado.",
        });
        setPartnerInviteTarget(null);
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo responder", sub: res.error.message });
      }
    });
  };
  const cancelScheduledMatch = async (matchId: string) => {
    const ok = await confirm({
      title: "Cancelar partido",
      body: "Se avisará a los participantes y, si el aviso no expiró, volverá a abrirse.",
      confirmLabel: "Cancelar partido",
      destructive: true,
    });
    if (!ok) return;
    startAction(async () => {
      const res = await cancelMatch({ matchId, reason: "Cancelado desde Busco partido" });
      if (res.ok) {
        toast({ icon: "check", title: "Partido cancelado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
      }
    });
  };
  const rescheduleScheduledMatch = async (matchId: string) => {
    const raw = await ask({
      title: "Reprogramar partido",
      label: "Nueva fecha",
      placeholder: "2026-06-01 19:30",
      helper: "Usa formato AAAA-MM-DD HH:mm.",
      required: true,
      confirmLabel: "Reprogramar",
      validate: (v) => (parseLocalDateTime(v) ? null : "Usa una fecha válida en formato AAAA-MM-DD HH:mm."),
    });
    if (raw == null) return;
    const playedAt = parseLocalDateTime(raw);
    if (!playedAt) return;
    startAction(async () => {
      const res = await rescheduleMatch({ matchId, playedAt });
      if (res.ok) {
        toast({ icon: "check", title: "Partido reprogramado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo reprogramar", sub: res.error.message });
      }
    });
  };

  const renderFeedMatches = () => {
    if (sorted.length === 0) {
      return (
        <div className="card" style={{ padding: 22, textAlign: "center" }}>
          <div className="label-mp" style={{ marginBottom: 8 }}>Sin resultados</div>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)" }}>Ningún aviso coincide con los filtros actuales. Prueba otro deporte, modalidad o chip de arriba.</p>
        </div>
      );
    }
    return (
      <>
        {featured && view !== "map" && (
          <FeaturedMatch
            m={featured}
            isMine={featured.seek.createdBy === meUserId}
            onApply={apply}
            onManage={() => {
              setManagedSeekId(featured.seek.id);
              setTab("mine");
              if (featured.seek.status === "open") openEditSeek(featured.seek);
            }}
            disabled={actionPending}
          />
        )}
        {view === "map" ? (
          <MapView matches={sorted} onApply={apply} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 310px), 1fr))", gap: 16 }}>
            {rest.map((m) => (
              <MatchCard key={m.id} m={m} me={me} onApply={apply} disabled={actionPending} />
            ))}
          </div>
        )}
      </>
    );
  };

  const feedBody = isUnavailable ? (
    <UnavailableState reason={unavailableReason} />
  ) : allMatches.length === 0 ? (
    view === "map" ? (
      <MapView matches={[]} onApply={apply} />
    ) : (
      <EmptyLobby city={myCity} />
    )
  ) : (
    renderFeedMatches()
  );

  return (
    <div className="flex min-w-0 flex-col gap-3.5 md:gap-5" data-screen-label="Busco Partido" data-sport={sport}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div className="w-full md:w-auto" style={{ minWidth: 0 }}>
          <h1 className="font-heading" style={{ fontWeight: 900, fontSize: "clamp(28px, 8vw, 44px)", textTransform: "uppercase", letterSpacing: "-0.03em", lineHeight: 1, margin: "8px 0 0" }}>
            Busco partido<span className="dot">.</span>
          </h1>
          <p style={{ color: "var(--muted-fg)", fontSize: 13.5, margin: "8px 0 0", lineHeight: 1.45 }}>
            <b style={{ color: "#0a0a0a" }}>{allMatches.length} avisos abiertos</b>
            <span className="hidden md:inline">
              {" "}· <span style={{ color: "var(--primary)" }}>{counts.nivel} con nivel definido</span> · {hoyCount} hoy
              {myPlanTier === "premium" ? " · MATCHPOINT+" : ""}
            </span>
          </p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 md:w-auto">
          <button
            type="button"
            className="btn btn-primary shrink-0"
            onClick={() => setPublishOpen(true)}
            disabled={isUnavailable}
            style={{ padding: "8px 12px", fontSize: 11, gap: 6 }}
          >
            <Lucide name="plus" style={{ width: 13, height: 13 }} />
            <span className="md:hidden">Publicar</span>
            <span className="hidden md:inline">Publicar aviso</span>
          </button>
          {tab === "feed" && (
            <div className="ml-auto flex min-w-0 shrink items-center justify-end gap-2">
              <SegBM options={[...FEED_VIEW_OPTIONS]} value={view} onChange={(v) => setView(v as View)} />
              <button
                type="button"
                className="btn btn-outline shrink-0 md:hidden"
                onClick={() => setFiltersOpen(true)}
                style={{ padding: "8px 12px", fontSize: 11, gap: 6 }}
              >
                <Lucide name="filter" style={{ width: 13, height: 13 }} />
                Filtros
                {activeFilterCount > 0 && (
                  <span style={{ padding: "1px 6px", borderRadius: 9999, background: "#0a0a0a", color: "#fff", fontSize: 10, fontWeight: 900 }}>
                    {activeFilterCount}
                  </span>
                )}
              </button>
              <div className="hidden md:block">
                <SortMenu value={sortBy} onChange={(v) => setSortBy(v as SortBy)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 md:hidden">
        {MAIN_TABS.map((item) => {
          const count =
            item.k === "feed" ? allMatches.length : item.k === "mine" ? mineActive.length : myApplications.length;
          return (
            <MainTabButton
              key={item.k}
              item={item}
              count={count}
              active={tab === item.k}
              compact
              onClick={() => setTab(item.k)}
            />
          );
        })}
      </div>
      <div className="hidden flex-wrap gap-2 md:flex">
        {MAIN_TABS.map((item) => {
          const count =
            item.k === "feed" ? allMatches.length : item.k === "mine" ? mineActive.length : myApplications.length;
          return (
            <MainTabButton
              key={item.k}
              item={item}
              count={count}
              active={tab === item.k}
              onClick={() => setTab(item.k)}
            />
          );
        })}
      </div>

      {tab === "feed" && (
      <div
        className="hidden md:flex"
        style={{
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
          maxWidth: "100%",
        }}
      >
        {SCOPE_CHIPS.map((c) => (
          <ScopeChip
            key={c.k}
            label={scopeLabel(c)}
            icon={c.i}
            count={counts[c.k]}
            active={scope === c.k}
            onClick={() => setScope(c.k)}
          />
        ))}
        {!singleSport && (
          <FineFilter label="Deporte" value={sport} onChange={(v) => setSport(v as "all" | MatchSeek["sport"])} options={sportFilterOptions} />
        )}
        <FineFilter label="Modalidad" value={mode} onChange={setMode} options={[{ k: "all", l: "Todas" }, { k: "singles", l: "Singles" }, { k: "doubles", l: "Dobles" }]} />
        <FineFilter label="Día" value={day} onChange={setDay} options={[{ k: "cualquier", l: "Cualquier día" }, { k: "hoy", l: "Hoy" }, { k: "mañana", l: "Mañana" }]} />
      </div>
      )}

      {tab === "feed" && partnerInvites.length > 0 && (
        <div className="card" style={{ padding: 14, borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div className="label-mp" style={{ color: "var(--primary)" }}>Invitaciones de dupla</div>
              <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.45 }}>
                Tienes {partnerInvites.length} invitación{partnerInvites.length === 1 ? "" : "es"} para jugar como partner en un aviso de dobles.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: 11 }}
              onClick={() => setPartnerInviteTarget(partnerInvites[0] ?? null)}
            >
              Revisar
            </button>
          </div>
        </div>
      )}

      {tab === "feed" && feedBody}
      {tab === "mine" && (
        <MinePanel
          items={mineActive}
          focusedId={managedSeekId ?? focusSeekId}
          busy={actionPending}
          onEdit={(seek) => {
            setManagedSeekId(seek.id);
            openEditSeek(seek);
          }}
          onAccept={accept}
          onCancelSeek={cancelSeek}
          onCancelMatch={cancelScheduledMatch}
          onRescheduleMatch={rescheduleScheduledMatch}
        />
      )}
      {tab === "apps" && <ApplicationsPanel items={myApplications} busy={actionPending} onWithdraw={withdraw} />}

      {publishOpen && (
        <PublishSeekModal
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
      {partnerInviteTarget && (
        <PartnerInviteModal
          seek={partnerInviteTarget}
          busy={actionPending}
          onClose={() => setPartnerInviteTarget(null)}
          onAccept={() => respondPartnerInvite(partnerInviteTarget, true)}
          onReject={() => respondPartnerInvite(partnerInviteTarget, false)}
        />
      )}
      {editTarget && (
        <EditSeekModal
          seek={editTarget.seek}
          pendingApplications={editTarget.pendingApplications}
          meUserId={meUserId}
          onClose={() => setEditTarget(null)}
          onDone={() => {
            setEditTarget(null);
            router.refresh();
          }}
        />
      )}
      {filtersOpen && (
        <FeedFilterSheet
          scope={scope}
          setScope={setScope}
          counts={counts}
          scopeLabel={scopeLabel}
          sport={sport}
          setSport={setSport}
          sportFilterOptions={sportFilterOptions}
          showSportFilter={!singleSport}
          mode={mode}
          setMode={setMode}
          day={day}
          setDay={setDay}
          sortBy={sortBy}
          setSortBy={setSortBy}
          onClose={() => setFiltersOpen(false)}
          onReset={resetFilters}
        />
      )}
    </div>
  );
}

function FeaturedMatch({
  m,
  isMine,
  onApply,
  onManage,
  disabled,
}: {
  m: Match;
  isMine: boolean;
  onApply: (seek: MatchSeek) => void;
  onManage: () => void;
  disabled?: boolean;
}) {
  const empty = m.slotsTotal - m.players.length;
  const alreadyApplied = !!m.seek.myApplicationStatus;
  const ctaLabel = isMine
    ? "Gestionar aviso"
    : alreadyApplied
      ? applicationStatusLabel(m.seek.myApplicationStatus)
      : "Postularme";
  return (
    <div className="card mp-featured-match" style={{ padding: 0, overflow: "hidden", background: "#0a0a0a", color: "#fff", position: "relative", border: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 85% 30%, rgba(16,185,129,0.28), transparent 55%), radial-gradient(ellipse at 5% 90%, rgba(251,191,36,0.10), transparent 55%)" }} />
      <div
        className="mp-featured-match-watermark hidden md:block"
        style={{ position: "absolute", top: 0, right: 0, fontFamily: "Plus Jakarta Sans", fontWeight: 900, fontSize: 220, color: "rgba(255,255,255,0.04)", letterSpacing: "-0.06em", lineHeight: 0.8, transform: "rotate(-6deg) translate(8%, -18%)", textTransform: "uppercase", pointerEvents: "none" }}
      >
        AVISO
      </div>

      <div className="relative grid grid-cols-1 gap-3 p-3.5 md:grid-cols-[1.5fr_auto_1fr] md:gap-7 md:items-center md:p-6 md:px-7">
        <div className="min-w-0">
          <div className="chip-green" style={{ marginBottom: 8, fontSize: 9.5 }}>
            <span className="chip-dot" />Aviso destacado para ti
          </div>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: "clamp(1.15rem, 4.8vw, 1.875rem)", textTransform: "uppercase", letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            {m.sport} · {m.mode}<span style={{ color: "var(--primary)" }}>.</span>
          </div>
          <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: "clamp(0.82rem, 3.2vw, 1.125rem)", color: "#fbbf24", letterSpacing: "-0.02em", marginTop: 6 }}>
            {m.date} · {m.time}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] md:mt-3.5 md:text-xs" style={{ color: "rgba(255,255,255,0.75)" }}>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Lucide name="map-pin" style={{ width: 11, height: 11, flexShrink: 0 }} />
              <span className="truncate">{m.club} · {m.dist}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Lucide name="zap" style={{ width: 11, height: 11, color: "#fbbf24" }} />
              {levelText(m.seek)}
            </span>
            {m.ranked && (
              <span className="inline-flex items-center gap-1.5" style={{ color: "var(--primary)" }}>
                <Lucide name="trophy" style={{ width: 11, height: 11 }} />
                Cuenta para MPR
              </span>
            )}
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <Lucide name="eye" style={{ width: 11, height: 11 }} />
              {m.viewing} mirando
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-3 md:contents md:border-0 md:pt-0">
          <div className="w-full min-w-0 md:hidden">
            <div className="mp-featured-slots-scroll">
              <SlotsRow players={m.players} total={m.slotsTotal} dark compact />
            </div>
          </div>
          <div className="hidden md:block">
            <SlotsRow players={m.players} total={m.slotsTotal} large dark />
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:items-end md:gap-3">
            <div className="hidden text-right md:block">
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.5)" }}>Empieza en</div>
              <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.02em", color: "#fff", lineHeight: 1, marginTop: 4 }}>
                {m.startsIn}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 md:hidden">
              <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>
                Empieza {m.startsIn.toLowerCase()}
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: empty === 1 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
                {empty === 1 ? "Último cupo" : `${empty} cupos libres`}
              </div>
            </div>
            <button
              className={`${isMine ? "btn" : "btn btn-primary"} w-full md:w-auto`}
              style={{
                padding: "10px 16px",
                fontSize: 11.5,
                background: isMine ? "rgba(255,255,255,0.1)" : undefined,
                color: "#fff",
                border: isMine ? "1px solid rgba(255,255,255,0.2)" : undefined,
                justifyContent: "center",
              }}
              onClick={() => (isMine ? onManage() : onApply(m.seek))}
              disabled={disabled || (!isMine && alreadyApplied)}
            >
              <Lucide name={isMine ? "clipboard-list" : "arrow-right"} style={{ width: 13, height: 13 }} />
              {ctaLabel}
            </button>
            <div className="hidden md:block" style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: empty === 1 ? "#fbbf24" : "rgba(255,255,255,0.5)" }}>
              {empty === 1 ? "Último cupo" : `${empty} cupos libres`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  m,
  me,
  onApply,
  disabled,
}: {
  m: Match;
  me: { level: number | null };
  onApply: (seek: MatchSeek) => void;
  disabled?: boolean;
}) {
  const empty = m.slotsTotal - m.players.length;
  void me;
  const urgencyColor = m.urgency === "hot" ? "#dc2626" : m.urgency === "today" ? "#fbbf24" : m.urgency === "tomorrow" ? "#0a0a0a" : "var(--muted-fg)";
  const alreadyApplied = !!m.seek.myApplicationStatus;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column", transition: "all 0.2s cubic-bezier(0.16,1,0.3,1)" }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 16px rgba(0,0,0,0.06)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: urgencyColor, animation: m.urgency === "hot" ? "mp-pulse 1.5s infinite" : "none" }} />
          <span className="font-heading tabular" style={{ fontWeight: 900, fontSize: 13, letterSpacing: "-0.01em" }}>{m.startsIn}</span>
        </div>
        <FitChip pct={m.fit} />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="font-heading" style={{ fontWeight: 900, fontSize: 17, textTransform: "uppercase", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {m.sport} · {m.mode}<span className="dot">.</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Lucide name="map-pin" style={{ width: 11, height: 11 }} />
            {m.club} · {m.dist}
          </div>
        </div>

        <SlotsRow players={m.players} total={m.slotsTotal} />

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
          <LevelBadge me={me} range={m.levelRange} />
          {m.ranked && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 9999, background: "rgba(16,185,129,0.1)", color: "var(--primary)", fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <Lucide name="trophy" style={{ width: 9, height: 9 }} />MPR
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span className="tabular" style={{ fontSize: 11.5, fontWeight: 800, color: "#0a0a0a" }}>{m.seek.applicantsCount}<span style={{ color: "var(--muted-fg)", fontWeight: 600 }}> postulantes</span></span>
        </div>
      </div>

      <div style={{ padding: "10px 14px", background: "#fafafa", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Lucide name="eye" style={{ width: 10, height: 10 }} />{m.viewing} mirando
        </span>
        <button className="btn btn-primary" style={{ padding: "7px 13px", fontSize: 10.5 }} onClick={() => onApply(m.seek)} disabled={disabled || alreadyApplied}>
          {alreadyApplied ? applicationStatusLabel(m.seek.myApplicationStatus) : empty === 1 ? <>Tomar último cupo<Lucide name="zap" style={{ width: 11, height: 11, fill: "#fff" }} /></> : <>Postularme<Lucide name="arrow-right" style={{ width: 11, height: 11 }} /></>}
        </button>
      </div>
    </div>
  );
}

function SlotsRow({
  players,
  total,
  large,
  dark,
  compact,
}: {
  players: MatchPlayer[];
  total: number;
  large?: boolean;
  dark?: boolean;
  compact?: boolean;
}) {
  const size = large ? 52 : compact ? 34 : 38;
  const fs = large ? 14 : compact ? 10 : 11;
  const gap = large ? 10 : compact ? 6 : 8;
  const empty = total - players.length;
  return (
    <div className="mp-slots-row" style={{ display: "flex", gap, alignItems: "center" }}>
      {players.map((p, i) => (
        <div key={i} style={{ position: "relative", flexShrink: 0 }}>
          <div
            title={p.title}
            style={{
              width: size,
              height: size,
              borderRadius: "50%",
              background: p.b,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              border: dark ? "2.5px solid #1f1f1f" : "2px solid #fff",
              boxShadow: large ? "0 4px 10px rgba(0,0,0,0.25)" : "0 1px 4px rgba(0,0,0,0.08)",
            }}
          >
            <span className="font-heading" style={{ fontSize: fs, fontWeight: 900, letterSpacing: "-0.01em" }}>{p.a}</span>
          </div>
          <span
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: large ? 16 : compact ? 11 : 12,
              height: large ? 16 : compact ? 11 : 12,
              borderRadius: "50%",
              background: "var(--primary)",
              border: dark ? "2px solid #0a0a0a" : "2px solid #fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Lucide name="check" style={{ width: large ? 8 : compact ? 5 : 6, height: large ? 8 : compact ? 5 : 6, color: "#fff" }} />
          </span>
        </div>
      ))}
      {Array.from({ length: empty }).map((_, i) => (
        <div
          key={"e" + i}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            border: "2px dashed " + (dark ? "rgba(16,185,129,0.6)" : "var(--primary)"),
            background: dark ? "rgba(16,185,129,0.06)" : "rgba(16,185,129,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--primary)",
            position: "relative",
            flexShrink: 0,
            animation: i === 0 ? "mp-pulse 2.4s infinite" : "none",
          }}
        >
          <Lucide name="plus" style={{ width: large ? 22 : compact ? 14 : 16, height: large ? 22 : compact ? 14 : 16 }} />
          {i === 0 && !large && !compact && (
            <span style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", padding: "1px 5px", borderRadius: 4, background: "var(--primary)", color: "#fff", fontSize: 7.5, fontWeight: 900, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>TÚ</span>
          )}
          {i === 0 && compact && (
            <span
              style={{
                position: "absolute",
                bottom: 1,
                left: "50%",
                transform: "translateX(-50%)",
                fontSize: 7,
                fontWeight: 900,
                letterSpacing: "0.08em",
                color: "var(--primary)",
                lineHeight: 1,
              }}
            >
              TÚ
            </span>
          )}
        </div>
      ))}
      <div
        style={{
          marginLeft: compact ? 2 : large ? 6 : 4,
          paddingLeft: compact ? 8 : large ? 12 : 8,
          borderLeft: "1px dashed " + (dark ? "rgba(255,255,255,0.18)" : "var(--border)"),
          flexShrink: 0,
        }}
      >
        <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: large ? 22 : compact ? 14 : 15, letterSpacing: "-0.02em", color: dark ? "#fff" : "#0a0a0a", lineHeight: 1 }}>
          {players.length}<span style={{ color: dark ? "rgba(255,255,255,0.3)" : "#a3a3a3" }}>/{total}</span>
        </div>
        <div style={{ fontSize: large ? 9.5 : compact ? 8 : 8.5, color: dark ? "rgba(255,255,255,0.5)" : "var(--muted-fg)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em", marginTop: 2, whiteSpace: "nowrap" }}>
          {empty === 1 ? "1 cupo" : `${empty} cupos`}
        </div>
      </div>
    </div>
  );
}

function LevelBadge({ me, range }: { me: { level: number | null }; range: [number, number] }) {
  const hasRange = Number.isFinite(range[0]) && Number.isFinite(range[1]);
  const fits = me.level != null && me.level >= range[0] && me.level <= range[1];
  const icon = fits ? "check" : hasRange ? "zap" : "minus";
  const label = fits ? "Encajas" : hasRange ? "Nivel sugerido" : "Nivel flexible";
  const bg = fits || hasRange ? "rgba(16,185,129,0.1)" : "var(--muted)";
  const color = fits || hasRange ? "var(--primary)" : "var(--muted-fg)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 9999, background: bg, color, fontSize: 9.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em" }}>
      <Lucide name={icon} style={{ width: 9, height: 9 }} />
      {hasRange ? `${levelNumber(range[0])}-${levelNumber(range[1])}` : "Abierto"} · {label}
    </span>
  );
}

function FitChip({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span className="tabular" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 10, fontWeight: 900, letterSpacing: "0.04em" }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--primary)" }} />
        abierto
      </span>
    );
  }
  const color = pct >= 90 ? "var(--primary)" : pct >= 70 ? "#0a0a0a" : "#a3a3a3";
  return (
    <span className="tabular" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 9999, background: pct >= 90 ? "rgba(16,185,129,0.12)" : "var(--muted)", color, fontSize: 10, fontWeight: 900, letterSpacing: "0.04em" }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color }} />
      {pct}% match
    </span>
  );
}

function MainTabButton({
  item,
  count,
  active,
  compact,
  onClick,
}: {
  item: (typeof MAIN_TABS)[number];
  count: number;
  active: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const label = compact ? item.lShort : item.l;
  const iconSize = compact ? 11 : 13;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: compact ? "center" : undefined,
        gap: compact ? 4 : 8,
        width: compact ? "100%" : undefined,
        minWidth: 0,
        padding: compact ? "8px 6px" : "9px 15px",
        borderRadius: 9999,
        background: active ? "#0a0a0a" : "#fff",
        color: active ? "#fff" : "#0a0a0a",
        border: "1px solid " + (active ? "#0a0a0a" : "var(--border)"),
        fontFamily: "inherit",
        fontSize: compact ? 10 : 12,
        fontWeight: 900,
        cursor: "pointer",
        flexShrink: compact ? undefined : 0,
        whiteSpace: "nowrap",
      }}
    >
      <Lucide name={item.i} style={{ width: iconSize, height: iconSize, color: active ? "var(--primary)" : "#0a0a0a", flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{label}</span>
      <span
        className="tabular"
        style={{
          padding: compact ? "1px 5px" : "1px 7px",
          borderRadius: 9999,
          background: active ? "rgba(255,255,255,0.18)" : "var(--muted)",
          color: active ? "#fff" : "var(--muted-fg)",
          fontSize: 10,
          fontWeight: 900,
          flexShrink: 0,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function ScopeChip({
  label,
  icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "8px 14px",
        borderRadius: 9999,
        background: active ? "#0a0a0a" : "#fff",
        color: active ? "#fff" : "#0a0a0a",
        border: "1px solid " + (active ? "#0a0a0a" : "var(--border)"),
        fontFamily: "inherit",
        fontSize: 11.5,
        fontWeight: 800,
        cursor: "pointer",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <Lucide name={icon} style={{ width: 12, height: 12, color: active ? "var(--primary)" : "#0a0a0a" }} />
      {label}
      <span
        style={{
          padding: "1px 6px",
          borderRadius: 9999,
          background: active ? "rgba(255,255,255,0.18)" : "var(--muted)",
          color: active ? "#fff" : "var(--muted-fg)",
          fontSize: 10,
          fontWeight: 900,
          marginLeft: 2,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function FeedFilterSheet({
  scope,
  setScope,
  counts,
  scopeLabel,
  sport,
  setSport,
  sportFilterOptions,
  showSportFilter,
  mode,
  setMode,
  day,
  setDay,
  sortBy,
  setSortBy,
  onClose,
  onReset,
}: {
  scope: Scope;
  setScope: (v: Scope) => void;
  counts: Record<Scope, number>;
  scopeLabel: (chip: (typeof SCOPE_CHIPS)[number]) => string;
  sport: "all" | MatchSeek["sport"];
  setSport: (v: "all" | MatchSeek["sport"]) => void;
  sportFilterOptions: { k: string; l: string }[];
  showSportFilter: boolean;
  mode: string;
  setMode: (v: string) => void;
  day: string;
  setDay: (v: string) => void;
  sortBy: SortBy;
  setSortBy: (v: SortBy) => void;
  onClose: () => void;
  onReset: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Filtros del feed"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxHeight: "82vh",
          overflow: "auto",
          borderRadius: "18px 18px 0 0",
          padding: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h3 className="font-heading" style={{ margin: 0, fontSize: 17, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
            Filtros<span className="dot">.</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar filtros"
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              border: 0,
              background: "var(--muted)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div className="label-mp" style={{ marginBottom: 10 }}>
              Vista rápida
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SCOPE_CHIPS.map((c) => (
                <ScopeChip
                  key={c.k}
                  label={scopeLabel(c)}
                  icon={c.i}
                  count={counts[c.k]}
                  active={scope === c.k}
                  onClick={() => setScope(c.k)}
                />
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="label-mp">Detalle</div>
            {showSportFilter && (
              <FineFilter
                label="Deporte"
                value={sport}
                onChange={(v) => setSport(v as "all" | MatchSeek["sport"])}
                options={sportFilterOptions}
                fullWidth
              />
            )}
            <FineFilter
              label="Modalidad"
              value={mode}
              onChange={setMode}
              options={[
                { k: "all", l: "Todas" },
                { k: "singles", l: "Singles" },
                { k: "doubles", l: "Dobles" },
              ]}
              fullWidth
            />
            <FineFilter
              label="Día"
              value={day}
              onChange={setDay}
              options={[
                { k: "cualquier", l: "Cualquier día" },
                { k: "hoy", l: "Hoy" },
                { k: "mañana", l: "Mañana" },
              ]}
              fullWidth
            />
            <SortMenu value={sortBy} onChange={(v) => setSortBy(v as SortBy)} fullWidth />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onReset}>
              Limpiar
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
              Ver resultados
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegBM({ options, value, onChange }: { options: { k: string; i: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div role="group" aria-label="Vista del feed" style={{ display: "inline-flex", background: "#f5f5f5", borderRadius: 9999, padding: 3 }}>
      {options.map((o) => (
        <button
          key={o.k}
          type="button"
          aria-pressed={value === o.k}
          aria-label={o.k === "cards" ? "Tarjetas" : "Mapa"}
          onClick={() => onChange(o.k)}
          style={{
            border: 0,
            background: value === o.k ? "#0a0a0a" : "transparent",
            color: value === o.k ? "#fff" : "#737373",
            padding: "7px 12px",
            borderRadius: 9999,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          <Lucide name={o.i} style={{ width: 13, height: 13 }} />
        </button>
      ))}
    </div>
  );
}

function SortMenu({
  value,
  onChange,
  fullWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  fullWidth?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", width: fullWidth ? "100%" : undefined, justifyContent: fullWidth ? "space-between" : undefined }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Lucide name="arrow-up-down" style={{ width: 12, height: 12, color: "var(--muted-fg)" }} />
        <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-fg)" }}>Ordenar</span>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, background: "transparent", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", outline: "none", marginLeft: fullWidth ? "auto" : undefined }}>
        <option value="relevancia">Cercanos primero</option>
        <option value="hora">Más pronto</option>
        <option value="ciudad">Ciudad</option>
      </select>
    </div>
  );
}

function FineFilter({
  label,
  value,
  onChange,
  options,
  fullWidth,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { k: string; l: string }[];
  fullWidth?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 9999, border: "1px solid var(--border)", background: "#fff", width: fullWidth ? "100%" : undefined, justifyContent: fullWidth ? "space-between" : undefined }}>
      <span style={{ fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-fg)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ border: 0, background: "transparent", fontFamily: "inherit", fontSize: 11.5, fontWeight: 800, cursor: "pointer", outline: "none", marginLeft: fullWidth ? "auto" : undefined }}>
        {options.map((o) => <option key={o.k} value={o.k}>{o.l}</option>)}
      </select>
    </div>
  );
}

function MapView({ matches, onApply }: { matches: Match[]; onApply: (seek: MatchSeek) => void }) {
  const isEmpty = matches.length === 0;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", height: 520, position: "relative", background: "radial-gradient(ellipse at 50% 50%, #e7f0ec 0%, #d6e3dd 35%, #c7d6cf 70%, #b6c8c0 100%)" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
            <path d="M 0 40 L 80 40 M 40 0 L 40 80" stroke="#fff" strokeWidth="1.5" fill="none" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <path d="M 0 280 Q 200 240 400 290 T 800 270 T 1200 310" stroke="#fff" strokeWidth="6" fill="none" opacity="0.7" />
        <path d="M 380 0 Q 360 200 410 360 T 440 720" stroke="#fff" strokeWidth="6" fill="none" opacity="0.7" />
      </svg>

      {matches.slice(0, 6).map((m, i) => {
        const positions = [
          { left: "32%", top: "38%" }, { left: "58%", top: "28%" }, { left: "72%", top: "55%" },
          { left: "25%", top: "64%" }, { left: "48%", top: "72%" }, { left: "64%", top: "42%" },
        ];
        const empty = m.slotsTotal - m.players.length;
        return (
          <div key={m.id} style={{ position: "absolute", ...positions[i], transform: "translate(-50%, -100%)" }}>
            <button type="button" onClick={() => onApply(m.seek)} style={{ background: "#fff", border: "2px solid #0a0a0a", borderRadius: 12, padding: "8px 12px", boxShadow: "0 8px 18px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap", fontFamily: "inherit", cursor: "pointer" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: m.players[0].b, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 900, fontFamily: "Plus Jakarta Sans" }}>{m.players[0].a}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 900 }}>{m.date} · {m.time}</div>
                <div style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.club.slice(0, 16)} · {empty} cupos</div>
              </div>
              <span style={{ padding: "2px 7px", borderRadius: 9999, background: "var(--primary)", color: "#fff", fontSize: 9, fontWeight: 900 }}>{m.fit == null ? "OK" : `${m.fit}%`}</span>
            </button>
            <div style={{ width: 12, height: 12, background: "#0a0a0a", transform: "rotate(45deg)", margin: "-7px auto 0", position: "relative", zIndex: -1 }} />
          </div>
        );
      })}

      <div style={{ position: "absolute", left: "45%", top: "50%", transform: "translate(-50%, -50%)" }}>
        <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#3b82f6", border: "3px solid #fff", boxShadow: "0 0 0 6px rgba(59,130,246,0.2), 0 2px 8px rgba(0,0,0,0.25)" }} />
      </div>

      <div style={{ position: "absolute", bottom: 16, left: 16, background: "#fff", padding: "10px 14px", borderRadius: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", display: "flex", gap: 14, alignItems: "center", fontSize: 11, fontWeight: 700 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6" }} /> Tú</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#0a0a0a" }} /> Aviso abierto</span>
      </div>
      <div style={{ position: "absolute", top: 16, right: 16, background: "#fff", padding: "8px 12px", borderRadius: 9999, boxShadow: "0 4px 10px rgba(0,0,0,0.08)", fontSize: 11, fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Lucide name="navigation" style={{ width: 12, height: 12, color: "var(--primary)" }} /> Vista referencial
      </div>
      {isEmpty && (
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", background: "#fff", padding: "14px 18px", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.1)", textAlign: "center", maxWidth: 280 }}>
          <div className="label-mp" style={{ marginBottom: 6 }}>Mapa sin avisos</div>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.4 }}>Cuando haya partidos abiertos en tu zona, verás marcadores aquí.</p>
        </div>
      )}
    </div>
  );
}

function MinePanel({
  items,
  focusedId,
  busy,
  onEdit,
  onAccept,
  onCancelSeek,
  onCancelMatch,
  onRescheduleMatch,
}: {
  items: MineItem[];
  focusedId?: string | null;
  busy?: boolean;
  onEdit: (seek: MatchSeek) => void;
  onAccept: (seek: MatchSeek, app: MatchSeekApplication) => void;
  onCancelSeek: (seek: MatchSeek) => void;
  onCancelMatch: (matchId: string) => void;
  onRescheduleMatch: (matchId: string) => void;
}) {
  if (items.length === 0) {
    return <PanelEmpty icon="clipboard-list" title="Aún no tienes avisos" body="Publica una franja para que otros jugadores se postulen. El diseño del lobby se mantiene aunque todavía no haya datos." />;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {items.map(({ seek, applications }) => {
        const pendingApps = applications.filter((a) => a.status === "pending");
        const isFocused = focusedId === seek.id;
        return (
          <div key={seek.id} className="card" style={{ padding: 0, overflow: "hidden", borderColor: isFocused ? "var(--primary)" : "var(--border)", boxShadow: isFocused ? "0 0 0 3px rgba(16,185,129,0.12)" : undefined }}>
            <div style={{ padding: 16, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div className="label-mp">{statusLabel(seek.status)}</div>
                <h3 className="font-heading" style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.02em", margin: "5px 0 0" }}>
                  {sportLabel(seek.sport)} · {modeLabel(seek.mode)}<span className="dot">.</span>
                </h3>
                <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span><Icon name="calendar" size={12} /> {formatDateLabel(seek.windowStart)} · {formatTime(seek.windowStart)}</span>
                  <span><Icon name="map-pin" size={12} /> {seek.city ?? "Ciudad por definir"}</span>
                </div>
              </div>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {seek.notes && <p style={{ margin: 0, fontSize: 13, color: "#0a0a0a" }}>{seek.notes}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <InfoChip icon="users" label={`${pendingApps.length} pendientes`} />
                <InfoChip icon="zap" label={levelText(seek)} />
                {seek.ranked && <InfoChip icon="trophy" label="MPR competitivo" accent />}
                {seek.mode === "doubles" && seek.partnerStatus === "pending" && (
                  <InfoChip icon="clock" label="Esperando partner" accent />
                )}
              </div>
              {seek.mode === "doubles" && seek.partnerStatus === "pending" && (
                <div style={softBoxStyle}>
                  <strong>Tu partner aún no confirma la dupla.</strong>
                  <span>El aviso no aparecerá en el lobby hasta que acepte la invitación.</span>
                </div>
              )}
              {applications.length === 0 ? (
                <div style={softBoxStyle}>
                  <strong>No hay postulantes todavía.</strong>
                  <span>El aviso sigue visible hasta {formatDateLabel(seek.expiresAt)}.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {applications.map((app) => (
                    <div key={app.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12, background: "#fff" }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>{app.applicantName ?? "Jugador"}</div>
                        <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>{applicationStatusLabel(app.status)} · {relativeFrom(app.createdAt)}</div>
                        {app.message && <div style={{ fontSize: 12, color: "#0a0a0a", marginTop: 4 }}>{app.message}</div>}
                      </div>
                      {seek.status === "open" && app.status === "pending" && (
                        <button className="btn btn-primary" style={{ padding: "7px 11px", fontSize: 10.5 }} disabled={busy} onClick={() => onAccept(seek, app)}>
                          Aceptar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border)", background: "#fafafa", display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {seek.status === "open" && (
                <>
                  <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => onEdit(seek)}>
                    <Icon name="pencil" size={12} />
                    Editar aviso
                  </button>
                  <button type="button" className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => void onCancelSeek(seek)}>
                    Cancelar aviso
                  </button>
                </>
              )}
              {seek.status === "matched" && seek.matchId && (
                <>
                  <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => onRescheduleMatch(seek.matchId!)}>
                    Reprogramar
                  </button>
                  <button className="btn btn-outline" style={{ fontSize: 11, color: "#dc2626" }} onClick={() => onCancelMatch(seek.matchId!)}>
                    Cancelar partido
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ApplicationsPanel({
  items,
  busy,
  onWithdraw,
}: {
  items: MyApplicationItem[];
  busy?: boolean;
  onWithdraw: (app: MyApplicationItem) => void;
}) {
  const router = useRouter();
  if (items.length === 0) {
    return <PanelEmpty icon="send" title="No te postulaste todavía" body="Cuando encuentres un aviso compatible, postúlate y lo verás aquí con su estado." />;
  }
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="mp-busco-app-head">
        <div>Aviso</div>
        <div>Cuándo</div>
        <div>Estado</div>
        <div />
      </div>
      {items.map((app) => (
        <div key={app.applicationId} className="mp-busco-app-row">
          <div className="mp-busco-app-primary">
            <div style={{ fontSize: 13, fontWeight: 900 }}>{sportLabel(app.sport)} · {modeLabel(app.mode)}</div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>Autor: {app.authorName ?? "Jugador"}</div>
          </div>
          <div className="mp-busco-app-cell" data-label="Cuándo">
            <div className="font-heading tabular" style={{ fontWeight: 900, fontSize: 14 }}>{formatDateLabel(app.windowStart)}</div>
            <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>{formatTime(app.windowStart)}</div>
          </div>
          <div className="mp-busco-app-cell" data-label="Estado">
            <ApplicationPill status={app.status} />
          </div>
          <div className="mp-busco-app-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {app.status === "accepted" && app.conversationId && (
              <button className="btn btn-primary" style={{ padding: "8px 12px", fontSize: 10.5 }} onClick={() => router.push(`/dashboard/user/chat?conv=${app.conversationId}`)}>
                Ir al chat
              </button>
            )}
            {app.status === "pending" && (
              <button className="btn btn-outline" style={{ padding: "8px 12px", fontSize: 10.5 }} disabled={busy} onClick={() => onWithdraw(app)}>
                Retirar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function PublishSeekModal({
  meUserId,
  onClose,
  onDone,
}: {
  meUserId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const { sports: enabledSports, single: singleSport } = useEnabledSports();
  const [pending, startTransition] = useTransition();
  const [sport, setSport] = useState<MatchSeek["sport"]>("pickleball");
  const [mode, setMode] = useState<MatchSeek["mode"]>("singles");
  const [date, setDate] = useState(defaultDateInput());
  const [time, setTime] = useState(defaultTimeInput());
  const [skillMin, setSkillMin] = useState(3);
  const [skillMax, setSkillMax] = useState(4);
  const [notes, setNotes] = useState("");
  const [partner, setPartner] = useState<Player[]>([]);
  const needsPartner = mode === "doubles";
  const canSubmit = !!meUserId && (!needsPartner || partner.length === 1);

  const submit = () => {
    if (!canSubmit) {
      toast({ icon: "alert-triangle", title: needsPartner ? "Elige tu partner" : "Inicia sesión", sub: needsPartner ? "En dobles necesitas publicar con una dupla completa." : undefined });
      return;
    }
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    startTransition(async () => {
      const res = await createMatchSeek({
        sport,
        mode,
        partnerId: mode === "doubles" ? partner[0]?.id : null,
        clubId: null,
        skillMin,
        skillMax,
        ranked: true,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo publicar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: mode === "doubles" ? "Invitación enviada" : "Aviso publicado", sub: mode === "doubles" ? "Tu partner debe aceptar para que el aviso aparezca en el lobby." : undefined });
      onDone();
    });
  };

  return (
    <ModalShell
      title="Publicar aviso"
      onClose={onClose}
      footer={
        <SeekModalActions>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || !canSubmit}>Publicar aviso</button>
        </SeekModalActions>
      }
    >
      <div className="mp-seek-form-grid">
        {!singleSport && (
          <Field label="Deporte">
            <select value={sport} onChange={(e) => setSport(e.target.value as MatchSeek["sport"])} style={inputStyle}>
              {enabledSports.map((s) => (
                <option key={s} value={s}>{SPORT_META[s].label}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Modalidad">
          <ModeSegmented value={mode} onChange={(next) => { setMode(next); setPartner([]); }} />
        </Field>
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Hora">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <LevelRangeSelector min={skillMin} max={skillMax} onChange={(nextMin, nextMax) => { setSkillMin(nextMin); setSkillMax(nextMax); }} />
      {needsPartner && (
        <PlayerPicker label="Tu partner" max={1} selected={partner} onChange={setPartner} excludeIds={meUserId ? [meUserId] : []} />
      )}
      <Field label="Mensaje">
        <textarea value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Busco partido competitivo, puedo moverme por la zona." style={{ ...inputStyle, minHeight: 82, resize: "vertical" }} />
      </Field>
    </ModalShell>
  );
}

function ApplyModal({ seek, meUserId, onClose, onDone }: { seek: MatchSeek; meUserId?: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [partner, setPartner] = useState<Player[]>([]);
  const [message, setMessage] = useState("");
  const needsPartner = seek.mode === "doubles";
  const canSubmit = !!meUserId && (!needsPartner || partner.length === 1);

  const submit = () => {
    if (!canSubmit) {
      toast({ icon: "alert-triangle", title: needsPartner ? "Elige tu partner" : "Inicia sesión" });
      return;
    }
    startTransition(async () => {
      const res = await applyToMatchSeek({
        seekId: seek.id,
        partnerId: needsPartner ? partner[0]?.id : null,
        message: message.trim() || null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo postular", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Postulación enviada" });
      onDone();
    });
  };

  return (
    <ModalShell
      title="Postularme"
      onClose={onClose}
      footer={
        <SeekModalActions>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending || !canSubmit}>Enviar postulación</button>
        </SeekModalActions>
      }
    >
      <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: 16, padding: 18 }}>
        <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Aviso abierto</div>
        <h3 className="font-heading" style={{ margin: "6px 0 0", fontWeight: 900, fontSize: 24, textTransform: "uppercase" }}>
          {sportLabel(seek.sport)} · {modeLabel(seek.mode)}<span style={{ color: "var(--primary)" }}>.</span>
        </h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
          <span>{formatDateLabel(seek.windowStart)} · {formatTime(seek.windowStart)}</span>
          <span>{seek.city ?? "Ciudad por definir"}</span>
          <span>{levelText(seek)}</span>
        </div>
      </div>
      {needsPartner && (
        <PlayerPicker label="Tu partner para dobles" max={1} selected={partner} onChange={setPartner} excludeIds={meUserId ? [meUserId] : []} />
      )}
      <Field label="Mensaje para el autor">
        <textarea value={message} maxLength={280} onChange={(e) => setMessage(e.target.value)} placeholder="Cuéntale tu disponibilidad o contexto." style={{ ...inputStyle, minHeight: 88, resize: "vertical" }} />
      </Field>
    </ModalShell>
  );
}

function PartnerInviteModal({
  seek,
  busy,
  onClose,
  onAccept,
  onReject,
}: {
  seek: MatchSeek;
  busy?: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <ModalShell
      title="Invitación de dupla"
      onClose={onClose}
      footer={
        <SeekModalActions>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Después
          </button>
          <button type="button" className="btn btn-outline" onClick={onReject} disabled={busy}>
            Rechazar
          </button>
          <button type="button" className="btn btn-primary" onClick={onAccept} disabled={busy}>
            Aceptar dupla
          </button>
        </SeekModalActions>
      }
    >
      <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: 16, padding: 18 }}>
        <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Te invitaron como partner</div>
        <h3 className="font-heading" style={{ margin: "6px 0 0", fontWeight: 900, fontSize: 24, textTransform: "uppercase" }}>
          {seek.authorName ?? "Un jugador"}<span style={{ color: "var(--primary)" }}>.</span>
        </h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.75)" }}>
          <span>{sportLabel(seek.sport)} · {modeLabel(seek.mode)}</span>
          <span>{formatDateLabel(seek.windowStart)} · {formatTime(seek.windowStart)}</span>
          <span>{seek.city ?? "Ciudad por definir"}</span>
        </div>
      </div>
      {seek.notes && (
        <p style={{ margin: 0, fontSize: 13, color: "#0a0a0a", lineHeight: 1.5 }}>{seek.notes}</p>
      )}
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Si aceptas, el aviso se publicará en el lobby y podrán recibir postulaciones de rivales.
      </p>
    </ModalShell>
  );
}

function EditSeekModal({
  seek,
  pendingApplications,
  meUserId,
  onClose,
  onDone,
}: {
  seek: MatchSeek;
  pendingApplications: number;
  meUserId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const initialStart = new Date(seek.windowStart);
  const [date, setDate] = useState(dateInputValue(initialStart));
  const [time, setTime] = useState(timeInputValue(initialStart));
  const [mode, setMode] = useState<MatchSeek["mode"]>(seek.mode);
  const [partner, setPartner] = useState<Player[]>(
    seek.partnerId ? [{ id: seek.partnerId, username: "partner", displayName: "Partner actual" }] : [],
  );
  const [skillMin, setSkillMin] = useState(seek.skillMin ?? 3);
  const [skillMax, setSkillMax] = useState(seek.skillMax ?? 4);
  const [notes, setNotes] = useState(seek.notes ?? "");
  const modeLocked = pendingApplications > 0;
  const needsPartner = mode === "doubles";
  const canSubmit = !needsPartner || partner.length === 1;

  const submit = () => {
    if (!canSubmit) {
      toast({ icon: "alert-triangle", title: "Elige tu partner", sub: "En dobles necesitas publicar con una dupla completa." });
      return;
    }
    const start = new Date(`${date}T${time}:00`);
    if (!Number.isFinite(start.getTime())) {
      toast({ icon: "alert-triangle", title: "Fecha u hora inválida" });
      return;
    }
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    startTransition(async () => {
      const res = await updateMatchSeek({
        seekId: seek.id,
        mode,
        partnerId: mode === "doubles" ? partner[0]?.id ?? null : null,
        skillMin,
        skillMax,
        ranked: seek.ranked,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo editar", sub: res.error.message });
        return;
      }
      toast({ icon: "check-circle-2", title: "Aviso actualizado" });
      onDone();
    });
  };

  return (
    <ModalShell
      title="Editar aviso"
      onClose={onClose}
      footer={
        <SeekModalActions>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={pending}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={pending}>Guardar cambios</button>
        </SeekModalActions>
      }
    >
      <div style={{ background: "#0a0a0a", color: "#fff", borderRadius: 16, padding: 18 }}>
        <div className="label-mp" style={{ color: "rgba(255,255,255,0.55)" }}>Gestionar aviso abierto</div>
        <h3 className="font-heading" style={{ margin: "6px 0 0", fontWeight: 900, fontSize: 24, textTransform: "uppercase" }}>
          {sportLabel(seek.sport)}<span style={{ color: "var(--primary)" }}>.</span>
        </h3>
      </div>
      <Field label="Modalidad">
        <ModeSegmented value={mode} disabled={modeLocked} onChange={(next) => { setMode(next); if (next === "singles") setPartner([]); }} />
        {modeLocked && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--muted-fg)", lineHeight: 1.4 }}>
            Tienes postulaciones activas: la modalidad queda fija hasta que las gestiones o canceles el aviso.
          </div>
        )}
      </Field>
      {needsPartner && (
        <PlayerPicker label="Tu partner" max={1} selected={partner} onChange={setPartner} excludeIds={meUserId ? [meUserId] : []} />
      )}
      <div className="mp-seek-form-grid">
        <Field label="Fecha">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Hora">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
        </Field>
      </div>
      <LevelRangeSelector min={skillMin} max={skillMax} onChange={(nextMin, nextMax) => { setSkillMin(nextMin); setSkillMax(nextMax); }} />
      <Field label="Mensaje">
        <textarea value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} placeholder="Ej. Busco partido competitivo, puedo moverme por la zona." style={{ ...inputStyle, minHeight: 82, resize: "vertical" }} />
      </Field>
    </ModalShell>
  );
}

function ModeSegmented({
  value,
  onChange,
  disabled,
}: {
  value: MatchSeek["mode"];
  onChange: (mode: MatchSeek["mode"]) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "inline-flex", gap: 2, padding: 3, background: "#f5f5f5", borderRadius: 9999, opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : undefined }}>
      {(["singles", "doubles"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          disabled={disabled}
          style={{
            padding: "7px 14px",
            borderRadius: 9999,
            background: value === mode ? "#0a0a0a" : "transparent",
            color: value === mode ? "#fff" : "var(--muted-fg)",
            border: 0,
            fontSize: 10.5,
            fontWeight: 900,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: disabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {mode === "singles" ? "Singles" : "Dobles"}
        </button>
      ))}
    </div>
  );
}

function LevelRangeSelector({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const minPct = skillLevelToPercent(min);
  const maxPct = skillLevelToPercent(max);
  const summary = rangeBandSummary(min, max);

  const updateMin = (value: number) => {
    const next = normalizeSkillLevel(Math.min(value, max));
    onChange(next, Math.max(max, next));
  };
  const updateMax = (value: number) => {
    const next = normalizeSkillLevel(Math.max(value, min));
    onChange(Math.min(min, next), next);
  };

  const applyPreset = (lo: number, hi: number) => onChange(lo, hi);

  return (
    <div className="mp-level-range-selector" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        .mp-level-range-input {
          position: absolute;
          left: 0;
          right: 0;
          top: 8px;
          width: 100%;
          height: 24px;
          margin: 0;
          appearance: none;
          background: transparent;
          pointer-events: none;
        }
        .mp-level-range-input::-webkit-slider-runnable-track {
          height: 28px;
          background: transparent;
          border: 0;
        }
        .mp-level-range-input::-webkit-slider-thumb {
          appearance: none;
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 2px solid #0a0a0a;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: grab;
        }
        .mp-level-range-input::-moz-range-track {
          height: 28px;
          background: transparent;
          border: 0;
        }
        .mp-level-range-input::-moz-range-thumb {
          pointer-events: auto;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          border: 2px solid #0a0a0a;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: grab;
        }
      `}</style>
      <div className="mp-level-range-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="label-mp">Rango de nivel MPR</div>
          <div className="mp-level-range-summary" style={{ fontSize: 11.5, color: "var(--muted-fg)", marginTop: 3 }}>
            {summary || "Elige el rango competitivo recomendado para este aviso."}
          </div>
        </div>
        <div className="mp-level-range-value-wrap" style={{ textAlign: "right" }}>
          <div className="font-heading tabular mp-level-range-value" aria-live="polite" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", whiteSpace: "nowrap" }}>
            {formatSkillLevel(min)} — {formatSkillLevel(max)}
          </div>
        </div>
      </div>
      <div className="mp-level-range-presets" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {SKILL_LEVEL_PRESETS.map((preset) => {
          const active = min === preset.min && max === preset.max;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.min, preset.max)}
              style={{
                padding: "5px 10px",
                borderRadius: 9999,
                border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
                background: active ? "#0a0a0a" : "#fff",
                color: active ? "#fff" : "var(--muted-fg)",
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "10px 10px 8px", background: "#fafafa" }}>
        <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)" }}>
          {SKILL_LEVEL_BANDS.map((band) => {
            const active = band.max >= min && band.min <= max;
            const flex = ((band.max - band.min) / SKILL_LEVEL_SPAN) * 100;
            return (
              <div
                key={band.id}
                title={band.label}
                aria-label={band.label}
                style={{
                  flex: `${flex} 1 0`,
                  background: active ? band.activeTint : band.tint,
                  borderRight: "1px solid rgba(10,10,10,0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 0,
                  transition: "background 160ms var(--ease-out)",
                }}
              >
                <span
                  style={{
                    fontSize: 7,
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    color: active ? "#047857" : "var(--muted-fg)",
                    lineHeight: 1,
                  }}
                >
                  {band.signal}
                </span>
              </div>
            );
          })}
        </div>
        <div
          className="mp-level-range-band-labels"
          style={{
            display: "flex",
            marginTop: 5,
            height: 14,
            fontSize: 8,
            fontWeight: 700,
            color: "var(--muted-fg)",
            letterSpacing: "-0.01em",
          }}
        >
          {SKILL_LEVEL_BANDS.map((band) => {
            const active = band.max >= min && band.min <= max;
            const flex = ((band.max - band.min) / SKILL_LEVEL_SPAN) * 100;
            return (
              <span
                key={`${band.id}-lbl`}
                title={band.label}
                style={{
                  flex: `${flex} 1 0`,
                  textAlign: "center",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: active ? "#0a0a0a" : "var(--muted-fg)",
                  padding: "0 1px",
                }}
              >
                {band.label}
              </span>
            );
          })}
        </div>
        <div style={{ position: "relative", height: 32, marginTop: 8 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: 12, height: 3, borderRadius: 9999, background: "#e5e7eb" }} />
          <div style={{ position: "absolute", left: `${minPct}%`, width: `${maxPct - minPct}%`, top: 12, height: 3, borderRadius: 9999, background: "var(--primary)" }} />
          {SKILL_LEVEL_TICKS.map((tick) => (
            <div
              key={tick}
              style={{
                position: "absolute",
                left: `${skillLevelToPercent(tick)}%`,
                top: 6,
                width: 1,
                height: 14,
                background: "rgba(10,10,10,0.18)",
                transform: "translateX(-50%)",
              }}
            />
          ))}
          <input
            className="mp-level-range-input"
            type="range"
            min={SKILL_LEVEL_MIN}
            max={SKILL_LEVEL_MAX}
            step={SKILL_LEVEL_STEP}
            value={min}
            onChange={(e) => updateMin(Number(e.target.value))}
            aria-label="Nivel MPR mínimo"
            style={{ zIndex: min > SKILL_LEVEL_MAX - 0.4 ? 3 : 2 }}
          />
          <input
            className="mp-level-range-input"
            type="range"
            min={SKILL_LEVEL_MIN}
            max={SKILL_LEVEL_MAX}
            step={SKILL_LEVEL_STEP}
            value={max}
            onChange={(e) => updateMax(Number(e.target.value))}
            aria-label="Nivel MPR máximo"
            style={{ zIndex: 2 }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9.5, fontWeight: 700, color: "var(--muted-fg)" }}>
          {SKILL_LEVEL_TICKS.map((tick) => (
            <span key={tick} className="tabular">{formatSkillLevel(tick)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SeekModalActions({ children }: { children: ReactNode }) {
  return <div className="mp-seek-modal-actions">{children}</div>;
}

function ModalShell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="mp-seek-modal-overlay mp-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        className="card mp-seek-modal-panel mp-modal-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="mp-seek-modal-header">
          <h3 className="font-heading mp-seek-modal-title">
            {title}<span className="dot">.</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="mp-seek-modal-close">
            <Icon name="x" size={13} />
          </button>
        </div>
        <div className="mp-seek-modal-body">{children}</div>
        {footer ? <div className="mp-seek-modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="label-mp">{label}</span>
      {children}
    </label>
  );
}

function PanelEmpty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", minHeight: 260 }}>
        <div style={{ padding: 28, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div className="chip-green" style={{ width: "fit-content", marginBottom: 12 }}><span className="chip-dot" />Estado vacío</div>
          <h3 className="font-heading" style={{ margin: 0, fontSize: 28, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.025em" }}>{title}<span className="dot">.</span></h3>
          <p style={{ color: "var(--muted-fg)", fontSize: 13, maxWidth: 420 }}>{body}</p>
        </div>
        <div style={{ background: "#0a0a0a", color: "#fff", padding: 28, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 80% 20%, rgba(16,185,129,0.28), transparent 50%)" }} />
          <div style={{ position: "relative", width: 132, height: 132, borderRadius: "50%", border: "2px dashed rgba(16,185,129,0.5)", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(16,185,129,0.06)" }}>
            <Icon name={icon} size={42} color="var(--primary)" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchCardSkeleton() {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", opacity: 0.72 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <Skeleton w={72} h={14} r={6} />
        <Skeleton w={48} h={20} r={9999} />
      </div>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <Skeleton w="70%" h={18} r={6} />
        <Skeleton w="48%" h={12} r={6} />
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} w={38} h={38} r={9999} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
          <Skeleton w={88} h={24} r={9999} />
          <Skeleton w={56} h={24} r={9999} />
          <span style={{ flex: 1 }} />
          <Skeleton w={72} h={14} r={6} />
        </div>
      </div>
      <div style={{ padding: "10px 14px", background: "#fafafa", borderTop: "1px solid var(--border)" }}>
        <Skeleton w="100%" h={34} r={9999} />
      </div>
    </div>
  );
}

function EmptyLobby({ city }: { city?: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ textAlign: "center", padding: "4px 8px 0" }}>
        <div className="label-mp" style={{ marginBottom: 6 }}>Sin avisos abiertos</div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          No hay partidos abiertos{city ? ` en ${city}` : ""} por ahora.
        </p>
      </div>
      <div
        aria-hidden
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 310px), 1fr))",
          gap: 16,
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: 2 }).map((_, i) => (
          <MatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function UnavailableState({ reason }: { reason?: "flag" | "auth" }) {
  const title = reason === "auth" ? "Inicia sesión para buscar partido" : "Busco partido estará disponible pronto";
  const body = reason === "auth"
    ? "Cuando inicies sesión, verás avisos reales de tu ciudad, tus postulaciones y tus avisos publicados."
    : "La función está protegida por flag. Mientras se activa, dejamos el diseño listo con estados vacíos honestos.";
  return <PanelEmpty icon="lock" title={title} body={body} />;
}

function ApplicationPill({ status }: { status: MyApplicationItem["status"] }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", padding: "5px 10px", borderRadius: 9999, background: status === "accepted" ? "rgba(16,185,129,0.12)" : "var(--muted)", color: status === "accepted" ? "var(--primary)" : "var(--muted-fg)", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em" }}>
      {applicationStatusLabel(status)}
    </span>
  );
}

function InfoChip({ icon, label, accent }: { icon: string; label: string; accent?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 9999, background: accent ? "rgba(16,185,129,0.1)" : "var(--muted)", color: accent ? "var(--primary)" : "#0a0a0a", fontSize: 10.5, fontWeight: 900 }}>
      <Icon name={icon} size={11} />
      {label}
    </span>
  );
}

function toMatch(seek: MatchSeek, myCity?: string | null): Match {
  const host = seek.authorName ?? "Jugador MATCHPOINT";
  const total = seek.mode === "doubles" ? 4 : 2;
  const basePlayers: MatchPlayer[] = [{ a: initials(host), b: gradientFor(seek.createdBy), title: host }];
  if (seek.mode === "doubles" && seek.partnerId) {
    basePlayers.push({ a: "DP", b: "linear-gradient(135deg,#0891b2,#06b6d4)", title: "Dupla del autor" });
  }
  const applicantSlots = Math.min(seek.applicantsCount, Math.max(0, total - basePlayers.length - 1));
  for (let i = 0; i < applicantSlots; i++) {
    basePlayers.push({ a: `P${i + 1}`, b: gradientFor(`${seek.id}-${i}`), title: "Postulante" });
  }
  const start = new Date(seek.windowStart);
  return {
    id: seek.id,
    seek,
    host,
    hostAv: initials(host),
    hostBg: gradientFor(seek.createdBy),
    hostLevel: seek.skillMin,
    sport: sportLabel(seek.sport),
    mode: modeLabel(seek.mode),
    club: seek.clubId ? "Club seleccionado" : "Club por acordar",
    dist: seek.city ? (seek.city === myCity ? "Tu ciudad" : seek.city) : "Ciudad por definir",
    date: formatDateLabel(seek.windowStart),
    time: formatTime(seek.windowStart),
    startsIn: startsInLabel(start),
    urgency: urgencyFor(start),
    levelRange: [seek.skillMin ?? Number.NaN, seek.skillMax ?? Number.NaN],
    slotsTotal: total,
    players: basePlayers,
    ranked: seek.ranked,
    fit: null,
    viewing: seek.applicantsCount,
    featured: false,
  };
}

function modeLabel(mode: MatchSeek["mode"]) {
  return mode === "doubles" ? "Dobles" : "Singles";
}

function statusLabel(status: MatchSeek["status"]) {
  if (status === "open") return "Abierto";
  if (status === "matched") return "Con match";
  if (status === "expired") return "Expirado";
  return "Cancelado";
}

function applicationStatusLabel(status: MatchSeekApplication["status"] | MyApplicationItem["status"] | null | undefined) {
  if (status === "accepted") return "Aceptado";
  if (status === "rejected") return "Rechazado";
  if (status === "withdrawn") return "Retirado";
  if (status === "pending") return "Ya te postulaste";
  return "Postularme";
}

function levelText(seek: MatchSeek) {
  if (seek.skillMin == null && seek.skillMax == null) return "Nivel flexible";
  if (seek.skillMin != null && seek.skillMax != null) return `Nivel ${levelNumber(seek.skillMin)}-${levelNumber(seek.skillMax)}`;
  if (seek.skillMin != null) return `Desde nivel ${levelNumber(seek.skillMin)}`;
  return `Hasta nivel ${levelNumber(seek.skillMax)}`;
}

function levelNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
}

function formatDateLabel(iso: string) {
  return fmtShortDateEc(iso);
}

function formatTime(iso: string) {
  return fmtTimeEc(iso);
}

function startsInLabel(date: Date) {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "Ahora";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return formatDateLabel(date.toISOString());
}

function urgencyFor(date: Date): Match["urgency"] {
  const hours = (date.getTime() - Date.now()) / 3600000;
  if (hours <= 3) return "hot";
  if (sameDay(date, new Date())) return "today";
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(date, tomorrow)) return "tomorrow";
  return "later";
}

function relativeFrom(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return formatDateLabel(iso);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "MP";
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function gradientFor(id: string) {
  const gradients = [
    "linear-gradient(135deg,#10b981,#047857)",
    "linear-gradient(135deg,#7c3aed,#db2777)",
    "linear-gradient(135deg,#0891b2,#06b6d4)",
    "linear-gradient(135deg,#ca8a04,#facc15)",
    "linear-gradient(135deg,#dc2626,#fb923c)",
    "linear-gradient(135deg,#0a0a0a,#374151)",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return gradients[Math.abs(hash) % gradients.length];
}

function defaultDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateInputValue(date: Date) {
  if (!Number.isFinite(date.getTime())) return defaultDateInput();
  return date.toISOString().slice(0, 10);
}

function timeInputValue(date: Date) {
  if (!Number.isFinite(date.getTime())) return defaultTimeInput();
  return date.toTimeString().slice(0, 5);
}

function defaultTimeInput() {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d.toTimeString().slice(0, 5);
}

function parseLocalDateTime(value: string) {
  const normalized = value.trim().replace(" ", "T");
  const date = new Date(normalized.length === 16 ? `${normalized}:00` : normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "10px 12px",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
};

const softBoxStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  padding: 12,
  borderRadius: 12,
  background: "#fafafa",
  border: "1px dashed var(--border)",
  color: "var(--muted-fg)",
  fontSize: 12,
};

