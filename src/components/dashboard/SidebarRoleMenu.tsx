"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MP_ROLES, MP_ROLE_ORDER, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { switchRole } from "@/server/actions/auth";
import type { RoleSwitchOption } from "./ActiveRoleSwitcher";

type PanelProps = {
  current: RoleKey;
  isAdmin?: boolean;
  options?: RoleSwitchOption[];
  onClose: () => void;
};

/** Lista de roles (compartida sidebar desktop + sheet mobile). */
export function RoleSwitcherPanel({ current, isAdmin, options, onClose }: PanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changeAdmin = (rk: RoleKey) => {
    startTransition(async () => {
      const res = await switchRole({ role: rk });
      if (!res.ok) return;
      router.push(`/dashboard/${rk}`);
      router.refresh();
      onClose();
    });
  };

  const changeOption = (opt: RoleSwitchOption) => {
    startTransition(async () => {
      const res = await switchRole({
        role: opt.role,
        clubId: opt.clubId ?? undefined,
        partnerId: opt.partnerId ?? undefined,
      });
      if (!res.ok) return;
      router.push(`/dashboard/${opt.role}`);
      router.refresh();
      onClose();
    });
  };

  const others = (options ?? []).filter((o) => o.role !== current);

  return (
    <>
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid #27272a" }}>
        <div
          style={{
            fontSize: 9,
            fontWeight: 900,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#71717a",
          }}
        >
          Cambiar rol
        </div>
        <div
          className="font-heading"
          style={{
            fontSize: 13,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            textTransform: "uppercase",
            marginTop: 2,
            color: "#fff",
          }}
        >
          Vista activa<span className="dot">.</span>
        </div>
      </div>
      <div style={{ maxHeight: "min(280px, 50vh)", overflow: "auto" }}>
        {isAdmin
          ? MP_ROLE_ORDER.map((rk) => {
              const r = MP_ROLES[rk];
              const on = current === rk;
              return (
                <button
                  key={rk}
                  type="button"
                  disabled={pending}
                  onClick={() => changeAdmin(rk)}
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
                    cursor: pending ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: pending && !on ? 0.62 : 1,
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
                        color: "#a1a1aa",
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
            })
          : others.map((opt) => {
              const r = MP_ROLES[opt.role];
              return (
                <button
                  key={`${opt.role}-${opt.clubId ?? ""}-${opt.partnerId ?? ""}`}
                  type="button"
                  disabled={pending}
                  onClick={() => changeOption(opt)}
                  style={{
                    width: "100%",
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "transparent",
                    border: 0,
                    color: "#fff",
                    textAlign: "left",
                    cursor: pending ? "wait" : "pointer",
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
                    <div style={{ fontSize: 10, color: "#a1a1aa" }}>{r.ctx}</div>
                  </div>
                  <Icon name="chevron-right" size={13} color="#71717a" />
                </button>
              );
            })}
      </div>
    </>
  );
}

/** Panel anclado al footer del sidebar (desktop). */
export function SidebarRoleMenu(props: PanelProps) {
  return (
    <div
      role="dialog"
      aria-label="Cambiar rol"
      className="hidden md:block"
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: "calc(100% + 8px)",
        background: "#18181b",
        border: "1px solid #3f3f46",
        borderRadius: 12,
        boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
        overflow: "hidden",
        zIndex: 30,
      }}
    >
      <RoleSwitcherPanel {...props} />
    </div>
  );
}

/** Bottom sheet mobile — reemplaza el pill flotante DEV en responsive. */
export function MobileRoleSwitcherSheet({
  open,
  onClose,
  current,
  isAdmin,
  options,
}: PanelProps & { open: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cur = MP_ROLES[current];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cambiar rol"
      className="md:hidden"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(10,10,10,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          background: "#18181b",
          borderRadius: "18px 18px 0 0",
          border: "1px solid #3f3f46",
          borderBottom: 0,
          overflow: "hidden",
          maxHeight: "min(85vh, 520px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: "14px 16px 10px",
            borderBottom: "1px solid #27272a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: cur.color,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={cur.icon} size={15} color="#fff" />
            </span>
            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#71717a",
                }}
              >
                Rol activo
              </span>
              <span
                className="font-heading"
                style={{
                  display: "block",
                  fontSize: 14,
                  fontWeight: 900,
                  textTransform: "uppercase",
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {cur.badge}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 30,
              height: 30,
              borderRadius: 9999,
              border: "1px solid #3f3f46",
              background: "#27272a",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "inherit",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
        <RoleSwitcherPanel current={current} isAdmin={isAdmin} options={options} onClose={onClose} />
      </div>
    </div>
  );
}
