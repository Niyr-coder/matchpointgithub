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
  dbStatus: string;
};
export type ClubOption = { id: string; name: string; city: string | null };
export type TorneosData = {
  partnerId: string | null;
  rows: TorneoRow[];
  clubs: ClubOption[];
  filterClub: { id: string; name: string } | null;
};

const PLACEHOLDER_COUNT = 4;

const ST_STYLES: Record<TorneoStatus, { bg: string; l: string }> = {
  LIVE: { bg: "#dc2626", l: "● LIVE" },
  "IN PROGRESS": { bg: "var(--torneo-accent, #fbbf24)", l: "EN CURSO" },
  OPEN: { bg: "var(--primary)", l: "ABIERTO" },
  CLOSED: { bg: "var(--muted-fg)", l: "CERRADO" },
};

const METRIC_CLASS: Record<string, string> = {
  Cupos: "",
  Premio: "is-prize",
  Revenue: "is-revenue",
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
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
    <div className={`card mp-partner-torneo-card${menuOpen ? " is-menu-open" : ""}`}>
      <div className="mp-partner-torneo-card-inner">
        <div className="mp-partner-torneo-card-main">
          <div className="mp-partner-torneo-card-kicker">
            <RSPill bg={ST_STYLES[t.st].bg}>{ST_STYLES[t.st].l}</RSPill>
            <span className="label-mp mp-partner-torneo-card-sport">{t.sport}</span>
          </div>
          <h3 className="font-heading mp-partner-torneo-card-title">
            {t.n}
            <span className="dot">.</span>
          </h3>
          <p className="mp-partner-torneo-card-date">{t.date}</p>
        </div>
        <div className="mp-partner-torneo-card-metrics">
          {[
            { l: "Cupos", v: t.cupos },
            { l: "Premio", v: t.prize },
            { l: "Revenue", v: t.revenue },
          ].map((s) => (
            <div key={s.l} className="mp-partner-torneo-card-metric">
              <div className="mp-partner-torneo-stat-label">{s.l}</div>
              <div
                className={`font-heading mp-partner-torneo-card-metric-value${METRIC_CLASS[s.l] ? ` ${METRIC_CLASS[s.l]}` : ""}`}
              >
                {s.v}
              </div>
            </div>
          ))}
        </div>
        <div ref={menuRef} className="mp-partner-torneo-card-actions">
          <button type="button" className="btn btn-primary" onClick={onGestionar}>
            Gestionar
          </button>
          <button
            type="button"
            className={`mp-partner-torneo-card-menu-btn${menuOpen ? " is-open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            aria-label="Más acciones"
            aria-expanded={menuOpen}
          >
            <Icon name="more-horizontal" size={13} color="currentColor" />
          </button>
          {menuOpen && (
            <div className="mp-partner-torneo-card-menu mp-modal-panel">
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
  return (
    <button
      type="button"
      className={`mp-partner-torneo-card-menu-item${danger ? " is-danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={13} color="currentColor" />
      {label}
    </button>
  );
}

function TorneoPlaceholder() {
  return (
    <div className="card mp-partner-torneo-card mp-partner-torneo-card--ph">
      <div className="mp-partner-torneo-card-inner">
        <div className="mp-partner-torneo-card-main">
          <div className="mp-partner-torneo-card-kicker">
            <RSPill bg="var(--muted-fg)">—</RSPill>
            <span className="label-mp mp-partner-torneo-card-sport">—</span>
          </div>
          <h3 className="font-heading mp-partner-torneo-card-title" style={{ color: "var(--muted-fg)" }}>
            Sin torneos
          </h3>
          <p className="mp-partner-torneo-card-date">—</p>
        </div>
        <div className="mp-partner-torneo-card-metrics">
          {[
            { l: "Cupos", v: "0 / —" },
            { l: "Premio", v: "$—" },
            { l: "Revenue", v: "$—" },
          ].map((s) => (
            <div key={s.l} className="mp-partner-torneo-card-metric">
              <div className="mp-partner-torneo-stat-label">{s.l}</div>
              <div className="font-heading mp-partner-torneo-card-metric-value" style={{ color: "var(--muted-fg)" }}>
                {s.v}
              </div>
            </div>
          ))}
        </div>
        <div className="mp-partner-torneo-card-actions">
          <button type="button" className="btn btn-primary" disabled>
            Gestionar
          </button>
        </div>
      </div>
    </div>
  );
}

export function PartnerTorneosScreenView({ data }: { data: TorneosData }) {
  const toast = useToast();
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreate = () => {
    if (!data.partnerId) {
      toast({ icon: "alert-triangle", title: "Sin partner activo" });
      return;
    }
    setCreateOpen(true);
  };

  const clearClubFilter = () => {
    router.push("/dashboard/partner/p-torneos");
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
            {data.filterClub ? (
              <>
                Eventos en {data.filterClub.name} <span className="dot">●</span>{" "}
                {hasReal ? data.rows.length : 0}
              </>
            ) : (
              <>
                Mis torneos <span className="dot">●</span> {hasReal ? data.rows.length : 0}
              </>
            )}
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
      {data.filterClub && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            fontSize: 12,
            color: "var(--muted-fg)",
          }}
        >
          <span>
            Solo tus eventos en <strong style={{ color: "#0a0a0a" }}>{data.filterClub.name}</strong>.
            No tienes acceso a la gestión del club.
          </span>
          <button type="button" className="btn btn-ghost" onClick={clearClubFilter} style={{ fontSize: 11 }}>
            Ver todos
          </button>
        </div>
      )}
      {data.partnerId && (
        <CreateTournamentFlow
          partnerId={data.partnerId}
          clubs={data.clubs}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          initialClubId={data.filterClub?.id}
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
