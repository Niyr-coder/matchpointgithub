"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { slotStartMs, SCHEDULE_HOURS } from "@/lib/reservations/court-schedule";
import type { CourtDayScheduleData, HourAvailability } from "@/server/queries/court-day-schedule";
import { EmployeeCourtScheduleGrid } from "./EmployeeCourtScheduleGrid";

export type CourtCalendarData = {
  clubId: string | null;
  days: CourtDayScheduleData[];
  dayOffset: number;
};

const DAY_SHORT = ["Hoy", "Mañana", "Pasado mañana", "En 3 días"];

function hourAnswerLine(ha: HourAvailability | undefined): string {
  if (!ha || ha.totalCourts === 0) return "Sin canchas activas.";
  if (ha.freeCount === 0) return `A las ${ha.hour} no hay canchas libres.`;
  if (ha.freeCount === ha.totalCourts) {
    return `A las ${ha.hour} las ${ha.totalCourts} canchas están libres.`;
  }
  return `A las ${ha.hour}: ${ha.freeCount} libres (${ha.freeLabels.join(", ")}).`;
}

function currentHourIndex(nowMs: number, weekStartIso: string, dayIdx: number): number | null {
  for (let hi = 0; hi < SCHEDULE_HOURS.length; hi++) {
    const start = slotStartMs(weekStartIso, dayIdx, hi);
    const end = hi < SCHEDULE_HOURS.length - 1 ? slotStartMs(weekStartIso, dayIdx, hi + 1) : start + 3600_000;
    if (nowMs >= start && nowMs < end) return hi;
  }
  return null;
}

export function EmployeeCourtCalendarScreenView({ data }: { data: CourtCalendarData }) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const dayOffset = data.dayOffset;
  const s = data.days[dayOffset] ?? data.days[0] ?? null;

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const defaultHourIdx = useMemo(
    () => (s ? currentHourIndex(nowMs, s.weekStartIso, s.dayIdx) : null),
    [s, nowMs],
  );

  const [selectedHourIdx, setSelectedHourIdx] = useState<number | null>(null);

  useEffect(() => {
    setSelectedHourIdx(defaultHourIdx);
  }, [defaultHourIdx, dayOffset]);

  useRealtimeRefresh(
    data.clubId ? [{ table: "reservations", filter: `club_id=eq.${data.clubId}` }] : [],
    { enabled: !!data.clubId, debounceMs: 500 },
  );

  const selectedHour = useMemo(
    () => (selectedHourIdx != null ? s?.hourAvailability[selectedHourIdx] : undefined),
    [selectedHourIdx, s?.hourAvailability],
  );

  const isPast = (hourIdx: number) =>
    s ? slotStartMs(s.weekStartIso, s.dayIdx, hourIdx) < nowMs - 60_000 : false;

  const setDay = (off: number) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("dia", String(off));
    router.push(`/dashboard/employee/e-calendario?${p.toString()}`);
  };

  const total = s?.courts.length ?? 0;
  const nowHourIdx = s ? currentHourIndex(nowMs, s.weekStartIso, s.dayIdx) : null;
  const freeNow =
    nowHourIdx != null && s ? (s.hourAvailability[nowHourIdx]?.freeCount ?? 0) : 0;

  return (
    <>
      <RSHeader
        label="Recepción"
        title={
          <>
            Disponibilidad <span className="dot">●</span> {s?.dayLabel ?? "—"}
          </>
        }
        action={
          <Link href="/dashboard/employee/e-walkins" className="btn btn-primary" style={{ fontSize: 11 }}>
            <Icon name="user-plus" size={12} color="#fff" />
            Asignar walk-in
          </Link>
        }
      />

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {data.days.map((d, i) => (
          <button
            key={d.dateIso}
            type="button"
            onClick={() => setDay(i)}
            style={{
              padding: "9px 16px",
              borderRadius: 9999,
              border: dayOffset === i ? "2px solid #0a0a0a" : `1px solid ${RS_BORDER}`,
              background: dayOffset === i ? "#0a0a0a" : "#fff",
              color: dayOffset === i ? "#fff" : "#0a0a0a",
              fontSize: 11,
              fontWeight: 800,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {DAY_SHORT[i]}
          </button>
        ))}
        <Link
          href="/dashboard/employee/e-reservas"
          style={{
            marginLeft: "auto",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--muted-fg)",
            textDecoration: "none",
          }}
        >
          Ver semana completa →
        </Link>
      </div>

      {s && total > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 10,
            marginBottom: 16,
          }}
        >
          {dayOffset === 0 ? (
            <div className="card" style={{ padding: "14px 16px" }}>
              <div className="label-mp">Ahora en el club</div>
              <div className="font-heading" style={{ fontSize: 22, fontWeight: 900, color: "var(--primary)" }}>
                {freeNow} / {total}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-fg)" }}>canchas libres en este momento</div>
            </div>
          ) : null}
          <div
            className="card"
            style={{
              padding: "14px 16px",
              background: selectedHour && selectedHour.freeCount > 0 ? "#ecfdf5" : "#fafafa",
            }}
          >
            <div className="label-mp">Hora seleccionada</div>
            <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35, marginTop: 4 }}>
              {selectedHour ? hourAnswerLine(selectedHour) : "Toca una hora en la columna izquierda."}
            </div>
          </div>
        </div>
      ) : null}

      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: 14,
            fontSize: 10,
          }}
        >
          {[
            { c: "#d1fae5", l: "Libre" },
            { c: "var(--primary)", l: "Reserva" },
            { c: "#fbbf24", l: "Evento" },
            { c: "#7c3aed", l: "Clase" },
          ].map((k) => (
            <span key={k.l} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: k.c }} />
              {k.l}
            </span>
          ))}
          <span style={{ marginLeft: "auto", color: "var(--muted-fg)", fontSize: 10 }}>
            Horas ↓ · Canchas →
          </span>
        </div>

        {!s || s.courts.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--muted-fg)", padding: 32 }}>
            No hay canchas activas.
          </p>
        ) : (
          <EmployeeCourtScheduleGrid
            schedule={s}
            selectedHourIdx={selectedHourIdx}
            onSelectHour={setSelectedHourIdx}
            isPast={isPast}
            onFreeCellClick={(court, hour) => {
              toast({
                icon: "calendar",
                title: `${court} · ${hour} libre`,
                sub: "Abriendo reservas…",
              });
              router.push("/dashboard/employee/e-reservas");
            }}
          />
        )}
      </div>
    </>
  );
}
