// Client view de PartnerBracketsScreen — multi-categoría con acordeón colapsable.
"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast, TOAST_SCORE_MS } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { generateBracket } from "@/server/actions/tournaments";
import { reportBracketMatch, correctBracketMatch } from "@/server/actions/tournament-group-stage";
import { REALTIME_DEBOUNCE } from "@/lib/realtime/debounce";
import { BracketView, type BracketNode } from "../brackets/BracketView";

export type BracketMatch = {
  id: string;
  a: string;
  b: string;
  sa: number | string;
  sb: number | string;
  w?: "a" | "b";
  live?: boolean;
  status: string;
  reportable: boolean;
  correctable: boolean;
};

export type BracketCategorySection = {
  categoryId: string | null;
  categoryName: string | null;
  stage: string | null;
  canGenerateRandomBracket: boolean;
  hasBracket: boolean;
  columns: { label: string; matches: BracketMatch[] }[];
  championLabel: string;
  championWhen: string;
  finalHasWinner?: boolean;
  thirdPlaceMatch?: BracketMatch | null;
};

export type BracketsData = {
  partnerId: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentSlug: string | null;
  displayToken: string | null;
  tournamentFormat: string;
  categories: BracketCategorySection[];
};

const STAGE_LABEL: Record<string, string> = {
  pending_groups: "Sin sortear",
  group_stage: "Fase de grupos",
  group_complete: "Grupos cerrados",
  knockout: "Eliminatoria",
  complete: "Finalizado",
};

type MatchOptimistic = Pick<
  BracketMatch,
  "sa" | "sb" | "w" | "status" | "reportable" | "correctable"
>;

function findBracketMatch(data: BracketsData, matchId: string): BracketMatch | null {
  for (const cat of data.categories) {
    if (cat.thirdPlaceMatch?.id === matchId) return cat.thirdPlaceMatch;
    for (const col of cat.columns) {
      const m = col.matches.find((x) => x.id === matchId);
      if (m) return m;
    }
  }
  return null;
}

function withOptimistic(m: BracketMatch, patch: MatchOptimistic | undefined): BracketMatch {
  if (!patch) return m;
  return { ...m, ...patch };
}

function toNode(m: BracketMatch, placeholder: boolean): BracketNode {
  return {
    id: m.id,
    a: { label: m.a, score: m.sa, isWinner: m.w === "a" },
    b: { label: m.b, score: m.sb, isWinner: m.w === "b" },
    live: m.live,
    reportable: !placeholder && m.reportable,
    correctable: !placeholder && m.correctable,
    dimmed: placeholder,
  };
}

