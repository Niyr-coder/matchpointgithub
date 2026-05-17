// Client view de MisClasesScreen — UI del mock original con data real.
"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { cancelEnrollment } from "@/server/actions/classes";

export type EnrolledClass = {
  id: string;
  classId: string;
  name: string;
  coachName: string;
  sport: string;
  club: string;
  nextSessionAt: string | null;
  sessionsCompleted: number;
  sessionsTotal: number;
};

export type PastEnrollment = {
  id: string;
  name: string;
  coachName: string;
  completed: number;
  total: number;
  enrolledAt: string;
};

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const CLASS_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#b45309)",
  "linear-gradient(135deg,#10b981,#047857)",
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#0891b2,#06b6d4)",
];

const COACH_AV_GRADIENTS = [
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#10b981,#047857)",
];

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function sessionDateLabel(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${DAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()].toLowerCase()} · ${hh}:${mm}`;
}

function enrolledRangeLabel(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

export function MisClasesScreenView({
  enrolled,
  past,
  totalCompletedSessions,
  pendingSessions,
}: {
  enrolled: EnrolledClass[];
  past: PastEnrollment[];
  totalCompletedSessions: number;
  pendingSessions: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [pending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Realtime: mis enrollments + sesiones (coach puede agregar/cancelar).
  useRealtimeRefresh([
    { table: "class_enrollments" },
    { table: "class_sessions" },
  ]);

  const handleCancel = async (e: EnrolledClass) => {
    const ok = await confirm({
      title: "Cancelar inscripción",
      body: `¿Cancelar tu inscripción en "${e.name}"?`,
      confirmLabel: "Cancelar inscripción",
      cancelLabel: "Volver",
      destructive: true,
    });
    if (!ok) return;
    setCancellingId(e.id);
    startTransition(async () => {
      const r = await cancelEnrollment({ enrollmentId: e.id });
      setCancellingId(null);
      if (!r.ok) {
        const msg =
          r.error.code === "ENROLLMENT.NOT_CANCELLABLE"
            ? "Esta inscripción ya no se puede cancelar."
            : r.error.message;
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: msg });
        return;
      }
      toast({ icon: "check-circle-2", title: "Inscripción cancelada", sub: e.name });
      router.refresh();
    });
  };

  const kpis: [string, string, string, string][] = [
    ["Clases activas", String(enrolled.length), enrolled[0]?.sport ?? "—", "var(--primary)"],
    ["Sesiones pendientes", String(pendingSessions), pendingSessions > 0 ? "agendadas" : "ninguna", "#0a0a0a"],
    ["Total completadas", String(totalCompletedSessions), "histórico", "#0ea5e9"],
    ["Nivel ganado", past.length > 0 ? `+${(past.length * 0.1).toFixed(1)}` : "—", past.length > 0 ? "estimado" : "completa clases", "#fbbf24"],
  ];

  return (
    <>
      <PolHero
        tone="dark"
        wm="LEARN"
        accent="#f59e0b"
        label="Coaching · Mis clases"
        title="Tu progreso"
        sub="Las clases en las que estás inscrito y tu historial. Sigue subiendo de nivel."
        right={
          <button
            className="btn btn-primary"
            onClick={() => router.push("/dashboard/user/academia")}
          >
            <Icon name="search" size={13} color="#fff" />
            Explorar más clases
          </button>
        }
      />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {kpis.map(([l, v, sub, c]) => (
          <div key={l} className="card" style={{ padding: 16 }}>
            <div className="label-mp">{l}</div>
            <div
              className="font-heading tabular"
              style={{
                fontSize: 30,
                fontWeight: 900,
                marginTop: 8,
                color: c,
                letterSpacing: "-0.03em",
              }}
            >
              {v}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <h2
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: "4px 0 0",
        }}
      >
        Clases activas<span className="dot">.</span>
      </h2>

      {enrolled.length === 0 ? (
        <EmptyState
          icon="graduation-cap"
          title="Aún no estás inscrito en ninguna clase"
          sub="Explora Academia para ver coaches y clases abiertas en tu ciudad."
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          {enrolled.map((c, i) => {
            const remaining = Math.max(0, c.sessionsTotal - c.sessionsCompleted);
            return (
              <div key={c.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  style={{
                    height: 110,
                    background: CLASS_GRADIENTS[i % CLASS_GRADIENTS.length],
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "radial-gradient(circle at 70% 30%, rgba(255,255,255,0.18), transparent 60%)",
                    }}
                  />
                  <div style={{ position: "absolute", top: 10, right: 10 }}>
                    <RSPill bg="var(--primary)">● ACTIVA</RSPill>
                  </div>
                  <div style={{ position: "relative", color: "#fff" }}>
                    <div
                      className="font-heading"
                      style={{
                        fontSize: 19,
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        lineHeight: 1,
                        textTransform: "uppercase",
                      }}
                    >
                      {c.name}
                      <span style={{ color: "#fbbf24" }}>.</span>
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
                      {c.sport} · {c.club}
                    </div>
                  </div>
                </div>
                <div style={{ padding: 18 }}>
                  <div
                    style={{
                      padding: 12,
                      background: c.nextSessionAt ? "#ecfdf5" : "var(--muted)",
                      borderRadius: 10,
                      border: `1px solid ${c.nextSessionAt ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: c.nextSessionAt ? "var(--primary)" : "var(--muted-fg)",
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon name="calendar-clock" size={17} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="label-mp" style={{ color: c.nextSessionAt ? "var(--primary)" : "var(--muted-fg)" }}>
                        {c.nextSessionAt ? "Próxima sesión" : "Sin sesiones próximas"}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, marginTop: 2 }}>
                        {c.nextSessionAt ? sessionDateLabel(c.nextSessionAt) : "—"}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 1 }}>
                        {c.club}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: COACH_AV_GRADIENTS[i % COACH_AV_GRADIENTS.length],
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "Plus Jakarta Sans",
                        fontWeight: 900,
                        fontSize: 11,
                      }}
                    >
                      {initials(c.coachName)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800 }}>{c.coachName}</div>
                      <div style={{ fontSize: 9.5, color: "var(--muted-fg)" }}>Tu coach</div>
                    </div>
                    <button
                      className="btn"
                      style={{ background: "#fff", border: "1px solid var(--border)", fontSize: 10 }}
                    >
                      <Icon name="message-square" size={11} />
                      Chat
                    </button>
                  </div>
                  {c.sessionsTotal > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 10.5,
                          marginBottom: 5,
                        }}
                      >
                        <span style={{ color: "var(--muted-fg)" }}>Sesiones restantes</span>
                        <b>
                          {remaining} / {c.sessionsTotal}
                        </b>
                      </div>
                      <div
                        style={{
                          height: 5,
                          background: "var(--muted)",
                          borderRadius: 9999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: (c.sessionsCompleted / c.sessionsTotal) * 100 + "%",
                            background: "var(--primary)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                    <button className="btn btn-primary" style={{ flex: 1, fontSize: 10.5 }}>
                      Ver detalle
                    </button>
                    <button
                      className="btn"
                      disabled={pending && cancellingId === c.id}
                      onClick={() => handleCancel(c)}
                      style={{
                        background: "#fff",
                        border: "1px solid var(--border)",
                        fontSize: 10.5,
                        opacity: pending && cancellingId === c.id ? 0.6 : 1,
                        cursor: pending && cancellingId === c.id ? "wait" : "pointer",
                      }}
                    >
                      {pending && cancellingId === c.id ? "Cancelando…" : "Cancelar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2
        className="font-heading"
        style={{
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: "8px 0 0",
        }}
      >
        Historial<span className="dot">.</span>
      </h2>

      {past.length === 0 ? (
        <EmptyState
          icon="history"
          title="Sin historial todavía"
          sub="Cuando termines tu primera clase aparecerá aquí con tu progreso."
        />
      ) : (
        past.map((p) => (
          <div
            key={p.id}
            className="card"
            style={{
              padding: 16,
              display: "grid",
              gridTemplateColumns: "40px 1fr 140px 140px 100px",
              gap: 16,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 9,
                background: "var(--muted)",
                color: "var(--muted-fg)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="check-check" size={17} color="var(--primary)" />
            </div>
            <div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.015em" }}>
                {p.name}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted-fg)" }}>
                con {p.coachName} · {enrolledRangeLabel(p.enrolledAt)}
              </div>
            </div>
            <div>
              <div className="label-mp">Completadas</div>
              <div className="font-heading" style={{ fontSize: 14, fontWeight: 900 }}>
                {p.completed} / {p.total}
              </div>
            </div>
            <div>
              <div className="label-mp">Progreso</div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--primary)" }}>
                {p.total > 0 ? `${Math.round((p.completed / p.total) * 100)}%` : "—"}
              </div>
            </div>
            <span />
          </div>
        ))
      )}
    </>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div
      className="card"
      style={{
        padding: 40,
        textAlign: "center",
        color: "var(--muted-fg)",
      }}
    >
      <Icon name={icon} size={32} color="var(--muted-fg)" />
      <div
        className="font-heading"
        style={{
          fontSize: 18,
          fontWeight: 900,
          marginTop: 12,
          color: "#0a0a0a",
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
        <span className="dot">.</span>
      </div>
      <p style={{ fontSize: 13, marginTop: 8, maxWidth: 360, margin: "8px auto 0" }}>{sub}</p>
    </div>
  );
}
