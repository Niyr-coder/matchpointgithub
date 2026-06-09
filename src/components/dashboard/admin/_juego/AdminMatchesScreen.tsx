"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useRealtimeRefresh } from "../../useRealtimeRefresh";
import { useToast } from "../../ToastProvider";
import { usePromptModal } from "../../widgets/PromptModal";
import {
  cancelMatchAdmin,
  cancelMatchSeekAdmin,
  dismissNoShowAdmin,
  listAdminMatchesData,
  resolveMatchDisputeAdmin,
  updatePlayerReliabilityAdmin,
  type AdminReliabilityRow,
} from "@/server/actions/admin/matches";
import {
  AJFilterBar,
  AJHero,
  AJIconButton,
  AJKpiStrip,
  AJSearchInput,
  AJStatusChip,
  ajRel,
} from "./components";
import {
  MATCH_KIND_META,
  MATCH_STATUS_META,
  MATCHES_HERO_BG,
  type MatchKind,
  type MatchStatus,
} from "./constants";

const MATCHES_TABLE_COLS = "70px minmax(220px,1.4fr) minmax(160px,1.2fr) 120px 90px 110px auto";

type AdminMatch = {
  id: string;
  source: "match" | "seek" | "no_show";
  sourceId: string;
  kind: MatchKind;
  status: MatchStatus;
  reporter: string;
  playerA: string;
  playerB: string;
  scoreA: string;
  scoreB: string;
  club: string;
  when: string;
  ranked: boolean;
  flag: string | null;
  reportsCount: number;
};

function toStatus(status: string): MatchStatus {
  if (status in MATCH_STATUS_META) return status as MatchStatus;
  return "scheduled";
}