export function PartnerBracketsScreenView({ data }: { data: BracketsData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [optimistic, setOptimistic] = useState<Record<string, MatchOptimistic>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const skipRealtimeUntil = useRef(0);

  const [openCats, setOpenCats] = useState<Set<string>>(() =>
    new Set(data.categories.map((c, i) => c.categoryId ?? `__no_cat_${i}`)),
  );

  const toggleCat = (key: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Limpia parches cuando el server ya reflejó el mismo marcador.
  useEffect(() => {
    setOptimistic((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const id of Object.keys(prev)) {
        const server = findBracketMatch(data, id);
        if (!server) continue;
        const patch = prev[id];
        if (
          (server.status === "reported" || server.status === "confirmed") &&
          String(server.sa) === String(patch.sa) &&
          String(server.sb) === String(patch.sb)
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [data]);

  const syncFromServer = useCallback(() => {
    startTx(() => router.refresh());
  }, [router, startTx]);

  // Relevancia client-side: bracket_matches no tiene tournament_id, así que
  // sin este guard cada score de CUALQUIER torneo de la plataforma refrescaba
  // esta pantalla (audit de costos 2026-07-01). UPDATEs se validan contra los
  // match ids visibles; INSERTs (generación de llave) son raros → fail-open.
  const knownMatchIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cat of data.categories) {
      for (const col of cat.columns) for (const m of col.matches) ids.add(m.id);
      if (cat.thirdPlaceMatch) ids.add(cat.thirdPlaceMatch.id);
    }
    return ids;
  }, [data.categories]);
  const knownMatchIdsRef = useRef(knownMatchIds);
  knownMatchIdsRef.current = knownMatchIds;
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
  }, []);

  useRealtimeRefresh(
    data.partnerId
      ? [
          // Con torneo activo, el CDC filtra server-side (tournament_id
          // denormalizado, mig 20260715000000); el guard de match ids queda
          // como cinturón para la vista sin tid.
          {
            table: "bracket_matches",
            ...(data.tournamentId ? { filter: `tournament_id=eq.${data.tournamentId}` } : {}),
          },
          {
            table: "brackets",
            ...(data.tournamentId ? { filter: `tournament_id=eq.${data.tournamentId}` } : {}),
          },
        ]
      : [],
    {
      enabled: !!data.partnerId,
      onChange: (table, payload) => {
        if (Date.now() < skipRealtimeUntil.current) return;
        if (table === "bracket_matches" && payload.eventType !== "INSERT") {
          const rowId = (payload.new?.id ?? payload.old?.id) as string | undefined;
          if (rowId && !knownMatchIdsRef.current.has(rowId)) return;
        }
        if (table === "brackets" && data.tournamentId) {
          const tid = payload.new?.tournament_id as string | undefined;
          if (tid && tid !== data.tournamentId) return;
        }
        if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
        realtimeTimer.current = setTimeout(syncFromServer, REALTIME_DEBOUNCE.LIVE);
      },
    },
  );

  // Categorías con optimistic aplicado
  const mergedCategories = useMemo(
    () =>
      data.categories.map((cat) => ({
        ...cat,
        columns: cat.columns.map((col) => ({
          ...col,
          matches: col.matches.map((m) => withOptimistic(m, optimistic[m.id])),
        })),
        thirdPlaceMatch: cat.thirdPlaceMatch
          ? withOptimistic(cat.thirdPlaceMatch, optimistic[cat.thirdPlaceMatch.id])
          : null,
      })),
    [data.categories, optimistic],
  );

  const hasAnyBracket = data.categories.some((c) => c.hasBracket);
  const labelTag = data.tournamentName
    ? `Partner · Brackets · ${data.tournamentName}`
    : "Partner · Brackets";

  const submitScore = (matchId: string, a: number, b: number) => {
    if (!data.tournamentId || savingIds.has(matchId)) return;
    if (a === b) {
      toast({
        icon: "alert-triangle",
        title: "Marcador inválido",
        sub: "Indica sets ganados por cada lado (no pueden empatar).",
        tone: "error",
      });
      return;
    }

    const serverRow = findBracketMatch(data, matchId);
    const mergedRow = serverRow ? withOptimistic(serverRow, optimistic[matchId]) : null;
    const isCorrection = mergedRow?.correctable ?? false;
    const winnerSide = (a > b ? "a" : "b") as "a" | "b";

    const patch: MatchOptimistic = {
      sa: a,
      sb: b,
      w: winnerSide,
      status: "reported",
      reportable: false,
      correctable: true,
    };

    setOptimistic((prev) => ({ ...prev, [matchId]: patch }));
    setSavingIds((prev) => new Set(prev).add(matchId));
    skipRealtimeUntil.current = Date.now() + 2500;

    startTx(async () => {
      const payload = {
        tournamentId: data.tournamentId!,
        matchId,
        winnerSide,
        score: { sets: [{ a, b }] },
      };
      try {
        const res = isCorrection
          ? await correctBracketMatch(payload)
          : await reportBracketMatch(payload);
        if (res.ok) {
          toast({
            icon: "check",
            title: isCorrection ? "Marcador corregido" : "Resultado registrado",
            durationMs: TOAST_SCORE_MS,
          });
          syncFromServer();
        } else {
          setOptimistic((prev) => {
            const next = { ...prev };
            delete next[matchId];
            return next;
          });
          toast({
            icon: "alert-triangle",
            title: "No se pudo",
            sub: res.error.message,
            tone: "error",
          });
        }
      } finally {
        setSavingIds((prev) => {
          const next = new Set(prev);
          next.delete(matchId);
          return next;
        });
      }
    });
  };

  const copyShare = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ icon: "check", title: `${label} copiado` });
    } catch {
      toast({ icon: "alert-triangle", title: "No se pudo copiar", tone: "error" });
    }
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = data.tournamentSlug ? `${origin}/eventos/${data.tournamentSlug}` : null;
  const liveUrl =
    data.tournamentSlug && data.displayToken
      ? `${origin}/t/${data.tournamentSlug}/live?k=${data.displayToken}`
      : null;

  const showCategoryHeaders = mergedCategories.length > 1 || mergedCategories[0]?.categoryName !== null;

  return (
    <>
      <RSHeader
        label={labelTag}
        title="Bracket en vivo"
        action={
          <button
            className="btn btn-primary"
            disabled={!hasAnyBracket}
            onClick={() => {
              if (liveUrl) copyShare(liveUrl, "Link pantalla TV");
              else if (publicUrl) copyShare(publicUrl, "Link público");
            }}
          >
            <Icon name="share-2" size={13} color="#fff" />
            Compartir
          </button>
        }
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {mergedCategories.map((cat, idx) => {
          const catKey = cat.categoryId ?? `__no_cat_${idx}`;
          const isOpen = openCats.has(catKey);
          const bracketCols = cat.columns.map((col) => ({
            label: col.label,
            matches: col.matches.map((m) => toNode(m, !cat.hasBracket)),
          }));

          return (
            <div key={catKey}>
              {showCategoryHeaders && (
                <button
                  type="button"
                  onClick={() => toggleCat(catKey)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 16px",
                    background: "var(--muted)",
                    border: "1px solid var(--border)",
                    borderBottom: isOpen ? "none" : "1px solid var(--border)",
                    borderRadius: isOpen ? "12px 12px 0 0" : 12,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#0a0a0a" }}>
                      {cat.categoryName ?? "Llave"}
                    </span>
                    {cat.stage && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "var(--muted-fg)",
                          background: "var(--border)",
                          padding: "2px 8px",
                          borderRadius: 20,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {STAGE_LABEL[cat.stage] ?? cat.stage}
                      </span>
                    )}
                    {cat.hasBracket && cat.finalHasWinner && (
                      <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>
                        · Finalizado
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 18,
                      color: "var(--muted-fg)",
                      display: "inline-block",
                      transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform 0.18s ease",
                      lineHeight: 1,
                    }}
                  >
                    ›
                  </span>
                </button>
              )}

              {(!showCategoryHeaders || isOpen) && (
                <div
                  style={
                    showCategoryHeaders
                      ? {
                          border: "1px solid var(--border)",
                          borderTop: "none",
                          borderRadius: "0 0 12px 12px",
                          overflow: "hidden",
                        }
                      : undefined
                  }
                >
                  {/* Barra de acción por categoría */}
                  {(!cat.hasBracket || (cat.canGenerateRandomBracket && !cat.hasBracket)) && (
                    <div
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      {cat.canGenerateRandomBracket && !cat.hasBracket && data.tournamentId && (
                        <GenerateBracketButton
                          tournamentId={data.tournamentId}
                          categoryId={cat.categoryId}
                        />
                      )}
                      {!cat.canGenerateRandomBracket && !cat.hasBracket && (
                        <span style={{ fontSize: 12, color: "var(--muted-fg)" }}>
                          Sortea grupos, cierra la fase y genera la llave desde la gestión del
                          torneo; el cuadro aparecerá aquí automáticamente.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bracket */}
                  <BracketView
                    columns={bracketCols}
                    champion={{
                      label: cat.championLabel,
                      decided: cat.hasBracket && !!cat.finalHasWinner,
                      when: cat.championWhen,
                    }}
                    thirdPlaceMatch={
                      cat.thirdPlaceMatch ? toNode(cat.thirdPlaceMatch, false) : undefined
                    }
                    onScoreSubmit={cat.hasBracket ? submitScore : undefined}
                    savingMatchIds={savingIds}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function GenerateBracketButton({
  tournamentId,
  categoryId,
}: {
  tournamentId: string;
  categoryId: string | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const { confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const doGenerate = async () => {
    const ok = await confirm({
      title: "Generar bracket",
      body: "¿Generar el bracket ahora? Las inscripciones aceptadas se sortearán aleatoriamente.",
      confirmLabel: "Generar",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await generateBracket({
        tournamentId,
        categoryId: categoryId ?? undefined,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Bracket generado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };
  return (
    <button
      className="btn"
      style={{
        background: "#0a0a0a",
        color: "#fff",
        border: "1px solid #0a0a0a",
      }}
      disabled={isPending}
      onClick={doGenerate}
    >
      <Icon name="shuffle" size={13} color="#fff" />
      {isPending ? "Generando…" : "Generar bracket"}
    </button>
  );
}
