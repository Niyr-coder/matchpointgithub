"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { Skeleton as SkBar } from "@/components/ui/Skeleton";
import { getQuedadaPlayerView } from "@/server/actions/quedadas";
import type {
  GameViewPair,
  GameViewParticipant,
  GameViewRound,
  GameViewGame,
} from "./QuedadaGameView";
import type { Prize, QuedadaRule } from "@/lib/schemas/quedadas";
import { getQuedadaEngine } from "@/lib/quedadas/engines/registry";
import { individualStandings } from "@/lib/quedadas/standings";
import { pairStandings } from "@/lib/quedadas/pair-standings";

type PlayerQuedada = {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  format: string;
  match_mode: "singles" | "doubles";
  visibility: "open" | "private";
  status: string;
  starts_at: string;
  location_text: string | null;
  fee_cents: number;
  perks_text: string | null;
  prizes: Prize[] | null;
  rules: QuedadaRule[] | null;
  target_points: number | null;
};
type PlayerCategory = {
  id: string;
  name: string;
  level_label: string | null;
  starts_at: string | null;
  court_label: string | null;
  max_slots?: number | null;
  target_points: number | null;
  sort_order: number;
};
type PlayerView = {
  quedada: PlayerQuedada;
  meUserId: string;
  isMember: boolean;
  categories: PlayerCategory[];
  pairs: GameViewPair[];
  participants: GameViewParticipant[];
  rounds: GameViewRound[];
  games: GameViewGame[];
};
type TabKey = "calendario" | "general" | "detalles" | "tabla";

const FORMAT_LABEL: Record<string, string> = {
  americano: "Americano",
  mexicano: "Mexicano",
  round_robin: "Round Robin",
  kotc: "Rey de Cancha",
  canguil: "Canguil",
  libre: "Libre",
};

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

function sideIds(game: GameViewGame, side: "a" | "b"): string[] {
  return side === "a"
    ? [game.side_a_p1, game.side_a_p2].filter((id): id is string => !!id)
    : [game.side_b_p1, game.side_b_p2].filter((id): id is string => !!id);
}

function includesMe(game: GameViewGame, meUserId: string): boolean {
  return [...sideIds(game, "a"), ...sideIds(game, "b")].includes(meUserId);
}

function mySide(game: GameViewGame, meUserId: string): "a" | "b" {
  return sideIds(game, "a").includes(meUserId) ? "a" : "b";
}

function gameOrder(a: GameViewGame, b: GameViewGame): number {
  return (a.round_no ?? 9999) - (b.round_no ?? 9999) || (a.court_no ?? 9999) - (b.court_no ?? 9999);
}

function myGames(data: PlayerView): GameViewGame[] {
  return data.games.filter((g) => includesMe(g, data.meUserId)).sort(gameOrder);
}

function nextGameForPlayer(data: PlayerView): GameViewGame | null {
  return myGames(data).find((g) => g.status !== "played") ?? null;
}

function myCategoryIds(data: PlayerView): Set<string> {
  const ids = new Set<string>();
  for (const p of data.pairs) {
    if (p.player_a_id === data.meUserId || p.player_b_id === data.meUserId) ids.add(p.category_id);
  }
  return ids;
}

function roundNumbersForPlayer(data: PlayerView): number[] {
  const catIds = myCategoryIds(data);
  const fromRounds = data.rounds
    .filter((r) => catIds.size === 0 || catIds.has(r.category_id))
    .map((r) => r.round_no)
    .filter((n): n is number => Number.isFinite(n));
  const fromGames = data.games
    .filter((g) => g.round_no != null && (catIds.size === 0 || catIds.has(g.category_id)))
    .map((g) => g.round_no as number);
  return [...new Set([...fromRounds, ...fromGames])].sort((a, b) => a - b);
}

function scoreFor(game: GameViewGame, meUserId: string): { mine: number | null; theirs: number | null; won: boolean | null } {
  const side = mySide(game, meUserId);
  const mine = side === "a" ? game.points_a : game.points_b;
  const theirs = side === "a" ? game.points_b : game.points_a;
  if (mine == null || theirs == null) return { mine, theirs, won: null };
  return { mine, theirs, won: mine > theirs };
}

function tabFromLocation(): TabKey {
  if (typeof window === "undefined") return "calendario";
  const requested = new URLSearchParams(window.location.search).get("tab");
  return requested === "general" || requested === "detalles" || requested === "tabla" ? requested : "calendario";
}

