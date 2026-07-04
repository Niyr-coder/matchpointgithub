"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

// Reemplaza window.mpToast del prototipo. Misma API: mpToast({ icon, title, sub }).
export type ToastPayload = {
  icon?: string;
  title: string;
  sub?: string;
  /** Duración visible en ms. Por defecto según tono. */
  durationMs?: number;
  /** success = 4.5s, error = 7s */
  tone?: "success" | "error" | "default";
};

type Toast = ToastPayload & { id: number; key: string; count: number };

type ToastCtx = (t: ToastPayload) => void;

const Ctx = createContext<ToastCtx>(() => {});

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

function resolveDuration(t: ToastPayload): number {
  if (t.durationMs != null) return t.durationMs;
  if (t.tone === "error" || t.icon === "alert-triangle" || t.icon === "x") return 7000;
  return 4500;
}

/** Duración recomendada para acciones de marcador / torneo en cancha. */
export const TOAST_SCORE_MS = 2500;

/** Máximo de toasts visibles a la vez (los más viejos se descartan). */
const MAX_TOASTS = 3;

/** Toasts iguales (mismo icono+título+sub+tono) colapsan en uno con contador. */
function toastKey(t: ToastPayload): string {
  return `${t.icon ?? ""}|${t.title}|${t.sub ?? ""}|${t.tone ?? ""}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastsRef = useRef<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const commit = useCallback((next: Toast[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.current.delete(id);
      }
      commit(toastsRef.current.filter((x) => x.id !== id));
    },
    [commit],
  );

  const push = useCallback(
    (t: ToastPayload) => {
      const ms = resolveDuration(t);
      const key = toastKey(t);
      const current = toastsRef.current;
      // Colapso: si ya hay uno igual visible, sube el contador y reinicia timer
      // (en vez de apilar otro). Así una ráfaga de confirmaciones = 1 toast "×N".
      const existing = current.find((x) => x.key === key);
      if (existing) {
        const old = timers.current.get(existing.id);
        if (old) clearTimeout(old);
        timers.current.set(existing.id, setTimeout(() => dismiss(existing.id), ms));
        commit(
          current.map((x) =>
            x.id === existing.id ? { ...x, count: x.count + 1, sub: t.sub ?? x.sub } : x,
          ),
        );
        return;
      }
      const id = Date.now() + Math.random();
      let next: Toast[] = [...current, { ...t, id, key, count: 1 }];
      // Cap: descarta los más viejos si excede el máximo.
      while (next.length > MAX_TOASTS) {
        const dropped = next[0];
        const dt = timers.current.get(dropped.id);
        if (dt) {
          clearTimeout(dt);
          timers.current.delete(dropped.id);
        }
        next = next.slice(1);
      }
      commit(next);
      timers.current.set(id, setTimeout(() => dismiss(id), ms));
    },
    [commit, dismiss],
  );

  useEffect(() => {
    (window as unknown as { mpToast?: (t: ToastPayload) => void }).mpToast = push;
    return () => {
      delete (window as unknown as { mpToast?: (t: ToastPayload) => void }).mpToast;
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, [push]);

  return (
    <Ctx.Provider value={push}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(24px + env(safe-area-inset-bottom))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              onClick={() => dismiss(t.id)}
              style={{
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 12,
                padding: "12px 16px",
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
                animation: "mpToastIn 280ms cubic-bezier(0.16, 1, 0.3, 1)",
                minWidth: 280,
                maxWidth: 420,
                pointerEvents: "auto",
                cursor: "pointer",
              }}
            >
              {t.icon && (
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--primary)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon name={t.icon} size={15} color="#fff" />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>
                  {t.title}
                  {t.count > 1 ? ` ×${t.count}` : ""}
                </div>
                {t.sub && (
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                    {t.sub}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
