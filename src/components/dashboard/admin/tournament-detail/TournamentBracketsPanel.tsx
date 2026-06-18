import type { AdminTournamentDetail } from "@/server/actions/tournaments";
import { BracketView, type BracketColumn } from "../../brackets/BracketView";

type Bracket = AdminTournamentDetail["brackets"][number];

// Extrae el tanteo por lado de un score jsonb. Soporta {sets:[{a,b}]} (flujo del
// partner) y {a,b}/{sideA,sideB}. Devuelve null cuando no hay nada registrado.
function sideScores(score: unknown): { a: number | null; b: number | null } {
  if (score == null || typeof score !== "object") return { a: null, b: null };
  const s = score as {
    sets?: Array<{ a?: number; b?: number }>;
    a?: unknown;
    b?: unknown;
    sideA?: unknown;
    sideB?: unknown;
  };
  if (Array.isArray(s.sets) && s.sets.length > 0) {
    let a = 0;
    let b = 0;
    for (const set of s.sets) {
      a += set.a ?? 0;
      b += set.b ?? 0;
    }
    return { a, b };
  }
  const a = s.a ?? s.sideA;
  const b = s.b ?? s.sideB;
  const toNum = (v: unknown): number | null =>
    typeof v === "number" ? v : v != null && !Number.isNaN(Number(v)) ? Number(v) : null;
  return { a: toNum(a), b: toNum(b) };
}

function roundLabel(idx: number, total: number): string {
  const fromEnd = total - 1 - idx;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semifinal";
  if (fromEnd === 2) return "Cuartos";
  if (fromEnd === 3) return "Octavos";
  return `Ronda ${idx + 1}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Sin horario";
  return new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TournamentBracketsPanel({ data }: { data: AdminTournamentDetail }) {
  const registrationLabel = new Map(
    data.registrations.map((r) => [
      r.id,
      r.playerNames.length > 0 ? r.playerNames.join(" / ") : r.id.slice(0, 8),
    ]),
  );

  return (
    <section className="card" style={{ padding: 18, marginTop: 16 }}>
      <div className="label-mp">Brackets / scoring</div>
      <h2
        className="font-heading"
        style={{ margin: "6px 0 4px", fontSize: 18, fontWeight: 950, letterSpacing: "-0.02em" }}
      >
        Cuadros del torneo
      </h2>
      <p style={{ margin: "0 0 14px", color: "var(--muted-fg)", fontSize: 12 }}>
        Vista admin de solo lectura de brackets y partidos generados. La edición operativa sigue en el panel del organizador.
      </p>

      {data.brackets.length === 0 ? (
        <div
          style={{
            padding: 18,
            border: "1px dashed var(--border)",
            borderRadius: 12,
            color: "var(--muted-fg)",
            textAlign: "center",
            fontSize: 12,
          }}
        >
          Este torneo todavía no tiene bracket generado.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {data.brackets.map((bracket) => (
            <BracketCard key={bracket.id} bracket={bracket} registrationLabel={registrationLabel} />
          ))}
        </div>
      )}
    </section>
  );
}

function BracketCard({
  bracket,
  registrationLabel,
}: {
  bracket: Bracket;
  registrationLabel: Map<string, string>;
}) {
  const roundNumbers = [...new Set(bracket.matches.map((m) => m.round))].sort((a, b) => a - b);
  const label = (regId: string | null) => registrationLabel.get(regId ?? "") ?? "Por definir";

  const columns: BracketColumn[] = roundNumbers.map((round, idx) => ({
    label: roundLabel(idx, roundNumbers.length),
    matches: bracket.matches
      .filter((m) => m.round === round)
      .sort((a, b) => a.position - b.position)
      .map((m) => {
        const sc = sideScores(m.score);
        return {
          id: m.id,
          a: { label: label(m.sideARegistrationId), score: sc.a, isWinner: m.winnerSide === "a" },
          b: { label: label(m.sideBRegistrationId), score: sc.b, isWinner: m.winnerSide === "b" },
          live: m.status === "live",
          meta: m.scheduledAt ? fmtDate(m.scheduledAt) : null,
        };
      }),
  }));

  // Campeón: ganador del último partido (ronda más alta, posición 0).
  const finalMatch = bracket.matches.find(
    (m) => m.round === roundNumbers[roundNumbers.length - 1] && m.position === 0,
  );
  const championRegId =
    finalMatch?.winnerSide === "a"
      ? finalMatch.sideARegistrationId
      : finalMatch?.winnerSide === "b"
        ? finalMatch.sideBRegistrationId
        : null;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 13 }}>
            {bracket.format} · {bracket.size} cupos
          </div>
          <div style={{ color: "var(--muted-fg)", fontSize: 10.5, marginTop: 2 }}>
            Generado {fmtDate(bracket.generatedAt)}
          </div>
        </div>
        <span style={{ color: "var(--muted-fg)", fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>
          {bracket.id.slice(0, 8)}
        </span>
      </div>

      <BracketView
        columns={columns}
        champion={{
          label: championRegId ? label(championRegId) : "Por definir",
          decided: !!championRegId,
        }}
      />
    </div>
  );
}
