import type { AdminTournamentDetail } from "@/server/actions/tournaments";

type Bracket = AdminTournamentDetail["brackets"][number];

function scoreLabel(score: unknown): string {
  if (score == null) return "—";
  if (typeof score === "string") return score;
  if (typeof score === "object") {
    const s = score as { a?: unknown; b?: unknown; sideA?: unknown; sideB?: unknown };
    const a = s.a ?? s.sideA;
    const b = s.b ?? s.sideB;
    if (a != null || b != null) return `${a ?? "—"}-${b ?? "—"}`;
  }
  return "Registrado";
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
  const rounds = new Map<number, Bracket["matches"]>();
  for (const match of bracket.matches) {
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match]);
  }

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
        {Array.from(rounds.entries()).map(([round, matches]) => (
          <div key={round} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="label-mp">Ronda {round}</div>
            {matches.map((match) => (
              <div key={match.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--muted-fg)" }}>
                  <span>Partido {match.position}</span>
                  <span>{match.status}</span>
                </div>
                <SideRow
                  label={registrationLabel.get(match.sideARegistrationId ?? "") ?? "TBD"}
                  winner={match.winnerSide === "a"}
                />
                <SideRow
                  label={registrationLabel.get(match.sideBRegistrationId ?? "") ?? "TBD"}
                  winner={match.winnerSide === "b"}
                />
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted-fg)" }}>
                  Score: <strong style={{ color: "#0a0a0a" }}>{scoreLabel(match.score)}</strong> · {fmtDate(match.scheduledAt)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SideRow({ label, winner }: { label: string; winner: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingTop: 6,
        fontSize: 12,
        fontWeight: winner ? 900 : 650,
        opacity: winner ? 1 : 0.75,
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {winner ? <span style={{ color: "var(--primary)", fontSize: 10 }}>Ganador</span> : null}
    </div>
  );
}
