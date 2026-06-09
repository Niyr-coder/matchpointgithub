// Client view de CoachClasesScreen — layout del mock 1:1 (RoleScreens.jsx 597-653).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RS_BORDER, RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createClass } from "@/server/actions/classes";

export type ClassRow = {
  id: string;
  name: string;
  kind: "Grupal" | "Individual";
  day: string;
  time: string;
  enrolled: number;
  cap: number;
  price: string;
  st: "active" | "full" | "paused";
};

export type ClasesData = {
  coachId: string | null;
  classes: ClassRow[];
};

const PLACEHOLDER_COUNT = 4;

function ClassCard({ c }: { c: ClassRow }) {
  return (
    <div
      className="card"
      style={{ padding: 16, opacity: c.st === "paused" ? 0.5 : 1 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <RSPill bg={c.kind === "Individual" ? "#7c3aed" : "#0a0a0a"}>{c.kind}</RSPill>
            {c.st === "full" && <RSPill bg="#fbbf24">LLENA</RSPill>}
            {c.st === "paused" && <RSPill bg="var(--muted-fg)">PAUSADA</RSPill>}
          </div>
          <div
            className="font-heading"
            style={{ fontSize: 15, fontWeight: 900, letterSpacing: "-0.015em" }}
          >
            {c.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: "var(--primary)",
              letterSpacing: "-0.02em",
            }}
          >
            {c.price}
          </div>
          <div
            style={{
              fontSize: 9,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            por clase
          </div>
        </div>
      </div>
      <div className="mp-tournament-form-grid-2" style={{ gap: 8, marginTop: 10 }}>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Días</div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3 }}>{c.day}</div>
        </div>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Horario</div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3 }}>{c.time}</div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            marginBottom: 4,
          }}
        >
          <span style={{ color: "var(--muted-fg)" }}>Inscritos</span>
          <b>
            {c.enrolled} / {c.cap}
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
              width: (c.enrolled / Math.max(c.cap, 1)) * 100 + "%",
              background: c.enrolled === c.cap ? "#fbbf24" : "var(--primary)",
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button className="btn btn-primary" style={{ flex: 1, fontSize: 11 }}>
          Ver alumnos
        </button>
        <button className="btn" style={{ background: "#fff", border: RS_BORDER, fontSize: 11 }}>
          <Icon name="settings-2" size={11} />
        </button>
      </div>
    </div>
  );
}

function ClassPlaceholder() {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 10,
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <RSPill bg="var(--muted-fg)">—</RSPill>
          </div>
          <div
            className="font-heading"
            style={{
              fontSize: 15,
              fontWeight: 900,
              letterSpacing: "-0.015em",
              color: "var(--muted-fg)",
            }}
          >
            Sin clases aún
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              color: "var(--muted-fg)",
              letterSpacing: "-0.02em",
            }}
          >
            $—
          </div>
          <div
            style={{
              fontSize: 9,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            por clase
          </div>
        </div>
      </div>
      <div className="mp-tournament-form-grid-2" style={{ gap: 8, marginTop: 10 }}>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Días</div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3, color: "var(--muted-fg)" }}>—</div>
        </div>
        <div style={{ padding: 8, background: "var(--muted)", borderRadius: 6 }}>
          <div className="label-mp">Horario</div>
          <div style={{ fontSize: 11, fontWeight: 800, marginTop: 3, color: "var(--muted-fg)" }}>—</div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 10.5,
            marginBottom: 4,
          }}
        >
          <span style={{ color: "var(--muted-fg)" }}>Inscritos</span>
          <b style={{ color: "var(--muted-fg)" }}>0 / 0</b>
        </div>
        <div style={{ height: 5, background: "var(--muted)", borderRadius: 9999, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "0%", background: "var(--border)" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button
          className="btn btn-primary"
          style={{ flex: 1, fontSize: 11, opacity: 0.5, cursor: "not-allowed" }}
          disabled
        >
          Ver alumnos
        </button>
        <button
          className="btn"
          style={{ background: "#fff", border: "1px dashed var(--border)", fontSize: 11, opacity: 0.5, cursor: "not-allowed" }}
          disabled
        >
          <Icon name="settings-2" size={11} />
        </button>
      </div>
    </div>
  );
}

export function CoachClasesScreenView({ data }: { data: ClasesData }) {
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleCreate = async () => {
    const clubId = await ask({
      title: "Nueva clase · paso 1/4",
      label: "ID del club",
      placeholder: "UUID del club donde dictas",
      helper: "Próximamente: selector con tus clubes.",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (clubId == null) return;
    const name = await ask({
      title: "Nueva clase · paso 2/4",
      label: "Nombre de la clase",
      placeholder: "ej. Pickleball intermedio",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (name == null) return;
    const priceStr = await ask({
      title: "Nueva clase · paso 3/4",
      label: "Precio por clase (USD)",
      initialValue: "15",
      required: true,
      validate: (v) => (/^\d+(\.\d+)?$/.test(v.trim()) && Number(v) > 0 ? null : "Solo números mayores que 0"),
      confirmLabel: "Siguiente",
    });
    if (priceStr == null) return;
    const maxStr = await ask({
      title: "Nueva clase · paso 4/4",
      label: "Cupo máximo de alumnos",
      initialValue: "8",
      required: true,
      validate: (v) => (/^\d+$/.test(v.trim()) && Number(v) > 0 ? null : "Solo enteros mayores que 0"),
      confirmLabel: "Crear clase",
    });
    if (maxStr == null) return;
    startTransition(async () => {
      const res = await createClass({
        clubId: clubId.trim(),
        name: name.trim(),
        kind: "group",
        sport: "pickleball",
        maxStudents: Number(maxStr) || 8,
        priceCents: Math.round(Number(priceStr) * 100) || 0,
        currency: "USD",
      });
      if (res.ok) toast({ icon: "check", title: "Clase creada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.coachId
      ? [
          { table: "classes", filter: `coach_id=eq.${data.coachId}` },
          { table: "class_enrollments" },
          { table: "class_sessions" },
        ]
      : [],
    { enabled: !!data.coachId },
  );

  const hasReal = data.classes.length > 0;

  return (
    <>
      <RSHeader
        label="Coach · Clases"
        title={
          <>
            Mis clases <span className="dot">●</span> {data.classes.length}
          </>
        }
        action={
          <button className="btn btn-primary" onClick={handleCreate} disabled={isPending}>
            <Icon name="plus" size={13} color="#fff" />
            {isPending ? "Creando…" : "Nueva clase"}
          </button>
        }
      />
      <div className="mp-tournament-form-grid-2">
        {hasReal
          ? data.classes.map((c) => <ClassCard key={c.id} c={c} />)
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <ClassPlaceholder key={k} />)}
      </div>
    </>
  );
}
