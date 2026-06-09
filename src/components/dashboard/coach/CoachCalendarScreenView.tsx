// Client view de CoachCalendarScreen — layout del mock 1:1 (RoleScreens.jsx 698-738).
"use client";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type CalendarData = {
  coachId: string | null;
  weekLabel: string;
  days: string[]; // 7 labels "LUN 12"
  grid: number[][]; // 6 hours x 7 days. 0=free, 1=group, 2=indiv, 3=block
};

const HOURS = ["09", "11", "14", "17", "19", "21"];

const COLORS: Record<number, { bg: string; col: string; l: string }> = {
  0: { bg: "#ecfdf5", col: "#065f46", l: "+ libre" },
  1: { bg: "#f59e0b", col: "#fff", l: "GRUPAL" },
  2: { bg: "#7c3aed", col: "#fff", l: "1·1" },
  3: { bg: "var(--muted)", col: "var(--muted-fg)", l: "OFF" },
};

export function CoachCalendarScreenView({ data }: { data: CalendarData }) {
  useRealtimeRefresh(
    data.coachId
      ? [
          { table: "class_sessions" },
          { table: "lessons_1on1", filter: `coach_id=eq.${data.coachId}` },
        ]
      : [],
    { enabled: !!data.coachId },
  );

  const enabled = !!data.coachId;

  return (
    <>
      <RSHeader
        label="Coach · Calendario"
        title={data.weekLabel}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, opacity: enabled ? 1 : 0.5 }}
              disabled={!enabled}
            >
              <Icon name="chevron-left" size={12} />
            </button>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, opacity: enabled ? 1 : 0.5 }}
              disabled={!enabled}
            >
              Hoy
            </button>
            <button
              className="btn"
              style={{ background: "#fff", border: RS_BORDER, opacity: enabled ? 1 : 0.5 }}
              disabled={!enabled}
            >
              <Icon name="chevron-right" size={12} />
            </button>
          </div>
        }
      />
      <div className="card" style={{ padding: 18 }}>
        <div className="mp-coach-calendar-scroll">
        <div className="mp-coach-calendar-inner">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "50px repeat(7, 1fr)",
            gap: 4,
            marginBottom: 6,
          }}
        >
          <div />
          {data.days.map((d, i) => (
            <div
              key={d}
              style={{
                fontSize: 9.5,
                fontWeight: 900,
                textAlign: "center",
                letterSpacing: "0.08em",
                padding: 6,
                color: i === 1 ? "var(--primary)" : "var(--muted-fg)",
              }}
            >
              {d}
            </div>
          ))}
        </div>
        {HOURS.map((h, hi) => (
          <div
            key={h}
            style={{
              display: "grid",
              gridTemplateColumns: "50px repeat(7, 1fr)",
              gap: 4,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--muted-fg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 6,
              }}
            >
              {h}:00
            </div>
            {(data.grid[hi] ?? []).map((s, di) => (
              <div
                key={di}
                style={{
                  height: 40,
                  borderRadius: 5,
                  background: COLORS[s].bg,
                  color: COLORS[s].col,
                  fontSize: 9.5,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: enabled ? "pointer" : "not-allowed",
                  opacity: enabled ? 1 : 0.6,
                }}
              >
                {COLORS[s].l}
              </div>
            ))}
          </div>
        ))}
        </div>
        </div>
      </div>
    </>
  );
}
