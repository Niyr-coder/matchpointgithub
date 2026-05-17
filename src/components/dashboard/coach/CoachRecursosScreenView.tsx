// Client view de CoachRecursosScreen — layout del mock 1:1 (RoleScreensPolish.jsx 282-353).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { PolHero } from "../widgets/PolHero";
import { RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createResource } from "@/server/actions/resources";

export type Resource = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  kindLabel: string;
  icon: string;
  color: string;
  uses: number;
};

export type RecursosData = {
  coachId: string | null;
  featured: Resource | null;
  items: Resource[];
  totalUses: number;
};

const PLACEHOLDER_COUNT = 6;

function FeaturedPlaceholder() {
  return (
    <div
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "1.2fr 1.4fr",
        minHeight: 220,
        borderRadius: 14,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          background: "var(--muted)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="folder" size={84} color="var(--muted-fg)" />
      </div>
      <div
        style={{
          padding: 26,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="label-mp">— · más usado</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-0.03em",
              textTransform: "uppercase",
              margin: "6px 0 10px",
              lineHeight: 1,
              color: "var(--muted-fg)",
            }}
          >
            Sin recursos aún
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, margin: 0 }}>
            Sube tu primer drill, plan o video para tenerlo listo cuando lo necesites con un alumno.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 18,
          }}
        >
          <div>
            <div className="label-mp">Usado</div>
            <div
              className="font-heading"
              style={{ fontSize: 22, fontWeight: 900, color: "var(--muted-fg)" }}
            >
              0{" "}
              <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>veces</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className="btn"
              style={{ background: "#fff", border: "1px dashed var(--border)", opacity: 0.5, cursor: "not-allowed" }}
              disabled
            >
              Vista previa
            </button>
            <button className="btn btn-primary" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
              <Icon name="send" size={12} color="#fff" />
              Enviar a alumno
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({ r }: { r: Resource }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}>
      <div
        style={{
          height: 120,
          background: r.color,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={r.icon} size={42} color="rgba(255,255,255,0.8)" />
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <RSPill bg="rgba(0,0,0,0.45)" color="#fff">
            {r.uses} usos
          </RSPill>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            fontSize: 9,
            fontWeight: 900,
            color: "rgba(255,255,255,0.85)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          {r.kindLabel}
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div
          className="font-heading"
          style={{
            fontSize: 13.5,
            fontWeight: 900,
            letterSpacing: "-0.015em",
            lineHeight: 1.25,
          }}
        >
          {r.title}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            className="btn"
            style={{
              flex: 1,
              background: "#fff",
              border: "1px solid var(--border)",
              fontSize: 10,
              padding: "6px 10px",
            }}
          >
            Ver
          </button>
          <button className="btn btn-primary" style={{ flex: 1, fontSize: 10, padding: "6px 10px" }}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function ResourcePlaceholder() {
  return (
    <div
      style={{
        padding: 0,
        overflow: "hidden",
        borderRadius: 14,
        background: "#fafafa",
        border: "1px dashed var(--border)",
        opacity: 0.6,
      }}
    >
      <div
        style={{
          height: 120,
          background: "var(--muted)",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="file" size={42} color="var(--muted-fg)" />
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <RSPill bg="var(--muted-fg)" color="#fff">
            0 usos
          </RSPill>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 8,
            fontSize: 9,
            fontWeight: 900,
            color: "var(--muted-fg)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
          }}
        >
          —
        </div>
      </div>
      <div style={{ padding: 14 }}>
        <div
          className="font-heading"
          style={{
            fontSize: 13.5,
            fontWeight: 900,
            letterSpacing: "-0.015em",
            lineHeight: 1.25,
            color: "var(--muted-fg)",
          }}
        >
          Sin recurso
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            className="btn"
            style={{
              flex: 1,
              background: "#fff",
              border: "1px dashed var(--border)",
              fontSize: 10,
              padding: "6px 10px",
              opacity: 0.5,
              cursor: "not-allowed",
            }}
            disabled
          >
            Ver
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1, fontSize: 10, padding: "6px 10px", opacity: 0.5, cursor: "not-allowed" }}
            disabled
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadResourceButton() {
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();
  const handleUpload = async () => {
    const title = await ask({
      title: "Subir recurso · 1/3",
      label: "Título del recurso",
      placeholder: "ej. Drills de revés",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (title == null) return;
    const KINDS = ["video", "article", "pdf", "plan", "exercise", "link"];
    const kind = await ask({
      title: "Subir recurso · 2/3",
      label: "Tipo",
      initialValue: "video",
      helper: `Opciones: ${KINDS.join(", ")}`,
      required: true,
      validate: (v) => (KINDS.includes(v.trim()) ? null : "Tipo inválido"),
      confirmLabel: "Siguiente",
    });
    if (kind == null) return;
    const desc = await ask({
      title: "Subir recurso · 3/3",
      label: "Descripción (opcional)",
      placeholder: "Breve resumen del recurso",
      multiline: true,
      confirmLabel: "Crear",
    });
    if (desc == null) return;
    startTransition(async () => {
      const res = await createResource({
        title: title.trim(),
        description: desc || undefined,
        kind: kind.trim() as "video" | "article" | "pdf" | "plan" | "exercise" | "link",
        visibility: "private",
      });
      if (res.ok) toast({ icon: "check", title: "Recurso creado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };
  return (
    <button className="btn btn-primary" onClick={handleUpload} disabled={isPending}>
      <Icon name="upload" size={13} color="#fff" />
      {isPending ? "Subiendo…" : "Subir recurso"}
    </button>
  );
}

export function CoachRecursosScreenView({ data }: { data: RecursosData }) {
  useRealtimeRefresh(
    data.coachId
      ? [
          { table: "resources", filter: `coach_id=eq.${data.coachId}` },
          { table: "resource_views" },
        ]
      : [],
    { enabled: !!data.coachId },
  );

  const hasFeatured = data.featured != null;
  const hasItems = data.items.length > 0;
  const totalResources = (data.featured ? 1 : 0) + data.items.length;

  return (
    <>
      <PolHero
        tone="dark"
        wm="BIBLIOTECA"
        accent="#f59e0b"
        label="Coach · Biblioteca"
        title="Tu material"
        sub="Drills, planes y videos que reutilizas con tus alumnos. Lo que más sirve, listo para enviar."
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <Icon name="folder" size={12} color="#fff" />
              Carpetas
            </button>
            <UploadResourceButton />

          </div>
        }
      />

      {hasFeatured && data.featured ? (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "1.2fr 1.4fr",
            minHeight: 220,
          }}
        >
          <div
            style={{
              background: data.featured.color,
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                fontFamily: "Plus Jakarta Sans",
                fontWeight: 900,
                fontSize: 220,
                color: "rgba(255,255,255,0.1)",
                letterSpacing: "-0.06em",
                lineHeight: 0.8,
                transform: "rotate(-6deg) translate(15%, -20%)",
              }}
            >
              {(data.featured.kindLabel.split(" ")[0] ?? "TOP").toUpperCase()}
            </div>
            <div style={{ position: "absolute", top: 16, left: 16 }}>
              <RSPill bg="rgba(255,255,255,0.2)" color="#fff">
                ★ DESTACADO
              </RSPill>
            </div>
            <Icon name={data.featured.icon} size={84} color="rgba(255,255,255,0.85)" />
          </div>
          <div
            style={{
              padding: 26,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div className="label-mp">{data.featured.kindLabel} · más usado</div>
              <h2
                className="font-heading"
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                  margin: "6px 0 10px",
                  lineHeight: 1,
                }}
              >
                {data.featured.title}
                <span className="dot">.</span>
              </h2>
              <p style={{ fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.55, margin: 0 }}>
                {data.featured.description ?? "—"}
              </p>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 18,
              }}
            >
              <div>
                <div className="label-mp">Usado</div>
                <div
                  className="font-heading"
                  style={{ fontSize: 22, fontWeight: 900, color: "var(--primary)" }}
                >
                  {data.featured.uses}{" "}
                  <span style={{ fontSize: 10, color: "var(--muted-fg)", fontWeight: 700 }}>
                    veces
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn"
                  style={{ background: "#fff", border: "1px solid var(--border)" }}
                >
                  Vista previa
                </button>
                <button className="btn btn-primary">
                  <Icon name="send" size={12} color="#fff" />
                  Enviar a alumno
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <FeaturedPlaceholder />
      )}

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            margin: "8px 0 14px",
          }}
        >
          <h2
            className="font-heading"
            style={{
              fontSize: 22,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Todo el material<span className="dot">.</span>
          </h2>
          <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
            {totalResources} recurso{totalResources === 1 ? "" : "s"} · {data.totalUses} usos totales
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {hasItems
            ? data.items.map((r) => <ResourceCard key={r.id} r={r} />)
            : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => (
                <ResourcePlaceholder key={k} />
              ))}
        </div>
      </div>
    </>
  );
}
