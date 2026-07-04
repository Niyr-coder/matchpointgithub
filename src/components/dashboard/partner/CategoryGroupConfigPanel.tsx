"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { updateCategoryGroupConfig } from "@/server/actions/tournament-group-stage";
import { updateTournamentCategory } from "@/server/actions/tournaments";
import {
  previewGroupPlayoff,
  validateGroupPlayoffConfig,
  type GroupPlayoffConfig,
} from "@/lib/tournaments/group-stage";

export type GroupConfigCategoryRow = {
  id: string;
  name: string;
  stage: string;
  acceptedCount: number;
  maxTeams: number | null;
  config: GroupPlayoffConfig;
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "#fff",
  fontSize: 13,
  fontWeight: 600,
  color: "#0a0a0a",
  fontFamily: "inherit",
  outline: "none",
};

function defaultConfig(): GroupPlayoffConfig {
  return {
    groupsCount: 2,
    advancePerGroup: 2,
    drawMode: "auto",
    finalScoringOverride: null,
    wildcards: null,
    knockoutExtras: null,
  };
}

function parseConfig(raw: GroupPlayoffConfig): GroupPlayoffConfig {
  return {
    groupsCount: raw.groupsCount ?? 2,
    advancePerGroup: raw.advancePerGroup ?? 2,
    drawMode: raw.drawMode ?? "auto",
    finalScoringOverride: raw.finalScoringOverride ?? null,
    scheduling: raw.scheduling ?? null,
    wildcards: raw.wildcards ?? null,
    knockoutExtras: raw.knockoutExtras ?? null,
  };
}

