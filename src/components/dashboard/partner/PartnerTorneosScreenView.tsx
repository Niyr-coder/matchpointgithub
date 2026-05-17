// Client view de PartnerTorneosScreen — layout 1:1 (RoleScreens.jsx 462-505).
"use client";
import { useTransition } from "react";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { createTournament } from "@/server/actions/tournaments";

export type TorneoStatus = "LIVE" | "IN PROGRESS" | "OPEN" | "CLOSED";
export type TorneoRow = {
  id: string;
  n: string;
  sport: string;
  date: string;
  cupos: string;
  revenue: string;
  prize: string;
  st: TorneoStatus;
  color: string;
};
export type TorneosData = { partnerId: string | null; rows: TorneoRow[] };

const PLACEHOLDER_COUNT = 4;

const ST_STYLES: Record<TorneoStatus, { bg: string; l: string }> = {
  LIVE: { bg: "#dc2626", l: "● LIVE" },
  "IN PROGRESS": { bg: "#fbbf24", l: "EN CURSO" },
  OPEN: { bg: "var(--primary)", l: "ABIERTO" },
  CLOSED: { bg: "var(--muted-fg)", l: "CERRADO" },
};

function TorneoCard({ t }: { t: TorneoRow }) {
  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "4px 1fr 100px 100px 110px 120px",
      }}
    >
      <div style={{ background: t.color }} />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <RSPill bg={ST_STYLES[t.st].bg}>{ST_STYLES[t.st].l}</RSPill>
          <span
            style={{
              fontSize: 9.5,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {t.sport}
          </span>
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 17,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
          }}
        >
          {t.n}
          <span style={{ color: "var(--primary)" }}>.</span>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>{t.date}</div>
      </div>
      {[
        { l: "Cupos", v: t.cupos, c: "#0a0a0a" },
        { l: "Premio", v: t.prize, c: "#fbbf24" },
        { l: "Revenue", v: t.revenue, c: "var(--primary)" },
      ].map((s) => (
        <div
          key={s.l}
          style={{
            padding: 16,
            borderLeft: "1px dashed var(--border)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <div className="label-mp">{s.l}</div>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              marginTop: 4,
              color: s.c,
            }}
          >
            {s.v}
          </div>
        </div>
      ))}
      <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <button className="btn btn-primary" style={{ fontSize: 10.5, padding: "6px 12px" }}>
          Gestionar
        </button>
        <button
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "var(--muted)",
            border: 0,
            cursor: "pointer",
          }}
        >
          <Icon name="more-horizontal" size={12} />
        </button>
      </div>
    </div>
  );
}

function TorneoPlaceholder() {
  return (
    <div
      style={{
        padding: 0,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "4px 1fr 100px 100px 110px 120px",
        background: "#fafafa",
        border: "1px dashed var(--border)",
        borderRadius: 12,
        opacity: 0.6,
      }}
    >
      <div style={{ background: "var(--muted-fg)" }} />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
          <RSPill bg="var(--muted-fg)">—</RSPill>
          <span
            style={{
              fontSize: 9.5,
              color: "var(--muted-fg)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            —
          </span>
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 17,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            color: "var(--muted-fg)",
          }}
        >
          Sin torneos
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>—</div>
      </div>
      {[
        { l: "Cupos", v: "0 / —" },
        { l: "Premio", v: "$—" },
        { l: "Revenue", v: "$—" },
      ].map((s) => (
        <div
          key={s.l}
          style={{
            padding: 16,
            borderLeft: "1px dashed var(--border)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-end",
          }}
        >
          <div className="label-mp">{s.l}</div>
          <div
            className="font-heading"
            style={{
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              marginTop: 4,
              color: "var(--muted-fg)",
            }}
          >
            {s.v}
          </div>
        </div>
      ))}
      <div style={{ padding: 16, display: "flex", alignItems: "center", gap: 6 }}>
        <button
          className="btn btn-primary"
          style={{ fontSize: 10.5, padding: "6px 12px" }}
          disabled
        >
          Gestionar
        </button>
      </div>
    </div>
  );
}

export function PartnerTorneosScreenView({ data }: { data: TorneosData }) {
  const toast = useToast();
  const { ask } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const handleCreate = async () => {
    if (!data.partnerId) {
      toast({ icon: "alert-triangle", title: "Sin partner activo" });
      return;
    }
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
    const name = await ask({
      title: "Nuevo torneo · 1/4",
      label: "Nombre del torneo",
      placeholder: "ej. Open Pickleball Quito 2026",
      required: true,
      confirmLabel: "Siguiente",
    });
    if (name == null) return;
    const startsAt = await ask({
      title: "Nuevo torneo · 2/4",
      label: "Fecha de inicio (ISO)",
      placeholder: "ej. 2026-06-15T18:00:00Z",
      required: true,
      validate: (v) => (ISO_RE.test(v.trim()) ? null : "Formato ISO: 2026-06-15T18:00:00Z"),
      confirmLabel: "Siguiente",
    });
    if (startsAt == null) return;
    const endsAt = await ask({
      title: "Nuevo torneo · 3/4",
      label: "Fecha de fin (ISO)",
      placeholder: "ej. 2026-06-17T22:00:00Z",
      required: true,
      validate: (v) => (ISO_RE.test(v.trim()) ? null : "Formato ISO: 2026-06-17T22:00:00Z"),
      confirmLabel: "Siguiente",
    });
    if (endsAt == null) return;
    const feeStr = await ask({
      title: "Nuevo torneo · 4/4",
      label: "Inscripción (USD)",
      initialValue: "0",
      required: true,
      validate: (v) => (/^\d+(\.\d+)?$/.test(v.trim()) ? null : "Solo números"),
      confirmLabel: "Crear torneo",
    });
    if (feeStr == null) return;
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);
    startTransition(async () => {
      const res = await createTournament({
        partnerId: data.partnerId!,
        name: name.trim(),
        slug,
        sport: "pickleball",
        format: "single_elim",
        startsAt,
        endsAt,
        entryFeeCents: Math.round(Number(feeStr) * 100) || 0,
        currency: "USD",
      });
      if (res.ok) toast({ icon: "check", title: "Torneo creado" });
      else toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
    });
  };

  useRealtimeRefresh(
    data.partnerId
      ? [
          { table: "tournaments", filter: `partner_id=eq.${data.partnerId}` },
          { table: "registrations" },
        ]
      : [],
    { enabled: !!data.partnerId },
  );

  const hasReal = data.rows.length > 0;

  return (
    <>
      <RSHeader
        label="Partner · Torneos"
        title={
          <>
            Mis torneos <span className="dot">●</span> {hasReal ? data.rows.length : 0}
          </>
        }
        action={
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={isPending || !data.partnerId}
          >
            <Icon name="plus" size={13} color="#fff" />
            {isPending ? "Creando…" : "Crear torneo"}
          </button>
        }
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {hasReal
          ? data.rows.map((t) => <TorneoCard key={t.id} t={t} />)
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <TorneoPlaceholder key={k} />)}
      </div>
    </>
  );
}
