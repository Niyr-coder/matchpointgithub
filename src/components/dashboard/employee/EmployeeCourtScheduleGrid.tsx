"use client";

import { useState } from "react";
import { scheduleCellStyle } from "@/lib/reservations/court-schedule";
import type { CourtDayScheduleData } from "@/server/queries/court-day-schedule";

const STATE_LABEL: Record<number, string> = {
  0: "Libre",
  1: "Reserva",
  2: "Evento",
  3: "Clase",
};

type Props = {
  schedule: CourtDayScheduleData;
  selectedHourIdx: number | null;
  onSelectHour: (idx: number) => void;
  isPast: (hourIdx: number) => boolean;
  onFreeCellClick?: (courtLabel: string, hour: string, courtId: string) => void;
};

function ScheduleCell({
  state,
  past,
  meta,
  hour,
  courtLabel,
  onFreeClick,
}: {
  state: number;
  past: boolean;
  meta?: { name: string; kind: string };
  hour: string;
  courtLabel: string;
  onFreeClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const reserved = state !== 0;
  const shortName = meta
    ? (() => {
        const parts = meta.name.split(" ").filter(Boolean);
        if (parts.length <= 1) return parts[0]?.slice(0, 6) ?? "—";
        return `${parts[0]} ${parts[1]![0]}.`.slice(0, 8);
      })()
    : STATE_LABEL[state];

  const base = scheduleCellStyle(state, { past });
  const clickable = !past && state === 0;
  const { transform: _t, ...baseStyle } = base;

  return (
    <div
      style={{
        position: "relative",
        ...baseStyle,
        transform: hover && clickable ? "scale(1.03)" : undefined,
        boxShadow: hover && clickable ? "0 4px 12px rgba(0,0,0,0.08)" : undefined,
        transition: "transform 120ms ease-out, box-shadow 120ms ease-out",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={clickable ? onFreeClick : undefined}
      title={
        meta
          ? `${meta.name} · ${hour}`
          : clickable
            ? `${courtLabel} libre · ${hour}`
            : past
              ? "Horario pasado"
              : undefined
      }
    >
      <span style={{ fontSize: reserved ? 8.5 : 9, fontWeight: 800, lineHeight: 1.1 }}>
        {past && state === 0 ? "—" : shortName}
      </span>
      {hover && reserved && meta ? (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0a0a0a",
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            padding: "5px 8px",
            borderRadius: 6,
            whiteSpace: "nowrap",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          {meta.name}
        </div>
      ) : null}
    </div>
  );
}

export function EmployeeCourtScheduleGrid({
  schedule,
  selectedHourIdx,
  onSelectHour,
  isPast,
  onFreeCellClick,
}: Props) {
  const courtCount = schedule.courts.length;
  const colTemplate = `52px repeat(${courtCount}, minmax(76px, 1fr))`;

  return (
    <div className="mp-touch-hscroll">
      <div style={{ minWidth: Math.max(640, 52 + courtCount * 80) }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: colTemplate,
            gap: 4,
            marginBottom: 6,
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 3,
            paddingBottom: 4,
          }}
        >
          <div />
          {schedule.courts.map((c) => (
            <div
              key={c.id}
              style={{
                textAlign: "center",
                padding: "8px 4px",
                borderRadius: 8,
                background: "var(--muted)",
              }}
            >
              <div className="font-heading" style={{ fontSize: 11, fontWeight: 900 }}>
                {c.label}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted-fg)", marginTop: 2 }}>{c.sport}</div>
            </div>
          ))}
        </div>

        {schedule.hours.map((hour, hi) => {
          const ha = schedule.hourAvailability[hi];
          const past = isPast(hi);
          const selected = selectedHourIdx === hi;
          const isNow = !past && selected;

          return (
            <div
              key={hour}
              style={{
                display: "grid",
                gridTemplateColumns: colTemplate,
                gap: 4,
                marginBottom: 4,
                borderRadius: 8,
                background: selected ? "rgba(16,185,129,0.06)" : "transparent",
                outline: selected ? "1px solid rgba(16,185,129,0.35)" : "none",
              }}
            >
              <button
                type="button"
                onClick={() => onSelectHour(hi)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  justifyContent: "center",
                  paddingRight: 8,
                  border: 0,
                  background: past ? "var(--muted)" : isNow ? "#0a0a0a" : "transparent",
                  color: past ? "var(--muted-fg)" : isNow ? "#fff" : "#0a0a0a",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  minHeight: 40,
                }}
              >
                <span className="font-heading tabular" style={{ fontSize: 12, fontWeight: 900 }}>
                  {hour}
                </span>
                {!past && (
                  <span style={{ fontSize: 8, fontWeight: 800, marginTop: 2, opacity: isNow ? 0.85 : 0.55 }}>
                    {ha?.freeCount ?? 0} libre
                  </span>
                )}
              </button>
              {schedule.courts.map((court) => (
                <ScheduleCell
                  key={court.id}
                  state={court.slots[hi] ?? 0}
                  past={past}
                  meta={court.cellMeta[hi]}
                  hour={hour}
                  courtLabel={court.label}
                  onFreeClick={
                    onFreeCellClick
                      ? () => onFreeCellClick(court.label, hour, court.id)
                      : undefined
                  }
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
