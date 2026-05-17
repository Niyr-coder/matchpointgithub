"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MP_ROLES, MP_ROLE_ORDER, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";

// Dev-only role switcher. Two states:
//   enabled  (default for admins) → full pill in bottom-right, click to expand list
//   disabled                       → minimal "DEV" pill that just toggles back on
// Persisted in localStorage so the choice survives page navigation.
const ENABLED_KEY = "mp_dev_role_switcher";

export function RoleSwitcher({ current }: { current: RoleKey }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const router = useRouter();
  const cur = MP_ROLES[current];

  // Hydrate from localStorage (default ON).
  useEffect(() => {
    try {
      const v = localStorage.getItem(ENABLED_KEY);
      if (v === "false") setEnabled(false);
    } catch {}
  }, []);

  const toggle = (next: boolean) => {
    setEnabled(next);
    if (!next) setOpen(false);
    try {
      localStorage.setItem(ENABLED_KEY, String(next));
    } catch {}
  };

  const change = (rk: RoleKey) => {
    setOpen(false);
    router.push(`/dashboard/${rk}`);
  };

  // Disabled state: tiny pill that brings the switcher back.
  if (!enabled) {
    return (
      <button
        onClick={() => toggle(true)}
        title="Activar dev role switcher"
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 950,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 11px",
          background: "rgba(10,10,10,0.85)",
          color: "rgba(255,255,255,0.7)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 9999,
          fontFamily: "inherit",
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        <Icon name="terminal" size={11} color="rgba(255,255,255,0.7)" />
        Dev
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 950, fontFamily: "inherit" }}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            width: 280,
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div
              style={{
                fontSize: 8.5,
                fontWeight: 900,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              ● Demo · Cambiar rol
            </div>
            <div
              className="font-heading"
              style={{
                fontSize: 14,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              Vista por rol<span style={{ color: "var(--primary)" }}>.</span>
            </div>
          </div>
          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {MP_ROLE_ORDER.map((rk) => {
              const r = MP_ROLES[rk];
              const on = current === rk;
              return (
                <button
                  key={rk}
                  onClick={() => change(rk)}
                  style={{
                    width: "100%",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 14px",
                    background: on ? "rgba(16,185,129,0.12)" : "transparent",
                    border: 0,
                    borderLeft: on ? "3px solid var(--primary)" : "3px solid transparent",
                    color: "#fff",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 7,
                      background: r.color,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name={r.icon} size={13} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 900,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {r.badge}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "rgba(255,255,255,0.55)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.ctx}
                    </div>
                  </div>
                  {on && <Icon name="check" size={13} color="var(--primary)" />}
                </button>
              );
            })}
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: "rgba(255,255,255,0.45)",
                lineHeight: 1.4,
                flex: 1,
              }}
            >
              Switcher de demo · solo admin.
            </div>
            <button
              onClick={() => toggle(false)}
              title="Ocultar dev tools"
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.55)",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 9999,
                padding: "5px 9px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Ocultar
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 14px",
          background: "#0a0a0a",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 9999,
          fontFamily: "inherit",
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: cur.color,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={cur.icon} size={12} color="#fff" />
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.1 }}>
          <span
            style={{
              fontSize: 8.5,
              fontWeight: 900,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            Demo · Rol
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 900, letterSpacing: "-0.01em" }}>{cur.badge}</span>
        </span>
        <Icon name={open ? "chevron-down" : "chevron-up"} size={13} color="rgba(255,255,255,0.5)" />
      </button>
    </div>
  );
}
