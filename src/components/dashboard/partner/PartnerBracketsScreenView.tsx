// Client view de PartnerBracketsScreen — layout 1:1 (RoleScreens.jsx 507-562).
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { generateBracket } from "@/server/actions/tournaments";
import { reportBracketMatch } from "@/server/actions/tournament-group-stage";

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
  rounds: { r1: BracketMatch[]; r2: BracketMatch[]; r3: BracketMatch[] };
  roundLabels: { r1: string; r2: string; r3: string };
  championLabel: string;
  championWhen: string;
};

const EMPTY_MATCH: BracketMatch = {
  id: "",
  a: "TBD",
  b: "TBD",
  sa: "-",
  sb: "-",
  status: "scheduled",
  reportable: false,
};

function MatchCell({
  m,
  placeholder,
  onReport,
}: {
  m: BracketMatch;
  placeholder?: boolean;
  onReport?: (matchId: string) => void;
}) {
  return (
    <div
      style={{
        padding: 8,
        background: m.live ? "#fffbeb" : placeholder ? "#fafafa" : "#fff",
        border: m.live ? "2px solid #fbbf24" : placeholder ? "1px dashed var(--border)" : RS_BORDER,
        borderRadius: 8,
        position: "relative",
        opacity: placeholder ? 0.6 : 1,
      }}
    >
      {m.live && (
        <span
          style={{
            position: "absolute",
            top: -8,
            right: 6,
            padding: "1px 5px",
            borderRadius: 3,
            background: "#fbbf24",
            color: "#0a0a0a",
            fontSize: 8,
            fontWeight: 900,
            letterSpacing: "0.1em",
          }}
        >
          LIVE
        </span>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "2px 0",
          opacity: m.w === "b" ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: m.w === "a" ? 900 : 700 }}>{m.a}</span>
        <span className="font-heading" style={{ fontSize: 12, fontWeight: 900 }}>
          {m.sa}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "2px 0",
          opacity: m.w === "a" ? 0.4 : 1,
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: m.w === "b" ? 900 : 700 }}>{m.b}</span>
        <span className="font-heading" style={{ fontSize: 12, fontWeight: 900 }}>
          {m.sb}
        </span>
      </div>
      {!placeholder && m.reportable && onReport && (
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 6, width: "100%", fontSize: 10 }}
          onClick={() => onReport(m.id)}
        >
          Reportar
        </button>
      )}
    </div>
  );
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

  const hasBracket =
    data.rounds.r1.length > 0 || data.rounds.r2.length > 0 || data.rounds.r3.length > 0;
  const r1 = hasBracket ? data.rounds.r1 : [EMPTY_MATCH, EMPTY_MATCH, EMPTY_MATCH, EMPTY_MATCH];
  const r2 = hasBracket ? data.rounds.r2 : [EMPTY_MATCH, EMPTY_MATCH];
  const r3 = hasBracket && data.rounds.r3[0] ? data.rounds.r3[0] : EMPTY_MATCH;

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

      <div className="card mp-partner-bracket-scroll" style={{ padding: 24, overflow: "auto" }}>
        <div className="mp-partner-bracket-grid">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              justifyContent: "space-around",
            }}
          >
            <div className="label-mp" style={{ textAlign: "center", marginBottom: -16 }}>
              {data.roundLabels.r1}
            </div>
            {r1.map((m, i) => (
              <MatchCell
                key={m.id || i}
                m={m}
                placeholder={!hasBracket}
                onReport={hasBracket ? onReport : undefined}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 80,
              justifyContent: "space-around",
            }}
          >
            <div className="label-mp" style={{ textAlign: "center", marginBottom: -16 }}>
              {data.roundLabels.r2}
            </div>
            {r2.map((m, i) => (
              <MatchCell
                key={m.id || i}
                m={m}
                placeholder={!hasBracket}
                onReport={hasBracket ? onReport : undefined}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            <div className="label-mp" style={{ textAlign: "center", marginBottom: 14 }}>
              {data.roundLabels.r3}
            </div>
            <MatchCell
              m={r3}
              placeholder={!hasBracket}
              onReport={hasBracket ? onReport : undefined}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div className="label-mp" style={{ textAlign: "center", marginBottom: 14 }}>
              Campeón
            </div>
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                background: hasBracket
                  ? "linear-gradient(135deg, #fef3c7, #fde68a)"
                  : "#fafafa",
                border: hasBracket ? "2px solid #fbbf24" : "1px dashed var(--border)",
                textAlign: "center",
                opacity: hasBracket ? 1 : 0.6,
              }}
            >
              <Icon name="trophy" size={24} color={hasBracket ? "#92400e" : "var(--muted-fg)"} />
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  color: hasBracket ? "#78350f" : "var(--muted-fg)",
                  letterSpacing: "0.16em",
                  marginTop: 6,
                  textTransform: "uppercase",
                }}
              >
                {data.championLabel}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: hasBracket ? "#78350f" : "var(--muted-fg)",
                  marginTop: 4,
                }}
              >
                {data.championWhen}
              </div>
            </div>
          </div>
        </div>
      </div>

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
