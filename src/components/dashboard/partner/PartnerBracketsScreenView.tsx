// Client view de PartnerBracketsScreen — layout 1:1 (RoleScreens.jsx 507-562).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast, TOAST_SCORE_MS } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { generateBracket } from "@/server/actions/tournaments";
import { reportBracketMatch, correctBracketMatch } from "@/server/actions/tournament-group-stage";
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

export type BracketsData = {
  partnerId: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentSlug: string | null;
  displayToken: string | null;
  tournamentFormat: string;
  canGenerateRandomBracket: boolean;
  columns: { label: string; matches: BracketMatch[] }[];
  hasBracket: boolean;
  championLabel: string;
  championWhen: string;
  finalHasWinner?: boolean;
  thirdPlaceMatch?: BracketMatch | null;
};

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
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useRealtimeRefresh(
    data.partnerId
      ? [{ table: "bracket_matches" }, { table: "brackets" }]
      : [],
    { enabled: !!data.partnerId },
  );

  const hasBracket = data.hasBracket;
  const bracketColumns = data.columns.map((col) => ({
    label: col.label,
    matches: col.matches.map((m) => toNode(m, !hasBracket)),
  }));

  const labelTag = data.tournamentName
    ? `Partner · Brackets · ${data.tournamentName}`
    : "Partner · Brackets";

  const submitScore = (matchId: string, a: number, b: number) => {
    if (!data.tournamentId || busy) return;
    if (a === b) {
      toast({
        icon: "alert-triangle",
        title: "Marcador inválido",
        sub: "Indica sets ganados por cada lado (no pueden empatar).",
        tone: "error",
      });
      return;
    }
    const row =
      data.thirdPlaceMatch?.id === matchId
        ? data.thirdPlaceMatch
        : data.columns.flatMap((c) => c.matches).find((x) => x.id === matchId);
    const isCorrection = row?.correctable ?? false;
    setBusy(true);
    setReportingId(matchId);
    startTx(async () => {
      const payload = {
        tournamentId: data.tournamentId!,
        matchId,
        winnerSide: (a > b ? "a" : "b") as "a" | "b",
        score: { sets: [{ a, b }] },
      };
      const res = isCorrection
        ? await correctBracketMatch(payload)
        : await reportBracketMatch(payload);
      setBusy(false);
      setReportingId(null);
      if (res.ok) {
        toast({
          icon: "check",
          title: isCorrection ? "Marcador corregido" : "Resultado registrado",
          durationMs: TOAST_SCORE_MS,
        });
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo",
          sub: res.error.message,
          tone: "error",
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

  return (
    <>
      <RSHeader
        label={labelTag}
        title="Bracket en vivo"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {!hasBracket && data.tournamentId && data.canGenerateRandomBracket && (
              <GenerateBracketButton tournamentId={data.tournamentId} />
            )}
            <button
              className="btn btn-primary"
              disabled={!hasBracket}
              onClick={() => {
                if (liveUrl) copyShare(liveUrl, "Link pantalla TV");
                else if (publicUrl) copyShare(publicUrl, "Link público");
              }}
            >
              <Icon name="share-2" size={13} color="#fff" />
              Compartir
            </button>
          </div>
        }
      />

      {!hasBracket && data.tournamentFormat === "groups_to_knockout" && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            fontSize: 12,
            color: "var(--muted-fg)",
            lineHeight: 1.5,
          }}
        >
          Este torneo usa <b>fase de grupos</b>. Sortea grupos, cierra la fase y genera la llave
          desde la página de gestión del torneo; el cuadro aparecerá aquí automáticamente.
        </div>
      )}

      <BracketView
        columns={bracketColumns}
        champion={{
          label: data.championLabel,
          decided: hasBracket && !!data.finalHasWinner,
          when: data.championWhen,
        }}
        thirdPlaceMatch={
          data.thirdPlaceMatch
            ? toNode(data.thirdPlaceMatch, false)
            : undefined
        }
        onScoreSubmit={hasBracket ? submitScore : undefined}
        reportingMatchId={reportingId}
      />
    </>
  );
}

function GenerateBracketButton({ tournamentId }: { tournamentId: string }) {
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
      const res = await generateBracket({ tournamentId });
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
