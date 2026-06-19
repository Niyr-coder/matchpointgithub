"use client";

import { Icon } from "@/components/Icon";
import type { TournamentDetail } from "@/lib/schemas/tournaments";
import { formatMprRange } from "@/lib/tournaments/event-level-categories";

type Props = {
  open: boolean;
  tournamentName: string;
  entryFeeCents: number;
  categories: TournamentDetail["categories"];
  registrationCountByCategory: Record<string, number>;
  pending: boolean;
  onClose: () => void;
  onPick: (categoryId: string) => void;
};

function feeLabel(cents: number): string {
  if (cents <= 0) return "Gratis";
  return `$${Math.round(cents / 100)}`;
}

export function TournamentCategoryJoinModal({
  open,
  tournamentName,
  entryFeeCents,
  categories,
  registrationCountByCategory,
  pending,
  onClose,
  onPick,
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1200,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 440, padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: "var(--primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="user-plus" size={15} color="#fff" />
          </div>
          <div>
            <div className="label-mp">Inscribirme</div>
            <div style={{ fontSize: 13, fontWeight: 900 }}>{tournamentName}</div>
          </div>
        </div>

        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          {entryFeeCents > 0 ? (
            <>
              Cuota <b style={{ color: "var(--fg)" }}>{feeLabel(entryFeeCents)}</b> — el pago depende de la
              política del torneo.
            </>
          ) : (
            "Inscripción gratuita."
          )}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="label-mp">Elige tu categoría</div>
          {categories.map((c) => {
            const taken = registrationCountByCategory[c.id] ?? 0;
            const cap = c.maxTeams ?? 0;
            const isFull = cap > 0 && taken >= cap;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => !isFull && onPick(c.id)}
                disabled={pending || isFull}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: isFull ? "#fafafa" : "#fff",
                  opacity: isFull ? 0.65 : 1,
                  cursor: isFull || pending ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 3 }}>
                  MPR {formatMprRange(c.mprMin ?? null, c.mprMax ?? null)}
                  {cap > 0 ? ` · ${taken}/${cap} cupos` : taken > 0 ? ` · ${taken} inscritos` : ""}
                  {isFull ? " · Llena" : ""}
                </div>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="btn"
          style={{ marginTop: 14, width: "100%", justifyContent: "center", background: "#fff", border: "1px solid var(--border)" }}
          onClick={onClose}
          disabled={pending}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
