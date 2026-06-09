"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { reliabilityScore, reliabilityTier } from "@/lib/reliability";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  cancelMatchAdmin,
  cancelMatchSeekAdmin,
  dismissNoShowAdmin,
  listAdminMatchesData,
  resolveMatchDisputeAdmin,
  updatePlayerReliabilityAdmin,
  type AdminMatchesData,
  type AdminMatchRow,
  type AdminMatchSeekRow,
  type AdminNoShowRow,
  type AdminReliabilityRow,
} from "@/server/actions/admin/matches";

const EMPTY: AdminMatchesData = { matches: [], seeks: [], noShows: [], reliability: [] };

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#f59e0b",
  reported: "#0ea5e9",
  confirmed: "var(--primary)",
  disputed: "#dc2626",
  cancelled: "var(--muted-fg)",
  open: "var(--primary)",
  matched: "#0ea5e9",
  expired: "var(--muted-fg)",
};

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      style={{
        color: STATUS_COLOR[status] ?? "var(--muted-fg)",
        fontSize: 10,
        fontWeight: 950,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

export function AdminMatchesScreen() {
  useRealtimeRefresh(
    [
      { table: "matches" },
      { table: "match_seeks" },
      { table: "match_seek_applications" },
      { table: "match_no_shows" },
      { table: "player_reliability" },
    ],
    { debounceMs: 1200 },
  );

  const router = useRouter();
  const toast = useToast();
  const { ask, confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<AdminMatchesData | null>(null);

  const load = useCallback(() => {
    listAdminMatchesData().then((res) => {
      if (res.ok) setData(res.data);
      else setData(EMPTY);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = useMemo(() => {
    const rows = data ?? EMPTY;
    return [
      ["Matches activos", rows.matches.filter((m) => ["scheduled", "reported"].includes(m.status)).length],
      ["Disputas", rows.matches.filter((m) => m.status === "disputed").length],
      ["Avisos abiertos", rows.seeks.filter((s) => s.status === "open").length],
      ["No-shows", rows.noShows.length],
    ] as const;
  }, [data]);

  const refreshAfter = () => {
    load();
    router.refresh();
  };

  const handleCancelMatch = async (match: AdminMatchRow) => {
    const reason = await ask({
      title: "Cancelar match",
      label: "Motivo",
      placeholder: "Ej: disputa reportada por soporte",
      multiline: true,
      required: false,
      confirmLabel: "Cancelar match",
      destructive: true,
    });
    if (reason == null) return;
    startTransition(async () => {
      const res = await cancelMatchAdmin({ matchId: match.id, reason: reason.trim() || undefined });
      if (res.ok) {
        toast({ icon: "check", title: "Match cancelado", sub: match.id.slice(0, 8) });
        refreshAfter();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
      }
    });
  };

  const handleResolveDispute = async (match: AdminMatchRow, resolution: "confirm" | "cancel") => {
    const ok = await confirm({
      title: resolution === "confirm" ? "Confirmar resultado" : "Cancelar por disputa",
      body:
        resolution === "confirm"
          ? "¿Cerrar esta disputa confirmando el score reportado?"
          : "¿Cerrar esta disputa cancelando el partido?",
      confirmLabel: resolution === "confirm" ? "Confirmar" : "Cancelar partido",
      destructive: resolution === "cancel",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await resolveMatchDisputeAdmin({ matchId: match.id, resolution });
      if (res.ok) {
        toast({ icon: "check", title: "Disputa actualizada" });
        refreshAfter();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleCancelSeek = async (seek: AdminMatchSeekRow) => {
    const ok = await confirm({
      title: "Cancelar aviso",
      body: `¿Cancelar el aviso de ${seek.authorName}?`,
      confirmLabel: "Cancelar aviso",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelMatchSeekAdmin({ seekId: seek.id });
      if (res.ok) {
        toast({ icon: "check", title: "Aviso cancelado" });
        refreshAfter();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleDismissNoShow = async (row: AdminNoShowRow) => {
    const ok = await confirm({
      title: "Descartar no-show",
      body: `¿Descartar el reporte contra ${row.noShowName}? Se ajustará su contador.`,
      confirmLabel: "Descartar reporte",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await dismissNoShowAdmin({ reportId: row.id });
      if (res.ok) {
        toast({ icon: "check", title: "Reporte descartado" });
        refreshAfter();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleEditReliability = async (row: AdminReliabilityRow) => {
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
      if (res.ok) {
        toast({ icon: "check", title: "Fiabilidad actualizada", sub: row.name });
        refreshAfter();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const rows = data ?? EMPTY;

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: "20px 16px 60px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1
          className="font-heading"
          style={{ margin: 0, fontSize: 34, fontWeight: 950, letterSpacing: "-0.04em" }}
        >
          Gobernanza de partidos<span style={{ color: "var(--primary)" }}>.</span>
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--muted-fg)", fontSize: 13 }}>
          Revisa match seeks, partidos, disputas, no-shows y score de fiabilidad.
        </p>
      </header>

      <div className="mp-partner-torneo-kpis" style={{ marginBottom: 16 }}>
        {kpis.map(([label, value]) => (
          <div key={label} className="card" style={{ padding: 14 }}>
            <div className="label-mp">{label}</div>
            <div className="font-heading" style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {data === null ? (
        <SkeletonRows rows={6} />
      ) : (
        <div className="mp-admin-split-panels" style={{ alignItems: "start" }}>
          <section className="card" style={{ padding: 16 }}>
            <SectionTitle label="Matches recientes" count={rows.matches.length} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.matches.map((match) => (
                <div key={match.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>
                        {match.teamALabel} vs {match.teamBLabel}
                      </div>
                      <div style={{ marginTop: 3, color: "var(--muted-fg)", fontSize: 11 }}>
                        {match.sport} · {match.mode} · {dateLabel(match.playedAt)} ·{" "}
                        {match.isRanked ? "ranked" : "casual"}
                      </div>
                      <div style={{ marginTop: 3, color: "var(--muted-fg)", fontSize: 11 }}>
                        Score: <strong style={{ color: "#0a0a0a" }}>{match.scoreLabel}</strong>
                      </div>
                      {match.disputedReason ? (
                        <div style={{ marginTop: 6, color: "#dc2626", fontSize: 11 }}>
                          Disputa: {match.disputedReason}
                        </div>
                      ) : null}
                    </div>
                    <StatusPill status={match.status} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    {match.status === "disputed" ? (
                      <>
                        <button className="btn btn-primary" disabled={pending} onClick={() => handleResolveDispute(match, "confirm")}>
                          Confirmar score
                        </button>
                        <button className="btn" disabled={pending} onClick={() => handleResolveDispute(match, "cancel")}>
                          Cancelar por disputa
                        </button>
                      </>
                    ) : null}
                    {["scheduled", "reported", "disputed"].includes(match.status) ? (
                      <button className="btn" disabled={pending} onClick={() => handleCancelMatch(match)}>
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {rows.matches.length === 0 ? <EmptyLine text="No hay matches recientes." /> : null}
            </div>
          </section>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="card" style={{ padding: 16 }}>
              <SectionTitle label="Avisos Busco partido" count={rows.seeks.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {rows.seeks.map((seek) => (
                  <div key={seek.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 12 }}>{seek.authorName}</strong>
                      <StatusPill status={seek.status} />
                    </div>
                    <div style={{ marginTop: 4, color: "var(--muted-fg)", fontSize: 11 }}>
                      {seek.sport} · {seek.mode} · {seek.city ?? "sin ciudad"} · {seek.applicantsCount} postulantes
                    </div>
                    <div style={{ marginTop: 4, color: "var(--muted-fg)", fontSize: 11 }}>
                      Ventana: {dateLabel(seek.windowStart)}
                    </div>
                    {seek.status === "open" ? (
                      <button className="btn" disabled={pending} onClick={() => handleCancelSeek(seek)} style={{ marginTop: 8 }}>
                        Cancelar aviso
                      </button>
                    ) : null}
                  </div>
                ))}
                {rows.seeks.length === 0 ? <EmptyLine text="No hay avisos recientes." /> : null}
              </div>
            </section>

            <section className="card" style={{ padding: 16 }}>
              <SectionTitle label="No-shows reportados" count={rows.noShows.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {rows.noShows.map((row) => (
                  <div key={row.id} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontSize: 12 }}>
                      <strong>{row.noShowName}</strong> reportado por {row.reportedByName}
                    </div>
                    <div style={{ marginTop: 4, color: "var(--muted-fg)", fontSize: 11 }}>
                      Match {row.matchId.slice(0, 8)} · {dateLabel(row.createdAt)}
                    </div>
                    <button className="btn" disabled={pending} onClick={() => handleDismissNoShow(row)} style={{ marginTop: 8 }}>
                      Descartar
                    </button>
                  </div>
                ))}
                {rows.noShows.length === 0 ? <EmptyLine text="No hay no-shows reportados." /> : null}
              </div>
            </section>

            <section className="card" style={{ padding: 16 }}>
              <SectionTitle label="Fiabilidad" count={rows.reliability.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {rows.reliability.map((row) => {
                  const score = reliabilityScore({ noShows: row.noShows, cancellations: row.cancellations });
                  const tier = reliabilityTier(score);
                  return (
                    <div key={row.userId} style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ fontSize: 12 }}>{row.name}</strong>
                        <span style={{ color: tier.color, fontWeight: 950, fontSize: 11 }}>{score} · {tier.label}</span>
                      </div>
                      <div style={{ marginTop: 4, color: "var(--muted-fg)", fontSize: 11 }}>
                        {row.noShows} no-shows · {row.cancellations} cancelaciones
                      </div>
                      <button className="btn" disabled={pending} onClick={() => handleEditReliability(row)} style={{ marginTop: 8 }}>
                        Editar
                      </button>
                    </div>
                  );
                })}
                {rows.reliability.length === 0 ? <EmptyLine text="No hay contadores de fiabilidad todavía." /> : null}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <h2 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
        {label}
      </h2>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--muted-fg)", fontSize: 11 }}>
        <Icon name="activity" size={12} />
        {count}
      </span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div style={{ padding: 16, textAlign: "center", color: "var(--muted-fg)", fontSize: 12 }}>
      {text}
    </div>
  );
}
