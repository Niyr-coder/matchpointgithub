// Vista pública para eventos de club (events.kind: social/clinic/exhibition/etc).
// Hermano de EventDetailView (torneos). Maneja inscripción contra
// POST /api/v1/events/{id}/register, incluyendo el flujo de payment_policy='flexible'.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import type { EventRow } from "@/lib/schemas/events";

type Props = {
  event: EventRow;
  clubName: string | null;
  clubCity: string | null;
  userId: string | null;
};

const MONTHS_ES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function kindLabel(kind: string): string {
  switch (kind) {
    case "social": return "Social";
    case "clinic": return "Clínica";
    case "exhibition": return "Exhibición";
    case "party": return "Fiesta";
    case "league_meet": return "Fecha de liga";
    default: return "Evento";
  }
}

function dateLabel(startsAt: string, endsAt: string | null): { d: string; m: string; full: string } {
  const s = new Date(startsAt);
  const e = endsAt ? new Date(endsAt) : s;
  const sd = s.getUTCDate();
  const ed = e.getUTCDate();
  const sameMonth = s.getUTCMonth() === e.getUTCMonth();
  const sameDay = sd === ed && sameMonth;
  const m = MONTHS_ES[s.getUTCMonth()];
  const year = s.getUTCFullYear();
  const d = sameDay ? `${sd}` : sameMonth ? `${sd}-${ed}` : `${sd}`;
  const full = sameDay
    ? `${sd} de ${MONTHS_LONG[s.getUTCMonth()]} ${year}`
    : sameMonth
      ? `${sd}-${ed} de ${MONTHS_LONG[s.getUTCMonth()]} ${year}`
      : `${sd} ${MONTHS_ES[s.getUTCMonth()]} – ${ed} ${MONTHS_ES[e.getUTCMonth()]} ${year}`;
  return { d, m, full };
}

function formatMoney(cents: number | null | undefined, currency?: string | null): string {
  if (cents == null || cents === 0) return "Gratis";
  const n = Math.round(cents / 100);
  const sym = currency === "USD" || !currency ? "$" : `${currency} `;
  if (n >= 1000) return `${sym}${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sym}${n}`;
}

// TODO(DRY): este modal está duplicado en src/components/dashboard/user/EventosScreenClient.tsx.
// Cuando haya tiempo, extraer a src/components/landing/eventos/PaymentModeDialog.tsx
// y compartir entre ambos lugares.
function PaymentModeDialog({
  onChoose,
  onCancel,
}: {
  onChoose: (mode: "online" | "onsite") => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420 }}
      >
        <h3 className="font-heading" style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em" }}>
          ¿Cómo prefieres pagar?
        </h3>
        <p style={{ margin: "8px 0 16px", fontSize: 13, color: "var(--muted-fg)", lineHeight: 1.5 }}>
          Este evento te deja elegir entre pago online (sube comprobante de transferencia o DeUna) o pago en sitio (pagas en el mostrador el día del evento).
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => onChoose("online")}
            className="btn btn-primary"
            style={{ justifyContent: "flex-start" }}
          >
            <Icon name="upload" size={13} color="#fff" />
            Pago online (subir comprobante)
          </button>
          <button
            type="button"
            onClick={() => onChoose("onsite")}
            className="btn"
            style={{ background: "#fff", border: "1px solid var(--border)", justifyContent: "flex-start" }}
          >
            <Icon name="map-pin" size={13} />
            Pago en sitio
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn"
            style={{ background: "transparent", border: 0, color: "var(--muted-fg)", marginTop: 4 }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Notice ligero (no dependemos de ToastProvider del dashboard en la landing).
function Notice({ kind, text, onClose }: { kind: "ok" | "err"; text: string; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 220,
        maxWidth: 360,
        padding: "12px 16px",
        background: kind === "ok" ? "#ecfdf5" : "#fef2f2",
        border: `1px solid ${kind === "ok" ? "#10b981" : "#dc2626"}`,
        borderRadius: 10,
        color: kind === "ok" ? "#065f46" : "#991b1b",
        fontSize: 13,
        fontWeight: 700,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
      }}
    >
      <Icon name={kind === "ok" ? "check-circle-2" : "alert-triangle"} size={15} color={kind === "ok" ? "#10b981" : "#dc2626"} />
      <span style={{ flex: 1 }}>{text}</span>
      <button
        type="button"
        onClick={onClose}
        style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", padding: 0, fontWeight: 900 }}
        aria-label="Cerrar"
      >
        ×
      </button>
    </div>
  );
}

