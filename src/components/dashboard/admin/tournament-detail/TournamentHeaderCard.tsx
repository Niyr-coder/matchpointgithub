"use client";

// Header del detalle admin de un torneo. Incluye botón "Editar" que abre
// modal con formulario (updateTournamentAdmin). Reutiliza primitives de
// event-detail para mantener consistencia visual.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { AdminTournamentDetail } from "@/server/actions/tournaments";
import { updateTournamentAdmin } from "@/server/actions/admin-tournaments-edit";
import { useToast } from "../../ToastProvider";
import { StatusPill, fmtDate, fmtMoney } from "../event-detail/primitives";

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export function TournamentHeaderCard({
  data,
  currency,
}: {
  data: AdminTournamentDetail;
  currency: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const canEdit =
    data.tournament.status !== "finished" &&
    data.tournament.status !== "cancelled";

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div className="label-mp">Torneo · {data.tournament.format}</div>
        <StatusPill status={data.tournament.status} />
        {canEdit && (
          <button
            onClick={() => setEditOpen(true)}
            className="btn"
            style={{
              marginLeft: "auto",
              background: "#fff",
              border: "1.5px solid var(--border)",
              padding: "5px 11px",
              fontSize: 12,
            }}
          >
            <Icon name="pencil" size={12} />
            Editar
          </button>
        )}
      </div>
      <h1
        className="font-heading"
        style={{
          fontSize: 28,
          fontWeight: 900,
          letterSpacing: "-0.025em",
          textTransform: "uppercase",
          margin: 0,
        }}
      >
        {data.tournament.name}
      </h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: 12, color: "var(--muted-fg)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="calendar" size={12} />
          {fmtDate(data.tournament.startsAt)} – {fmtDate(data.tournament.endsAt)}
        </span>
        {data.clubName && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="building-2" size={12} />
            {data.clubName}
          </span>
        )}
        {data.organizerName && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Icon name="user" size={12} />
            {data.organizerName}
          </span>
        )}
        {data.tournament.prizePoolCents != null && data.tournament.prizePoolCents > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--primary)", fontWeight: 800 }}>
            <Icon name="trophy" size={12} color="var(--primary)" />
            Premio: {fmtMoney(data.tournament.prizePoolCents, currency)}
          </span>
        )}
      </div>

      {editOpen && (
        <TournamentEditDialog
          data={data}
          currency={currency}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

function TournamentEditDialog({
  data,
  currency,
  onClose,
}: {
  data: AdminTournamentDetail;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(data.tournament.name);
  const [description, setDescription] = useState(data.tournament.description ?? "");
  const [startsAt, setStartsAt] = useState(isoToLocalInput(data.tournament.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(data.tournament.endsAt));
  const [regOpens, setRegOpens] = useState(
    isoToLocalInput(data.tournament.registrationOpensAt),
  );
  const [regCloses, setRegCloses] = useState(
    isoToLocalInput(data.tournament.registrationClosesAt),
  );
  const [maxParticipants, setMaxParticipants] = useState<string>(
    data.tournament.maxParticipants != null
      ? String(data.tournament.maxParticipants)
      : "",
  );
  const [entryFeeCents, setEntryFeeCents] = useState<string>(
    String(data.tournament.entryFeeCents),
  );

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    if (name !== data.tournament.name) patch.name = name;
    const newDesc = description.trim() === "" ? null : description;
    if (newDesc !== (data.tournament.description ?? null)) patch.description = newDesc;
    const newStartIso = localInputToIso(startsAt);
    const newEndIso = localInputToIso(endsAt);
    if (newStartIso && newStartIso !== data.tournament.startsAt) {
      patch.startsAt = newStartIso;
    }
    if (newEndIso && newEndIso !== data.tournament.endsAt) {
      patch.endsAt = newEndIso;
    }
    const newRegOpens = localInputToIso(regOpens);
    if (newRegOpens !== (data.tournament.registrationOpensAt ?? null)) {
      patch.registrationOpensAt = newRegOpens;
    }
    const newRegCloses = localInputToIso(regCloses);
    if (newRegCloses !== (data.tournament.registrationClosesAt ?? null)) {
      patch.registrationClosesAt = newRegCloses;
    }
    const newMax = maxParticipants.trim() === "" ? null : Number(maxParticipants);
    if (newMax !== (data.tournament.maxParticipants ?? null)) {
      patch.maxParticipants = newMax;
    }
    const newFee = Number(entryFeeCents);
    if (!Number.isNaN(newFee) && newFee !== data.tournament.entryFeeCents) {
      patch.entryFeeCents = newFee;
    }

    if (Object.keys(patch).length === 0) {
      toast({ icon: "info", title: "Sin cambios" });
      onClose();
      return;
    }

    startTransition(async () => {
      const res = await updateTournamentAdmin({
        tournamentId: data.tournament.id,
        patch,
      });
      if (res.ok) {
        const dateChanged = "startsAt" in patch || "endsAt" in patch;
        toast({
          icon: "check",
          title: "Torneo actualizado",
          sub: dateChanged ? "Se notificará a los inscritos del cambio." : undefined,
        });
        onClose();
        router.refresh();
      } else {
        toast({
          icon: "alert-triangle",
          title: "Error al guardar",
          sub: res.error.message,
        });
      }
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
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Editar torneo
        </h3>
        <p style={{ margin: "8px 0 16px", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Si modificas la fecha u horario se notificará a todos los jugadores inscritos
          (pending o accepted).
        </p>

        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            style={inputStyle}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={2000}
            style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Inicio">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Fin">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Apertura inscripciones (opcional)">
            <input
              type="datetime-local"
              value={regOpens}
              onChange={(e) => setRegOpens(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Cierre inscripciones (opcional)">
            <input
              type="datetime-local"
              value={regCloses}
              onChange={(e) => setRegCloses(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Máx. participantes (vacío = sin tope)">
            <input
              type="number"
              min={1}
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={`Inscripción (centavos ${currency})`}>
            <input
              type="number"
              min={0}
              value={entryFeeCents}
              onChange={(e) => setEntryFeeCents(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            onClick={onClose}
            disabled={pending}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)" }}
          >
            Volver
          </button>
          <button
            onClick={handleSave}
            disabled={pending}
            className="btn"
            style={{ background: "var(--primary)", color: "#0a0a0a", opacity: pending ? 0.6 : 1 }}
          >
            <Icon name="check" size={13} />
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 13,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: 6,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
