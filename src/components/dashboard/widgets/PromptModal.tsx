// Reemplaza window.prompt() / window.confirm() con un modal con look del producto.
// API:
//   const ask = usePromptModal();
//   const val = await ask({ title, label, initialValue, placeholder, validate });
//   if (val == null) return; // canceled
"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";

type AskOptions = {
  title: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  helper?: string;
  multiline?: boolean;
  required?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  validate?: (v: string) => string | null;
};

type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Ctx = {
  ask: (opts: AskOptions) => Promise<string | null>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const PromptCtx = createContext<Ctx | null>(null);

export function usePromptModal(): Ctx {
  const ctx = useContext(PromptCtx);
  if (!ctx) throw new Error("usePromptModal: missing PromptModalProvider");
  return ctx;
}

type PendingInput =
  | { kind: "input"; opts: AskOptions; resolve: (v: string | null) => void }
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void };

export function PromptModalProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingInput | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback<Ctx["ask"]>((opts) => {
    setValue(opts.initialValue ?? "");
    setError(null);
    return new Promise<string | null>((resolve) => {
      setPending({ kind: "input", opts, resolve });
    });
  }, []);

  const confirm = useCallback<Ctx["confirm"]>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: "confirm", opts, resolve });
    });
  }, []);

  const close = (v: string | null | boolean) => {
    if (!pending) return;
    if (pending.kind === "input") pending.resolve(v as string | null);
    else pending.resolve(v as boolean);
    setPending(null);
    setError(null);
    setValue("");
  };

  const submit = () => {
    if (!pending) return;
    if (pending.kind === "input") {
      const trimmed = value;
      if (pending.opts.required && !trimmed.trim()) {
        setError("Este campo es obligatorio.");
        return;
      }
      if (pending.opts.validate) {
        const err = pending.opts.validate(trimmed);
        if (err) {
          setError(err);
          return;
        }
      }
      close(trimmed);
    } else {
      close(true);
    }
  };

  return (
    <PromptCtx.Provider value={{ ask, confirm }}>
      {children}
      {pending && (
        <div
          onClick={() => close(pending.kind === "confirm" ? false : null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(10,10,10,0.55)",
            backdropFilter: "blur(4px)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{ padding: 0, overflow: "hidden", width: 460, maxWidth: "100%" }}
          >
            <div
              style={{
                padding: "16px 22px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3
                className="font-heading"
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  letterSpacing: "-0.015em",
                  margin: 0,
                }}
              >
                {pending.opts.title}
                <span className="dot">.</span>
              </h3>
              <button
                onClick={() => close(pending.kind === "confirm" ? false : null)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--muted)",
                  border: 0,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Cerrar"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
            <div style={{ padding: 22 }}>
              {pending.kind === "input" ? (
                <>
                  {pending.opts.label && (
                    <div className="label-mp" style={{ marginBottom: 6 }}>
                      {pending.opts.label}
                    </div>
                  )}
                  {pending.opts.multiline ? (
                    <textarea
                      autoFocus
                      value={value}
                      onChange={(e) => {
                        setValue(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder={pending.opts.placeholder ?? ""}
                      style={{
                        width: "100%",
                        minHeight: 96,
                        padding: "10px 12px",
                        border: "1px solid " + (error ? "#dc2626" : "var(--border)"),
                        borderRadius: 8,
                        fontFamily: "inherit",
                        fontSize: 13,
                        resize: "vertical",
                      }}
                    />
                  ) : (
                    <input
                      autoFocus
                      value={value}
                      onChange={(e) => {
                        setValue(e.target.value);
                        if (error) setError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submit();
                        if (e.key === "Escape") close(null);
                      }}
                      placeholder={pending.opts.placeholder ?? ""}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid " + (error ? "#dc2626" : "var(--border)"),
                        borderRadius: 8,
                        fontFamily: "inherit",
                        fontSize: 13,
                      }}
                    />
                  )}
                  {pending.opts.helper && !error && (
                    <div style={{ fontSize: 10.5, color: "var(--muted-fg)", marginTop: 6 }}>
                      {pending.opts.helper}
                    </div>
                  )}
                  {error && (
                    <div style={{ fontSize: 11, color: "#dc2626", marginTop: 6, fontWeight: 700 }}>
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <p
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--muted-fg)",
                    margin: 0,
                  }}
                >
                  {pending.opts.body ?? "¿Continuar?"}
                </p>
              )}
            </div>
            <div
              style={{
                padding: "14px 22px",
                background: "#fafafa",
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                onClick={() => close(pending.kind === "confirm" ? false : null)}
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                {pending.opts.cancelLabel ?? "Cancelar"}
              </button>
              <button
                onClick={submit}
                className="btn"
                style={{
                  background: pending.opts.destructive ? "#dc2626" : "#0a0a0a",
                  color: "#fff",
                  border: "1px solid " + (pending.opts.destructive ? "#dc2626" : "#0a0a0a"),
                }}
              >
                {pending.opts.confirmLabel ?? (pending.kind === "confirm" ? "Confirmar" : "Guardar")}
              </button>
            </div>
          </div>
        </div>
      )}
    </PromptCtx.Provider>
  );
}
