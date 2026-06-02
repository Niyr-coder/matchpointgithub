"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MP_ROLES, type RoleKey } from "@/lib/roles";
import { Icon } from "@/components/Icon";
import { switchRole } from "@/server/actions/auth";

export type RoleSwitchOption = {
  role: RoleKey;
  clubId?: string | null;
  partnerId?: string | null;
};

/** Cambio explícito de rol activo (requerido tras el guard estricto de rutas). */
export function ActiveRoleSwitcher({
  current,
  options,
}: {
  current: RoleKey;
  options: RoleSwitchOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const others = options.filter((o) => o.role !== current);
  if (others.length === 0) return null;

  const onPick = (opt: RoleSwitchOption) => {
    startTransition(async () => {
      const res = await switchRole({
        role: opt.role,
        clubId: opt.clubId ?? undefined,
        partnerId: opt.partnerId ?? undefined,
      });
      if (!res.ok) return;
      router.push(`/dashboard/${opt.role}`);
      router.refresh();
    });
  };

  return (
    <div
      style={{
        padding: "10px 12px",
        borderTop: "1px solid var(--sidebar-border, #27272a)",
        marginTop: 8,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--sidebar-muted)",
          marginBottom: 8,
        }}
      >
        Cambiar rol
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {others.map((opt) => {
          const cfg = MP_ROLES[opt.role];
          return (
            <button
              key={`${opt.role}-${opt.clubId ?? ""}-${opt.partnerId ?? ""}`}
              type="button"
              disabled={pending}
              onClick={() => onPick(opt)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #3f3f46",
                background: "transparent",
                color: "var(--sidebar-fg, #fafaf9)",
                fontSize: 12,
                fontWeight: 700,
                cursor: pending ? "wait" : "pointer",
                textAlign: "left",
              }}
            >
              <Icon name="repeat" size={14} />
              {cfg.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}
