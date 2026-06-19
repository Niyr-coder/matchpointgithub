"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { usePromptModal } from "../widgets/PromptModal";
import { adminClubAppApi } from "@/lib/api/adminClubApplications";
import type { ActionResult } from "@/lib/api/action";

export function AdminApplicationDetailActions({
  applicationId,
  name,
  status,
}: {
  applicationId: string;
  name: string;
  status: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const { ask, confirm } = usePromptModal();
  const [isPending, setIsPending] = useState(false);

  const runMutation = async <T,>(
    fn: () => Promise<ActionResult<T>>,
    okTitle: string,
    okSub?: string,
    onSuccess?: () => void,
  ) => {
    setIsPending(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast({ icon: "check", title: okTitle, sub: okSub });
        if (onSuccess) onSuccess();
        else router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo avanzar",
          sub: r.error?.message ?? "Error desconocido",
        });
      }
    } catch (err) {
      toast({
        icon: "alert-triangle",
        title: "Error de conexión",
        sub: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const doStartDocs = async () => {
    const ok = await confirm({
      title: "Iniciar revisión documental",
      body: "La solicitud pasará a revisión de documentos. El solicitante verá el avance en su timeline.",
      confirmLabel: "Iniciar revisión",
    });
    if (!ok) return;
    void runMutation(
      () => adminClubAppApi.startDocsReview(applicationId),
      "Revisión documental iniciada",
    );
  };

  const doScheduleField = async () => {
    const scheduledAt = await ask({
      title: "Agendar verificación de campo",
      label: "Fecha y hora",
      initialValue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      helper: "Usa formato ISO con zona horaria. Ej: 2026-05-31T15:00:00.000Z",
      required: true,
      confirmLabel: "Agendar",
      validate: (v) => (Number.isNaN(Date.parse(v)) ? "Ingresa una fecha válida en formato ISO." : null),
    });
    if (scheduledAt == null) return;
    const notes = await ask({
      title: "Notas de verificación",
      label: "Notas internas",
      placeholder: "Opcional",
      multiline: true,
      required: false,
      confirmLabel: "Continuar",
    });
    if (notes == null) return;
    void runMutation(
      () =>
        adminClubAppApi.scheduleFieldVerification(
          applicationId,
          scheduledAt,
          notes.trim() || undefined,
        ),
      "Verificación de campo agendada",
    );
  };

  const doMarkFieldVerified = async () => {
    const notes = await ask({
      title: "Marcar campo verificado",
      label: "Notas de la visita",
      placeholder: "Opcional",
      multiline: true,
      required: false,
      confirmLabel: "Marcar verificado",
    });
    if (notes == null) return;
    void runMutation(
      () => adminClubAppApi.markFieldVerified(applicationId, notes.trim() || undefined),
      "Campo verificado",
    );
  };

  const doStartFinal = async () => {
    const ok = await confirm({
      title: "Pasar a revisión final",
      body: "Usa este paso cuando documentos y verificación de campo ya estén revisados.",
      confirmLabel: "Pasar a revisión final",
    });
    if (!ok) return;
    void runMutation(
      () => adminClubAppApi.startFinalReview(applicationId),
      "Solicitud en revisión final",
    );
  };

  const doApproveFinal = async () => {
    const ok = await confirm({
      title: `Aprobar "${name}"`,
      body: "Se creará el club, se asignará el rol owner al solicitante y se notificará la decisión.",
      confirmLabel: "Aprobar y crear club",
    });
    if (!ok) return;
    void runMutation(
      () => adminClubAppApi.approve(applicationId),
      `Club "${name}" aprobado`,
      undefined,
      () => router.push("/dashboard/admin/admin-clubs"),
    );
  };

  const doQuickApprove = async () => {
    const ok = await confirm({
      title: `Aprobación rápida de "${name}"`,
      body: "Avanza automáticamente las etapas pendientes y crea el club. Úsalo solo cuando soporte ya completó la revisión fuera de la pantalla.",
      confirmLabel: "Aprobación rápida",
    });
    if (!ok) return;
    void runMutation(
      () => adminClubAppApi.quickApprove(applicationId),
      `Club "${name}" aprobado`,
      undefined,
      () => router.push("/dashboard/admin/admin-clubs"),
    );
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
    void runMutation(
      () => adminClubAppApi.reject(applicationId, reason),
      "Solicitud rechazada",
      undefined,
      () => router.push("/dashboard/admin/admin-clubs"),
    );
  };

  const doAddNote = async () => {
    const note = await ask({
      title: "Agregar nota interna",
      label: "Nota de revisión",
      placeholder: "Ej: falta validar RUC con el documento cargado.",
      multiline: true,
      required: true,
      confirmLabel: "Guardar nota",
      validate: (v) => (v.trim().length < 1 ? "Escribe una nota." : null),
    });
    if (note == null) return;
    void runMutation(
      () => adminClubAppApi.addNote(applicationId, note.trim()),
      "Nota agregada",
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "start",
        gap: 12,
        background: "#0a0a0a",
        color: "#fff",
      }}
    >
      <div>
        <div className="label-mp" style={{ color: "rgba(255,255,255,0.6)" }}>
          Pipeline de revisión
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>
          Avanza por documentos, verificación de campo y revisión final antes de crear el club.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {status === "submitted" && (
          <button className="btn btn-primary" disabled={isPending} onClick={doStartDocs}>
            <Icon name="file-search" size={13} color="#fff" />
            Iniciar docs
          </button>
        )}
        {status === "docs_review" && (
          <button className="btn btn-primary" disabled={isPending} onClick={doScheduleField}>
            <Icon name="map-pin" size={13} color="#fff" />
            Agendar campo
          </button>
        )}
        {status === "field_verification" && (
          <>
            <button className="btn btn-primary" disabled={isPending} onClick={doMarkFieldVerified}>
              <Icon name="map-pinned" size={13} color="#fff" />
              Campo verificado
            </button>
            <button className="btn btn-primary" disabled={isPending} onClick={doStartFinal}>
              <Icon name="clipboard-check" size={13} color="#fff" />
              Revisión final
            </button>
          </>
        )}
        {status === "final_review" && (
          <button className="btn btn-primary" disabled={isPending} onClick={doApproveFinal}>
            <Icon name="check" size={13} color="#fff" />
            {isPending ? "Procesando…" : "Aprobar y crear club"}
          </button>
        )}
        {status !== "final_review" && (
          <button
            className="btn"
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
            disabled={isPending}
            onClick={doQuickApprove}
          >
            <Icon name="zap" size={12} color="#fff" />
            Aprobación rápida
          </button>
        )}
        <button
          className="btn"
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
          disabled={isPending}
          onClick={doAddNote}
        >
          <Icon name="message-square-plus" size={12} color="#fff" />
          Nota
        </button>
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
      </div>
    </div>
  );
}

export function AdminApplicationDocumentActions({
  applicationId,
  documentId,
  status,
  applicationStatus,
}: {
  applicationId: string;
  documentId: string;
  status: string;
  applicationStatus: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const { ask, confirm } = usePromptModal();
  const [isPending, setIsPending] = useState(false);
  const canReview =
    status !== "pending" &&
    ["docs_review", "field_verification", "final_review"].includes(applicationStatus);

  const approveDoc = async () => {
    const ok = await confirm({
      title: "Aprobar documento",
      body: "Marca este documento como validado para la revisión de la solicitud.",
      confirmLabel: "Aprobar documento",
    });
    if (!ok) return;
    setIsPending(true);
    try {
      const r = await adminClubAppApi.approveDocument(applicationId, documentId);
      if (r.ok) {
        toast({ icon: "check", title: "Documento aprobado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo aprobar", sub: r.error?.message });
      }
    } catch (err) {
      toast({
        icon: "alert-triangle",
        title: "Error de conexión",
        sub: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    } finally {
      setIsPending(false);
    }
  };

  const rejectDoc = async () => {
    const reason = await ask({
      title: "Rechazar documento",
      label: "Motivo",
      placeholder: "Ej: el archivo está ilegible o no corresponde al RUC.",
      multiline: true,
      required: true,
      confirmLabel: "Rechazar documento",
      destructive: true,
      validate: (v) => (v.trim().length < 2 ? "Escribe un motivo." : null),
    });
    if (reason == null) return;
    setIsPending(true);
    try {
      const r = await adminClubAppApi.rejectDocument(applicationId, documentId, reason.trim());
      if (r.ok) {
        toast({ icon: "x", title: "Documento rechazado" });
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "No se pudo rechazar", sub: r.error?.message });
      }
    } catch (err) {
      toast({
        icon: "alert-triangle",
        title: "Error de conexión",
        sub: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    } finally {
      setIsPending(false);
    }
  };

  if (!canReview) return null;
  return (
    <>
      {status !== "approved" && (
        <button
          type="button"
          className="btn"
          disabled={isPending}
          onClick={approveDoc}
          style={{
            background: "#ecfdf5",
            border: "1px solid #bbf7d0",
            color: "#166534",
            fontSize: 10.5,
          }}
        >
          <Icon name="check" size={11} color="#166534" />
          Aprobar
        </button>
      )}
      {status !== "rejected" && (
        <button
          type="button"
          className="btn"
          disabled={isPending}
          onClick={rejectDoc}
          style={{
            background: "#fff",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: 10.5,
          }}
        >
          <Icon name="x" size={11} color="#991b1b" />
          Rechazar
        </button>
      )}
    </>
  );
}
