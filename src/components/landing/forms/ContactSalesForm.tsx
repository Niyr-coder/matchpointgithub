"use client";

// Formulario público "Hablar con ventas".
// Reemplaza los `mailto:ventas@matchpoint.top` del landing — captura nombre,
// email, teléfono opcional, tipo (Club / Partner / Coach / Otro), nombre del
// negocio y mensaje. Postea a POST /api/v1/contact/sales y muestra un estado
// de éxito en su lugar.
//
// Estados: idle → loading → success | error.
// Honeypot: campo `website` oculto; los bots lo rellenan, los humanos no.

import { useState } from "react";
import { Icon } from "@/components/Icon";
import {
  SALES_LEAD_TYPE_LABELS,
  type SalesLeadType,
} from "@/lib/schemas/sales-leads";

type Status = "idle" | "loading" | "success" | "error";

const TYPE_OPTIONS: { value: SalesLeadType; label: string }[] = (
  Object.entries(SALES_LEAD_TYPE_LABELS) as [SalesLeadType, string][]
).map(([value, label]) => ({ value, label }));

export type ContactSalesFormProps = {
  // Initial lead type — committed on mount. To reflect external changes (e.g.
  // the user clicks a different tier CTA), remount via `key`.
  defaultLeadType?: SalesLeadType;
  defaultMessage?: string;
  heading?: string;
  description?: string;
  tone?: "light" | "dark";
  ctaLabel?: string;
};

