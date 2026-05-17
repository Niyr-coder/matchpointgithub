// Client view de PartnerBracketsScreen — layout 1:1 (RoleScreens.jsx 507-562).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { generateBracket } from "@/server/actions/tournaments";

export type BracketMatch = {
  a: string;
  b: string;
  sa: number | string;
  sb: number | string;
  w?: "a" | "b";
  live?: boolean;
};

export type BracketsData = {
  partnerId: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  rounds: { r1: BracketMatch[]; r2: BracketMatch[]; r3: BracketMatch[] };
  championLabel: string;
  championWhen: string;
};

const EMPTY_MATCH: BracketMatch = { a: "TBD", b: "TBD", sa: "-", sb: "-" };

function MatchCell({ m, placeholder }: { m: BracketMatch; placeholder?: boolean }) {
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
    </div>
  );
}

export function PartnerBracketsScreenView({ data }: { data: BracketsData }) {
  useRealtimeRefresh(
    data.partnerId
      ? [
          { table: "bracket_matches" },
          { table: "brackets" },
        ]
      : [],
    { enabled: !!data.partnerId },
  );

  const hasBracket = data.rounds.r1.length > 0 || data.rounds.r2.length > 0 || data.rounds.r3.length > 0;
  const r1 = hasBracket ? data.rounds.r1 : [EMPTY_MATCH, EMPTY_MATCH, EMPTY_MATCH, EMPTY_MATCH];
  const r2 = hasBracket ? data.rounds.r2 : [EMPTY_MATCH, EMPTY_MATCH];
  const r3 = hasBracket && data.rounds.r3[0] ? data.rounds.r3[0] : EMPTY_MATCH;

  const labelTag = data.tournamentName
    ? `Partner · Brackets · ${data.tournamentName}`
    : "Partner · Brackets";

  return (
    <>
      <RSHeader
        label={labelTag}
        title="Bracket en vivo"
        action={
          <div style={{ display: "flex", gap: 8 }}>
            {!hasBracket && data.tournamentId && (
              <GenerateBracketButton tournamentId={data.tournamentId} />
            )}
            <button className="btn btn-primary" disabled={!hasBracket}>
              <Icon name="share-2" size={13} color="#fff" />
              Compartir
            </button>
          </div>
        }
      />
      <div className="card" style={{ padding: 24, overflow: "auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr",
            gap: 24,
            minWidth: 720,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              justifyContent: "space-around",
            }}
          >
            <div className="label-mp" style={{ textAlign: "center", marginBottom: -16 }}>
              Cuartos
            </div>
            {r1.map((m, i) => (
              <MatchCell key={i} m={m} placeholder={!hasBracket} />
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
              Semis
            </div>
            {r2.map((m, i) => (
              <MatchCell key={i} m={m} placeholder={!hasBracket} />
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
              Final
            </div>
            <MatchCell m={r3} placeholder={!hasBracket} />
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
    </>
  );
}

function GenerateBracketButton({ tournamentId }: { tournamentId: string }) {
  const toast = useToast();
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
      if (res.ok) toast({ icon: "check", title: "Bracket generado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
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
