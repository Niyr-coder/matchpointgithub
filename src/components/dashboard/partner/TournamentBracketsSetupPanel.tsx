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
}: {
  tournamentId: string;
  categories: BracketSetupCategory[];
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTx] = useTransition();
  const [withThirdPlace, setWithThirdPlace] = useState(true);

  if (categories.length === 0) return null;

  const generate = async (cat: BracketSetupCategory) => {
    const ok = await confirm({
      title: `Generar llave · ${cat.name}`,
      body: `Se sortearán aleatoriamente las ${cat.acceptedCount} inscripciones aceptadas de esta categoría. ¿Continuar?`,
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
          return (
            <div
              key={cat.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
