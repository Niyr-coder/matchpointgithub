"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  getTournamentLiveDisplay,
  type TournamentLiveDisplay,
} from "@/server/actions/tournament-live";
import { useRealtimeRefresh } from "@/components/dashboard/useRealtimeRefresh";

const SLIDE_MS = 15000;

type Slide =
  | { kind: "live"; title: string }
  | { kind: "recent"; title: string }
  | { kind: "groups"; title: string; index: number }
  | { kind: "champion"; title: string };

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
  const [slideIdx, setSlideIdx] = useState(0);
  const [, startTx] = useTransition();

  const refresh = useCallback(() => {
    startTx(async () => {
      const res = await getTournamentLiveDisplay({ slug, token });
      if (res.ok) setData(res.data);
    });
  }, [slug, token]);

  useRealtimeRefresh(
    [
      { table: "tournament_group_matches" },
      { table: "bracket_matches" },
      { table: "tournament_categories" },
      { table: "tournaments", filter: `id=eq.${initial.tournamentId}` },
    ],
    { enabled: true, onChange: () => refresh() },
  );

  useEffect(() => {
    const t = setInterval(refresh, SLIDE_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const slides: Slide[] = [];
  if (data.liveMatches.length > 0) slides.push({ kind: "live", title: "En juego" });
  if (data.recentMatches.length > 0) slides.push({ kind: "recent", title: "Últimos resultados" });
  data.groupTables.forEach((_, i) => {
    slides.push({ kind: "groups", title: "Tablas de grupo", index: i });
  });
  if (data.championLabel) slides.push({ kind: "champion", title: "Campeón" });
  if (slides.length === 0) slides.push({ kind: "live", title: data.tournamentName });

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  const slide = slides[slideIdx % slides.length] ?? slides[0]!;

  return (
    <div className="mp-tv-live">
      <header className="mp-tv-live-header">
        <div className="mp-tv-live-brand">MATCHPOINT</div>
        <h1 className="mp-tv-live-title">{data.tournamentName}</h1>
        <div className="mp-tv-live-slide-label">{slide.title}</div>
      </header>

      <main className="mp-tv-live-main">
        {slide.kind === "live" && (
          <MatchGrid
            matches={data.liveMatches}
            empty="No hay partidos en juego ahora mismo."
          />
        )}
        {slide.kind === "recent" && (
          <MatchGrid matches={data.recentMatches} empty="Aún no hay resultados." />
        )}
        {slide.kind === "groups" && data.groupTables[slide.index] && (
          <GroupTableView table={data.groupTables[slide.index]!} />
        )}
        {slide.kind === "champion" && (
          <div className="mp-tv-live-champion">
            <div className="mp-tv-live-champion-label">Campeón</div>
            <div className="mp-tv-live-champion-name">{data.championLabel}</div>
          </div>
        )}
      </main>

      {slides.length > 1 && (
        <footer className="mp-tv-live-dots" aria-hidden>
          {slides.map((_, i) => (
            <span key={i} className={i === slideIdx % slides.length ? "is-active" : ""} />
          ))}
        </footer>
      )}
    </div>
  );
}

function MatchGrid({
  matches,
  empty,
}: {
  matches: TournamentLiveDisplay["liveMatches"];
  empty: string;
}) {
  if (matches.length === 0) {
    return <p className="mp-tv-live-empty">{empty}</p>;
  }
  return (
    <div className="mp-tv-live-grid">
      {matches.map((m) => (
        <div key={m.id} className={`mp-tv-live-card${m.status === "live" ? " is-live" : ""}`}>
          {m.groupName && <div className="mp-tv-live-meta">{m.groupName}</div>}
          {m.courtLabel && <div className="mp-tv-live-meta">{m.courtLabel}</div>}
          <div className="mp-tv-live-row">
            <span className="mp-tv-live-team">{m.labelA}</span>
            <span className="mp-tv-live-score">{m.scoreA}</span>
          </div>
          <div className="mp-tv-live-row">
            <span className="mp-tv-live-team">{m.labelB}</span>
            <span className="mp-tv-live-score">{m.scoreB}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupTableView({
  table,
}: {
  table: TournamentLiveDisplay["groupTables"][number];
}) {
  return (
    <div className="mp-tv-live-table-wrap">
      <div className="mp-tv-live-table-title">
        {table.categoryName} · Grupo {table.groupName}
      </div>
      <table className="mp-tv-live-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Equipo</th>
            <th>G</th>
            <th>Sets</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.rank}>
              <td>{r.rank}</td>
              <td>{r.label}</td>
              <td>{r.wins}</td>
              <td>{r.sets}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
