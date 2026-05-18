// Client view de CoachHome — layout del mock 1:1 (RoleHomes.jsx 378-447).
"use client";
import { Icon } from "@/components/Icon";
import { RHKpi, RHPanel, RHWelcome } from "../widgets/RH";
import { useRealtimeRefresh } from "../useRealtimeRefresh";

export type AgendaItem = {
  id: string;
  time: string;
  timestamp: number;
  title: string;
  sub: string;
  kind: "group" | "individual";
  status?: "completed" | "next" | "upcoming";
};

export type NextClass = {
  id: string;
  time: string;
  title: string;
  sub: string;
  minutesUntil: number;
};

export type TopStudent = {
  id: string;
  name: string;
  classes: number;
};

export type CoachHomeData = {
  coachId: string | null;
  userName: string | null;
  kpis: {
    classesToday: number;
    groupToday: number;
    individualToday: number;
    studentsActive: number;
    newStudentsMonth: number;
    revenueMonthCents: number;
  };
  agenda: AgendaItem[];
  next: NextClass | null;
  topStudents: TopStudent[];
  studentsTotal: number;
};

const AGENDA_PLACEHOLDER_COUNT = 4;
const STUDENT_PLACEHOLDER_COUNT = 4;

const STUDENT_GRADIENTS = [
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#dc2626,#fb923c)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtUSD(cents: number): string {
  const dollars = cents / 100;
  if (dollars === 0) return "$—";
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

function AgendaPlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "8px 0",
        borderTop: "1px dashed var(--border)",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 50,
          textAlign: "right",
          fontFamily: "Plus Jakarta Sans",
          fontSize: 13,
          fontWeight: 900,
          color: "var(--muted-fg)",
        }}
      >
        —
      </div>
      <div
        style={{
          width: 3,
          height: 30,
          background: "var(--border)",
          borderRadius: 9999,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted-fg)" }}>Sin clase</div>
        <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>—</div>
      </div>
    </div>
  );
}

function StudentPlaceholder({ k }: { k: number }) {
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 10,
        border: "1px dashed var(--border)",
        background: "#fafafa",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          background: "var(--muted)",
          color: "var(--muted-fg)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Plus Jakarta Sans",
          fontWeight: 900,
          fontSize: 12,
          marginBottom: 8,
        }}
      >
        —
      </div>
      <div style={{ fontSize: 11.5, fontWeight: 900, color: "var(--muted-fg)" }}>Sin alumnos</div>
      <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>—</div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted-fg)", marginTop: 6 }}>
        — clases · k{k}
      </div>
    </div>
  );
}