export function QuedadaDetailView({ quedadaId }: { quedadaId: string }) {
  const router = useRouter();
  const [data, setData] = useState<PlayerView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(tabFromLocation);

  const reload = useCallback(async () => {
    const res = await getQuedadaPlayerView({ quedadaId });
    if (!res.ok) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    setData(res.data as PlayerView);
    setError(null);
    setLoading(false);
  }, [quedadaId]);

  useEffect(() => {
    const id = setTimeout(() => void reload(), 0);
    return () => clearTimeout(id);
  }, [reload]);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        onClick={() => router.push("/dashboard/user/quedadas")}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: 0,
          background: "transparent",
          color: "var(--muted-fg)",
          fontFamily: "inherit",
          fontSize: 12,
          fontWeight: 800,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <Icon name="arrow-left" size={13} color="var(--muted-fg)" />
        Volver
      </button>

      <PlayerHeader q={q} loading={loading} isMember={data?.isMember ?? false} />

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
          <PageTabs tabs={tabs} active={activeTab} onTab={setActiveTab} />
          {activeTab === "calendario" && <MyCalendarTab data={data} />}
          {activeTab === "general" && <GeneralCalendarTab data={data} />}
          {activeTab === "detalles" && <DetailsTab data={data} />}
          {activeTab === "tabla" && <StandingsTab data={data} />}
        </>
      )}
    </div>
  );
}

function buildTabs(data: PlayerView | null): Array<{ key: TabKey; label: string; icon: string; disabled?: boolean; title?: string }> {
  const hasGames = (data?.games.length ?? 0) > 0;
  const isAmericano = data?.quedada.format === "americano";
  return [
    { key: "calendario", label: "Tu calendario", icon: "calendar-days" },
    {
      key: "general",
      label: "Calendario general",
      icon: "layout-grid",
      disabled: !isAmericano || !hasGames,
      title: !isAmericano ? "Disponible para Americano" : hasGames ? undefined : "Aparece cuando el organizador publique partidos",
    },
    { key: "detalles", label: "Detalles", icon: "info" },
    {
      key: "tabla",
      label: "Tabla",
      icon: "bar-chart-3",
      disabled: !isAmericano || !hasGames,
      title: !isAmericano ? "Disponible para Americano" : hasGames ? undefined : "Aparece cuando haya partidos",
    },
  ];
}