export function EventKindDetailView({ event, clubName, clubCity, userId }: Props) {
  const router = useRouter();
  const [askPaymentMode, setAskPaymentMode] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const date = dateLabel(event.startsAt, event.endsAt);
  const club = [clubName, clubCity].filter(Boolean).join(" · ") || "Club";
  const kind = kindLabel(event.kind);
  const price = formatMoney(event.priceCents, event.currency);
  const capacity = event.capacity ?? 0;
  const accent = (event.name.split(" ")[0] ?? "EVENT").toUpperCase().slice(0, 6);
  const isRegisterable =
    event.status === "published" || event.status === "registration_open";

  // Llama al endpoint de inscripción. Si la policy es 'flexible' y no envíamos
  // paymentMode, el server devuelve EVENTS.PAYMENT_MODE_REQUIRED y abrimos el
  // modal. Si la respuesta trae paidTransactionId redirigimos a /pagos/[id].
  const inscribir = (paymentMode?: "online" | "onsite") => {
    if (!userId) {
      // No logueado: redirige al login con next= para volver a este detalle.
      const next = typeof window !== "undefined" ? window.location.pathname : `/eventos/${event.slug}`;
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    startTransition(async () => {
      const body = paymentMode ? { paymentMode } : {};
      const res = await fetch(`/api/v1/events/${event.id}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const code = json?.error?.code as string | undefined;
        if (code === "EVENTS.PAYMENT_MODE_REQUIRED") {
          setAskPaymentMode(true);
          return;
        }
        if (code === "EVENTS.ALREADY_REGISTERED") {
          setNotice({ kind: "err", text: "Ya estás inscrito a este evento." });
          return;
        }
        if (code === "EVENTS.FULL") {
          setNotice({ kind: "err", text: "El evento está lleno." });
          return;
        }
        setNotice({
          kind: "err",
          text: json?.error?.message ?? `No se pudo inscribir (HTTP ${res.status}).`,
        });
        return;
      }
      const txId = json?.data?.paidTransactionId as string | null | undefined;
      if (txId) {
        router.push(`/pagos/${txId}`);
      } else {
        setNotice({ kind: "ok", text: "¡Inscripción confirmada!" });
        router.refresh();
      }
    });
  };

  return (
    <>
      <section
        style={{
          position: "relative",
          minHeight: 420,
          background: "linear-gradient(135deg, #0a0a0a 0%, #1f2937 60%, #064e3b 100%)",
          color: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            fontFamily: "Plus Jakarta Sans",
            fontWeight: 900,
            fontSize: 340,
            color: "rgba(16,185,129,0.07)",
            letterSpacing: "-0.06em",
            lineHeight: 0.8,
            transform: "rotate(-6deg) translate(15%, -15%)",
            pointerEvents: "none",
          }}
        >
          {accent}
        </div>
        <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "60px 32px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
            <span
              style={{
                padding: "4px 12px",
                background: "var(--primary)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              ★ {kind}
            </span>
            <span
              style={{
                padding: "4px 12px",
                background: "rgba(255,255,255,0.15)",
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Club
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14 }}>
            <span
              className="font-heading"
              style={{ fontSize: 96, fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 0.9 }}
            >
              {date.d}
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.7)",
              }}
            >
              {date.m}
            </span>
          </div>
          <h1
            className="font-heading"
            style={{
              fontSize: "clamp(3rem, 7vw, 5.5rem)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: "0 0 18px",
              lineHeight: 0.92,
              maxWidth: 900,
            }}
          >
            {event.name}
            <span style={{ color: "#10b981" }}>.</span>
          </h1>
          <div
            style={{
              display: "flex",
              gap: 26,
              fontSize: 14,
              color: "rgba(255,255,255,0.85)",
              flexWrap: "wrap",
              marginBottom: 36,
            }}
          >
            <span>
              <Icon name="map-pin" size={13} style={{ display: "inline", marginRight: 5 }} />
              {club}
            </span>
            <span>
              <Icon name="calendar" size={13} style={{ display: "inline", marginRight: 5 }} />
              {date.full}
            </span>
            {capacity > 0 && (
              <span>
                <Icon name="users" size={13} style={{ display: "inline", marginRight: 5 }} />
                Cupo {capacity}
              </span>
            )}
            <span>
              <Icon name="trophy" size={13} style={{ display: "inline", marginRight: 5 }} />
              <b style={{ color: "var(--primary)" }}>{price}</b>
            </span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              style={{ padding: "15px 26px", fontSize: 13 }}
              onClick={() => inscribir()}
              disabled={!isRegisterable}
            >
              <Icon name={isRegisterable ? "check" : "lock"} size={14} />
              {isRegisterable
                ? userId
                  ? `Inscribirme · ${price}`
                  : "Inicia sesión para inscribirte"
                : event.status === "cancelled"
                  ? "Evento cancelado"
                  : "Inscripciones cerradas"}
            </button>
            <button
              className="btn"
              style={{
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
              }}
              onClick={() => {
                if (typeof window !== "undefined" && navigator.share) {
                  navigator.share({ title: event.name, url: window.location.href }).catch(() => {});
                }
              }}
            >
              <Icon name="share-2" size={13} />
              Compartir
            </button>
          </div>
        </div>
      </section>

      <main
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "60px 32px",
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          gap: 32,
        }}
      >
        <div>
          <div className="label-mp">Sobre el evento</div>
          <h2
            className="font-heading"
            style={{
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: "-0.025em",
              textTransform: "uppercase",
              margin: "8px 0 14px",
            }}
          >
            {date.full}
            <span className="dot">.</span>
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#0a0a0a", marginBottom: 32 }}>
            {event.description ??
              `${kind} organizada en ${club}. ${
                event.priceCents > 0
                  ? `Inscripción ${price} por persona.`
                  : "Inscripción gratuita."
              }`}
          </p>
        </div>
        <div>
          <div className="card" style={{ padding: 22, position: "sticky", top: 100 }}>
            <div className="label-mp">Inscripción</div>
            <h3
              className="font-heading"
              style={{
                fontSize: 26,
                fontWeight: 900,
                margin: "6px 0 14px",
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
              }}
            >
              {price}
              <span className="dot">.</span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              <KV label="Modalidad" value={kind} />
              <KV label="Cupo" value={capacity > 0 ? String(capacity) : "Abierto"} />
              <KV
                label="Pago"
                value={
                  event.paymentPolicy === "free"
                    ? "Gratis"
                    : event.paymentPolicy === "prepay"
                      ? "Online (comprobante)"
                      : event.paymentPolicy === "onsite"
                        ? "En sitio"
                        : "Online o en sitio"
                }
              />
              <KV
                label="Estado"
                value={
                  event.status === "cancelled"
                    ? "Cancelado"
                    : event.status === "finished"
                      ? "Finalizado"
                      : event.status === "live"
                        ? "En curso"
                        : "Inscripciones abiertas"
                }
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => inscribir()}
              disabled={!isRegisterable}
            >
              {isRegisterable
                ? userId
                  ? "Inscribirme"
                  : "Inicia sesión"
                : "No disponible"}
              <Icon name="arrow-right" size={13} />
            </button>
          </div>
        </div>
      </main>

      {askPaymentMode && (
        <PaymentModeDialog
          onChoose={(mode) => {
            setAskPaymentMode(false);
            inscribir(mode);
          }}
          onCancel={() => setAskPaymentMode(false)}
        />
      )}
      {notice && <Notice kind={notice.kind} text={notice.text} onClose={() => setNotice(null)} />}
    </>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
      <span style={{ color: "var(--muted-fg)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 800 }}>
        {label}
      </span>
      <span style={{ fontWeight: 700, color: "#0a0a0a", textAlign: "right" }}>{value}</span>
    </div>
  );
}
