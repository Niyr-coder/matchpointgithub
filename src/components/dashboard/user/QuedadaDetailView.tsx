"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";
import { getQuedadaPlayerView } from "@/server/actions/quedadas";
import type {
  GameViewGame,
  GameViewParticipant,
  QuedadaPlayerQuedada,
  QuedadaPlayerViewData,
} from "@/lib/quedadas/game-view-types";
import {
  gameOrder,
  includesUser,
  myGames,
  mySide,
  nextGameForPlayer,
  restRoundsForPlayer,
  roundNumbersForPlayer,
  scoreForUser,
  sideIds,
} from "@/lib/quedadas/player-schedule";
import { QuedadaPrizeRow } from "./quedada-fields/QuedadaPrizeRow";
import { getQuedadaEngine } from "@/lib/quedadas/engines/registry";
import { individualStandings } from "@/lib/quedadas/standings";
import { pairStandings } from "@/lib/quedadas/pair-standings";
import { gameOutcomeForUser, podiumRankLabel } from "@/lib/quedadas/profile-stats";
import { EventPlayerConfigPanel } from "@/components/events/EventPlayerConfigPanel";
import { quedadaFormatLabel } from "@/lib/quedadas/format-labels";
import type { Prize, QuedadaRule } from "@/lib/schemas/quedadas";
import { PlayerBackBtn } from "./_shared/PlayerBackBtn";
import { PlayerHero } from "./_shared/PlayerHero";
import { PlayerTabStrip } from "./_shared/PlayerTabStrip";
import { NextMatchCard } from "./_shared/NextMatchCard";
import { MiniStat } from "./_shared/MiniStat";
import { PLAYER_TONES } from "./_shared/playerTones";
import { CourtMatchup } from "@/components/quedadas/CourtMatchup";

type PlayerView = QuedadaPlayerViewData;
type TabKey = "calendario" | "general" | "configuracion" | "detalles" | "tabla";

function statusMeta(status: string): { label: string; bg: string; fg: string } {
  switch (status) {
    case "registration_open":
      return { label: "Abierta", bg: "rgba(16,185,129,0.16)", fg: "#d1fae5" };
    case "registration_closed":
      return { label: "Cerrada", bg: "rgba(251,191,36,0.16)", fg: "#fef3c7" };
    case "live":
      return { label: "En curso", bg: "rgba(14,165,233,0.16)", fg: "#e0f2fe" };
    case "finished":
      return { label: "Finalizada", bg: "rgba(255,255,255,0.12)", fg: "#fff" };
    case "cancelled":
      return { label: "Cancelada", bg: "rgba(239,68,68,0.18)", fg: "#fecaca" };
    default:
      return { label: status, bg: "rgba(255,255,255,0.12)", fg: "#fff" };
  }
}

