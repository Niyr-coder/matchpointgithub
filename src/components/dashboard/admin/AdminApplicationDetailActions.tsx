"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import {
  quickApproveApplication,
  rejectApplication,
} from "@/server/actions/clubApplicationsAdmin";

export function AdminApplicationDetailActions({
  applicationId,
  name,
}: {
  applicationId: string;
  name: string;
  status: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const { ask, confirm } = usePromptModal();
  const [isPending, startTransition] = useTransition();

  const doApprove = async () => {
    const ok = await confirm({
      title: `Aprobar "${name}"`,
      body: "Se creará el club, se asignará el rol owner al solicitante y se notificará la decisión.",
      confirmLabel: "Aprobar y crear club",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await quickApproveApplication({ applicationId });
      if (r.ok) {
        toast({ icon: "check", title: `Club "${name}" aprobado` });
        router.push("/dashboard/admin/admin-clubs");
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error al aprobar", sub: r.error.message });
      }
    });
  };

  const doReject = async () => {
    const reason = await ask({
      title: `Rechazar "${name}"`,
      label: "Motivo del rechazo",
      placeholder: "Explica brevemente la razón",
      multiline: true,
      required: true,
      confirmLabel: "Rechazar",
      destructive: true,
    });
    if (reason == null) return;
    startTransition(async () => {
      const r = await rejectApplication({ applicationId, reason });
      if (r.ok) {
        toast({ icon: "check", title: "Solicitud rechazada" });
        router.push("/dashboard/admin/admin-clubs");
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error al rechazar", sub: r.error.message });
      }
    });
  };

  return (
    <div
      className="card"
      style={{
        padding: 16,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        background: "#0a0a0a",
        color: "#fff",
      }}
    >
      <div>
        <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
          Decisión
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>
          Aprobar crea el club y materializa canchas + rol owner. Rechazar requiere motivo.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn"
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
          disabled={isPending}
          onClick={doReject}
        >
          <Icon name="x" size={12} color="#fff" />
          Rechazar
        </button>
        <button
          className="btn btn-primary"
          disabled={isPending}
          onClick={doApprove}
        >
          <Icon name="check" size={13} color="#fff" />
          {isPending ? "Procesando…" : "Aprobar y crear club"}
        </button>
      </div>
    </div>
  );
}