function PlayerHeader({ q, loading, isMember }: { q: PlayerQuedada | null; loading: boolean; isMember: boolean }) {
  const sm = q ? statusMeta(q.status) : null;
  return (
    <div
      style={{
        padding: "20px 24px",
        borderRadius: 14.4,
        color: "#fff",
        overflow: "hidden",
        position: "relative",
        background:
          "radial-gradient(115% 130% at 98% 112%, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0) 52%), linear-gradient(135deg, #0a0a0a 0%, #052e22 60%, #064e3b 100%)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          fontFamily: "var(--font-heading)",
          fontWeight: 900,
          fontSize: 160,
          color: "rgba(255,255,255,0.06)",
          letterSpacing: "-0.06em",
          lineHeight: 0.8,
          transform: "rotate(-6deg) translate(15%, -22%)",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        QUEDA
      </div>
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "5px 12px",
            borderRadius: 9999,
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.18)",
            fontSize: 10.5,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#34d399" }} />
          {q ? `${isMember ? "Inscrito" : "Vista jugador"} · ${sm?.label ?? q.status}` : "Quedada"}
        </div>
        {loading || !q ? (
          <div style={{ marginTop: 14 }}>
            <SkBar w={260} h={30} r={8} dark />
          </div>
        ) : (
          <>
            <h1
              className="font-heading"
              style={{
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                margin: "12px 0 0",
                lineHeight: 1.05,
              }}
            >
              {q.title}
              <span style={{ color: "#34d399" }}>.</span>
            </h1>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
                fontSize: 12,
                color: "rgba(255,255,255,0.78)",
              }}
            >
              <MetaItem icon="calendar-days">{whenLabel(q.starts_at)}</MetaItem>
              {q.location_text && <MetaItem icon="map-pin">{q.location_text}</MetaItem>}
              <MetaItem icon="gamepad-2">
                {FORMAT_LABEL[q.format] ?? q.format} · {q.match_mode === "singles" ? "Singles" : "Dobles"}
              </MetaItem>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PageTabs({
  tabs,
  active,
  onTab,
}: {
  tabs: Array<{ key: TabKey; label: string; icon: string; disabled?: boolean; title?: string }>;
  active: TabKey;
  onTab: (key: TabKey) => void;
}) {
  return (
    <div role="tablist" aria-label="Vista de quedada" style={{ display: "flex", gap: 22, padding: "0 2px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            type="button"
            disabled={t.disabled}
            title={t.title}
            onClick={() => onTab(t.key)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "0 1px 12px",
              border: 0,
              borderBottom: on ? "2px solid var(--primary)" : "2px solid transparent",
              background: "transparent",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: on ? "var(--fg)" : t.disabled ? "var(--border)" : "var(--muted-fg)",
              opacity: t.disabled ? 0.6 : 1,
              cursor: t.disabled ? "not-allowed" : "pointer",
            }}
          >
            <Icon name={t.icon} size={12} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function MyCalendarTab({ data }: { data: PlayerView }) {
  const isAmericano = data.quedada.format === "americano";
  const games = myGames(data);
  const next = nextGameForPlayer(data);
  const playedMine = games.filter((g) => g.status === "played");
  const pendingMine = games.filter((g) => g.status !== "played");
  const rounds = roundNumbersForPlayer(data);
  const restCount = Math.max(0, rounds.length - games.length);

  if (!isAmericano) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ReservedBlock q={data.quedada} />
        <SoonCard />
      </div>
    );
  }

  if (data.games.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
      {next ? <NextMatchCard data={data} game={next} /> : (
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {courtNos.map((courtNo) => (
            <CourtCard key={courtNo} courtNo={courtNo} games={(byCourt.get(courtNo) ?? []).sort(gameOrder)} data={data} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailsTab({ data }: { data: PlayerView }) {
  const q = data.quedada;
  const prizes = q.prizes ?? [];
  const rules = q.rules ?? [];
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
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9, background: "var(--muted)" }}>
                <span className="font-heading" style={{ minWidth: 36, fontSize: 12, fontWeight: 900, color: "var(--primary)" }}>{p.place}</span>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{p.prize}</span>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="label-mp">Tabla general</div>
      <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 320 }}>
            <div style={{ display: "grid", gridTemplateColumns: "26px minmax(96px,1fr) 30px 30px 40px 48px", gap: 6, padding: "6px 11px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)" }}>
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
                  gridTemplateColumns: "26px minmax(96px,1fr) 30px 30px 40px 48px",
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

function ReservedBlock({ q }: { q: PlayerQuedada }) {
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

function SoonCard() {
  return (
    <div className="card" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12, background: "var(--muted)", color: "var(--muted-fg)" }}>
      <Icon name="clock" size={18} color="var(--muted-fg)" />
      <div>
        <div className="font-heading" style={{ fontSize: 13.5, fontWeight: 900, color: "var(--fg)" }}>
          Pronto<span className="dot">.</span>
        </div>
        <div style={{ fontSize: 12, marginTop: 2 }}>
          El motor de juego de este formato todavía no está disponible. Por ahora puedes revisar los detalles de la quedada.
        </div>
      </div>
    </div>
  );
}

function NextMatchCard({ data, game }: { data: PlayerView; game: GameViewGame }) {
  const side = mySide(game, data.meUserId);
  const partnerIds = sideIds(game, side).filter((id) => id !== data.meUserId);
  const rivalIds = sideIds(game, side === "a" ? "b" : "a");
  return (
    <section
      aria-labelledby="next-match-heading"
      style={{
        position: "relative",
        overflow: "hidden",
        padding: "18px 22px",
        borderRadius: 14.4,
        color: "#fff",
        border: "1px solid rgba(52,211,153,0.22)",
        background: "linear-gradient(135deg, #0a0a0a 0%, #0c2519 60%, #065f46 100%)",
      }}
    >
      <div aria-hidden style={{ position: "absolute", top: 0, right: 0, fontFamily: "var(--font-heading)", fontSize: 140, fontWeight: 900, color: "rgba(52,211,153,0.08)", letterSpacing: "-0.06em", lineHeight: 0.8, transform: "rotate(-6deg) translate(15%, -25%)", textTransform: "uppercase", pointerEvents: "none" }}>
        R{game.round_no ?? "?"}
      </div>
      <div style={{ position: "relative" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 10px", borderRadius: 9999, background: "rgba(52,211,153,0.18)", color: "#86efac", fontSize: 9, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          ★ Tu próximo partido
        </span>
        <div style={{ display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap", marginTop: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>RONDA</div>
            <div className="font-heading tabular" style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>{game.round_no ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>CANCHA</div>
            <div className="font-heading tabular" style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1 }}>{game.court_no ?? "—"}</div>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Tu compañero</div>
            <div className="font-heading" style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {partnerIds.map((id) => nameFor(data, id)).join(" + ") || "Singles"}<span style={{ color: "#34d399" }}>.</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 800, letterSpacing: "0.08em", marginTop: 8, textTransform: "uppercase" }}>vs.</div>
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {rivalIds.map((id) => nameFor(data, id)).join(" + ")}<span style={{ color: "#fbbf24" }}>.</span>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14, fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>Cuando termines, el organizador carga el marcador y se genera la siguiente ronda.</div>
      </div>
    </section>
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
  const score = scoreFor(game, data.meUserId);
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

function CourtCard({ courtNo, games, data }: { courtNo: number; games: GameViewGame[]; data: PlayerView }) {
  const current = games.find((g) => g.status !== "played") ?? null;
  const played = games.filter((g) => g.status === "played");
  const meInCurrent = current ? includesMe(current, data.meUserId) : false;
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", border: meInCurrent ? "1.5px solid var(--primary)" : "1px solid var(--border)" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <Icon name="square" size={13} color="var(--muted-fg)" />
        <span className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>Cancha {courtNo}</span>
        <span style={{ flex: 1 }} />
        {current ? (
          <span style={{ padding: "2px 7px", borderRadius: 9999, background: "var(--color-mp-primary-light)", color: "var(--color-mp-primary-active)", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>● En juego · R{current.round_no ?? "—"}</span>
        ) : (
          <span style={{ padding: "2px 7px", borderRadius: 9999, border: "1px solid var(--border)", color: "var(--muted-fg)", fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase" }}>Libre</span>
        )}
      </div>
      {current ? (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="label-mp">Ahora</div>
          <TeamLine ids={sideIds(current, "a")} data={data} />
          <VsDivider />
          <TeamLine ids={sideIds(current, "b")} data={data} />
        </div>
      ) : (
        <div style={{ padding: 14, fontSize: 11.5, color: "var(--muted-fg)", textAlign: "center" }}>No hay partido programado.</div>
      )}
      {played.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6, background: "#fafafa" }}>
          <div className="label-mp">Jugadas en esta cancha</div>
          {[...played].reverse().map((g) => <PlayedRow key={g.id} game={g} data={data} />)}
        </div>
      )}
    </div>
  );
}

function TeamLine({ ids, data }: { ids: string[]; data: PlayerView }) {
  const mine = ids.includes(data.meUserId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 800 }}>
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ids.map((id) => nameFor(data, id)).join(" + ")}</span>
      {mine && <span aria-label="Tú juegas aquí" style={{ padding: "1px 6px", borderRadius: 9999, background: "var(--primary)", color: "#0a0a0a", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.08em" }}>TÚ</span>}
    </div>
  );
}

function PlayedRow({ game, data }: { game: GameViewGame; data: PlayerView }) {
  const aWon = (game.points_a ?? 0) > (game.points_b ?? 0);
  const mine = includesMe(game, data.meUserId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, padding: "4px 0" }}>
      <span className="tabular" style={{ width: 24, fontWeight: 900, color: "var(--muted-fg)", flexShrink: 0 }}>R{game.round_no ?? "—"}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: aWon ? 800 : 600, color: aWon ? "var(--fg)" : "var(--muted-fg)" }}>{sideIds(game, "a").map((id) => nameFor(data, id)).join(" + ")}</span>
      <span className="tabular" style={{ fontSize: 12, fontWeight: 900 }}>{game.points_a ?? 0}<span style={{ color: "var(--muted-fg)", padding: "0 4px" }}>–</span>{game.points_b ?? 0}</span>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right", fontWeight: !aWon ? 800 : 600, color: !aWon ? "var(--fg)" : "var(--muted-fg)" }}>{sideIds(game, "b").map((id) => nameFor(data, id)).join(" + ")}</span>
      {mine && <span style={{ padding: "1px 6px", borderRadius: 9999, background: "var(--muted)", color: "var(--muted-fg)", fontSize: 8.5, fontWeight: 900, letterSpacing: "0.06em" }}>TÚ</span>}
    </div>
  );
}

function VsDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 9, fontWeight: 900, color: "var(--muted-fg)" }}>VS</span>
      <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="label-mp">{label}</div>
      <div className="font-heading tabular" style={{ marginTop: 5, fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ marginTop: 3, fontSize: 11, color: "var(--muted-fg)" }}>{sub}</div>}
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

function MetaItem({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
      <Icon name={icon} size={12} color="rgba(255,255,255,0.62)" />
      {children}
    </span>
  );
}