export function CoachHomeView({ data }: { data: CoachHomeData }) {
  useRealtimeRefresh(
    data.coachId
      ? [
          { table: "class_sessions" },
          { table: "lessons_1on1", filter: `coach_id=eq.${data.coachId}` },
          { table: "class_enrollments" },
          { table: "transactions" },
        ]
      : [],
    { enabled: !!data.coachId },
  );

  const hasAgenda = data.agenda.length > 0;
  const hasStudents = data.topStudents.length > 0;
  const { kpis } = data;

  return (
    <>
      <RHWelcome role="coach" userName={data.userName} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <RHKpi
          label="Clases hoy"
          value={String(kpis.classesToday)}
          sub={
            kpis.classesToday > 0
              ? `${kpis.groupToday} grupales · ${kpis.individualToday} individuales`
              : "sin clases agendadas"
          }
        />
        <RHKpi
          label="Alumnos activos"
          value={String(kpis.studentsActive)}
          sub={kpis.newStudentsMonth > 0 ? `${kpis.newStudentsMonth} nuevos este mes` : "sin nuevos este mes"}
          delta={kpis.newStudentsMonth > 0 ? `↑ ${kpis.newStudentsMonth}` : "—"}
          deltaPos
        />
        <RHKpi
          label="Ingresos · mes"
          value={fmtUSD(kpis.revenueMonthCents)}
          sub={kpis.revenueMonthCents > 0 ? "Después de comisión club" : "sin cobros este mes"}
          accent="var(--primary)"
        />
        <RHKpi
          label="Win rate alumnos"
          value="—"
          sub="sin tracking aún"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 16 }}>
        <RHPanel
          title="Próxima clase"
          action={
            data.next ? (
              <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800 }}>
                en {data.next.minutesUntil} min
              </span>
            ) : (
              <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 800 }}>—</span>
            )
          }
        >
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              background: data.next
                ? "linear-gradient(135deg, #0a0a0a 0%, #f59e0b 200%)"
                : "#fafafa",
              color: data.next ? "#fff" : "var(--muted-fg)",
              position: "relative",
              overflow: "hidden",
              border: data.next ? "0" : "1px dashed var(--border)",
              opacity: data.next ? 1 : 0.6,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                fontFamily: "Plus Jakarta Sans",
                fontWeight: 900,
                fontSize: 120,
                color: "rgba(255,255,255,0.06)",
                letterSpacing: "-0.06em",
                lineHeight: 0.8,
                transform: "rotate(-6deg) translate(15%, -25%)",
                textTransform: "uppercase",
              }}
            >
              NEXT
            </div>
            <div className="label-mp" style={{ color: data.next ? "rgba(255,255,255,0.7)" : "var(--muted-fg)" }}>
              ● {data.next ? "Próxima clase del día" : "Sin clase agendada"}
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: "-0.025em",
                textTransform: "uppercase",
                marginTop: 8,
              }}
            >
              {data.next ? data.next.title : "—"}
              <span style={{ color: "#fbbf24" }}>.</span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 14,
                marginTop: 12,
                fontSize: 11,
                color: data.next ? "rgba(255,255,255,0.85)" : "var(--muted-fg)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="clock" size={11} color={data.next ? "#fff" : "var(--muted-fg)"} />{" "}
                {data.next ? `${data.next.time} · ${data.next.sub}` : "—"}
              </span>
            </div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 14, opacity: data.next ? 1 : 0.5, cursor: data.next ? "pointer" : "not-allowed" }}
              disabled={!data.next}
            >
              Empezar check-in
              <Icon name="arrow-right" size={12} color="#fff" />
            </button>
          </div>
        </RHPanel>

        <RHPanel title="Agenda · hoy">
          {hasAgenda
            ? data.agenda.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    padding: "8px 0",
                    borderTop: i === 0 ? "0" : "1px dashed var(--border)",
                    opacity: c.status === "completed" ? 0.5 : 1,
                  }}
                >
                  <div
                    style={{
                      width: 50,
                      textAlign: "right",
                      fontFamily: "Plus Jakarta Sans",
                      fontSize: 13,
                      fontWeight: 900,
                      color: c.status === "next" ? "var(--primary)" : "#0a0a0a",
                    }}
                  >
                    {c.time}
                  </div>
                  <div
                    style={{
                      width: 3,
                      height: 30,
                      background:
                        c.status === "completed"
                          ? "var(--muted-fg)"
                          : c.status === "next"
                          ? "var(--primary)"
                          : "var(--border)",
                      borderRadius: 9999,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{c.title}</div>
                    <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>{c.sub}</div>
                  </div>
                  {c.status === "completed" && (
                    <Icon name="check-circle-2" size={14} color="var(--primary)" />
                  )}
                  {c.status === "next" && (
                    <span
                      style={{
                        fontSize: 8.5,
                        padding: "2px 6px",
                        borderRadius: 3,
                        background: "var(--primary)",
                        color: "#fff",
                        fontWeight: 900,
                        letterSpacing: "0.12em",
                      }}
                    >
                      SIGUE
                    </span>
                  )}
                </div>
              ))
            : Array.from({ length: AGENDA_PLACEHOLDER_COUNT }).map((_, k) => (
                <AgendaPlaceholder key={k} />
              ))}
        </RHPanel>
      </div>

      <RHPanel
        title="Tus alumnos · top performers"
        action={
          <button
            className="btn"
            style={{
              background: "#fff",
              border: "1px solid var(--border)",
              fontSize: 10.5,
              opacity: hasStudents ? 1 : 0.5,
              cursor: hasStudents ? "pointer" : "not-allowed",
            }}
            disabled={!hasStudents}
          >
            Ver todos · {data.studentsTotal}
          </button>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {hasStudents
            ? data.topStudents.map((a, i) => (
                <div
                  key={a.id}
                  style={{ padding: 12, borderRadius: 10, border: "1px solid var(--border)" }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: STUDENT_GRADIENTS[i % STUDENT_GRADIENTS.length],
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "Plus Jakarta Sans",
                      fontWeight: 900,
                      fontSize: 12,
                      marginBottom: 8,
                    }}
                  >
                    {initials(a.name)}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 900 }}>{a.name}</div>
                  <div style={{ fontSize: 9.5, color: "var(--muted-fg)", marginTop: 1 }}>
                    Nivel — · {a.classes} clases
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: "var(--muted-fg)",
                      marginTop: 6,
                    }}
                  >
                    sin tracking aún
                  </div>
                </div>
              ))
            : Array.from({ length: STUDENT_PLACEHOLDER_COUNT }).map((_, k) => (
                <StudentPlaceholder key={k} k={k} />
              ))}
        </div>
      </RHPanel>
    </>
  );
}
