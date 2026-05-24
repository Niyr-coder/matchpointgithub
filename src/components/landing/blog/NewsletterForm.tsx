"use client";
import { useState } from "react";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "already" }
  | { kind: "error"; message: string };

export type NewsletterFormSource = "blog" | "footer" | "popup" | "embed" | "other";

export function NewsletterForm({
  source = "blog",
  microcopy = "0 spam, 1 email/mes.",
}: {
  source?: NewsletterFormSource;
  microcopy?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const busy = state.kind === "loading";
  const done = state.kind === "success" || state.kind === "already";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    const trimmed = email.trim();
    if (!trimmed) {
      setState({ kind: "error", message: "Ingresa tu email." });
      return;
    }

    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, source }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: { alreadySubscribed?: boolean };
        error?: { message?: string };
      };
      if (!res.ok || !body.ok) {
        setState({
          kind: "error",
          message: body.error?.message ?? "No pudimos suscribirte. Inténtalo de nuevo.",
        });
        return;
      }
      setState({ kind: body.data?.alreadySubscribed ? "already" : "success" });
    } catch {
      setState({ kind: "error", message: "Error de red. Inténtalo de nuevo." });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card" style={cardStyle}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="label-mp" style={{ color: "var(--primary)" }}>
          Newsletter MATCHPOINT
        </span>
        <h3
          className="font-heading"
          style={{
            fontSize: 20,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          Recibe lo nuevo del blog en tu inbox.
        </h3>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label htmlFor="newsletter-email" style={visuallyHidden}>
          Email
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="tu@email.com"
          value={email}
          disabled={busy || done}
          onChange={(ev) => {
            setEmail(ev.target.value);
            if (state.kind === "error") setState({ kind: "idle" });
          }}
          style={inputStyle}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || done}
          aria-busy={busy}
        >
          {busy ? "Enviando…" : done ? "Listo" : "Suscribirme"}
        </button>
      </div>

      <FormStatus state={state} microcopy={microcopy} />
    </form>
  );
}

function FormStatus({ state, microcopy }: { state: State; microcopy: string }) {
  if (state.kind === "success") {
    return (
      <p style={msgStyle(true)}>
        ¡Listo! Te avisaremos cuando salga lo próximo.
      </p>
    );
  }
  if (state.kind === "already") {
    return <p style={msgStyle(true)}>Ya estabas suscrito — ¡gracias!</p>;
  }
  if (state.kind === "error") {
    return <p style={msgStyle(false)}>{state.message}</p>;
  }
  return (
    <p style={{ fontSize: 11, color: "var(--muted-fg)", margin: 0 }}>{microcopy}</p>
  );
}

const cardStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "10px 14px",
  borderRadius: 9999,
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "inherit",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  outline: "none",
};

const visuallyHidden: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

function msgStyle(ok: boolean): React.CSSProperties {
  return {
    fontSize: 12,
    color: ok ? "var(--primary)" : "var(--danger, #b91c1c)",
    margin: 0,
    fontWeight: 600,
  };
}
