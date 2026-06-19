"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "@/components/dashboard/ToastProvider";
import { assignClubTournamentPartner } from "@/server/actions/events";
import { formatActionError } from "@/lib/user-facing/errors";

export type VerifiedPartnerOption = { id: string; name: string };

export function AssignTournamentPartnerModal({
  clubId,
  tournamentId,
  tournamentName,
  partners,
  onClose,
}: {
  clubId: string;
  tournamentId: string;
  tournamentName: string;
  partners: VerifiedPartnerOption[];
  onClose: () => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const doAssign = () => {
    if (!selectedId) {
      toast({ icon: "alert-triangle", title: "Elige un partner" });
      return;
    }
    startSubmit(async () => {
      const res = await assignClubTournamentPartner({
        clubId,
        tournamentId,
        partnerId: selectedId,
      });
      if (res.ok) {
        toast({
          icon: "check",
          title: "Partner asignado",
          sub: "Ya puede gestionar el torneo desde su panel.",
        });
        router.refresh();
        onClose();
      } else {
        toast({
          icon: "alert-triangle",
          title: "No se pudo asignar",
          sub: formatActionError(res.error),
        });
      }
    });
  };

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "mpFade 200ms cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="card"
        style={{
          padding: 0,
          width: 440,
          maxWidth: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "mpPop 220ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            className="font-heading"
            style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase", margin: 0 }}
          >
            Asignar partner<span className="dot">.</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: "transparent",
              border: 0,
              cursor: "pointer",
              display: "inline-flex",
              color: "var(--muted-fg)",
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 22, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted-fg)", lineHeight: 1.45 }}>
            Elige quién gestiona{" "}
            <strong style={{ color: "var(--fg)" }}>{tournamentName}</strong>. Solo aparecen partners
            verificados vinculados a tu club.
          </div>

          {partners.length === 0 ? (
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                border: "1px dashed var(--border)",
                background: "#fafafa",
                fontSize: 12,
                color: "var(--muted-fg)",
                lineHeight: 1.45,
              }}
            >
              No hay partners verificados vinculados a tu club. Pide a MATCHPOINT que vincule uno desde
              admin.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {partners.map((p) => {
                const active = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
                      background: active ? "rgba(16,185,129,0.08)" : "#fff",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 900 }}>{p.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 2 }}>
                      Partner verificado
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              className="btn"
              onClick={onClose}
              style={{ background: "#fff", border: "1px solid var(--border)" }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitting || partners.length === 0 || !selectedId}
              onClick={doAssign}
            >
              {submitting ? "Asignando…" : "Asignar gestión"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
