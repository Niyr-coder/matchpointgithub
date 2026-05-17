"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

// Reemplaza window.mpToast del prototipo. Misma API: mpToast({ icon, title, sub }).
export type ToastPayload = {
  icon?: string;
  title: string;
  sub?: string;
};

type Toast = ToastPayload & { id: number };

type ToastCtx = (t: ToastPayload) => void;

const Ctx = createContext<ToastCtx>(() => {});

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: ToastPayload) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3200);
  }, []);

  // Compat shim: también exponemos window.mpToast para código legacy que lo use.
  useEffect(() => {
    (window as unknown as { mpToast?: (t: ToastPayload) => void }).mpToast = push;
    return () => {
      delete (window as unknown as { mpToast?: (t: ToastPayload) => void }).mpToast;
    };
  }, [push]);

  return (
    <Ctx.Provider value={push}>
      {children}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
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
                <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.3 }}>{t.title}</div>
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
