// Client view de PartnerTorneosScreen.
"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { RSHeader, RSPill } from "../widgets/RS";
import { useRealtimeRefresh } from "../useRealtimeRefresh";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { setTournamentStatus } from "@/server/actions/tournaments";
import { CreateTournamentFlow } from "./CreateTournamentFlow";

export type TorneoStatus = "LIVE" | "IN PROGRESS" | "OPEN" | "CLOSED";
export type TorneoRow = {
  id: string;
  slug: string;
  n: string;
  sport: string;
  date: string;
  cupos: string;
  revenue: string;
  prize: string;
  st: TorneoStatus;
  color: string;
  dbStatus: string;
};
export type ClubOption = { id: string; name: string; city: string | null };
export type TorneosData = {
  partnerId: string | null;
  rows: TorneoRow[];
  clubs: ClubOption[];
};

const PLACEHOLDER_COUNT = 4;

const ST_STYLES: Record<TorneoStatus, { bg: string; l: string }> = {
  LIVE: { bg: "#dc2626", l: "● LIVE" },
  "IN PROGRESS": { bg: "#fbbf24", l: "EN CURSO" },
  OPEN: { bg: "var(--primary)", l: "ABIERTO" },
  CLOSED: { bg: "var(--muted-fg)", l: "CERRADO" },
};

function TorneoCard({ t }: { t: TorneoRow }) {
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierre al click fuera.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const onGestionar = () => router.push(`/dashboard/partner/torneo/${t.id}`);

  const onEditar = () => {
    setMenuOpen(false);
    router.push(`/dashboard/partner/torneo/${t.id}`);
  };
  const onCerrar = () => {
    setMenuOpen(false);
    startTx(async () => {
      const res = await setTournamentStatus({
        tournamentId: t.id,
        status: "registration_closed",
      });
      if (res.ok) {
        toast({ icon: "lock", title: "Inscripciones cerradas" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cerrar", sub: res.error.message });
      }
    });
  };
  const onCancelar = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: "Cancelar torneo",
      body: `Cancelar "${t.n}"? Esta acción avisa a todos los inscritos y libera los cupos.`,
      confirmLabel: "Cancelar torneo",
      destructive: true,
    });
    if (!ok) return;
    startTx(async () => {
      const res = await setTournamentStatus({ tournamentId: t.id, status: "cancelled" });
      if (res.ok) {
        toast({ icon: "x", title: "Torneo cancelado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo cancelar", sub: res.error.message });
      }
    });
  };

  return (
    <div className="card mp-partner-torneo-card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
      <div className="mp-partner-torneo-card-inner">
        <div className="mp-partner-torneo-card-accent" style={{ background: t.color }} />
        <div className="mp-partner-torneo-card-main">
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
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
            className="font-heading mp-partner-torneo-card-title"
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
        <div className="mp-partner-torneo-card-metrics">
          {[
            { l: "Cupos", v: t.cupos, c: "#0a0a0a" },
            { l: "Premio", v: t.prize, c: "#fbbf24" },
            { l: "Revenue", v: t.revenue, c: "var(--primary)" },
          ].map((s) => (
            <div key={s.l} className="mp-partner-torneo-card-metric">
              <div className="mp-partner-torneo-stat-label">{s.l}</div>
              <div
                className="font-heading mp-partner-torneo-stat-value"
                style={{ color: s.c, marginTop: 4 }}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>
        <div ref={menuRef} className="mp-partner-torneo-card-actions">
        <button
          className="btn btn-primary"
          onClick={onGestionar}
          style={{ fontSize: 10.5, padding: "6px 12px" }}
        >
          Gestionar
        </button>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Más acciones"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: menuOpen ? "#0a0a0a" : "var(--muted)",
            color: menuOpen ? "#fff" : "#0a0a0a",
            border: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            lineHeight: 1,
          }}
        >
          <Icon name="more-horizontal" size={12} color={menuOpen ? "#fff" : "#0a0a0a"} />
        </button>
        {menuOpen && (
          <div
            className="mp-modal-panel"
            style={{
              position: "absolute",
              top: "100%",
              right: 12,
              marginTop: 6,
              width: 240,
              background: "#fff",
              border: "1px solid var(--border)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
              zIndex: 50,
              fontSize: 12,
            }}
          >
            <KebabItem icon="pencil" label="Editar torneo" onClick={onEditar} />
            <KebabItem
              icon="lock"
              label="Cerrar inscripciones"
              onClick={onCerrar}
              disabled={t.dbStatus === "registration_closed" || t.dbStatus === "cancelled"}
            />
            <KebabItem
              icon="x"
              label="Cancelar torneo"
              onClick={onCancelar}
              danger
              disabled={t.dbStatus === "cancelled" || t.dbStatus === "finished"}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

function KebabItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const color = disabled ? "var(--muted-fg)" : danger ? "#dc2626" : "#0a0a0a";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 14px",
        background: "transparent",
        border: 0,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12,
        color,
        textAlign: "left",
        fontFamily: "inherit",
        transition: "background 160ms var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon name={icon} size={13} color={color} />
      {label}
    </button>
  );
}

function TorneoPlaceholder() {
  return (
    <div
      className="card mp-partner-torneo-card mp-partner-torneo-card--ph"
      style={{ padding: 0, overflow: "hidden", background: "#fafafa", border: "1px dashed var(--border)", opacity: 0.6 }}
    >
      <div className="mp-partner-torneo-card-inner">
        <div className="mp-partner-torneo-card-accent" style={{ background: "var(--muted-fg)" }} />
        <div className="mp-partner-torneo-card-main">
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <RSPill bg="var(--muted-fg)">—</RSPill>
            <span style={{ fontSize: 9.5, color: "var(--muted-fg)", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase" }}>—</span>
          </div>
          <div className="font-heading mp-partner-torneo-card-title" style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase", color: "var(--muted-fg)" }}>
            Sin torneos
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4 }}>—</div>
        </div>
        <div className="mp-partner-torneo-card-metrics">
          {[
            { l: "Cupos", v: "0 / —" },
            { l: "Premio", v: "$—" },
            { l: "Revenue", v: "$—" },
          ].map((s) => (
            <div key={s.l} className="mp-partner-torneo-card-metric">
              <div className="mp-partner-torneo-stat-label">{s.l}</div>
              <div className="font-heading mp-partner-torneo-stat-value" style={{ color: "var(--muted-fg)", marginTop: 4 }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div className="mp-partner-torneo-card-actions">
          <button className="btn btn-primary" style={{ fontSize: 10.5, padding: "6px 12px" }} disabled>
            Gestionar
          </button>
        </div>
      </div>
    </div>
  );
}

export function PartnerTorneosScreenView({ data }: { data: TorneosData }) {
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreate = () => {
    if (!data.partnerId) {
      toast({ icon: "alert-triangle", title: "Sin partner activo" });
      return;
    }
    setCreateOpen(true);
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
            disabled={!data.partnerId}
          >
            <Icon name="plus" size={13} color="#fff" />
            Crear torneo
          </button>
        }
      />
      {data.partnerId && (
        <CreateTournamentFlow
          partnerId={data.partnerId}
          clubs={data.clubs}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {hasReal
          ? data.rows.map((t) => <TorneoCard key={t.id} t={t} />)
          : Array.from({ length: PLACEHOLDER_COUNT }).map((_, k) => <TorneoPlaceholder key={k} />)}
      </div>
    </>
  );
}