export function CategoryGroupConfigPanel({
  tournamentId,
  categories,
  readOnly,
}: {
  tournamentId: string;
  categories: GroupConfigCategoryRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "");
  const active = categories.find((c) => c.id === activeId) ?? categories[0];

  const [groupsCount, setGroupsCount] = useState(String(active?.config.groupsCount ?? 2));
  const [advancePerGroup, setAdvancePerGroup] = useState(String(active?.config.advancePerGroup ?? 2));
  const [maxTeams, setMaxTeams] = useState(active?.maxTeams != null ? String(active.maxTeams) : "");
  const [finalBo5, setFinalBo5] = useState(!!active?.config.finalScoringOverride?.bestOf && active.config.finalScoringOverride.bestOf >= 5);
  const [bestThirds, setBestThirds] = useState(
    String(active?.config.wildcards?.mode === "best_thirds_global" ? active.config.wildcards.count : 0),
  );
  const [thirdPlaceMatch, setThirdPlaceMatch] = useState(
    !!active?.config.knockoutExtras?.thirdPlaceMatch,
  );
  const [drawMode, setDrawMode] = useState<"auto" | "manual">(
    active?.config.drawMode === "manual" ? "manual" : "auto",
  );
  const [saving, setSaving] = useState(false);

  const switchCategory = (c: GroupConfigCategoryRow) => {
    setActiveId(c.id);
    const cfg = parseConfig(c.config);
    setGroupsCount(String(cfg.groupsCount));
    setAdvancePerGroup(String(cfg.advancePerGroup));
    setMaxTeams(c.maxTeams != null ? String(c.maxTeams) : "");
    setFinalBo5(!!cfg.finalScoringOverride?.bestOf && cfg.finalScoringOverride.bestOf >= 5);
    setBestThirds(String(cfg.wildcards?.mode === "best_thirds_global" ? cfg.wildcards.count : 0));
    setThirdPlaceMatch(!!cfg.knockoutExtras?.thirdPlaceMatch);
    setDrawMode(cfg.drawMode === "manual" ? "manual" : "auto");
  };

  const draftConfig = useMemo((): GroupPlayoffConfig => {
    const wc = Number(bestThirds);
    return {
      groupsCount: Number(groupsCount) || 1,
      advancePerGroup: Number(advancePerGroup) || 1,
      drawMode,
      finalScoringOverride: finalBo5
        ? { type: "side_out", points: 11, winBy: 2, bestOf: 5 }
        : null,
      // Preservar la programación por cancha (se guarda aparte con
      // saveGroupStageScheduling); sin esto, guardar el formato la borraba.
      scheduling: active?.config.scheduling ?? null,
      wildcards:
        wc > 0 ? { mode: "best_thirds_global", count: wc } : null,
      knockoutExtras: thirdPlaceMatch ? { thirdPlaceMatch: true } : null,
    };
  }, [groupsCount, advancePerGroup, drawMode, finalBo5, bestThirds, thirdPlaceMatch, active]);

  const preview = useMemo(() => {
    if (!active) return null;
    return previewGroupPlayoff(draftConfig, active.acceptedCount);
  }, [draftConfig, active]);

  const validationError = useMemo(() => {
    if (!active) return null;
    return validateGroupPlayoffConfig(draftConfig, active.acceptedCount || 1);
  }, [draftConfig, active]);

  const locked = readOnly || !active;
  const structureLocked = readOnly || !active || active.stage !== "pending_groups";
  const postSorteo = !!(active && active.stage !== "pending_groups");

  const onSave = () => {
    if (!active || saving || locked) return;
    if (validationError) {
      toast({ icon: "alert-triangle", title: "Config inválida", sub: validationError, tone: "error" });
      return;
    }
    setSaving(true);
    startTx(async () => {
      const maxVal = maxTeams.trim() === "" ? null : Number(maxTeams);
      if (maxVal != null && maxVal < active.acceptedCount) {
        setSaving(false);
        toast({
          icon: "alert-triangle",
          title: "Cupos insuficientes",
          sub: `Hay ${active.acceptedCount} inscritos aceptados; el cupo no puede ser menor.`,
          tone: "error",
        });
        return;
      }

      const cfgRes = await updateCategoryGroupConfig({
        tournamentId,
        categoryId: active.id,
        config: draftConfig,
      });
      if (!cfgRes.ok) {
        setSaving(false);
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: cfgRes.error.message, tone: "error" });
        return;
      }

      if (maxVal !== active.maxTeams) {
        const catRes = await updateTournamentCategory({
          tournamentId,
          categoryId: active.id,
          body: { maxTeams: maxVal },
        });
        if (!catRes.ok) {
          setSaving(false);
          toast({ icon: "alert-triangle", title: "Cupos no actualizados", sub: catRes.error.message, tone: "error" });
          return;
        }
      }

      setSaving(false);
      toast({ icon: "check", title: "Formato competitivo guardado" });
      router.refresh();
    });
  };

  if (categories.length === 0) return null;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ marginBottom: 14 }}>
        <div className="label-mp">Formato competitivo</div>
        <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.5 }}>
          Configura grupos y clasificación por categoría. Los grupos y clasificados solo son editables antes del sorteo; las opciones de llave (mejor tercero, bronce) se pueden cambiar en cualquier momento.
        </div>
      </div>

      {categories.length > 1 && (
        <div className="mp-touch-hscroll" style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`btn${c.id === active?.id ? " btn-primary" : ""}`}
              style={
                c.id === active?.id
                  ? undefined
                  : { background: "#fff", border: "1px solid var(--border)" }
              }
              onClick={() => switchCategory(c)}
            >
              {c.name}
              {c.stage !== "pending_groups" && (
                <span style={{ marginLeft: 6, opacity: 0.75, fontSize: 10 }}>· sorteado</span>
              )}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              marginBottom: 14,
              fontSize: 11,
              color: "var(--muted-fg)",
            }}
          >
            <span>
              <b style={{ color: "#0a0a0a" }}>{active.acceptedCount}</b> inscritos aceptados
            </span>
            <span>·</span>
            <span>
              Etapa:{" "}
              <b style={{ color: "#0a0a0a" }}>
                {active.stage === "pending_groups" ? "Sin sortear" : active.stage}
              </b>
            </span>
          </div>

          <div className="mp-tournament-form-grid-2" style={{ gap: 12 }}>
            <Field label="Número de grupos">
              <input
                type="number"
                min={1}
                max={16}
                value={groupsCount}
                disabled={structureLocked}
                onChange={(e) => setGroupsCount(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Clasifican por grupo">
              <input
                type="number"
                min={1}
                max={16}
                value={advancePerGroup}
                disabled={structureLocked}
                onChange={(e) => setAdvancePerGroup(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Cupos (maxTeams)">
              <input
                type="number"
                min={1}
                value={maxTeams}
                disabled={structureLocked}
                onChange={(e) => setMaxTeams(e.target.value)}
                placeholder="Sin límite"
                style={inputStyle}
              />
            </Field>
            <Field
              label="Mejores terceros globales"
              hint="Cuántos 3.º de grupo entran a la llave por ranking global (como los mejores terceros en un Mundial). 0 = solo pasan los de arriba en cada grupo."
            >
              <input
                type="number"
                min={0}
                max={16}
                value={bestThirds}
                disabled={locked}
                onChange={(e) => setBestThirds(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="label-mp" style={{ marginBottom: 8 }}>
              Armado de grupos
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["auto", "manual"] as const).map((mode) => {
                const on = drawMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={structureLocked}
                    onClick={() => setDrawMode(mode)}
                    className={`btn${on ? " btn-primary" : ""}`}
                    style={
                      on
                        ? { flex: 1 }
                        : { flex: 1, background: "#fff", border: "1px solid var(--border)" }
                    }
                  >
                    {mode === "auto" ? "Sorteo automático" : "Asignar a mano"}
                  </button>
                );
              })}
            </div>
            <span
              style={{
                display: "block",
                fontSize: 10.5,
                color: "var(--muted-fg)",
                lineHeight: 1.45,
                marginTop: 6,
              }}
            >
              {drawMode === "auto"
                ? "Las parejas se reparten al azar en grupos parejos (comportamiento por defecto)."
                : "Tú decides qué pareja va a cada grupo desde Operación. Permite grupos de distinto tamaño."}
            </span>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="label-mp" style={{ marginBottom: 8 }}>
              Eliminatoria
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, cursor: locked ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={finalBo5}
                  disabled={locked}
                  onChange={(e) => setFinalBo5(e.target.checked)}
                  style={{ accentColor: "var(--primary)", marginTop: 2 }}
                />
                <span>
                  Final al best of 5
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.4 }}>
                    Solo la final del cuadro; el resto sigue la regla del torneo.
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, cursor: locked ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={thirdPlaceMatch}
                  disabled={locked}
                  onChange={(e) => setThirdPlaceMatch(e.target.checked)}
                  style={{ accentColor: "var(--primary)", marginTop: 2 }}
                />
                <span>
                  Partido de bronce (3.º y 4.º del torneo)
                  <span style={{ display: "block", fontSize: 11, color: "var(--muted-fg)", marginTop: 2, lineHeight: 1.4 }}>
                    Perdedores de semifinal juegan por el podio. No es lo mismo que los mejores terceros de grupo.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {preview && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 10,
                background: "var(--muted)",
                fontSize: 11.5,
                lineHeight: 1.55,
                color: "var(--muted-fg)",
              }}
            >
              {active.acceptedCount > 0 ? (
                <>
                  Con <b style={{ color: "#0a0a0a" }}>{active.acceptedCount}</b> inscritos → grupos de{" "}
                  <b style={{ color: "#0a0a0a" }}>
                    {preview.minGroupSize === preview.maxGroupSize
                      ? preview.minGroupSize
                      : `${preview.minGroupSize}–${preview.maxGroupSize}`}
                  </b>{" "}
                  equipos · pasan <b style={{ color: "#0a0a0a" }}>{draftConfig.advancePerGroup}</b> por grupo
                  {preview.wildcardCount > 0 && (
                    <>
                      {" "}
                      +{" "}
                      <b style={{ color: "#0a0a0a" }}>
                        {preview.wildcardCount}
                      </b>{" "}
                      {preview.wildcardCount === 1 ? "mejor tercero" : "mejores terceros"} global
                      {preview.wildcardCount === 1 ? "" : "es"}
                    </>
                  )}{" "}
                  → <b style={{ color: "#0a0a0a" }}>{preview.qualified}</b> en llave
                  {preview.byes > 0 && (
                    <>
                      {" "}
                      (cuadro de {preview.bracketSize} con {preview.byes} bye{preview.byes === 1 ? "" : "s"})
                    </>
                  )}
                  {thirdPlaceMatch && preview.qualified >= 4 && (
                    <>
                      {" "}
                      · incluye partido de bronce tras semifinal
                    </>
                  )}
                  .
                </>
              ) : (
                "Aún no hay inscritos aceptados; el preview se actualizará cuando confirmes inscripciones."
              )}
            </div>
          )}

          {postSorteo && (
            <div
              style={{
                marginTop: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: "#fef3c7",
                border: "1px solid #f59e0b",
                fontSize: 11,
                color: "#92400e",
                lineHeight: 1.5,
              }}
            >
              El cuadro ya fue generado. Puedes cambiar las opciones de llave (mejor tercero, bronce), pero necesitarás regenerar el cuadro desde Operación para que surtan efecto.
            </div>
          )}

          {validationError && !locked && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#dc2626" }}>{validationError}</div>
          )}

          {!locked && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || !!validationError}
                onClick={onSave}
              >
                <Icon name="check" size={13} color="#fff" />
                {saving ? "Guardando…" : "Guardar formato"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--muted-fg)",
        }}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span style={{ fontSize: 10.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>{hint}</span>
      ) : null}
    </label>
  );
}
