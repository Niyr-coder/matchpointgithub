// Client view de CoachAlumnosScreen — layout del mock 1:1 (RoleScreens.jsx 655-696).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSTable, type RSColumn } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { markAttendance } from "@/server/actions/classes";

export type StudentRow = {
  id: string;
  name: string;
  av: string;
  avBg: string;
  lvl: number | null;
  gain: string | null;
  classes: number;
  attended: number;
  next: string;
  nextSessionId: string | null;
};

export type AlumnosData = {
  coachId: string | null;
  students: StudentRow[];
};

const PLACEHOLDER_COUNT = 4;

const PLACEHOLDER_ROWS: StudentRow[] = Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => ({
  id: `placeholder-${i}`,
  name: "Sin alumnos",
  av: "—",
  avBg: "var(--muted)",
  lvl: null,
  gain: null,
  classes: 0,
  attended: 0,
  next: "—",
  nextSessionId: null,
}));

export function CoachAlumnosScreenView({ data }: { data: AlumnosData }) {
  useRealtimeRefresh(
    data.coachId
      ? [
          { table: "class_enrollments" },
          { table: "lessons_1on1", filter: `coach_id=eq.${data.coachId}` },
          { table: "class_session_attendance" },
        ]
      : [],
    { enabled: !!data.coachId },
  );
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const handleAttended = (s: StudentRow) => {
    if (!s.nextSessionId) {
      toast({ icon: "alert-triangle", title: "Sin sesión próxima", sub: "No hay una clase agendada para marcar." });
      return;
    }
    startTransition(async () => {
      const res = await markAttendance({
        classSessionId: s.nextSessionId,
        studentId: s.id,
        attended: true,
      });
      if (res.ok) toast({ icon: "check", title: `${s.name} marcado como asistió` });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  const hasReal = data.students.length > 0;
  const rows = hasReal ? data.students : PLACEHOLDER_ROWS;

  const cols: RSColumn<StudentRow>[] = [
    {
      k: "name",
      l: "Alumno",
      render: (s) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: s.avBg,
              color: hasReal ? "#fff" : "var(--muted-fg)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "Plus Jakarta Sans",
              fontWeight: 900,
              fontSize: 11,
              opacity: hasReal ? 1 : 0.6,
            }}
          >
            {s.av}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: hasReal ? "#0a0a0a" : "var(--muted-fg)" }}>
            {s.name}
          </div>
        </div>
      ),
    },
    {
      k: "lvl",
      l: "Nivel · progreso",
      render: (s) => (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="font-heading" style={{ fontSize: 14, fontWeight: 900, color: "var(--muted-fg)" }}>
            {s.lvl ?? "—"}
          </span>
          <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 800 }}>
            {s.gain ?? "sin tracking"}
          </span>
        </div>
      ),
    },
    {
      k: "classes",
      l: "Clases · asistencia",
      align: "center",
      render: (s) =>
        hasReal && s.classes > 0 ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              {s.attended} / {s.classes}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>sin attendance</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)" }}>—</div>
            <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>—</div>
          </div>
        ),
    },
    {
      k: "next",
      l: "Próxima clase",
      render: (s) => (
        <span
          style={{
            color: s.next === "sin agendar" || s.next === "—" ? "var(--muted-fg)" : "#0a0a0a",
            fontStyle: s.next === "sin agendar" || s.next === "—" ? "italic" : "normal",
          }}
        >
          {s.next}
        </span>
      ),
    },
    {
      k: "a",
      l: "",
      align: "right",
      render: (s) => (
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--muted)",
              border: 0,
              cursor: hasReal ? "pointer" : "not-allowed",
              opacity: hasReal ? 1 : 0.5,
            }}
            disabled={!hasReal}
            title="Mensaje"
          >
            <Icon name="message-square" size={12} />
          </button>
          <button
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: s.nextSessionId ? "var(--primary)" : "var(--muted)",
              color: "#fff",
              border: 0,
              cursor: hasReal && s.nextSessionId && !isPending ? "pointer" : "not-allowed",
              opacity: hasReal && s.nextSessionId ? 1 : 0.5,
            }}
            disabled={!hasReal || !s.nextSessionId || isPending}
            onClick={() => handleAttended(s)}
            title="Marcar asistencia en próxima sesión"
          >
            <Icon name="check" size={12} color="#fff" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <RSHeader
        label="Coach · Alumnos"
        title={
          <>
            Mis alumnos <span className="dot">●</span> {data.students.length}
          </>
        }
        action={
          <button className="btn btn-primary">
            <Icon name="user-plus" size={13} color="#fff" />
            Invitar alumno
          </button>
        }
      />
      <RSTable cols={cols} rows={rows} rowKey={(s) => s.id} />
    </>
  );
}
