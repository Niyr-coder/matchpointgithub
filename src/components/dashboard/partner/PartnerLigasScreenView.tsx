// Client view de PartnerLigasScreen — layout 1:1 (RoleScreens2.jsx 294-319).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createLeague } from "@/server/actions/tournaments";

export type LigaStatus = "EN CURSO" | "PRÓXIMA" | "FINALIZADA" | "ARCHIVADA";
export type LigaRow = {
  id: string;
  n: string;
  teams: number;
  jornada: string;
  revenue: string;
  st: LigaStatus;
};
export type LigasData = { partnerId: string | null; rows: LigaRow[] };

const PLACEHOLDER_COUNT = 3;

const ST_COLOR: Record<LigaStatus, string> = {
  "EN CURSO": "#fbbf24",
  "PRÓXIMA": "var(--primary)",
  FINALIZADA: "var(--muted-fg)",
  ARCHIVADA: "var(--muted-fg)",
};

function LigaCard({ l }: { l: LigaRow }) {
  return (
    <div className="card mp-partner-liga-card" style={{ padding: 18 }}>
      <div className="mp-partner-liga-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <RSPill bg={ST_COLOR[l.st]}>{l.st}</RSPill>
          <div
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              marginTop: 6,
              textTransform: "uppercase",
            }}
          >
            {l.n}
            <span style={{ color: "var(--primary)" }}>.</span>
          </div>
        </div>
        <button className="btn btn-primary mp-partner-liga-cta">Ver detalle</button>
      </div>
      <div className="mp-partner-liga-stats">
        {[
          { l: "Equipos", v: String(l.teams), c: "#0a0a0a" },
          { l: "Jornada", v: l.jornada, c: "#0a0a0a" },
          { l: "Revenue", v: l.revenue, c: "var(--primary)" },
        ].map((s) => (
          <div key={s.l} className="mp-partner-liga-stat" style={{ padding: 10, background: "var(--muted)", borderRadius: 8 }}>
            <div className="label-mp mp-rh-kpi-label">{s.l}</div>
            <div
              className="font-heading"
              style={{ fontSize: 16, fontWeight: 900, marginTop: 3, color: s.c }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LigaPlaceholder() {
  return (
    <div className="card mp-partner-liga-card mp-partner-liga-card--ph" style={{ padding: 18, border: "1px dashed var(--border)", background: "#fafafa", opacity: 0.6 }}>
      <div className="mp-partner-liga-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <RSPill bg="var(--muted-fg)">—</RSPill>
          <div
            className="font-heading"
            style={{
              fontSize: 18,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              marginTop: 6,
              textTransform: "uppercase",
              color: "var(--muted-fg)",
            }}
          >
            Sin ligas
          </div>
        </div>
        <button className="btn btn-primary mp-partner-liga-cta" disabled>
          Ver detalle
        </button>
      </div>
      <div className="mp-partner-liga-stats">
        {[
          { l: "Equipos", v: "0" },
          { l: "Jornada", v: "— / —" },
          { l: "Revenue", v: "$—" },
        ].map((s) => (
          <div key={s.l} className="mp-partner-liga-stat" style={{ padding: 10, background: "var(--muted)", borderRadius: 8 }}>
            <div className="label-mp mp-rh-kpi-label">{s.l}</div>
            <div
              className="font-heading"
              style={{ fontSize: 16, fontWeight: 900, marginTop: 3, color: "var(--muted-fg)" }}
            >
              {s.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PartnerLigasScreenView({ data }: { data: LigasData }) {
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleCreate = async () => {
    if (!data.partnerId) {
      toast({ icon: "alert-triangle", title: "Sin partner activo" });
      return;
    }
    const name = await ask({
      title: "Nueva liga · 1/3",
      label: "Nombre de la liga",
      placeholder: "ej. Liga Pickleball Quito",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (name == null) return;
    const slugDefault = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40);
    const slug = await ask({
      title: "Nueva liga · 2/3",
      label: "Slug (URL)",
      initialValue: slugDefault,
      helper: "Se usa en la URL pública.",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (slug == null) return;
    const SPORTS = ["pickleball", "padel", "tenis"];
    const sport = await ask({
      title: "Nueva liga · 3/3",
      label: "Deporte",
      initialValue: "pickleball",
      helper: `Opciones: ${SPORTS.join(", ")}`,
      required: true,
      validate: (v) => (SPORTS.includes(v.trim()) ? null : "Deporte inválido"),
      confirmLabel: "Crear liga",
    });
    if (sport == null) return;
    startTransition(async () => {
      const res = await createLeague({
        partnerId: data.partnerId!,
        name: name.trim(),
        slug: slug.trim(),
        sport: sport.trim() as "pickleball" | "padel" | "tenis",
      });
      if (res.ok) toast({ icon: "check", title: "Liga creada" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.partnerId ? [{ table: "leagues", filter: `partner_id=eq.${data.partnerId}` }] : [],
    { enabled: !!data.partnerId },
  );

  const hasReal = data.rows.length > 0;

  return (
    <>
      <RSHeader
        label="Partner · Ligas"
        title={
          <>
            Mis ligas <span className="dot">●</span> {hasReal ? data.rows.length : 0}
          </>
        }
        action={
          <button className="btn btn-primary" onClick={handleCreate} disabled={isPending || !data.partnerId}>
            <Icon name="plus" size={13} color="#fff" />
            {isPending ? "Creando…" : "Crear liga"}
          </button>
        }
      />
      <div className="mp-partner-ligas-list">
      {hasReal
        ? data.rows.map((l) => <LigaCard key={l.id} l={l} />)
        : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <LigaPlaceholder key={k} />)}
      </div>
    </>
  );
}
