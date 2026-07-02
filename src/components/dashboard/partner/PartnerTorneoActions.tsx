"use client";
// Panel de acciones para la página de gestión del torneo del partner.
// Maneja: estelar (admin-only mostrado pero pega contra setTournamentFeatured),
// cerrar inscripciones, cancelar torneo, generar bracket.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { usePromptModal } from "@/components/dashboard/widgets/PromptModal";
import {
  setTournamentStatus,
  setTournamentFeatured,
  generateBracket,
} from "@/server/actions/tournaments";
import { closeTournament } from "@/server/actions/tournament-close";
import type { CategoryWinner } from "@/server/actions/tournament-close";
import {
  EditTournamentModal,
  type EditableTournament,
  type ClubOption,
} from "./EditTournamentModal";

type Props = {
  tournamentId: string;
  status: string;
  format: string;
  isFeatured: boolean;
  isAdmin: boolean;
  acceptedCount: number;
  hasBracket: boolean;
  categoriesCount?: number;
  setupLocked: boolean;
  setupLockMessage?: string | null;
  editable: EditableTournament;
  categoryWinners?: CategoryWinner[];
  availableClubs?: ClubOption[];
};

export function PartnerTorneoActions({
  tournamentId,
  status,
  format,
  isFeatured,
  isAdmin,
  acceptedCount,
  hasBracket,
  categoriesCount = 0,
  setupLocked,
  setupLockMessage,
  editable,
  categoryWinners = [],
  availableClubs = [],
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const { confirm } = usePromptModal();
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [featuredOptimistic, setFeaturedOptimistic] = useState<boolean | null>(null);
  const shownFeatured = featuredOptimistic ?? isFeatured;

  useEffect(() => {
    setFeaturedOptimistic(null);
  }, [isFeatured]);

  const wrap = (key: string, fn: () => Promise<unknown>, okMsg: string, okIcon = "check") => {
    if (busy) return;
    setBusy(key);
    startTx(async () => {
      try {
        const res = (await fn()) as { ok: boolean; error?: { message: string } };
        if (res.ok) {
          toast({ icon: okIcon, title: okMsg });
          await router.refresh();
        } else {
          if (key === "estelar") setFeaturedOptimistic(null);
          toast({
            icon: "alert-triangle",
            title: "No se pudo",
            sub: res.error?.message ?? "Error",
          });
        }
      } catch {
        if (key === "estelar") setFeaturedOptimistic(null);
      } finally {
        setBusy(null);
      }
    });
  };

  const onEstelar = async () => {
    if (busy) return;
    if (shownFeatured) {
      const ok = await confirm({
        title: "Quitar de estelares",
        body: "Este torneo dejará de aparecer destacado en portada y eventos. ¿Quieres continuar?",
        confirmLabel: "Quitar estelar",
        destructive: true,
      });
      if (!ok) return;
    }
    setFeaturedOptimistic(!shownFeatured);
    wrap(
      "estelar",
      () => setTournamentFeatured({ tournamentId, featured: !shownFeatured }),
      shownFeatured ? "Quitado de estelares" : "Marcado como estelar",
      "star",
    );
  };

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

  const onFinalizar = async () => {
    const winnerLines =
      categoryWinners.length > 0
        ? "\n\nCampeones detectados:\n" +
          categoryWinners
            .map((c) => `• ${c.categoryName}: ${c.winnerLabel ?? "Sin ganador definido"}`)
            .join("\n")
        : "";
    const ok = await confirm({
      title: "Finalizar torneo",
      body:
        `El torneo se marcará como finalizado y se notificará a todos los inscritos.${winnerLines}\n\n¿Deseas continuar?`,
      confirmLabel: "Finalizar torneo",
      destructive: true,
    });
    if (!ok) return;
    wrap("finalizar", () => closeTournament({ tournamentId }), "Torneo finalizado", "flag");
  };

  const isGroupsFormat = format === "groups_to_knockout";
  const isLigaFormat = format === "round_robin" || format === "swiss";
  // Con categorías, cada llave se genera POR categoría en la pantalla Brackets;
  // el botón directo generaría un bracket global que mezcla categorías (y su
  // final cerraría todo el torneo). El server también lo rechaza
  // (BRACKETS.CATEGORY_REQUIRED) — esto es la entrada correcta, no solo UI.
  const isBracketFormat = !isGroupsFormat && !isLigaFormat;

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
      {setupLocked && setupLockMessage && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.45 }}>
          {setupLockMessage}
        </p>
      )}
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
          disabled={cancelled || setupLocked}
          title={setupLocked ? setupLockMessage ?? undefined : undefined}
        />
        {isAdmin && (
          <ActionBtn
            icon="star"
            label={shownFeatured ? "Quitar estelar" : "Marcar estelar"}
            onClick={onEstelar}
            loading={busy === "estelar"}
            accent={shownFeatured ? "#fbbf24" : undefined}
          />
        )}
        <ActionBtn
          icon="lock"
          label="Cerrar inscripciones"
          onClick={onCerrar}
          loading={busy === "cerrar"}
          disabled={closed}
        />
        {isBracketFormat && categoriesCount === 0 && !hasBracket && (
          <ActionBtn
            icon="trophy"
            label="Generar bracket"
            onClick={onGenerar}
            loading={busy === "bracket"}
            primary
          />
        )}
        {isBracketFormat && categoriesCount > 0 && (
          <ActionBtn
            icon="trophy"
            label="Brackets por categoría"
            onClick={() => router.push(`/dashboard/partner/p-brackets?tid=${tournamentId}`)}
            primary={!hasBracket}
          />
        )}
        {status === "live" && (
          <ActionBtn
            icon="flag"
            label="Finalizar torneo"
            onClick={onFinalizar}
            loading={busy === "finalizar"}
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
        availableClubs={availableClubs}
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
  title,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  accent?: string;
  title?: string;
}) {
  const isInactive = !!disabled || !!loading;
  const fg = isInactive
    ? "var(--muted-fg)"
    : danger
      ? "#dc2626"
      : primary
        ? "#fff"
        : accent ?? "#0a0a0a";
  const bg = primary
    ? "var(--primary)"
    : accent && !isInactive
      ? `${accent}1a`
      : "#fff";
  const border = primary ? "transparent" : danger ? "#fecaca" : "var(--border)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isInactive}
      aria-busy={loading || undefined}
      title={title}
      className={`mp-action-tile${loading ? " is-loading" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        cursor: isInactive ? "not-allowed" : "pointer",
        opacity: isInactive ? 0.55 : 1,
        textAlign: "left",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 800,
        color: fg,
        transition: "transform 160ms var(--ease-out), background 160ms var(--ease-out), opacity 160ms var(--ease-out)",
      }}
    >
      <Icon name={icon} size={14} color={fg} />
      {loading ? "Procesando…" : label}
    </button>
  );
}
