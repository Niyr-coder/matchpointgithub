"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTournamentLiveDisplay,
  type TournamentLiveDisplay,
  type TournamentLiveMatch,
  type TournamentLiveCourt,
  type TournamentLiveBracketRound,
  type TournamentLiveTeam,
  type TournamentLiveGlobalStanding,
} from "@/server/actions/tournament-live";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";

const SCENE_MS = 14000;
const REFRESH_MS = 12000;
const STALE_MS = 45000;
const BUMP_MS = 800;
const REALTIME_DEBOUNCE_MS = 1000;

const PUBLIC_SITE =
  process.env.NEXT_PUBLIC_APP_URL ??
  (typeof window !== "undefined" ? window.location.origin : "");

type Scene =
  | { kind: "court"; idx: number }
  | { kind: "bracket" }
  | { kind: "champion" }
  | { kind: "upnext" }
  | { kind: "teams" }
  | { kind: "globalstandings" };

function fmtTime(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
}

function scoreSig(m: TournamentLiveMatch): string {
  return `${m.scoreA}-${m.scoreB}-${m.sets.map((s) => `${s.a}/${s.b}`).join(",")}`;
}

export function TournamentLiveDisplayClient({
  slug,
  token,
  initial,
}: {
  slug: string;
  token: string;
  initial: TournamentLiveDisplay;
}) {
  const [data, setData] = useState(initial);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [lastSync, setLastSync] = useState<number>(() => Date.now());
  const [now, setNow] = useState<number>(() => Date.now());
  const [bumped, setBumped] = useState<Set<string>>(() => new Set());
  const prevSig = useRef<Map<string, string>>(new Map());
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => {
    (async () => {
      const res = await getTournamentLiveDisplay({ slug, token });
      if (res.ok) {
        setData(res.data);
        setLastSync(Date.now());
      }
    })();
  }, [slug, token]);

  // Debounce realtime events: las tablas sin filter (group_matches, bracket_matches)
  // pueden disparar decenas de eventos seguidos. Esperar 1s antes de refetch.
  const debouncedRefresh = useCallback(() => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    realtimeTimer.current = setTimeout(refresh, REALTIME_DEBOUNCE_MS);
  }, [refresh]);

  useRealtimeRefresh(
    [
      { table: "tournament_group_matches" },
      { table: "bracket_matches" },
      { table: "tournament_categories" },
      { table: "tournaments", filter: `id=eq.${initial.tournamentId}` },
    ],
    { enabled: true, onChange: debouncedRefresh },
  );

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => {
      clearInterval(t);
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Marcadores que cambiaron por realtime → animar solo esos
  useEffect(() => {
    const scored = [
      ...data.liveMatches,
      ...data.courts.map((c) => c.current).filter((m): m is TournamentLiveMatch => !!m),
    ];
    const next = new Map<string, string>();
    const changed = new Set<string>();
    for (const m of scored) {
      const sig = scoreSig(m);
      next.set(m.id, sig);
      const prev = prevSig.current.get(m.id);
      if (prev !== undefined && prev !== sig) changed.add(m.id);
    }
    prevSig.current = next;
    if (changed.size > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBumped(changed);
      const t = setTimeout(() => setBumped(new Set()), BUMP_MS);
      return () => clearTimeout(t);
    }
  }, [data]);

  // Canchas con partido EN JUEGO → un scoreboard broadcast por cancha
  const liveCourts = data.courts.filter((c) => c.current && c.current.status === "live");

  // Escenas secundarias (sin courts): se intercalan entre los scoreboards de cancha.
  const secondary: Scene[] = [];
  if (data.globalStandings.length > 0) secondary.push({ kind: "globalstandings" });
  if (data.teams.length > 0) secondary.push({ kind: "teams" });
  if (data.phase === "knockout" && data.bracketRounds.length > 0) secondary.push({ kind: "bracket" });
  if (data.championLabel) secondary.push({ kind: "champion" });
  secondary.push({ kind: "upnext" });

  const scenes: Scene[] = [];
  if (liveCourts.length === 0) {
    // Sin canchas en juego: rotar entre las secundarias directamente.
    scenes.push(...secondary);
  } else {
    // Con canchas: court[i] → secondary[i] → court[i+1] → secondary[i+1] → ...
    secondary.forEach((sec, i) => {
      scenes.push({ kind: "court", idx: i % liveCourts.length });
      scenes.push(sec);
    });
  }
  if (scenes.length === 0) scenes.push({ kind: "upnext" });

  useEffect(() => {
    if (scenes.length <= 1) return;
    const t = setInterval(() => setSceneIdx((i) => (i + 1) % scenes.length), SCENE_MS);
    return () => clearInterval(t);
  }, [scenes.length]);

  const scene = scenes[sceneIdx % scenes.length] ?? scenes[0]!;
  const liveCount = data.liveMatches.length;
  const secondsAgo = Math.max(0, Math.floor((now - lastSync) / 1000));
  const stale = now - lastSync > STALE_MS;
  const publicUrl = PUBLIC_SITE ? `${PUBLIC_SITE}/eventos/${slug}` : "";
  const qrSrc = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=6&data=${encodeURIComponent(publicUrl)}`
    : "";
  const subtitle =
    data.phase === "knockout"
      ? "Eliminatorias"
      : data.categoryNames.slice(0, 2).join(" · ") || "Fase de grupos";

  // Ticker: canchas en juego + próximos + info del torneo + sponsors
  const tickerItems: string[] = [];
  for (const c of liveCourts) {
    const m = c.current!;
    const games = m.sets.map((s) => `${s.a}-${s.b}`).join("  ");
    tickerItems.push(`${c.courtLabel.toUpperCase()} · ${m.labelA} vs ${m.labelB}  ${games}`);
  }
  for (const u of data.upcomingMatches.slice(0, 4)) {
    const t = fmtTime(u.scheduledAt);
    tickerItems.push(
      `PRÓXIMO${u.courtLabel ? ` ${u.courtLabel.toUpperCase()}` : ""}${t ? ` ${t}` : ""} · ${u.labelA} vs ${u.labelB}`,
    );
  }
  // Info del torneo
  tickerItems.push(data.tournamentName.toUpperCase());
  if (data.categoryNames.length > 0) {
    tickerItems.push(`CATEGORÍAS: ${data.categoryNames.join(" · ").toUpperCase()}`);
  }
  if (data.teams.length > 0) {
    tickerItems.push(`${data.teams.length} ${data.teams.length === 1 ? "EQUIPO INSCRITO" : "EQUIPOS INSCRITOS"}`);
  }
  if (publicUrl) {
    tickerItems.push(`SIGUE EL TORNEO EN ${publicUrl.replace(/^https?:\/\//, "").toUpperCase()}`);
  }
  // Sponsors
  for (const sp of data.sponsors) {
    tickerItems.push(`PATROCINADO POR ${sp.sponsorName.toUpperCase()} · ${sp.headline.toUpperCase()}`);
  }
  if (tickerItems.length === 0) tickerItems.push(data.tournamentName.toUpperCase());

  return (
    <div className="mp-tvb">
      <header className="mp-tvb-top">
        <div className="mp-tvb-brand">
          <span className="mp-tvb-brand-dot" aria-hidden />
          MATCHPOINT
          <span className="mp-tvb-brand-series">Pro Series</span>
        </div>
        <div className="mp-tvb-title">
          <div className="mp-tvb-title-name">{data.tournamentName}</div>
          <div className="mp-tvb-title-sub">{subtitle}</div>
        </div>
        <div className="mp-tvb-status-wrap">
          {liveCount > 0 && !stale && (
            <span className="mp-tvb-live">
              <span className="mp-tvb-live-dot" aria-hidden />
              Live
            </span>
          )}
          <span className={`mp-tvb-sync${stale ? " is-stale" : ""}`}>
            {stale ? "Reconectando…" : `Act. ${secondsAgo}s`}
          </span>
        </div>
      </header>

      <main className="mp-tvb-stage" key={sceneIdx}>
        {scene.kind === "court" && liveCourts[scene.idx] && (
          <CourtBroadcast court={liveCourts[scene.idx]!} bump={bumped} />
        )}
        {scene.kind === "bracket" && (
          <BracketFull
            rounds={data.bracketRounds}
            finalists={data.finalists}
            championLabel={data.championLabel}
          />
        )}
        {scene.kind === "champion" && data.championLabel && (
          <ChampionScene championLabel={data.championLabel} finalists={data.finalists} />
        )}
        {scene.kind === "upnext" && (
          <UpNextScene upcoming={data.upcomingMatches} recent={data.recentMatches} name={data.tournamentName} />
        )}
        {scene.kind === "teams" && (
          <TeamsScene teams={data.teams} totalCount={data.teams.length} />
        )}
        {scene.kind === "globalstandings" && (
          <GlobalStandingsScene standings={data.globalStandings} />
        )}
      </main>

      <footer className="mp-tvb-ticker">
        <div className="mp-tvb-ticker-tag">En vivo</div>
        <div className="mp-tvb-ticker-track">
          <div className="mp-tvb-ticker-row">
            {[...tickerItems, ...tickerItems].map((it, i) => (
              <span className="mp-tvb-ticker-item" key={i}>
                {it}
                <span className="mp-tvb-ticker-sep" aria-hidden>
                  ●
                </span>
              </span>
            ))}
          </div>
        </div>
        {qrSrc && (
          <div className="mp-tvb-ticker-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR para seguir el torneo" width={52} height={52} />
          </div>
        )}
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CourtBroadcast
// ---------------------------------------------------------------------------
function CourtBroadcast({ court, bump }: { court: TournamentLiveCourt; bump: Set<string> }) {
  const m = court.current!;
  const sets = m.sets;
  const cur = sets.length - 1;
  const leadA = Number(m.scoreA) > Number(m.scoreB);
  const leadB = Number(m.scoreB) > Number(m.scoreA);
  const isBumped = bump.has(m.id);
  const meta = `${court.courtLabel}${m.groupName ? ` · Grupo ${m.groupName}` : " · Eliminatoria"}`;
  const rows = [
    { label: m.labelA, side: "a" as const, lead: leadA },
    { label: m.labelB, side: "b" as const, lead: leadB },
  ];
  return (
    <div className="mp-tvb-board">
      <div className="mp-tvb-board-court">{meta}</div>
      <div className="mp-tvb-sb">
        {rows.map((r) => (
          <div
            key={r.side}
            className={`mp-tvb-sb-row${r.lead ? " is-lead" : ""}${isBumped ? " is-bump" : ""}`}
          >
            <div className="mp-tvb-sb-team">{r.label}</div>
            <div className="mp-tvb-sb-games">
              {sets.map((s, i) => {
                const mine = r.side === "a" ? s.a : s.b;
                const won = r.side === "a" ? s.a > s.b : s.b > s.a;
                return (
                  <span
                    key={i}
                    className={`mp-tvb-g${i === cur ? " is-cur" : ""}${won ? " is-won" : ""}`}
                  >
                    {mine}
                  </span>
                );
              })}
              {sets.length === 0 && <span className="mp-tvb-g is-cur">0</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="mp-tvb-board-foot">
        {sets.length > 0 ? `Game ${sets.length}` : "Por comenzar"} · {meta}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChampionScene — solo se monta cuando championLabel !== null
// ---------------------------------------------------------------------------
function ChampionScene({
  championLabel,
  finalists,
}: {
  championLabel: string;
  finalists: { a: string; b: string } | null;
}) {
  return (
    <div className="mp-tvb-champ">
      <div className="mp-tvb-champ-trophy" aria-hidden>
        <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </div>
      <div className="mp-tvb-champ-label">Campeón</div>
      <div className="mp-tvb-champ-name">{championLabel}</div>
      {finalists && (
        <div className="mp-tvb-champ-final">
          Final: <b>{finalists.a}</b> vs <b>{finalists.b}</b>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UpNextScene — próximos partidos + últimos resultados
// ---------------------------------------------------------------------------
function UpNextScene({
  upcoming,
  recent,
  name,
}: {
  upcoming: TournamentLiveMatch[];
  recent: TournamentLiveMatch[];
  name: string;
}) {
  const next = upcoming.slice(0, 6);
  const last = recent.slice(0, 6);
  if (next.length === 0 && last.length === 0) {
    return (
      <div className="mp-tvb-upnext">
        <div className="mp-tvb-upnext-hero">{name}</div>
        <div className="mp-tvb-upnext-sub">Los partidos en vivo aparecerán aquí.</div>
      </div>
    );
  }
  return (
    <div className="mp-tvb-upnext-grid">
      <div>
        <div className="mp-tvb-col-h">Próximos</div>
        {next.length === 0 ? (
          <div className="mp-tvb-col-empty">Sin partidos programados.</div>
        ) : (
          <div className="mp-tvb-rows mp-tv-stagger">
            {next.map((m) => (
              <div className="mp-tvb-row" key={m.id}>
                {m.scheduledAt && (
                  <span className="mp-tvb-row-time">{fmtTime(m.scheduledAt)}</span>
                )}
                {m.courtLabel && (
                  <span style={{ flexShrink: 0, fontSize: "0.72em", fontWeight: 700, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" }}>
                    {m.courtLabel}
                  </span>
                )}
                <span className="mp-tvb-row-teams">
                  {m.labelA} <i>vs</i> {m.labelB}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="mp-tvb-col-h">Últimos resultados</div>
        {last.length === 0 ? (
          <div className="mp-tvb-col-empty">Aún no hay resultados.</div>
        ) : (
          <div className="mp-tvb-rows mp-tv-stagger">
            {last.map((m) => (
              <div className="mp-tvb-row" key={m.id}>
                <span className="mp-tvb-row-teams">
                  {m.labelA} <b>{m.scoreA}</b>–<b>{m.scoreB}</b> {m.labelB}
                </span>
                {(m.groupName || m.courtLabel) && (
                  <span style={{ flexShrink: 0, fontSize: "0.68em", fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {m.groupName ?? m.courtLabel}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TeamsScene — lista de equipos inscritos
// ---------------------------------------------------------------------------
const TEAMS_MAX = 16;

function TeamsScene({
  teams,
  totalCount,
}: {
  teams: TournamentLiveTeam[];
  totalCount: number;
}) {
  const visible = teams.slice(0, TEAMS_MAX);
  const half = Math.ceil(visible.length / 2);
  const colA = visible.slice(0, half);
  const colB = visible.slice(half);
  const extra = totalCount - TEAMS_MAX;

  return (
    <div className="mp-tvb-upnext-grid">
      <div>
        <div className="mp-tvb-col-h">
          Inscritos &mdash; {totalCount} {totalCount === 1 ? "equipo" : "equipos"}
        </div>
        <div className="mp-tvb-rows mp-tv-stagger">
          {colA.map((t) => (
            <div className="mp-tvb-row" key={t.registrationId}>
              <span className="mp-tvb-row-teams">{t.label}</span>
            </div>
          ))}
        </div>
      </div>
      {colB.length > 0 && (
        <div>
          <div className="mp-tvb-col-h">&nbsp;</div>
          <div className="mp-tvb-rows mp-tv-stagger">
            {colB.map((t) => (
              <div className="mp-tvb-row" key={t.registrationId}>
                <span className="mp-tvb-row-teams">{t.label}</span>
              </div>
            ))}
            {extra > 0 && (
              <div className="mp-tvb-row">
                <span className="mp-tvb-col-empty">+{extra} más</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GlobalStandingsScene — tabla de posiciones global cross-grupos
// ---------------------------------------------------------------------------
const STANDINGS_MAX = 12;

function GlobalStandingsScene({
  standings,
}: {
  standings: TournamentLiveGlobalStanding[];
}) {
  const rows = standings.slice(0, STANDINGS_MAX);
  const extra = standings.length - STANDINGS_MAX;

  return (
    <div className="mp-tv-live-table-wrap">
      <div className="mp-tv-live-table-title">Tabla de Posiciones</div>
      <table className="mp-tv-live-table">
        <thead>
          <tr>
            <th style={{ width: "2.5em" }}>#</th>
            <th>Equipo</th>
            <th style={{ textAlign: "center", width: "3.5em" }}>PJ</th>
            <th style={{ textAlign: "center", width: "3.5em" }}>G</th>
            <th style={{ textAlign: "center", width: "3.5em" }}>P</th>
            <th style={{ textAlign: "center", width: "5em" }}>Sets</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rank}>
              <td
                style={{
                  fontWeight: 900,
                  color: row.rank === 1
                    ? "var(--tv-accent, #34d399)"
                    : row.rank <= 3
                      ? "rgba(255,255,255,0.7)"
                      : "rgba(255,255,255,0.35)",
                }}
              >
                {row.rank}
              </td>
              <td style={{ fontWeight: row.rank <= 3 ? 900 : 700 }}>{row.label}</td>
              <td style={{ textAlign: "center", color: "rgba(255,255,255,0.5)" }}>{row.played}</td>
              <td
                style={{
                  textAlign: "center",
                  fontWeight: 900,
                  color: "var(--tv-accent, #34d399)",
                }}
              >
                {row.wins}
              </td>
              <td style={{ textAlign: "center", color: "rgba(255,255,255,0.4)" }}>{row.losses}</td>
              <td
                style={{
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                  color: "rgba(255,255,255,0.6)",
                }}
              >
                {row.setsWon}-{row.setsLost}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {extra > 0 && (
        <p className="mp-tvb-empty" style={{ marginTop: 14 }}>
          +{extra} equipos más
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BracketFull
// ---------------------------------------------------------------------------
function BracketFull({
  rounds,
  finalists,
  championLabel,
}: {
  rounds: TournamentLiveBracketRound[];
  finalists: { a: string; b: string } | null;
  championLabel: string | null;
}) {
  if (rounds.length === 0) {
    return <p className="mp-tvb-empty">El cuadro se genera al cerrar la fase de grupos.</p>;
  }
  return (
    <section className="mp-tv-bk-wrap">
      <div className="mp-tv-bk-heads">
        {rounds.map((r) => (
          <div className="mp-tv-bk-head" key={r.name}>
            {r.name}
          </div>
        ))}
        {championLabel && <div className="mp-tv-bk-head">Campeón</div>}
      </div>
      <div className="mp-tv-bk">
        {rounds.map((r) => (
          <div className="mp-tv-bk-col" key={r.name}>
            {r.matches.map((m) => (
              <div className="mp-tv-bk-m" key={m.id}>
                <div className={`mp-tv-bk-card${m.status === "live" ? " is-live" : ""}`}>
                  <div className={`mp-tv-bk-side${m.winner === "a" ? " is-win" : ""}`}>
                    <span className="mp-tv-bk-team">{m.labelA}</span>
                    {m.sets.length > 0 && <b className="mp-tv-bk-score">{m.scoreA}</b>}
                  </div>
                  <div className={`mp-tv-bk-side${m.winner === "b" ? " is-win" : ""}`}>
                    <span className="mp-tv-bk-team">{m.labelB}</span>
                    {m.sets.length > 0 && <b className="mp-tv-bk-score">{m.scoreB}</b>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {championLabel && (
          <div className="mp-tv-bk-col mp-tv-bk-champ-col">
            <div className="mp-tv-bk-champ">
              <span className="mp-tv-bk-champ-trophy" aria-hidden>
                🏆
              </span>
              <span className="mp-tv-bk-champ-name">{championLabel}</span>
            </div>
          </div>
        )}
      </div>
      {!championLabel && finalists && (
        <div className="mp-tv-bk-foot">
          Final: <b>{finalists.a}</b> vs <b>{finalists.b}</b>
        </div>
      )}
    </section>
  );
}
