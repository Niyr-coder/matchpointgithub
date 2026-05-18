"use client";
// Panel solo-admin con acciones de soporte para sobreescribir el estado del
// torneo. Reutiliza setTournamentStatus (que ya acepta admin OR partner).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { setTournamentStatus } from "@/server/actions/tournaments";

export function AdminOverridesPanel({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (key: string, newStatus: string, ok: string, icon = "shield") => {
    if (busy) return;
    if (
      !confirm(
        `Override admin: cambiar estado a "${newStatus}". Esta acción es de soporte, no se valida políticas de partner. ¿Continuar?`,
      )
    )
      return;
    setBusy(key);
    startTx(async () => {
      const res = await setTournamentStatus({ tournamentId, status: newStatus });
      setBusy(null);
      if (res.ok) {
        toast({ icon, title: ok });
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "Override falló",
          sub: res.error.message,
        });
      }
    });
  };

  return (
    <div
      className="card"
      style={{
        padding: 18,
        border: "1px dashed #7c3aed",
        background: "rgba(124, 58, 237, 0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 900,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 4,
            background: "#7c3aed",
            color: "#fff",
          }}
        >
          <Icon name="shield" size={10} color="#fff" /> Admin override
        </span>
        <span style={{ fontSize: 11, color: "var(--muted-fg)" }}>
          Acciones de soporte que ignoran las restricciones normales del partner.
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 10,
          marginTop: 12,
        }}
      >
        {status !== "draft" && (
          <OverrideBtn
            icon="eye-off"
            label="Volver a borrador"
            onClick={() => run("draft", "draft", "Torneo en borrador")}
            loading={busy === "draft"}
          />
        )}
        {status !== "registration_open" && status !== "cancelled" && (
          <OverrideBtn
            icon="rocket"
            label="Forzar publicación"
            onClick={() =>
              run("publish", "registration_open", "Inscripciones abiertas")
            }
            loading={busy === "publish"}
          />
        )}
        {status === "cancelled" && (
          <OverrideBtn
            icon="rotate-ccw"
            label="Reactivar torneo"
            onClick={() =>
              run("reactivate", "registration_open", "Torneo reactivado")
            }
            loading={busy === "reactivate"}
          />
        )}
        {status !== "finished" && (
          <OverrideBtn
            icon="flag"
            label="Marcar finalizado"
            onClick={() => run("finish", "finished", "Torneo finalizado")}
            loading={busy === "finish"}
          />
        )}
        {status === "registration_open" && (
          <OverrideBtn
            icon="lock"
            label="Cerrar inscripciones (forzado)"
            onClick={() =>
              run("close", "registration_closed", "Inscripciones cerradas")
            }
            loading={busy === "close"}
          />
        )}
      </div>
    </div>
  );
}

function OverrideBtn({
  icon,
  label,
  onClick,
  loading,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 10,
        background: "#fff",
        border: "1px solid #7c3aed",
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.6 : 1,
        fontFamily: "inherit",
        fontSize: 12,
        fontWeight: 800,
        color: "#0a0a0a",
        textAlign: "left",
        transition: "background 140ms var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.background = "rgba(124,58,237,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#fff";
      }}
    >
      <Icon name={icon} size={13} />
      {loading ? "Procesando…" : label}
    </button>
  );
}
