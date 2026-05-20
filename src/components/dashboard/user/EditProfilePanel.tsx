// Formulario de edición del perfil propio (tab Preferencias). Carga los valores
// actuales y los guarda vía updateProfile (server action existente). El avatar
// se edita aparte desde el header. El username no se edita en v1.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { useToast } from "../ToastProvider";
import { updateProfile } from "@/server/actions/auth";
import type { EditableProfile } from "./ProfileScreenView";

const SPORTS: Array<{ v: EditableProfile["preferredSport"]; l: string }> = [
  { v: "pickleball", l: "Pickleball" },
  { v: "padel", l: "Pádel" },
  { v: "tennis", l: "Tenis" },
];
const HANDS: Array<{ v: EditableProfile["dominantHand"]; l: string }> = [
  { v: "right", l: "Derecha" },
  { v: "left", l: "Izquierda" },
];
const LOCALES: Array<{ v: EditableProfile["locale"]; l: string }> = [
  { v: "es", l: "Español" },
  { v: "en", l: "English" },
  { v: "pt", l: "Português" },
];

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--muted-fg)",
  marginBottom: 6,
  display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  background: "#fff",
  color: "#0a0a0a",
};

export function EditProfilePanel({ initial }: { initial: EditableProfile }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<EditableProfile>(initial);

  function set<K extends keyof EditableProfile>(key: K, value: EditableProfile[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  // null-safe para inputs controlados (un input no puede tener value null).
  const v = (s: string | null) => s ?? "";
  // string vacío → null al guardar (no persistir "" en columnas nullable).
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

  const save = () => {
    if (pending) return;
    startTransition(async () => {
      const displayName =
        `${form.firstName ?? ""} ${form.lastName ?? ""}`.trim() || undefined;
      const res = await updateProfile({
        firstName: orNull(v(form.firstName)),
        lastName: orNull(v(form.lastName)),
        ...(displayName ? { displayName } : {}),
        city: orNull(v(form.city)),
        country: orNull(v(form.country)),
        phone: orNull(v(form.phone)),
        dominantHand: form.dominantHand,
        preferredSport: form.preferredSport,
        locale: form.locale ?? "es",
      });
      if (!res.ok) {
        toast({ icon: "alert-triangle", title: "No se pudo guardar", sub: res.error.message });
        return;
      }
      toast({ icon: "check", title: "Perfil actualizado" });
      router.refresh();
    });
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        <Field label="Nombre">
          <input style={inputStyle} value={v(form.firstName)} maxLength={40} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field label="Apellido">
          <input style={inputStyle} value={v(form.lastName)} maxLength={40} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <input style={inputStyle} value={v(form.city)} maxLength={80} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field label="País">
          <input style={inputStyle} value={v(form.country)} maxLength={80} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Teléfono">
          <input type="tel" style={inputStyle} value={v(form.phone)} maxLength={30} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Fecha de nacimiento">
          <input
            type="date"
            disabled
            value={v(form.birthdate)}
            title="La fecha de nacimiento no se puede modificar"
            style={{ ...inputStyle, background: "var(--muted)", color: "var(--muted-fg)", cursor: "not-allowed" }}
          />
          <span style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 4, display: "block" }}>
            No editable
          </span>
        </Field>
        <Field label="Mano dominante">
          <select style={inputStyle} value={v(form.dominantHand)} onChange={(e) => set("dominantHand", (e.target.value || null) as EditableProfile["dominantHand"])}>
            <option value="">—</option>
            {HANDS.map((h) => (
              <option key={h.v} value={h.v ?? ""}>{h.l}</option>
            ))}
          </select>
        </Field>
        <Field label="Deporte preferido">
          <select style={inputStyle} value={v(form.preferredSport)} onChange={(e) => set("preferredSport", (e.target.value || null) as EditableProfile["preferredSport"])}>
            <option value="">—</option>
            {SPORTS.map((s) => (
              <option key={s.v} value={s.v ?? ""}>{s.l}</option>
            ))}
          </select>
        </Field>
        <Field label="Idioma">
          <select style={inputStyle} value={form.locale ?? "es"} onChange={(e) => set("locale", e.target.value as EditableProfile["locale"])}>
            {LOCALES.map((l) => (
              <option key={l.v} value={l.v ?? "es"}>{l.l}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn btn-primary" disabled={pending} onClick={save} style={{ opacity: pending ? 0.6 : 1, cursor: pending ? "wait" : "pointer" }}>
          {!pending && <Icon name="check" size={13} />}
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}
