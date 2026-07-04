"use client";

// Llaves por categoría (setup, tab Operación). Generar el bracket es una
// acción de configuración del torneo, así que vive aquí — junto a sortear
// grupos y el cronograma — y NO en p-brackets, que es visualización y
// reporte en vivo. Cada categoría sortea su propia llave con sus inscritos.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import { generateBracket } from "@/server/actions/tournaments";
import { listCategoryAcceptedRegistrationIds } from "@/server/actions/tournament-group-stage";

const STAGE_LABEL: Record<string, string> = {
  pending_groups: "Sin llave",
  group_stage: "Fase de grupos",
  group_complete: "Grupos cerrados",
  knockout: "Eliminatoria",
  complete: "Finalizada",
};

export type BracketSetupCategory = {
  id: string;
  name: string;
  stage: string | null;
  acceptedCount: number;
  hasBracket: boolean;
};

export function TournamentBracketsSetupPanel({
  tournamentId,
  categories,
  registrationLabels = {},
}: {
  tournamentId: string;
  categories: BracketSetupCategory[];
  registrationLabels?: Record<string, string>;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTx] = useTransition();
  const [withThirdPlace, setWithThirdPlace] = useState(true);
  // Editor de semillas (Opción C): categoría abierta + orden actual.
  const [seedCatId, setSeedCatId] = useState<string | null>(null);
  const [seedIds, setSeedIds] = useState<string[] | null>(null);

  if (categories.length === 0) return null;

  const generate = async (cat: BracketSetupCategory) => {
    const ok = await confirm({
      title: `Generar llave · ${cat.name}`,
      body: `Se sembrarán por ranking (MPR) las ${cat.acceptedCount} inscripciones aceptadas de esta categoría. ¿Continuar?`,
      confirmLabel: "Generar",
    });
    if (!ok) return;
    startTx(async () => {
      const res = await generateBracket({
        tournamentId,
        categoryId: cat.id,
        thirdPlaceMatch: withThirdPlace,
      });
      if (res.ok) {
        toast({ icon: "check", title: `Llave de ${cat.name} generada` });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: res.error.message, tone: "error" });
      }
    });
  };

  const openSeedEditor = async (cat: BracketSetupCategory) => {
    setSeedCatId(cat.id);
    setSeedIds(null);
    const res = await listCategoryAcceptedRegistrationIds({ tournamentId, categoryId: cat.id });
    if (res.ok) setSeedIds(res.data.registrationIds);
    else {
      toast({ icon: "alert-triangle", title: "No se pudo cargar", sub: res.error.message, tone: "error" });
      setSeedCatId(null);
    }
  };

  const moveSeed = (index: number, dir: -1 | 1) => {
    setSeedIds((prev) => {
      if (!prev) return prev;
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const generateManual = (cat: BracketSetupCategory) => {
    if (!seedIds || seedIds.length < 2) return;
    startTx(async () => {
      const res = await generateBracket({
        tournamentId,
        categoryId: cat.id,
        thirdPlaceMatch: withThirdPlace,
        manualSeeds: seedIds,
      });
      if (res.ok) {
        toast({ icon: "check", title: `Llave de ${cat.name} generada con tu orden` });
        setSeedCatId(null);
        setSeedIds(null);
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo", sub: res.error.message, tone: "error" });
      }
    });
  };

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="git-branch" size={14} />
          <span className="label-mp" style={{ margin: 0 }}>
            Llaves por categoría
          </span>
        </div>
        <Link
          href={`/dashboard/partner/p-brackets?tid=${tournamentId}`}
          style={{ fontSize: 12, fontWeight: 800, color: "var(--primary)", textDecoration: "none" }}
        >
          Ver brackets →
        </Link>
      </div>
      <p style={{ margin: "4px 0 10px", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
        Cada categoría sortea su propia llave con sus inscripciones aceptadas.
        Los resultados se reportan desde la pantalla Brackets o el monitor de cancha.
      </p>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 700,
          color: "var(--muted-fg)",
          marginBottom: 12,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={withThirdPlace}
          onChange={(e) => setWithThirdPlace(e.target.checked)}
          style={{ accentColor: "var(--primary)" }}
        />
        Incluir partido por el 3er puesto (cuadros de 4+; con 3 inscritos el 3° sale
        del perdedor de la semifinal)
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {categories.map((cat) => {
          const canGenerate = !cat.hasBracket && cat.acceptedCount >= 2;
          const editing = seedCatId === cat.id;
          return (
            <div
              key={cat.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 900 }}>{cat.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                    {cat.acceptedCount} inscrito{cat.acceptedCount === 1 ? "" : "s"} aceptado{cat.acceptedCount === 1 ? "" : "s"}
                    {cat.stage ? ` · ${STAGE_LABEL[cat.stage] ?? cat.stage}` : ""}
                  </div>
                </div>
                {cat.hasBracket ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: "#16a34a",
                    }}
                  >
                    <Icon name="check" size={12} color="#16a34a" />
                    Llave generada
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={pending || !canGenerate}
                      title={
                        !canGenerate
                          ? "Necesitas al menos 2 inscripciones aceptadas en esta categoría"
                          : undefined
                      }
                      onClick={() => generate(cat)}
                      style={{ fontSize: 12, padding: "8px 14px" }}
                    >
                      <Icon name="trophy" size={12} color="#fff" />
                      Generar llave
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={pending || !canGenerate}
                      onClick={() => (editing ? setSeedCatId(null) : openSeedEditor(cat))}
                      style={{
                        fontSize: 12,
                        padding: "8px 14px",
                        background: "#fff",
                        border: "1px solid var(--border)",
                      }}
                    >
                      {editing ? "Cerrar" : "Sembrar a mano"}
                    </button>
                  </div>
                )}
              </div>

              {editing && !cat.hasBracket && (
                <div style={{ borderTop: "1px dashed var(--border)", paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--muted-fg)", lineHeight: 1.5, marginBottom: 8 }}>
                    Ordena las semillas: el <b>#1</b> es el cabeza de serie (los byes caen en los
                    primeros). El resto arma el cuadro estándar.
                  </div>
                  {seedIds === null ? (
                    <p style={{ fontSize: 12, color: "var(--muted-fg)" }}>Cargando inscripciones…</p>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {seedIds.map((id, i) => (
                          <div
                            key={id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 8px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--muted)",
                            }}
                          >
                            <span
                              style={{
                                width: 22,
                                textAlign: "center",
                                fontSize: 12,
                                fontWeight: 900,
                                color: "var(--primary)",
                              }}
                            >
                              {i + 1}
                            </span>
                            <span
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontSize: 12,
                                fontWeight: 600,
                                color: "#0a0a0a",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={registrationLabels[id] ?? "Equipo sin nombre"}
                            >
                              {registrationLabels[id] ?? "Equipo sin nombre"}
                            </span>
                            <button
                              type="button"
                              aria-label="Subir"
                              disabled={i === 0 || pending}
                              onClick={() => moveSeed(i, -1)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                background: "#fff",
                                cursor: i === 0 || pending ? "default" : "pointer",
                                opacity: i === 0 ? 0.4 : 1,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon name="arrow-up" size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label="Bajar"
                              disabled={i === seedIds.length - 1 || pending}
                              onClick={() => moveSeed(i, 1)}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 6,
                                border: "1px solid var(--border)",
                                background: "#fff",
                                cursor: i === seedIds.length - 1 || pending ? "default" : "pointer",
                                opacity: i === seedIds.length - 1 ? 0.4 : 1,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Icon name="arrow-down" size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn"
                          disabled={pending}
                          onClick={() => {
                            setSeedCatId(null);
                            setSeedIds(null);
                          }}
                          style={{ background: "#fff", border: "1px solid var(--border)" }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={pending || seedIds.length < 2}
                          onClick={() => generateManual(cat)}
                        >
                          <Icon name="trophy" size={12} color="#fff" />
                          Generar con este orden
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
