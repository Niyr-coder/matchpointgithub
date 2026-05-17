"use client";

// Header del detalle admin de un evento: status pill, título, metadata
// (fecha, club, organizador) y descripción. Incluye botón "Editar" que abre
// un modal con formulario de edición/reprogramación (server action
// updateEventAdmin). Aislado del resto del view; usa router.refresh tras OK.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { AdminEventDetail } from "@/server/actions/events";
import { updateEventAdmin } from "@/server/actions/admin-events-edit";
import { useToast } from "../../ToastProvider";
import { StatusPill, fmtDate } from "./primitives";

// El input datetime-local trabaja con "YYYY-MM-DDTHH:mm" sin zona; convertimos
// hacia/desde ISO usando la zona local del navegador.
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // new Date("YYYY-MM-DDTHH:mm") asume zona local -> toISOString() devuelve UTC con offset Z.
  return new Date(local).toISOString();
}

export function EventHeaderCard({ data }: { data: AdminEventDetail }) {
  const [editOpen, setEditOpen] = useState(false);
  const canEdit =
    data.event.status !== "finished" && data.event.status !== "cancelled";

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
        <div className="label-mp">Evento · {data.event.kind}</div>
        <StatusPill status={data.event.status} />
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
        {data.event.name}
      </h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12, fontSize: 12, color: "var(--muted-fg)" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <Icon name="calendar" size={12} />
          {fmtDate(data.event.startsAt)} – {fmtDate(data.event.endsAt)}
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
      </div>
      {data.event.description && (
        <p style={{ marginTop: 14, fontSize: 13, color: "#0a0a0a", lineHeight: 1.5, maxWidth: 720 }}>
          {data.event.description}
        </p>
      )}

      {editOpen && (
        <EventEditDialog
          data={data}
          onClose={() => setEditOpen(false)}
        />
      )}
    </div>
  );
}

function EventEditDialog({
  data,
  onClose,
}: {
  data: AdminEventDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(data.event.name);
  const [description, setDescription] = useState(data.event.description ?? "");
  const [startsAt, setStartsAt] = useState(isoToLocalInput(data.event.startsAt));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(data.event.endsAt));
  const [capacity, setCapacity] = useState<string>(
    data.event.capacity != null ? String(data.event.capacity) : "",
  );
  const [priceCents, setPriceCents] = useState<string>(String(data.event.priceCents));

  const handleSave = () => {
    const patch: Record<string, unknown> = {};
    if (name !== data.event.name) patch.name = name;
    const newDesc = description.trim() === "" ? null : description;
    if (newDesc !== (data.event.description ?? null)) patch.description = newDesc;
    const newStartIso = localInputToIso(startsAt);
    const newEndIso = localInputToIso(endsAt);
    if (newStartIso !== data.event.startsAt) patch.startsAt = newStartIso;
    if (newEndIso !== data.event.endsAt) patch.endsAt = newEndIso;
    const newCap = capacity.trim() === "" ? null : Number(capacity);
    if (newCap !== (data.event.capacity ?? null)) patch.capacity = newCap;
    const newPrice = Number(priceCents);
    if (!Number.isNaN(newPrice) && newPrice !== data.event.priceCents) {
      patch.priceCents = newPrice;
    }

    if (Object.keys(patch).length === 0) {
      toast({ icon: "info", title: "Sin cambios" });
      onClose();
      return;
    }

    startTransition(async () => {
      const res = await updateEventAdmin({ eventId: data.event.id, patch });
      if (res.ok) {
        const dateChanged = "startsAt" in patch || "endsAt" in patch;
        toast({
          icon: "check",
          title: "Evento actualizado",
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
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <h3
          className="font-heading"
          style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}
        >
          Editar evento
        </h3>
        <p style={{ margin: "8px 0 16px", fontSize: 12, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Si modificas la fecha u horario se notificará a todos los inscritos activos.
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
          <Field label="Cupo (vacío = ilimitado)">
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label={`Precio (centavos ${data.event.currency ?? "USD"})`}>
            <input
              type="number"
              min={0}
              value={priceCents}
              onChange={(e) => setPriceCents(e.target.value)}
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
