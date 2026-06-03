"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import {
  podiumRankLabel,
  quedadaFormatLabel,
  type QuedadaProfileStats,
} from "@/lib/quedadas/profile-stats";

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--muted)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <div className="label-mp" style={{ color: "var(--muted-fg)", fontSize: 9 }}>
        {label}
      </div>
      <div
        className="font-heading tabular"
        style={{ fontWeight: 900, fontSize: 22, letterSpacing: "-0.03em", marginTop: 4 }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ marginTop: 2, fontSize: 11, color: "var(--muted-fg)" }}>{sub}</div>
      ) : null}
    </div>
  );
}

export type QuedadaPlayerStatsPanelProps = {
  stats: QuedadaProfileStats | null;
  /** Perfil propio vs ajeno */
  scope?: "mine" | "public";
  /** Dónde se monta (copy del empty / links) */
  surface?: "profile" | "quedadas";
  playerFirstName?: string;
  defaultOpen?: boolean;
  /** accordion = card colapsable; plain = cuerpo siempre visible (p. ej. tab Actividad) */
  variant?: "accordion" | "plain";
};

export function QuedadaPlayerStatsPanel({
  stats,
  scope = "mine",
  surface = "profile",
  playerFirstName = "Jugador",
  defaultOpen,
  variant = "accordion",
}: QuedadaPlayerStatsPanelProps) {
  const isMine = scope === "mine";
  const hasData = (stats?.finishedCount ?? 0) > 0 || (stats?.activeCount ?? 0) > 0;
  const isPlain = variant === "plain";
  const [open, setOpen] = useState(defaultOpen ?? (isMine && hasData));
  const expanded = isPlain || open;

  const title =
    surface === "quedadas"
      ? "Tu actividad"
      : isMine
        ? "Tus quedadas"
        : `Quedadas de ${playerFirstName}`;
  const subtitle =
    surface === "quedadas"
      ? "Podios, rachas y rendimiento en quedadas finalizadas"
      : isMine
        ? "Podios, rachas y partidos en juego social"
        : "Actividad en quedadas finalizadas";

  const body = (
        <div style={{ padding: isPlain ? "20px" : "0 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!hasData ? (
            <div
              style={{
                padding: "16px 14px",
                borderRadius: 10,
                background: "var(--muted)",
                border: "1px dashed var(--border)",
                textAlign: "center",
              }}
            >
              <Icon name="users-round" size={22} color="var(--muted-fg)" />
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, marginTop: 8 }}>
                {isMine ? "Aún sin historial" : "Sin historial visible"}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 4, lineHeight: 1.45 }}>
                {isMine
                  ? surface === "quedadas"
                    ? "Cuando cierren quedadas donde hayas jugado, verás podios y rachas aquí."
                    : "Cuando juegues y cierren quedadas, verás podios, rachas y partidos aquí."
                  : "Este jugador aún no tiene quedadas finalizadas registradas."}
              </div>
              {isMine && surface === "profile" ? (
                <Link
                  href="/dashboard/user/quedadas"
                  className="btn btn-outline"
                  style={{ marginTop: 12, fontSize: 11 }}
                >
                  Explorar quedadas
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))",
                  gap: 10,
                }}
              >
                <Kpi label="Finalizadas" value={String(stats!.finishedCount)} />
                <Kpi
                  label="Podios"
                  value={String(stats!.podiums.total)}
                  sub={
                    stats!.podiums.total > 0
                      ? `${stats!.podiums.first} oro · ${stats!.podiums.second} plata · ${stats!.podiums.third} bronce`
                      : undefined
                  }
                />
                <Kpi
                  label="Racha podio"
                  value={stats!.podiumStreak > 0 ? String(stats!.podiumStreak) : "—"}
                  sub={stats!.podiumStreak > 1 ? "quedadas seguidas top 3" : undefined}
                />
                <Kpi
                  label="Racha victorias"
                  value={stats!.winStreak > 0 ? String(stats!.winStreak) : "—"}
                  sub={stats!.winStreak > 0 ? "partidos en quedadas" : undefined}
                />
                <Kpi
                  label="Win rate"
                  value={stats!.gamesPlayed > 0 ? `${stats!.gameWinRate}%` : "—"}
                  sub={
                    stats!.gamesPlayed > 0
                      ? `${stats!.gameWins}/${stats!.gamesPlayed} partidos`
                      : undefined
                  }
                />
                {(stats!.activeCount ?? 0) > 0 ? (
                  <Kpi label="En curso" value={String(stats!.activeCount)} sub="inscripciones activas" />
                ) : null}
              </div>

              {stats!.recent.length > 0 ? (
                <div>
                  <span className="label-mp" style={{ color: "var(--muted-fg)" }}>
                    RECIENTES
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {stats!.recent.map((q) => {
                      const rank = podiumRankLabel(q.finalRank);
                      const isPodium = q.finalRank != null && q.finalRank <= 3;
                      const date = new Date(q.finishedAt);
                      const dateLabel = Number.isNaN(date.getTime())
                        ? "—"
                        : date.toLocaleDateString("es-EC", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          });
                      return (
                        <div
                          key={q.quedadaId}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto",
                            gap: 12,
                            alignItems: "center",
                            padding: "10px 12px",
                            borderRadius: 10,
                            background: isPodium ? "rgba(16,185,129,0.06)" : "var(--muted)",
                            border: `1px solid ${isPodium ? "rgba(16,185,129,0.18)" : "var(--border)"}`,
                          }}
                        >
                          <div
                            className="font-heading tabular"
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 900,
                              fontSize: rank === "1°" ? 16 : 13,
                              background: isPodium ? "rgba(16,185,129,0.12)" : "var(--border)",
                              color: isPodium ? "var(--color-mp-primary-active)" : "var(--muted-fg)",
                            }}
                          >
                            {rank ?? "—"}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {q.title}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                              {quedadaFormatLabel(q.format)} · {dateLabel}
                              {q.gamesPlayed > 0 ? ` · ${q.gameWins}G/${q.gamesPlayed}PJ` : ""}
                            </div>
                          </div>
                          {isMine ? (
                            <Link
                              href={`/dashboard/user/quedada/${q.quedadaId}`}
                              style={{
                                fontSize: 11,
                                color: "var(--color-mp-primary-active)",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                                textDecoration: "none",
                              }}
                            >
                              Ver
                            </Link>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {isMine && surface === "profile" ? (
                <Link
                  href="/dashboard/user/quedadas"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--color-mp-primary-active)",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  <Icon name="arrow-right" size={14} />
                  Ir a quedadas
                </Link>
              ) : null}
              {isMine && surface === "quedadas" ? (
                <Link
                  href="/dashboard/user/perfil"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--color-mp-primary-active)",
                    fontWeight: 800,
                    textDecoration: "none",
                  }}
                >
                  <Icon name="user" size={14} />
                  Ver en tu perfil
                </Link>
              ) : null}
            </>
          )}
        </div>
  );

  if (isPlain) {
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <span className="label-mp" style={{ color: "var(--muted-fg)" }}>
            {surface === "quedadas" ? "RENDIMIENTO" : "JUEGO SOCIAL"}
          </span>
          <div className="card-title" style={{ fontSize: 17, marginTop: 2 }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>{subtitle}</div>
        </div>
        {body}
      </div>
    );
  }

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: "hidden", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "16px 20px",
          border: 0,
          background: "transparent",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "inherit",
        }}
      >
        <div>
          <span className="label-mp" style={{ color: "var(--muted-fg)" }}>
            {surface === "quedadas" ? "RENDIMIENTO" : "JUEGO SOCIAL"}
          </span>
          <div className="card-title" style={{ fontSize: 17, marginTop: 2 }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-fg)", marginTop: 2 }}>{subtitle}</div>
        </div>
        <Icon name={expanded ? "chevron-up" : "chevron-down"} size={18} color="var(--muted-fg)" />
      </button>

      {expanded ? body : null}
    </div>
  );
}