export function AdminMatchesScreen() {
  const toast = useToast();
  const router = useRouter();
  const { ask } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [list, setList] = useState<AdminMatch[]>([]);
  const [reliability, setReliability] = useState<AdminReliabilityRow[]>([]);
  const [filter, setFilter] = useState({ kind: "all", status: "all", q: "" });
  const rtTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listAdminMatchesData();
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se cargaron matches", sub: res.error.message });
        return;
      }

      const matchRows: AdminMatch[] = res.data.matches.map((m) => ({
        id: m.id,
        source: "match",
        sourceId: m.id,
        kind: m.isRanked ? "ranked" : "friendly",
        status: toStatus(m.status),
        reporter: "—",
        playerA: m.teamALabel,
        playerB: m.teamBLabel,
        scoreA: m.scoreLabel,
        scoreB: m.disputedReason ?? "—",
        club: `${m.sport} · ${m.mode}`,
        when: m.playedAt,
        ranked: m.isRanked,
        flag: m.disputedReason,
        reportsCount: m.status === "disputed" ? 1 : 0,
      }));

      const seekRows: AdminMatch[] = res.data.seeks
        .filter((s) => s.status === "open")
        .map((s) => ({
          id: s.id,
          source: "seek",
          sourceId: s.id,
          kind: "friendly",
          status: "scheduled",
          reporter: s.authorName,
          playerA: s.authorName,
          playerB: `${s.applicantsCount} postulantes`,
          scoreA: "Aviso abierto",
          scoreB: "—",
          club: `${s.sport} · ${s.mode}${s.city ? ` · ${s.city}` : ""}`,
          when: s.windowStart,
          ranked: false,
          flag: "Busco partido abierto",
          reportsCount: 0,
        }));

      const noShowRows: AdminMatch[] = res.data.noShows.map((n) => ({
        id: n.id,
        source: "no_show",
        sourceId: n.id,
        kind: "friendly",
        status: "disputed",
        reporter: n.reportedByName,
        playerA: n.noShowName,
        playerB: `Reportado por ${n.reportedByName}`,
        scoreA: "No-show",
        scoreB: "—",
        club: `Match ${n.matchId.slice(0, 8)}`,
        when: n.createdAt,
        ranked: false,
        flag: "Reporte de inasistencia",
        reportsCount: 1,
      }));

      setList([...noShowRows, ...matchRows, ...seekRows]);
      setReliability(res.data.reliability);
    });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () => () => {
      if (rtTimer.current) clearTimeout(rtTimer.current);
    },
    [],
  );

  useRealtimeRefresh(
    [
      { table: "matches" },
      { table: "match_seeks" },
      { table: "match_seek_applications" },
      { table: "match_no_shows" },
      { table: "player_reliability" },
    ],
    {
      onChange: () => {
        if (rtTimer.current) clearTimeout(rtTimer.current);
        rtTimer.current = setTimeout(load, 900);
      },
    },
  );

  const disputed = list.filter((m) => m.status === "disputed").length;
  const stats = [
    { v: disputed, l: "Disputados", highlight: disputed > 0 },
    { v: list.filter((m) => m.status === "reported").length, l: "Reportados" },
    { v: list.filter((m) => m.status === "scheduled" || m.status === "live").length, l: "Agendados" },
    { v: list.filter((m) => m.status === "confirmed").length, l: "Confirmados" },
  ];

  const filtered = useMemo(
    () =>
      list.filter((m) => {
        if (filter.kind !== "all" && m.kind !== filter.kind) return false;
        if (filter.status !== "all" && m.status !== filter.status) return false;
        if (filter.q) {
          const blob = `${m.playerA} ${m.playerB} ${m.club} ${m.id}`.toLowerCase();
          if (!blob.includes(filter.q.toLowerCase())) return false;
        }
        return true;
      }),
    [filter, list],
  );

  const confirmMatch = (m: AdminMatch) => {
    startTransition(async () => {
      const res = await resolveMatchDisputeAdmin({ matchId: m.sourceId, resolution: "confirm" });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo confirmar", sub: res.error.message });
        return;
      }
      setList((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "confirmed", flag: null } : x)));
      toast({ icon: "check", title: "Match confirmado", sub: m.id.slice(0, 8) });
      router.refresh();
    });
  };

  const cancelOrDismiss = async (m: AdminMatch) => {
    const reason = await ask({
      title: m.source === "match" ? "Cancelar match" : m.source === "seek" ? "Cancelar aviso" : "Descartar no-show",
      label: "Motivo",
      placeholder: "Ej: revisión de soporte",
      multiline: true,
      required: false,
      confirmLabel: m.source === "no_show" ? "Descartar reporte" : "Confirmar",
      destructive: true,
    });
    if (reason == null) return;
    startTransition(async () => {
      const res =
        m.source === "seek"
          ? await cancelMatchSeekAdmin({ seekId: m.sourceId })
          : m.source === "no_show"
            ? await dismissNoShowAdmin({ reportId: m.sourceId })
            : m.status === "disputed"
              ? await resolveMatchDisputeAdmin({
                  matchId: m.sourceId,
                  resolution: "cancel",
                  reason: reason.trim() || "Cancelado por soporte MATCHPOINT",
                })
              : await cancelMatchAdmin({
                  matchId: m.sourceId,
                  reason: reason.trim() || "Cancelado por soporte MATCHPOINT",
                });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo actualizar", sub: res.error.message });
        return;
      }
      setList((prev) => prev.filter((x) => x.id !== m.id));
      toast({
        icon: "ban",
        title: m.source === "no_show" ? "Reporte descartado" : "Registro actualizado",
        sub: m.id.slice(0, 8),
      });
      router.refresh();
    });
  };

  const investigate = (m: AdminMatch) => {
    toast({ icon: "search", title: "Registro real", sub: `${m.source} · ${m.id.slice(0, 8)}` });
  };

  const editReliability = async (row: AdminReliabilityRow) => {
    const value = await ask({
      title: "Editar fiabilidad",
      label: "No-shows, cancelaciones",
      initialValue: `${row.noShows}, ${row.cancellations}`,
      placeholder: "Ej: 1, 2",
      confirmLabel: "Guardar",
      validate: (v) => (/^\s*\d+\s*,\s*\d+\s*$/.test(v) ? null : "Usa el formato: no-shows, cancelaciones"),
    });
    if (value == null) return;
    const [noShows, cancellations] = value.split(",").map((x) => Number(x.trim()));
    startTransition(async () => {
      const res = await updatePlayerReliabilityAdmin({ userId: row.userId, noShows, cancellations });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      setReliability((prev) => prev.map((x) => (x.userId === row.userId ? { ...x, noShows, cancellations } : x)));
      toast({ icon: "check", title: "Fiabilidad actualizada", sub: row.name });
      router.refresh();
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <AJHero
        chipText=""
        title="Matches"
        sub="Resultados oficiales con impacto en ranking. Resuelve disputas y modera resultados sospechosos."
        wordmark="MTCH"
        bg={MATCHES_HERO_BG}
        accent="#f87171"
      />
      <AJKpiStrip stats={stats} />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.02em" }}>
            Cola de moderación<span className="dot">.</span>
          </span>
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)", fontWeight: 700 }}>Matches, avisos y no-shows</span>
          <span style={{ flex: 1 }} />
          <AJSearchInput value={filter.q} onChange={(v) => setFilter({ ...filter, q: v })} placeholder="Buscar por jugador, club o id…" />
        </div>
        <AJFilterBar
          totalAll={list.length}
          totalShown={filtered.length}
          onClear={() => setFilter({ kind: "all", status: "all", q: "" })}
          groups={[
            {
              label: "Tipo",
              value: filter.kind,
              onChange: (v) => setFilter({ ...filter, kind: v }),
              options: [
                { k: "all", l: "Todos" },
                { k: "ranked", l: "Ranked" },
                { k: "friendly", l: "Amistoso" },
                { k: "tournament", l: "Torneo" },
                { k: "league", l: "Liga" },
              ],
            },
            {
              label: "Estado",
              value: filter.status,
              onChange: (v) => setFilter({ ...filter, status: v }),
              options: [
                { k: "all", l: "Todos" },
                { k: "disputed", l: "Disputado" },
                { k: "reported", l: "Reportado" },
                { k: "scheduled", l: "Agendado" },
                { k: "live", l: "En vivo" },
                { k: "confirmed", l: "Confirmado" },
                { k: "walkover", l: "Walkover" },
                { k: "cancelled", l: "Cancelado" },
              ],
            },
          ]}
        />

        {filtered.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--muted-fg)" }}>
            <Icon name="search-x" size={26} color="var(--muted-fg)" />
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 900, marginTop: 10, color: "var(--fg)" }}>
              Sin resultados<span className="dot">.</span>
            </div>
          </div>
        ) : (
          <div className="card mp-table-scroll" style={{ padding: 0, overflow: "hidden" }}>
            <div className="mp-admin-matches-inner">
              <div className="mp-table-row" style={{ display: "grid", gridTemplateColumns: MATCHES_TABLE_COLS, gap: 12, padding: "10px 16px", fontSize: 9.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted-fg)", borderBottom: "1px solid var(--border)", background: "var(--muted)", alignItems: "center" }}>
                <span>Tipo</span>
                <span>Match</span>
                <span>Marcadores</span>
                <span>Rating</span>
                <span>Estado</span>
                <span>Cuándo</span>
                <span />
              </div>
              {filtered.map((m, i) => {
                const sm = MATCH_STATUS_META[m.status];
                const km = MATCH_KIND_META[m.kind];
                const scoreConflict = Boolean(m.status === "disputed" && m.scoreB && m.scoreB !== "—");
                const showActions =
                  m.source !== "match" ||
                  m.status === "disputed" ||
                  m.status === "reported" ||
                  m.status === "scheduled" ||
                  m.status === "live";
                return (
                  <div key={`${m.source}-${m.id}`} className="mp-table-row" style={{ display: "grid", gridTemplateColumns: MATCHES_TABLE_COLS, gap: 12, padding: "12px 16px", alignItems: "center", borderBottom: i < filtered.length - 1 ? "1px solid var(--border)" : 0, background: m.status === "cancelled" ? "#fafafa" : "#fff", opacity: m.status === "cancelled" ? 0.7 : 1 }}>
                    <AJStatusChip {...km} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.playerA}</div>
                      <div style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 600, margin: "2px 0" }}>vs.</div>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.playerB}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--muted-fg)" }}>{m.id}</span>
                        <span style={{ fontSize: 10, color: "var(--muted-fg)" }}>· {m.club}</span>
                        {m.reportsCount > 0 ? (
                          <span title={`${m.reportsCount} reportes`} style={{ fontSize: 9, fontWeight: 900, padding: "1px 6px", borderRadius: 9999, background: "#fee2e2", color: "#dc2626" }}>
                            <Icon name="alert-triangle" size={8} style={{ verticalAlign: "middle", marginRight: 3 }} />
                            {m.reportsCount}
                          </span>
                        ) : null}
                      </div>
                      {m.flag ? (
                        <div style={{ fontSize: 10.5, color: "#dc2626", fontWeight: 700, marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Icon name="alert-triangle" size={10} />
                          {m.flag}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="font-heading tabular" style={{ fontSize: 12.5, fontWeight: 900, color: scoreConflict ? "#dc2626" : "var(--fg)" }}>{m.scoreA}</div>
                      {m.scoreB && m.scoreB !== "—" ? (
                        <div className="font-heading tabular" style={{ fontSize: 12.5, fontWeight: 900, color: scoreConflict ? "#dc2626" : "var(--muted-fg)", marginTop: 4 }}>{m.scoreB}</div>
                      ) : null}
                    </div>
                    <span className="font-heading tabular" style={{ fontSize: 13, fontWeight: 900, color: m.ranked ? "#15803d" : "var(--muted-fg)" }}>
                      {m.ranked ? "Ranked" : "—"}
                    </span>
                    <AJStatusChip {...sm} />
                    <span style={{ fontSize: 11, color: "var(--muted-fg)", fontWeight: 700 }}>{ajRel(m.when)}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {showActions ? (
                        <>
                          <AJIconButton title="Investigar" icon="search" onClick={() => investigate(m)} disabled={pending} />
                          {m.source === "match" && (m.status === "disputed" || m.status === "reported") ? (
                            <AJIconButton title="Confirmar resultado" icon="check" onClick={() => confirmMatch(m)} bg="#dcfce7" border="1px solid #86efac" color="#15803d" disabled={pending} />
                          ) : null}
                          <AJIconButton title={m.source === "no_show" ? "Descartar reporte" : "Cancelar"} icon="x" onClick={() => void cancelOrDismiss(m)} border="1px solid #fecaca" color="#dc2626" disabled={pending} />
                        </>
                      ) : (
                        <AJIconButton title="Ver detalles" icon="eye" onClick={() => investigate(m)} disabled={pending} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {reliability.length > 0 ? (
        <div className="card" style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="font-heading" style={{ fontSize: 13, fontWeight: 900, textTransform: "uppercase" }}>
            Fiabilidad<span className="dot">.</span>
          </span>
          {reliability.slice(0, 6).map((r) => (
            <button
              key={r.userId}
              type="button"
              onClick={() => void editReliability(r)}
              disabled={pending}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 9999,
                background: "#fff",
                padding: "6px 10px",
                fontSize: 10.5,
                fontWeight: 800,
                color: "var(--fg)",
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {r.name} · {r.noShows} NS / {r.cancellations} cancel.
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