function money(cents: number): string {
  if (!cents || cents <= 0) return "Gratis";
  const n = cents / 100;
  return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short" });
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${date} · ${hh}:${mm}`;
}

function participantName(p: GameViewParticipant | undefined | null): string {
  return p?.profiles?.display_name || (p?.profiles?.username ? `@${p.profiles.username}` : "Jugador");
}

function nameFor(data: PlayerView, userId: string | null | undefined): string {
  if (!userId) return "—";
  return participantName(data.participants.find((p) => p.user_id === userId));
}

type MyQuedadaPerf = {
  finalRank: number | null;
  tableRank: number | null;
  played: number;
  wins: number;
  pf: number;
  diff: number;
};

function myPerformanceInQuedada(data: PlayerView): MyQuedadaPerf | null {
  const mode = getQuedadaEngine(data.quedada.format).standingsMode(data.quedada.match_mode);
  if (mode === "manual") return null;

  const mePart = data.participants.find((p) => p.user_id === data.meUserId);
  const finalRank = mePart?.final_rank ?? null;
  const playedGames = myGames(data).filter((g) => g.status === "played");
  let wins = 0;
  for (const g of playedGames) {
    if (gameOutcomeForUser(g, data.meUserId) === "win") wins += 1;
  }

  let tableRank: number | null = null;
  let pf = 0;
  let diff = 0;
  if (mode === "pair") {
    const rows = pairStandings(data.games, data.pairs);
    const idx = rows.findIndex((r) => r.playerIds.includes(data.meUserId));
    if (idx >= 0) {
      tableRank = idx + 1;
      pf = rows[idx].pf;
      diff = rows[idx].diff;
    }
  } else {
    const rows = individualStandings(
      data.games,
      data.participants.map((p) => p.user_id),
      (id) => nameFor(data, id),
    );
    const idx = rows.findIndex((r) => r.userId === data.meUserId);
    if (idx >= 0) {
      tableRank = idx + 1;
      pf = rows[idx].pf;
      diff = rows[idx].diff;
    }
  }

  return {
    finalRank,
    tableRank,
    played: playedGames.length,
    wins,
    pf,
    diff,
  };
}

function PlayerFinishedSummary({ data }: { data: PlayerView }) {
  const perf = myPerformanceInQuedada(data);
  if (data.quedada.status !== "finished" || !perf) return null;

  const podium = podiumRankLabel(perf.finalRank);
  const isPodium = perf.finalRank != null && perf.finalRank <= 3;

  return (
    <div
      className="card"
      style={{
        padding: 16,
        border: isPodium ? "1px solid rgba(16,185,129,0.28)" : "1px solid var(--border)",
        background: isPodium ? "var(--color-mp-primary-light)" : "var(--card)",
      }}
    >
      <div className="label-mp" style={{ color: "var(--primary)" }}>
        Tu resumen
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
        {podium ? (
          <span className="font-heading" style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.03em" }}>
            {podium}
          </span>
        ) : perf.tableRank ? (
          <span className="font-heading" style={{ fontSize: 22, fontWeight: 900 }}>
            #{perf.tableRank}
          </span>
        ) : null}
        <span style={{ fontSize: 13, color: "var(--muted-fg)", fontWeight: 700 }}>
          {podium ? "puesto final" : perf.tableRank ? "en la tabla" : "Sin puesto registrado"}
        </span>
      </div>
      {perf.played > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          <MiniStat label="PJ" value={String(perf.played)} />
          <MiniStat label="G" value={String(perf.wins)} />
          <MiniStat label="PF" value={String(perf.pf)} />
          <MiniStat
            label="DIF"
            value={perf.diff > 0 ? `+${perf.diff}` : String(perf.diff)}
          />
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 10 }}>
          No jugaste partidos registrados en esta quedada.
        </div>
      )}
    </div>
  );
}

function tabFromLocation(): TabKey {
  if (typeof window === "undefined") return "calendario";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested === "general" || requested === "configuracion" || requested === "detalles" || requested === "tabla" ? requested : "calendario";
}

export function QuedadaDetailView({
  quedadaId,
  initialData = null,
}: {
  quedadaId: string;
  initialData?: QuedadaPlayerViewData | null;
}) {
  const router = useRouter();
  const [data, setData] = useState<QuedadaPlayerViewData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(tabFromLocation);

  const reload = useCallback(async () => {
    const res = await getQuedadaPlayerView({ quedadaId });
    if (!res.ok) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setData(res.data as QuedadaPlayerViewData);
    setError(null);
    setLoading(false);
  }, [quedadaId]);

  useEffect(() => {
    if (initialData) return;
    const id = setTimeout(() => void reload(), 0);
    return () => clearTimeout(id);
  }, [reload, initialData]);

  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeRefresh(
    [
      { table: "quedada_rounds", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_games", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedada_participants", filter: `quedada_id=eq.${quedadaId}` },
      { table: "quedadas", filter: `id=eq.${quedadaId}` },
    ],
    {
      onChange: () => {
        if (rtTimer.current) clearTimeout(rtTimer.current);
        rtTimer.current = setTimeout(() => void reload(), 400);
      },
    },
  );

  const q = data?.quedada ?? null;
  const tabs = useMemo(() => buildTabs(data), [data]);
  const activeTab = tabs.find((t) => t.key === tab && !t.disabled)?.key ?? "calendario";

  const setActiveTab = (key: TabKey) => {
    const t = tabs.find((item) => item.key === key);
    if (t?.disabled) return;
    setTab(key);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", key);
      router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
    }
  };

  return (
    <div className="min-w-0 w-full max-w-full" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18 }}>
      <PlayerBackBtn onClick={() => router.push("/dashboard/user/quedadas")} />

      <PlayerHero
        tone={PLAYER_TONES.quedada}
        loading={loading}
        statusLabel={
          q
            ? data?.quedada
              ? `${data.isMember ? "Inscrito" : "Vista jugador"} · ${statusMeta(q.status).label}`
              : "Quedada"
            : "Quedada"
        }
        title={q?.title ?? ""}
        meta={
          q
            ? [
                { icon: "calendar-days", label: whenLabel(q.starts_at) },
                ...(q.location_text ? [{ icon: "map-pin", label: q.location_text }] : []),
                {
                  icon: "gamepad-2",
                  label: `${quedadaFormatLabel(q.format)} · ${q.match_mode === "singles" ? "Singles" : "Dobles"}`,
                },
              ]
            : []
        }
      />

      {loading && (
        <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <SkBar w={160} h={14} r={6} />
          <SkBar h={56} r={10} />
          <SkBar h={56} r={10} />
        </div>
      )}

      {!loading && error && (
        <div
          className="card"
          style={{
            padding: 18,
            background: "var(--destructive-bg)",
            border: "1px solid var(--destructive-border)",
            color: "var(--destructive-fg)",
            fontSize: 13,
          }}
        >
          No se pudo cargar la quedada: {error}
        </div>
      )}

      {!loading && !error && q && data && (
        <>
          <PlayerTabStrip
            tabs={tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon, disabled: t.disabled, title: t.title }))}
            active={activeTab}
            onChange={setActiveTab}
            tone="quedada"
            ariaLabel="Vista de quedada"
          />
          {activeTab === "calendario" && <MyCalendarTab data={data} />}
          {activeTab === "general" && <GeneralCalendarTab data={data} />}
          {activeTab === "configuracion" && <ConfigTab data={data} />}
          {activeTab === "detalles" && <DetailsTab data={data} />}
          {activeTab === "tabla" && <StandingsTab data={data} />}
        </>
      )}
    </div>
  );
}

function buildTabs(data: PlayerView | null): Array<{ key: TabKey; label: string; icon: string; disabled?: boolean; title?: string }> {
  const hasGames = (data?.games.length ?? 0) > 0;
  const hasCourts = data?.games.some((g) => g.court_no != null) ?? false;
  const standingsMode = data
    ? getQuedadaEngine(data.quedada.format).standingsMode(data.quedada.match_mode)
    : "individual";
  const hasStandings = hasGames && standingsMode !== "manual";

  return [
    { key: "calendario", label: "Tu calendario", icon: "calendar-days" },
    {
      key: "general",
      label: "Por cancha",
      icon: "layout-grid",
      disabled: !hasGames || !hasCourts,
      title: !hasGames
        ? "Aparece cuando el organizador publique partidos"
        : !hasCourts
          ? "Los partidos aún no tienen cancha asignada"
          : undefined,
    },
    { key: "configuracion", label: "Configuración", icon: "settings-2" },
    { key: "detalles", label: "Detalles", icon: "info" },
    {
      key: "tabla",
      label: "Tabla",
      icon: "bar-chart-3",
      disabled: !hasStandings,
      title: standingsMode === "manual"
        ? "Este formato no calcula ranking automático"
        : !hasGames
          ? "Aparece cuando haya partidos"
          : undefined,
    },
  ];
}

function MyCalendarTab({ data }: { data: PlayerView }) {
  const games = myGames(data);
  const next = nextGameForPlayer(data);
  const playedMine = games.filter((g) => g.status === "played");
  const pendingMine = games.filter((g) => g.status !== "played");
  const rounds = roundNumbersForPlayer(data);
  const restCount = restRoundsForPlayer(data);

  if (data.games.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <PlayerFinishedSummary data={data} />
        <ReservedBlock q={data.quedada} />
        <EmptyPanel
          icon="clock"
          title="El organizador aún no inicia el juego"
          body="Cuando arranque la quedada y se genere la primera ronda, tus partidos aparecen aquí."
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PlayerFinishedSummary data={data} />
      {next ? (
        <QuedadaNextMatchCard data={data} game={next} />
      ) : (
        <div className="card" style={{ padding: 16, background: "var(--color-mp-primary-light)", border: "1px solid rgba(16,185,129,0.2)", display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="check-circle-2" size={18} color="var(--color-mp-primary-active)" />
          <div>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>Sin partidos pendientes<span className="dot">.</span></div>
            <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>Jugaste todo lo programado hasta ahora.</div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <MiniStat label="Partidos jugaste" value={String(playedMine.length)} />
        <MiniStat label="Por jugar" value={String(pendingMine.length)} />
        <MiniStat label="Rondas de la quedada" value={String(rounds.length)} />
        <MiniStat label="Descansos" value={String(restCount)} sub={`${restCount} ronda${restCount === 1 ? "" : "s"} descansaste`} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="label-mp" style={{ color: "var(--primary)" }}>Tu schedule</div>
        {rounds.length === 0 ? (
          <EmptyPanel icon="calendar-days" title="Sin rondas visibles" body="El calendario se arma apenas existan partidos con ronda." />
        ) : (
          rounds.slice().reverse().map((roundNo) => {
            const game = games.find((g) => g.round_no === roundNo) ?? null;
            return <RoundRow key={roundNo} roundNo={roundNo} game={game} data={data} />;
          })
        )}
      </div>
    </div>
  );
}

function GeneralCalendarTab({ data }: { data: PlayerView }) {
  const played = data.games.filter((g) => g.status === "played").length;
  const lastRound = data.rounds.length > 0 ? data.rounds[data.rounds.length - 1]?.round_no : 0;
  const currentRound = data.games.filter((g) => g.status !== "played").sort(gameOrder)[0]?.round_no ?? lastRound ?? 0;
  const byCourt = new Map<number, GameViewGame[]>();
  for (const g of data.games) {
    if (g.court_no == null) continue;
    const arr = byCourt.get(g.court_no) ?? [];
    arr.push(g);
    byCourt.set(g.court_no, arr);
  }
  const courtNos = [...byCourt.keys()].sort((a, b) => a - b);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 className="font-heading" style={{ margin: 0, fontSize: 14, fontWeight: 900, textTransform: "uppercase" }}>Por cancha<span className="dot">.</span></h2>
        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
          Ronda <b>{currentRound || "—"}</b> en juego · <b>{played}</b>/{data.games.length} partidos jugados
        </span>
      </div>
      {courtNos.length === 0 ? (
        <EmptyPanel icon="layout-grid" title="Sin canchas asignadas" body="Los partidos publicados todavía no tienen número de cancha." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {courtNos.map((courtNo) => (
            <CourtCard key={courtNo} courtNo={courtNo} games={(byCourt.get(courtNo) ?? []).sort(gameOrder)} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConfigTab({ data }: { data: PlayerView }) {
  const q = data.quedada;
  return (
    <div className="card" style={{ padding: 18 }}>
      <EventPlayerConfigPanel
        kind="quedada"
        format={q.format}
        matchMode={q.match_mode}
        visibility={q.visibility}
        feeCents={q.fee_cents}
        targetPoints={q.target_points}
        status={q.status}
        categories={data.categories}
      />
    </div>
  );
}

function DetailsTab({ data }: { data: PlayerView }) {
  const q = data.quedada;
  const prizes = (q.prizes as Prize[] | null) ?? [];
  const rules = (q.rules as QuedadaRule[] | null) ?? [];
  const hasContent = q.description || q.perks_text || prizes.length > 0 || rules.length > 0 || data.categories.length > 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!hasContent && <EmptyPanel icon="info" title="Sin detalles todavía" body="El organizador aún no agregó descripción, reglas ni premios." />}

      {q.description && (
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp">Sobre la quedada</div>
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--fg)", whiteSpace: "pre-wrap" }}>{q.description}</p>
        </div>
      )}

      {q.perks_text && (
        <div style={{ fontSize: 12.5, color: "var(--color-mp-primary-active)", background: "var(--color-mp-primary-light)", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 7, alignItems: "flex-start" }}>
          <Icon name="sparkles" size={13} color="var(--primary)" style={{ marginTop: 2 }} />
          <span>{q.perks_text}</span>
        </div>
      )}

      {prizes.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp">Premios</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {prizes.map((p, i) => (
              <div key={`${p.place}-${i}`} style={{ padding: "8px 12px", borderRadius: 9, background: "var(--muted)" }}>
                <QuedadaPrizeRow prize={p} />
              </div>
            ))}
          </div>
        </div>
      )}

      {rules.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp">Reglas clave</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {rules.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, fontWeight: 600 }}>
                <Icon name={r.warn ? "alert-triangle" : "check"} size={13} color={r.warn ? "#b45309" : "var(--success-fg)"} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ color: r.warn ? "#b45309" : "var(--fg)" }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.categories.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="label-mp">Categorías</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {data.categories.map((c) => {
              const taken = data.pairs.filter((p) => p.category_id === c.id).length;
              return (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: "var(--muted)" }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800 }}>{c.name}</span>
                  <span style={{ color: "var(--muted-fg)", fontWeight: 700 }}>
                    {c.max_slots != null ? `${taken}/${c.max_slots} cupos` : `${taken} inscritos`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const STANDINGS_GRID = "26px minmax(0, 1fr) 28px 28px 34px 42px";

function StandingsTab({ data }: { data: PlayerView }) {
  const mode = getQuedadaEngine(data.quedada.format).standingsMode(data.quedada.match_mode);
  if (mode === "manual") {
    return <EmptyPanel icon="bar-chart-3" title="Sin tabla automática" body="Este formato se gestiona con partidos manuales y no calcula ranking automático." />;
  }

  const rows =
    mode === "pair"
      ? pairStandings(data.games, data.pairs).map((r) => ({
          id: r.userId,
          name: r.playerIds.map((id) => nameFor(data, id)).join(" + "),
          played: r.played,
          wins: r.wins,
          pf: r.pf,
          pc: r.pc,
          diff: r.diff,
          isMe: r.playerIds.includes(data.meUserId),
        }))
      : individualStandings(
          data.games,
          data.participants.map((p) => p.user_id),
          (id) => nameFor(data, id),
        ).map((r) => ({
          id: r.userId,
          name: nameFor(data, r.userId),
          played: r.played,
          wins: r.wins,
          pf: r.pf,
          pc: r.pc,
          diff: r.diff,
          isMe: r.userId === data.meUserId,
        }));

  return (
    <div className="min-w-0 w-full max-w-full" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="label-mp">Tabla general</div>
      <div className="min-w-0 w-full max-w-full" style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div className="mp-table-scroll">
          <div style={{ width: "100%", minWidth: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: STANDINGS_GRID, gap: 6, padding: "6px 11px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>
              <span>#</span>
              <span>{mode === "pair" ? "Pareja" : "Jugador"}</span>
              <span style={{ textAlign: "center" }} title="Partidos jugados">PJ</span>
              <span style={{ textAlign: "center" }} title="Ganados">G</span>
              <span style={{ textAlign: "center" }} title="Puntos a favor">PF</span>
              <span style={{ textAlign: "right" }} title="Diferencia (PF-PC)">DIF</span>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: STANDINGS_GRID,
                  gap: 6,
                  alignItems: "center",
                  padding: "7px 11px",
                  fontSize: 12,
                  background: r.isMe ? "var(--color-mp-primary-light)" : i === 0 ? "var(--muted)" : "transparent",
                }}
              >
                <span className="font-heading tabular" style={{ fontWeight: 900, color: i === 0 ? "var(--color-mp-primary-active)" : "var(--muted-fg)" }}>{i + 1}</span>
                <span style={{ minWidth: 0, fontWeight: r.isMe ? 900 : 700, color: r.isMe ? "var(--color-mp-primary-active)" : "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{r.played}</span>
                <span className="font-heading tabular" style={{ textAlign: "center", fontWeight: 900 }}>{r.wins}</span>
                <span className="tabular" style={{ textAlign: "center", color: "var(--muted-fg)" }}>{r.pf}</span>
                <span className="tabular" style={{ textAlign: "right", fontWeight: 700, color: r.diff > 0 ? "var(--color-mp-primary-active)" : r.diff < 0 ? "var(--destructive-fg)" : "var(--muted-fg)" }}>{r.diff > 0 ? `+${r.diff}` : r.diff}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReservedBlock({ q }: { q: QuedadaPlayerQuedada }) {
  return (
    <div className="card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="label-mp" style={{ color: "var(--primary)" }}>Bloque reservado</div>
      <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
        {whenLabel(q.starts_at)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--muted-fg)" }}>
        {q.location_text && <span>{q.location_text}</span>}
        <span>{money(q.fee_cents)}</span>
      </div>
    </div>
  );
}

function QuedadaNextMatchCard({ data, game }: { data: PlayerView; game: GameViewGame }) {
  const tone = PLAYER_TONES.quedada;
  const side = mySide(game, data.meUserId);
  const partnerIds = sideIds(game, side).filter((id) => id !== data.meUserId);
  const rivalIds = sideIds(game, side === "a" ? "b" : "a");
  const partnerLabel =
    data.quedada.match_mode === "singles"
      ? ""
      : partnerIds.map((id) => nameFor(data, id)).join(" + ") || "Por confirmar";

  return (
    <NextMatchCard
      tone={tone}
      toneKey="quedada"
      kicker="Tu próximo partido"
      primary="RONDA"
      primaryValue={game.round_no ?? "—"}
      secondary="CANCHA"
      secondaryValue={game.court_no ?? "—"}
      partner={partnerLabel}
      opponents={rivalIds.map((id) => nameFor(data, id)).join(" + ")}
      subtitle="Cuando termines, el organizador carga el marcador y se genera la siguiente ronda."
    />
  );
}

function RoundRow({ roundNo, game, data }: { roundNo: number; game: GameViewGame | null; data: PlayerView }) {
  if (!game) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 12, padding: "11px 14px", border: "1px dashed var(--border)", borderRadius: 10, alignItems: "center", opacity: 0.7 }}>
        <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "var(--muted-fg)", textAlign: "center" }}>R{roundNo}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="coffee" size={13} color="var(--muted-fg)" />
          <span style={{ fontSize: 12.5, color: "var(--muted-fg)", fontWeight: 700 }}>Descansaste esta ronda</span>
        </div>
      </div>
    );
  }
  const score = scoreForUser(game, data.meUserId);
  const side = mySide(game, data.meUserId);
  const mine = sideIds(game, side).map((id) => (id === data.meUserId ? "Tú" : nameFor(data, id))).join(" + ");
  const rivals = sideIds(game, side === "a" ? "b" : "a").map((id) => nameFor(data, id)).join(" + ");
  const played = game.status === "played";
  const border = played && score.won === true ? "rgba(16,185,129,0.42)" : played && score.won === false ? "var(--destructive-border)" : "var(--border)";
  const background = played && score.won === true ? "rgba(16,185,129,0.06)" : played && score.won === false ? "var(--destructive-bg)" : "#fff";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 12, padding: "12px 14px", border: `1px solid ${border}`, borderRadius: 10, alignItems: "center", background }}>
      <div className="font-heading tabular" style={{ fontSize: 18, fontWeight: 900, color: "var(--fg)", textAlign: "center" }}>R{roundNo}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ padding: "2px 7px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>CANCHA {game.court_no ?? "—"}</span>
          <span style={{ padding: "2px 7px", borderRadius: 9999, background: played ? (score.won ? "rgba(16,185,129,0.18)" : "var(--destructive-bg)") : "var(--color-mp-primary-light)", color: played ? (score.won ? "var(--success-fg)" : "var(--destructive-fg)") : "var(--color-mp-primary-active)", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {played ? (score.won ? "★ GANASTE" : "PERDISTE") : "POR JUGAR"}
          </span>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {mine}
          <span style={{ fontWeight: 600, color: "var(--muted-fg)" }}> vs. </span>
          {rivals}
        </div>
      </div>
      <div className="font-heading tabular" style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em", color: played && score.won === true ? "var(--color-mp-primary-active)" : played && score.won === false ? "var(--destructive-fg)" : "var(--fg)", flexShrink: 0 }}>
        {played ? (
          <>
            {score.mine ?? 0}<span style={{ color: "var(--muted-fg)", fontSize: 14, margin: "0 4px" }}>–</span>{score.theirs ?? 0}
          </>
        ) : "—"}
      </div>
    </div>
  );
}

function teamNames(data: PlayerView, game: GameViewGame, side: "a" | "b"): string[] {
  return sideIds(game, side).map((id) => nameFor(data, id));
}

function myNamesInGame(data: PlayerView, game: GameViewGame): string[] {
  return [...sideIds(game, "a"), ...sideIds(game, "b")]
    .filter((id) => id === data.meUserId)
    .map((id) => nameFor(data, id));
}

function CourtCard({ courtNo, games, data }: { courtNo: number; games: GameViewGame[]; data: PlayerView }) {
  const current = games.find((g) => g.status !== "played") ?? null;
  const meInCurrent = current ? includesUser(current, data.meUserId) : false;
  const playedCount = games.filter((g) => g.status === "played").length;

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        border: meInCurrent ? "1.5px solid var(--primary)" : "1px solid var(--border)",
        boxShadow: meInCurrent ? "0 0 0 1px rgba(16,185,129,0.12)" : undefined,
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--border)",
          background: meInCurrent ? "var(--color-mp-primary-light)" : "var(--muted)",
        }}
      >
        <span className="font-heading" style={{ fontSize: 15, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
          Cancha {courtNo}
        </span>
        <span style={{ flex: 1 }} />
        {current ? (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 9999,
              background: "var(--primary)",
              color: "#fff",
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            ● En juego · R{current.round_no ?? "—"}
          </span>
        ) : (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 9999,
              border: "1px solid var(--border)",
              background: "#fff",
              color: "var(--muted-fg)",
              fontSize: 9,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Libre
          </span>
        )}
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", marginLeft: 4 }}>
          {playedCount}/{games.length}
        </span>
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        <div className="label-mp" style={{ marginBottom: 6 }}>
          {current ? `Ahora · Ronda ${current.round_no ?? "—"}` : "Sin partido programado"}
        </div>
        {current ? (
          <CourtMatchup
            teamA={teamNames(data, current, "a")}
            teamB={teamNames(data, current, "b")}
            nameSize={11}
            highlightNames={myNamesInGame(data, current)}
            active={meInCurrent}
          />
        ) : (
          <CourtMatchup teamA={[]} teamB={[]} emptyLabel="Libre" />
        )}
      </div>
    </div>
  );
}

function EmptyPanel({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted-fg)" }}>
      <Icon name={icon} size={24} color="var(--muted-fg)" />
      <div className="font-heading" style={{ marginTop: 10, fontSize: 16, fontWeight: 900, color: "var(--fg)", textTransform: "uppercase" }}>
        {title}<span className="dot">.</span>
      </div>
      <p style={{ margin: "8px auto 0", maxWidth: 520, fontSize: 13, lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}
