"use client";
// Panel de acciones para la página de gestión del torneo del partner.
// Maneja: estelar (admin-only mostrado pero pega contra setTournamentFeatured),
// cerrar inscripciones, cancelar torneo, generar bracket.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import {
  setTournamentStatus,
  setTournamentFeatured,
  generateBracket,
} from "@/server/actions/tournaments";
import {
  EditTournamentModal,
  type EditableTournament,
} from "./EditTournamentModal";

type Props = {
  tournamentId: string;
  status: string;
  format: string;
  isFeatured: boolean;
  isAdmin: boolean;
  acceptedCount: number;
  hasBracket: boolean;
  editable: EditableTournament;
};

export function PartnerTorneoActions({
  tournamentId,
  status,
  format,
  isFeatured,
  isAdmin,
  acceptedCount,
  hasBracket,
  editable,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const wrap = (key: string, fn: () => Promise<unknown>, okMsg: string, okIcon = "check") => {
    if (busy) return;
    setBusy(key);
    startTx(async () => {
      try {
        const res = (await fn()) as { ok: boolean; error?: { message: string } };
        if (res.ok) {
          toast({ icon: okIcon, title: okMsg });
          router.refresh();
        } else {
          toast({
            icon: "alert-triangle",
            title: "No se pudo",
            sub: res.error?.message ?? "Error",
          });
        }
      } finally {
        setBusy(null);
      }
    });
  };

  const onEstelar = () =>
    wrap(
      "estelar",
      () => setTournamentFeatured({ tournamentId, featured: !isFeatured }),
      isFeatured ? "Quitado de estelares" : "Marcado como estelar",
      "star",
    );

  const onCerrar = () =>
    wrap(
      "cerrar",
      () => setTournamentStatus({ tournamentId, status: "registration_closed" }),
      "Inscripciones cerradas",
      "lock",
    );

  const onCancelar = async () => {
    const ok = await confirm({
      title: "Cancelar torneo",
      body: "Esta acción avisa a todos los inscritos. ¿Continuar?",
      confirmLabel: "Cancelar torneo",
      destructive: true,
    });
    if (!ok) return;
    wrap(
      "cancelar",
      () => setTournamentStatus({ tournamentId, status: "cancelled" }),
      "Torneo cancelado",
      "x",
    );
  };

  const isGroupsFormat = format === "groups_to_knockout";

  const onGenerar = () => {
    if (acceptedCount < 2) {
      toast({
        icon: "alert-triangle",
        title: "Faltan inscritos",
        sub: "Necesitas al menos 2 aceptados.",
      });
      return;
    }
    wrap(
      "bracket",
      () => generateBracket({ tournamentId }),
      "Bracket generado",
      "trophy",
    );
  };

  const closed = status === "registration_closed" || status === "cancelled" || status === "finished";
  const cancelled = status === "cancelled" || status === "finished";
  const isDraft = status === "draft";

  const onPublicar = () =>
    wrap(
      "publicar",
      () => setTournamentStatus({ tournamentId, status: "registration_open" }),
      "Torneo publicado · inscripciones abiertas",
      "rocket",
    );

  return (
    <div className="card" style={{ padding: 18 }}>
      <div className="label-mp">Acciones del torneo</div>
      <div className="mp-partner-torneo-actions-grid">
        {isDraft && (
          <ActionBtn
            icon="rocket"
            label="Publicar torneo"
            onClick={onPublicar}
            loading={busy === "publicar"}
            primary
          />
        )}
        <ActionBtn
          icon="pencil"
          label="Editar torneo"
          onClick={() => setEditOpen(true)}
          disabled={cancelled}
        />
        {isAdmin && (
          <ActionBtn
            icon="star"
            label={isFeatured ? "Quitar estelar" : "Marcar estelar"}
            onClick={onEstelar}
            loading={busy === "estelar"}
            accent={isFeatured ? "#fbbf24" : undefined}
          />
        )}
        <ActionBtn
          icon="lock"
          label="Cerrar inscripciones"
          onClick={onCerrar}
          loading={busy === "cerrar"}
          disabled={closed}
        />
        {!isGroupsFormat && !hasBracket && (
          <ActionBtn
            icon="trophy"
            label="Generar bracket"
            onClick={onGenerar}
            loading={busy === "bracket"}
            primary
          />
        )}
        <ActionBtn
          icon="x"
          label="Cancelar torneo"
          onClick={onCancelar}
          loading={busy === "cancelar"}
          disabled={cancelled}
          danger
        />
      </div>
      <EditTournamentModal
        tournament={editable}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  loading,
  disabled,
  danger,
  primary,
  accent,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  accent?: string;
}) {
  const fg = disabled
    ? "var(--muted-fg)"
    : danger
      ? "#dc2626"
      : primary
        ? "#fff"
        : accent ?? "#0a0a0a";
  const bg = primary
    ? "var(--primary)"
    : accent
      ? `${accent}1a`
      : "#fff";
  const border = primary ? "transparent" : danger ? "#fecaca" : "var(--border)";
  return (
    <button
      onClick={onClick}
      disabled={!!disabled || !!loading}
      className="mp-action-tile"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "left",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 800,
        color: fg,
        transition: "transform 160ms var(--ease-out), background 160ms var(--ease-out)",
      }}
    >
      <Icon name={icon} size={14} color={fg} />
      {loading ? "Procesando…" : label}
    </button>
  );
}
