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
    finalScoringOverride: null,
    wildcards: null,
    knockoutExtras: null,
  };
}

function parseConfig(raw: GroupPlayoffConfig): GroupPlayoffConfig {
  return {
    groupsCount: raw.groupsCount ?? 2,
    advancePerGroup: raw.advancePerGroup ?? 2,
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
  };

  const draftConfig = useMemo((): GroupPlayoffConfig => {
    const wc = Number(bestThirds);
    return {
      groupsCount: Number(groupsCount) || 1,
      advancePerGroup: Number(advancePerGroup) || 1,
      finalScoringOverride: finalBo5
        ? { type: "side_out", points: 11, winBy: 2, bestOf: 5 }
        : null,
      wildcards:
        wc > 0 ? { mode: "best_thirds_global", count: wc } : null,
      knockoutExtras: thirdPlaceMatch ? { thirdPlaceMatch: true } : null,
    };
  }, [groupsCount, advancePerGroup, finalBo5, bestThirds, thirdPlaceMatch]);

  const preview = useMemo(() => {
    if (!active) return null;
    return previewGroupPlayoff(draftConfig, active.acceptedCount);
  }, [draftConfig, active]);

  const validationError = useMemo(() => {
    if (!active) return null;
    return validateGroupPlayoffConfig(draftConfig, active.acceptedCount || 1);
  }, [draftConfig, active]);

  const locked = readOnly || !active || active.stage !== "pending_groups";

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
          Configura grupos y clasificación por categoría. Solo editable antes del sorteo de grupos.
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
                disabled={locked}
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
                disabled={locked}
                onChange={(e) => setAdvancePerGroup(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Cupos (maxTeams)">
              <input
                type="number"
                min={1}
                value={maxTeams}
                disabled={locked}
                onChange={(e) => setMaxTeams(e.target.value)}
                placeholder="Sin límite"
                style={inputStyle}
              />
            </Field>
            <Field label="Mejores 3.º globales">
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

          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: locked ? "default" : "pointer" }}>
              <input
                type="checkbox"
                checked={finalBo5}
                disabled={locked}
                onChange={(e) => setFinalBo5(e.target.checked)}
                style={{ accentColor: "var(--primary)" }}
              />
              Final al best of 5
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: locked ? "default" : "pointer" }}>
              <input
                type="checkbox"
                checked={thirdPlaceMatch}
                disabled={locked}
                onChange={(e) => setThirdPlaceMatch(e.target.checked)}
                style={{ accentColor: "var(--primary)" }}
              />
              Partido por el 3er puesto (perdedores de semifinales)
            </label>
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
                      + <b style={{ color: "#0a0a0a" }}>{preview.wildcardCount}</b> mejores 3.º
                    </>
                  )}{" "}
                  → <b style={{ color: "#0a0a0a" }}>{preview.qualified}</b> en llave
                  {preview.byes > 0 && (
                    <>
                      {" "}
                      (cuadro de {preview.bracketSize} con {preview.byes} bye{preview.byes === 1 ? "" : "s"})
                    </>
                  )}
                  .
                </>
              ) : (
                "Aún no hay inscritos aceptados; el preview se actualizará cuando confirmes inscripciones."
              )}
            </div>
          )}

          {validationError && !locked && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#dc2626" }}>{validationError}</div>
          )}

          {locked && active.stage !== "pending_groups" && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--muted-fg)" }}>
              La config quedó bloqueada tras el sorteo de grupos.
            </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
    </label>
  );
}
