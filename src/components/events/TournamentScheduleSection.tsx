"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  filterScheduleForCategory,
  groupScheduleBlocks,
  type TournamentScheduleBlockView,
} from "@/lib/tournaments/schedule-display";

type Props = {
  blocks: TournamentScheduleBlockView[];
  categories?: { id: string; name: string }[];
  myCategoryId?: string | null;
  heading?: string;
};

export function TournamentScheduleSection({
  blocks,
  categories = [],
  myCategoryId = null,
  heading = "Agenda del torneo",
}: Props) {
  const [scope, setScope] = useState<"all" | "mine">("all");

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const myCategoryName = myCategoryId
    ? (categories.find((c) => c.id === myCategoryId)?.name ?? "Tu categoría")
    : null;

  const visibleBlocks = useMemo(() => {
    if (scope === "mine" && myCategoryId) {
      return filterScheduleForCategory(blocks, myCategoryId);
    }
    return blocks;
  }, [blocks, myCategoryId, scope]);

  const days = useMemo(
    () => groupScheduleBlocks(visibleBlocks, categoryNames),
    [visibleBlocks, categoryNames],
  );

  const canFilterMine = !!myCategoryId && blocks.some((b) => b.categoryId === myCategoryId);

  return (
    <div>
      <div className="label-mp">Cronograma</div>
      <h2
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.02em",
          textTransform: "uppercase",
          margin: "8px 0 12px",
        }}
      >
        {heading}
        <span className="dot">.</span>
      </h2>

      {canFilterMine && (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setScope("all")}
            style={chipStyle(scope === "all")}
          >
            Todo el torneo
          </button>
          <button
            type="button"
            onClick={() => setScope("mine")}
            style={chipStyle(scope === "mine")}
          >
            Mi categoría{myCategoryName ? ` · ${myCategoryName}` : ""}
          </button>
        </div>
      )}

      {days.length === 0 ? (
        <div
          style={{
            padding: "20px 16px",
            borderRadius: 12,
            border: "1px dashed var(--border)",
            background: "#fafafa",
            fontSize: 12.5,
            color: "var(--muted-fg)",
            lineHeight: 1.5,
          }}
        >
          {blocks.length === 0
            ? "El organizador aún no publicó el cronograma. Vuelve más tarde."
            : scope === "mine"
              ? "No hay bloques específicos para tu categoría todavía. Prueba ver todo el torneo."
              : "Sin bloques en el cronograma."}
        </div>
      ) : (
        days.map((day) => (
          <div key={day.dayKey} style={{ marginBottom: 24 }}>
            <div
              className="label-mp"
              style={{ color: "var(--primary)", marginBottom: 10, textTransform: "capitalize" }}
            >
              {day.dayLabel}
            </div>
            {day.items.map((item, i) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: 18,
                  padding: "10px 0",
                  borderTop: i === 0 ? "0" : "1px solid var(--border)",
                }}
              >
                <div
                  className="font-heading"
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: "var(--primary)",
                    minWidth: 70,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item.time}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{item.label}</div>
                  {item.categoryName && (
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3 }}>
                      {item.categoryName}
                    </div>
                  )}
                  {item.notes && (
                    <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 3 }}>
                      {item.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 9999,
    fontSize: 11,
    fontWeight: 800,
    fontFamily: "inherit",
    cursor: "pointer",
    background: active ? "#0a0a0a" : "#fff",
    color: active ? "#fff" : "#0a0a0a",
    border: `1px solid ${active ? "#0a0a0a" : "var(--border)"}`,
  };
}
