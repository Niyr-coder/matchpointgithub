"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MP_ROLES, MP_ROLE_ORDER, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { switchRole } from "@/server/actions/auth";
import type { RoleSwitchOption } from "./ActiveRoleSwitcher";

type Props = {
  current: RoleKey;
  isAdmin?: boolean;
  options?: RoleSwitchOption[];
  onClose: () => void;
};

/** Panel de cambio de rol anclado al footer del sidebar (admin = todos los roles demo). */
export function SidebarRoleMenu({ current, isAdmin, options, onClose }: Props) {
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
    <div
      role="dialog"
      aria-label="Cambiar rol"
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
      <div style={{ maxHeight: 280, overflow: "auto" }}>
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
    </div>
  );
}