export function ContactSalesForm({
  defaultLeadType = "club",
  defaultMessage,
  heading = "Hablar con ventas",
  description = "Cuéntanos sobre tu club, partner o academia. Te contactamos en menos de 24 horas hábiles.",
  tone = "light",
  ctaLabel = "Enviar mensaje",
}: ContactSalesFormProps) {
  const dark = tone === "dark";
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [leadType, setLeadType] = useState<SalesLeadType>(defaultLeadType);
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState(defaultMessage ?? "");
  const [website, setWebsite] = useState(""); // honeypot

  async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setErrMsg(null);
    setFieldErrors({});

    try {
      const res = await fetch("/api/v1/contact/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: phone || undefined,
          leadType,
          businessName: businessName || undefined,
          message: message || undefined,
          sourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
          website, // honeypot — debe ir vacío
        }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const errBody = json as
          | { error?: { code?: string; message?: string; fields?: Record<string, string[]> } }
          | null;
        setStatus("error");
        setErrMsg(errBody?.error?.message ?? "No pudimos enviar tu mensaje. Intenta de nuevo.");
        setFieldErrors(errBody?.error?.fields ?? {});
        return;
      }
      setStatus("success");
      setName("");
      setEmail("");
      setPhone("");
      setBusinessName("");
      setMessage("");
      setWebsite("");
    } catch (err) {
      setStatus("error");
      setErrMsg(
        err instanceof Error
          ? `Error de red: ${err.message}`
          : "Error de red. Intenta de nuevo en un momento.",
      );
    }
  }

  if (status === "success") {
    return (
      <div
        style={{
          padding: 28,
          background: dark ? "rgba(16,185,129,0.12)" : "var(--muted)",
          border: dark ? "1px solid var(--primary)" : "1px solid var(--border)",
          borderRadius: 14,
          textAlign: "center",
          color: dark ? "#fff" : "#0a0a0a",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 14,
          }}
        >
          <Icon name="check-check" size={26} color="#fff" />
        </div>
        <div
          className="font-heading"
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.02em", textTransform: "uppercase" }}
        >
          Mensaje enviado<span style={{ color: "var(--primary)" }}>.</span>
        </div>
        <p
          style={{
            fontSize: 13.5,
            color: dark ? "rgba(255,255,255,0.75)" : "var(--muted-fg)",
            maxWidth: 420,
            margin: "8px auto 16px",
            lineHeight: 1.55,
          }}
        >
          Recibimos tu mensaje. Te contactamos pronto al email que dejaste.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => setStatus("idle")}
          style={
            dark
              ? {
                  background: "rgba(255,255,255,0.1)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.25)",
                  fontSize: 12,
                }
              : { fontSize: 12 }
          }
        >
          Enviar otro mensaje
        </button>
      </div>
    );
  }

  const labelColor = dark ? "rgba(255,255,255,0.7)" : "var(--muted-fg)";
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 13px",
    borderRadius: 9,
    background: dark ? "rgba(0,0,0,0.3)" : "#fff",
    border: dark ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--border)",
    color: dark ? "#fff" : "#0a0a0a",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: 12,
        padding: 22,
        background: dark ? "rgba(255,255,255,0.04)" : "#fff",
        border: dark ? "1px solid rgba(255,255,255,0.1)" : "1px solid var(--border)",
        borderRadius: 14,
      }}
      noValidate
    >
      <div style={{ gridColumn: "1 / -1" }}>
        <div
          className="label-mp"
          style={{ color: labelColor, fontSize: 10, marginBottom: 4 }}
        >
          ● {heading}
        </div>
        <p style={{ fontSize: 13, color: labelColor, margin: 0, lineHeight: 1.5 }}>
          {description}
        </p>
      </div>

      <FormField
        label="Nombre"
        required
        error={fieldErrors.name?.[0]}
        labelColor={labelColor}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          style={inputStyle}
        />
      </FormField>

      <FormField
        label="Email"
        required
        error={fieldErrors.email?.[0]}
        labelColor={labelColor}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={200}
          autoComplete="email"
          style={inputStyle}
        />
      </FormField>

      <FormField
        label="Teléfono / WhatsApp"
        error={fieldErrors.phone?.[0]}
        labelColor={labelColor}
      >
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={40}
          placeholder="+593 99 ..."
          autoComplete="tel"
          style={inputStyle}
        />
      </FormField>

      <FormField
        label="Tipo"
        required
        error={fieldErrors.leadType?.[0]}
        labelColor={labelColor}
      >
        <select
          value={leadType}
          onChange={(e) => setLeadType(e.target.value as SalesLeadType)}
          required
          style={inputStyle}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Nombre del negocio"
        error={fieldErrors.businessName?.[0]}
        labelColor={labelColor}
        full
      >
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          maxLength={200}
          placeholder="ej. Club Norte Pickleball"
          autoComplete="organization"
          style={inputStyle}
        />
      </FormField>

      <FormField
        label="Mensaje"
        error={fieldErrors.message?.[0]}
        labelColor={labelColor}
        full
      >
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder="Cuéntanos qué plan te interesa, cuántas canchas o jugadores manejas, y cualquier duda."
          rows={4}
          style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
        />
      </FormField>

      {/* Honeypot — oculto visualmente y para lectores de pantalla. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}
      >
        <label>
          No completes este campo
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {errMsg && (
        <div
          role="alert"
          style={{
            gridColumn: "1 / -1",
            padding: "10px 12px",
            background: dark ? "rgba(220,38,38,0.12)" : "#fef2f2",
            border: dark ? "1px solid rgba(220,38,38,0.4)" : "1px solid #fecaca",
            color: dark ? "#fecaca" : "#991b1b",
            borderRadius: 9,
            fontSize: 12.5,
          }}
        >
          {errMsg}
        </div>
      )}

      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginTop: 4,
          flexWrap: "wrap",
        }}
      >
        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === "loading"}
          style={{
            padding: "13px 22px",
            fontSize: 13,
            opacity: status === "loading" ? 0.7 : 1,
            cursor: status === "loading" ? "wait" : "pointer",
          }}
        >
          {status === "loading" ? (
            <>
              <Icon name="loader-2" size={14} />
              Enviando…
            </>
          ) : (
            <>
              <Icon name="send" size={14} />
              {ctaLabel}
            </>
          )}
        </button>
        <span style={{ fontSize: 11, color: labelColor }}>
          Te respondemos al email que dejas. Nada de spam.
        </span>
      </div>
    </form>
  );
}

function FormField({
  label,
  required,
  error,
  children,
  labelColor,
  full,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  labelColor: string;
  full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: labelColor,
          marginBottom: 5,
        }}
      >
        {label} {required && <span style={{ color: "var(--primary)" }}>*</span>}
      </div>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>
      )}
    </div>
  );
}
