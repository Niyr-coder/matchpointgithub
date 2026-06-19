// Client view de PartnerBracketsScreen — layout 1:1 (RoleScreens.jsx 507-562).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { generateBracket } from "@/server/actions/tournaments";
import { reportBracketMatch } from "@/server/actions/tournament-group-stage";
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
};

export type BracketsData = {
  partnerId: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  tournamentFormat: string;
  canGenerateRandomBracket: boolean;
  columns: { label: string; matches: BracketMatch[] }[];
  hasBracket: boolean;
  championLabel: string;
  championWhen: string;
  finalHasWinner?: boolean;
};

function toNode(m: BracketMatch, placeholder: boolean): BracketNode {
  return {
    id: m.id,
    a: { label: m.a, score: m.sa, isWinner: m.w === "a" },
    b: { label: m.b, score: m.sb, isWinner: m.w === "b" },
    live: m.live,
    reportable: !placeholder && m.reportable,
    dimmed: placeholder,
  };
}

export function PartnerBracketsScreenView({ data }: { data: BracketsData }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [reportId, setReportId] = useState<string | null>(null);
  const [setsA, setSetsA] = useState("2");
  const [setsB, setSetsB] = useState("0");
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

  const onReport = (matchId: string) => {
    setReportId(matchId);
    setSetsA("2");
    setSetsB("0");
  };

  const submitReport = () => {
    if (!data.tournamentId || !reportId || busy) return;
    const a = Number(setsA);
    const b = Number(setsB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      toast({
        icon: "alert-triangle",
        title: "Marcador inválido",
        sub: "Indica sets ganados por cada lado.",
      });
      return;
    }
    setBusy(true);
    startTx(async () => {
      const res = await reportBracketMatch({
        tournamentId: data.tournamentId!,
        matchId: reportId,
        winnerSide: a > b ? "a" : "b",
        score: { sets: [{ a, b }] },
      });
      setBusy(false);
      if (res.ok) {
        toast({ icon: "check", title: "Resultado registrado" });
        setReportId(null);
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo",
          sub: res.error.message,
        });
      }
    });
  };

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
            <button className="btn btn-primary" disabled={!hasBracket}>
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
        onReport={hasBracket ? onReport : undefined}
      />

      {reportId && (
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
          onClick={() => !busy && setReportId(null)}
        >
          <div
            className="card"
            style={{ padding: 20, width: "100%", maxWidth: 360 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="label-mp">Reportar resultado (sets ganados)</div>
              <div className="mp-tournament-form-grid-2" style={{ marginTop: 12 }}>
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
              <button type="button" className="btn" disabled={busy} onClick={() => setReportId(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={submitReport}>
                {busy ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
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
