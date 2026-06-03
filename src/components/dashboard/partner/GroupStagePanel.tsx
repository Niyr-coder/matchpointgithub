"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import {
  closeGroupStage,
  drawTournamentGroups,
  generateKnockoutFromGroups,
  reportGroupMatch,
} from "@/server/actions/tournament-group-stage";
import type { GroupStageSummary } from "@/server/actions/tournament-group-stage";

type Props = {
  tournamentId: string;
  acceptedCount: number;
  registrationLabels: Record<string, string>;
  initial: GroupStageSummary | null;
};

const STAGE_LABEL: Record<string, string> = {
  pending_groups: "Pendiente sorteo",
  group_stage: "Fase de grupos",
  group_complete: "Grupos cerrados",
  knockout: "Eliminatoria",
  complete: "Finalizada",
};

export function GroupStagePanel({
  tournamentId,
  acceptedCount,
  registrationLabels,
  initial,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [reportMatchId, setReportMatchId] = useState<string | null>(null);
  const [setsA, setSetsA] = useState("2");
  const [setsB, setSetsB] = useState("0");

  const summary = initial;
  const stage = summary?.stage ?? "pending_groups";

  const wrap = (key: string, fn: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(key);
    startTx(async () => {
      try {
        const res = (await fn()) as { ok: boolean; error?: { message: string } };
        if (res.ok) {
          toast({ icon: "check", title: ok });
          router.refresh();
        } else {
          toast({
            icon: "alert-triangle",
            title: "No se pudo",
            sub: res.error?.message ?? "Error",
          });
        }
      } finally {
        setBusy(null);
      }
    });
  };

  const onDraw = () =>
    wrap(
      "draw",
      () =>
        drawTournamentGroups({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Grupos sorteados y calendario generado",
    );

  const onCloseGroups = () =>
    wrap(
      "close",
      () =>
        closeGroupStage({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Fase de grupos cerrada",
    );

  const onKnockout = () =>
    wrap(
      "ko",
      () =>
        generateKnockoutFromGroups({
          tournamentId,
          categoryId: summary!.categoryId,
        }),
      "Cuadro final generado",
    );

  const onReport = (matchId: string) => {
    const a = Number(setsA);
    const b = Number(setsB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      toast({
        icon: "alert-triangle",
        title: "Marcador inválido",
        sub: "Indica sets ganados por cada lado (no pueden empatar).",
      });
      return;
    }
    const winnerSide = a > b ? "a" : "b";
    wrap(
      "report",
      () =>
        reportGroupMatch({
          tournamentId,
          matchId,
          winnerSide,
          score: { sets: [{ a, b }] },
        }),
      "Resultado registrado",
    );
    setReportMatchId(null);
  };

  if (!summary) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="label-mp">Fase de grupos</div>
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--muted-fg)" }}>
          Crea una categoría con config de grupos para este torneo.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="label-mp">Fase de grupos · {summary.categoryName}</div>
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted-fg)" }}>
            {summary.config.groupsCount} grupos · top {summary.config.advancePerGroup} por grupo ·{" "}
            {STAGE_LABEL[stage] ?? stage}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {stage === "pending_groups" && (
            <ActionBtn
              icon="shuffle"
              label="Sortear grupos"
              onClick={onDraw}
              loading={busy === "draw"}
              disabled={acceptedCount < summary.config.groupsCount}
              primary
            />
          )}
          {stage === "group_stage" && (
            <ActionBtn
              icon="lock"
              label="Cerrar fase de grupos"
              onClick={onCloseGroups}
              loading={busy === "close"}
              primary
            />
          )}
          {stage === "knockout" && (
            <Link href="/dashboard/partner/brackets" className="btn btn-primary" style={{ fontSize: 12 }}>
              Ver bracket en vivo
            </Link>
          )}
          {stage === "group_complete" && (
            <ActionBtn
              icon="trophy"
              label="Generar cuadro final"
              onClick={onKnockout}
              loading={busy === "ko"}
              primary
            />
          )}
        </div>
      </div>

      {stage === "pending_groups" && acceptedCount < summary.config.groupsCount && (
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#dc2626" }}>
          Necesitas al menos {summary.config.groupsCount} inscripciones aceptadas (tienes{" "}
          {acceptedCount}).
        </p>
      )}

      {summary.groups.length > 0 && (
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          {summary.groups.map((g) => (
            <div
              key={g.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  background: "var(--muted)",
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                Grupo {g.name}
              </div>
              <div style={{ padding: 14 }}>
                <div className="label-mp" style={{ marginBottom: 8 }}>
                  Tabla
                </div>
                <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted-fg)" }}>
                      <th style={{ padding: "4px 6px" }}>#</th>
                      <th style={{ padding: "4px 6px" }}>Equipo</th>
                      <th style={{ padding: "4px 6px" }}>PJ</th>
                      <th style={{ padding: "4px 6px" }}>G</th>
                      <th style={{ padding: "4px 6px" }}>P</th>
                      <th style={{ padding: "4px 6px" }}>Dif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.standings.map((row) => (
                      <tr key={row.registrationId}>
                        <td style={{ padding: "4px 6px", fontWeight: 900 }}>{row.rank}</td>
                        <td style={{ padding: "4px 6px" }}>
                          {registrationLabels[row.registrationId] ?? row.registrationId.slice(0, 8)}
                        </td>
                        <td style={{ padding: "4px 6px" }}>{row.played}</td>
                        <td style={{ padding: "4px 6px" }}>{row.wins}</td>
                        <td style={{ padding: "4px 6px" }}>{row.losses}</td>
                        <td style={{ padding: "4px 6px" }}>
                          {row.setsWon - row.setsLost}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {stage === "group_stage" && g.matches.length > 0 && (
                  <>
                    <div className="label-mp" style={{ margin: "14px 0 8px" }}>
                      Partidos
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {g.matches.map((m) => {
                        const done = m.status === "reported" || m.status === "confirmed";
                        const labelA =
                          registrationLabels[m.sideARegistrationId] ??
                          m.sideARegistrationId.slice(0, 8);
                        const labelB =
                          registrationLabels[m.sideBRegistrationId] ??
                          m.sideBRegistrationId.slice(0, 8);
                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10,
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              fontSize: 11.5,
                              flexWrap: "wrap",
                            }}
                          >
                            <span>
                              F{m.roundNo} · {labelA} vs {labelB}
                              {done && m.winnerSide && (
                                <span style={{ color: "var(--primary)", fontWeight: 800 }}>
                                  {" "}
                                  · {m.winnerSide === "a" ? labelA : labelB} gana
                                </span>
                              )}
                            </span>
                            {!done && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => {
                                  setReportMatchId(m.id);
                                  setSetsA("2");
                                  setSetsB("0");
                                }}
                              >
                                Reportar
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {reportMatchId && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16,
          }}
          onClick={() => setReportMatchId(null)}
        >
          <div
            className="card"
            style={{ padding: 20, width: "100%", maxWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="label-mp">Reportar resultado (sets ganados)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <label style={{ fontSize: 12 }}>
                Lado A
                <input
                  type="number"
                  min={0}
                  value={setsA}
                  onChange={(e) => setSetsA(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
              <label style={{ fontSize: 12 }}>
                Lado B
                <input
                  type="number"
                  min={0}
                  value={setsB}
                  onChange={(e) => setSetsB(e.target.value)}
                  style={{ width: "100%", marginTop: 4 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setReportMatchId(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy === "report"}
                onClick={() => onReport(reportMatchId)}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  loading,
  disabled,
  primary,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? "btn btn-primary" : "btn"}
      onClick={onClick}
      disabled={disabled || loading}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
    >
      <Icon name={icon} size={13} />
      {loading ? "…" : label}
    </button>
  );
}
