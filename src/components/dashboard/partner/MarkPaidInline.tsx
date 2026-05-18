"use client";
// Pill clickeable que sustituye al PayStatus cuando la inscripción está
// onsite_pending. Mismo tamaño/forma que el pill normal, así no rompe el grid.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../ToastProvider";
import { markRegistrationPaidByPartner } from "@/server/actions/tournaments";

export function MarkPaidInline({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [, startTx] = useTransition();
  const [loading, setLoading] = useState(false);

  const onClick = () => {
    if (loading) return;
    setLoading(true);
    startTx(async () => {
      const res = await markRegistrationPaidByPartner({ registrationId });
      setLoading(false);
      if (res.ok) {
        toast({ icon: "check", title: "Marcado como pagado" });
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo marcar",
          sub: res.error.message,
        });
      }
    });
  };

  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Marcar como pagado en club"
      style={{
        fontSize: 9.5,
        fontWeight: 900,
        letterSpacing: "0.08em",
        padding: "4px 9px",
        borderRadius: 4,
        background: "#fbbf24",
        color: "#000",
        border: 0,
        cursor: loading ? "wait" : "pointer",
        opacity: loading ? 0.6 : 1,
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        transition: "transform 140ms var(--ease-out), background 140ms var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.background = "var(--primary)";
      }}
      onMouseLeave={(e) => {
        if (!loading) e.currentTarget.style.background = "#fbbf24";
      }}
      onMouseDown={(e) => {
        if (!loading) e.currentTarget.style.transform = "scale(0.97)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {loading ? "MARCANDO…" : "MARCAR PAGADO"}
    </button>
  );
}
