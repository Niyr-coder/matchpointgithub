"use client";

// Barra lateral de acciones admin del detalle de torneo. Autocontenida.
// Extension point compartido por Agente A (editar) y Agente D (organizador).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { cancelTournament, type AdminTournamentDetail } from "@/server/actions/tournaments";
import { reassignTournamentOrganizerAdmin } from "@/server/actions/admin-event-ownership";
import { searchUsers } from "@/server/actions/roles";
import { useToast } from "../../ToastProvider";
import { CancelDialog } from "../event-detail/primitives";

export function TournamentActionsBar({ data }: { data: AdminTournamentDetail }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reassignOpen, setReassignOpen] = useState(false);

  const canCancel =
    data.tournament.status !== "cancelled" && data.tournament.status !== "finished";

  const organizerEmail = data.organizerEmail;
  const organizerLabel = data.organizerName ?? "organizador";

  const handleCancel = () => {
    startTransition(async () => {
      const res = await cancelTournament({
        tournamentId: data.tournament.id,
        reason: reason.trim() || undefined,
      });
      if (res.ok) {
        toast({ icon: "check", title: "Torneo cancelado" });
        setCancelOpen(false);
        setReason("");
        router.refresh();
      } else {
        toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
      }
    });
  };

  const handleContact = () => {
    if (!organizerEmail) return;
    const subject = encodeURIComponent(`MatchPoint · Torneo "${data.tournament.name}"`);
    window.location.href = `mailto:${organizerEmail}?subject=${subject}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        onClick={handleContact}
        disabled={!organizerEmail}
        title={organizerEmail ? `Escribir a ${organizerLabel}` : "Sin email del organizador"}
        className="btn"
        style={{
          background: "#fff",
          border: "1.5px solid var(--border)",
          color: organizerEmail ? "#0a0a0a" : "var(--muted-fg)",
          cursor: organizerEmail ? "pointer" : "not-allowed",
          opacity: organizerEmail ? 1 : 0.6,
        }}
      >
        <Icon name="mail" size={13} color={organizerEmail ? "#0a0a0a" : "#9ca3af"} />
        Contactar organizador
      </button>

      <button
        onClick={() => setReassignOpen(true)}
        className="btn"
        style={{ background: "#fff", border: "1.5px solid var(--border)" }}
      >
        <Icon name="user-plus" size={13} />
        Reasignar organizador
      </button>

      {canCancel && (
        <button
          onClick={() => setCancelOpen(true)}
          className="btn"
          style={{ background: "#fff", border: "1.5px solid #fca5a5", color: "#b91c1c" }}
        >
          <Icon name="x-octagon" size={13} color="#b91c1c" />
          Cancelar torneo
        </button>
      )}

      {cancelOpen && (
        <CancelDialog
          title={`Cancelar torneo "${data.tournament.name}"`}
          reason={reason}
          setReason={setReason}
          onClose={() => setCancelOpen(false)}
          onConfirm={handleCancel}
          pending={pending}
        />
      )}

      {reassignOpen && (
        <ReassignOrganizerDialog
          title={`Reasignar organizador de "${data.tournament.name}"`}
          currentLabel={organizerLabel}
          onClose={() => setReassignOpen(false)}
          onConfirm={async (userId) => {
            const res = await reassignTournamentOrganizerAdmin({
              tournamentId: data.tournament.id,
              newOrganizerUserId: userId,
            });
            if (res.ok) {
              toast({ icon: "check", title: "Organizador reasignado" });
              setReassignOpen(false);
              router.refresh();
            } else {
              toast({ icon: "alert-triangle", title: "Error", sub: res.error.message });
            }
          }}
        />
      )}
    </div>
  );
}

// ── Diálogo local (no se comparte para evitar tocar otros archivos) ────────
// Reutiliza `searchUsers` de roles.ts (búsqueda admin/owner/manager,
// ilike sobre username/display_name, LIMIT 10).
function ReassignOrganizerDialog({
  title,
  currentLabel,
  onClose,
  onConfirm,
}: {
  title: string;
  currentLabel: string;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; username: string; display_name: string }[]
  >([]);
  const [selected, setSelected] = useState<
    { id: string; username: string; display_name: string } | null
  >(null);
  const [searching, startSearch] = useTransition();
  const [submitting, startSubmit] = useTransition();

  const doSearch = () => {
    if (query.trim().length < 1) return;
    startSearch(async () => {
      const res = await searchUsers({ q: query });
      if (res.ok) setResults(res.data);
      else toast({ icon: "alert-triangle", title: "Error buscando", sub: res.error.message });
    });
  };

  const doSubmit = () => {
    if (!selected) {
      toast({ icon: "alert-triangle", title: "Selecciona un usuario" });
      return;
    }
    startSubmit(async () => {
      await onConfirm(selected.id);
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480 }}
      >
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: "10px 0 14px",
            fontSize: 12,
            color: "var(--muted-fg)",
            lineHeight: 1.5,
          }}
        >
          Organizador actual: <strong>{currentLabel}</strong>. El nuevo usuario debe tener rol
          admin, owner, manager o partner-admin. Queda registrado en el audit log.
        </p>

        <div className="label-mp" style={{ marginBottom: 6 }}>
          Buscar usuario
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            placeholder="@username o nombre…"
            style={{
              flex: 1,
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "inherit",
            }}
          />
          <button
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
            onClick={doSearch}
            disabled={searching}
          >
            <Icon name="search" size={12} />
          </button>
        </div>

        {results.length > 0 && !selected && (
          <div style={{ marginBottom: 12, maxHeight: 200, overflowY: "auto" }}>
            {results.map((u) => (
              <button
                key={u.id}
                onClick={() => setSelected(u)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  marginBottom: 4,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800 }}>{u.display_name}</div>
                <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{u.username}</div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div
            style={{
              padding: "8px 12px",
              background: "#ecfdf5",
              border: "1px solid var(--primary)",
              borderRadius: 6,
              marginBottom: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{selected.display_name}</div>
              <div style={{ fontSize: 10, color: "var(--muted-fg)" }}>@{selected.username}</div>
            </div>
            <button
              onClick={() => {
                setSelected(null);
                setResults([]);
                setQuery("");
              }}
              style={{
                border: 0,
                background: "transparent",
                cursor: "pointer",
                color: "var(--muted-fg)",
              }}
            >
              cambiar
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Volver
          </button>
          <button
            onClick={doSubmit}
            disabled={submitting || !selected}
            className="btn btn-primary"
            style={{ opacity: submitting || !selected ? 0.6 : 1 }}
          >
            {submitting ? "Reasignando…" : "Confirmar reasignación"}
          </button>
        </div>
      </div>
    </div>
  );
}
