// Client wrapper que envuelve sidebar + topbar + bottom pill + main, y maneja
// el estado del drawer mobile compartido entre el sidebar y el bottom nav.
// El layout.tsx server pasa la data fetcheada como props.
"use client";
import { useState, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { RoleKey } from "@/lib/roles";
import { DashboardSidebar } from "./DashboardSidebar";
import { TopBar } from "./TopBar";
import { MobileBottomNav } from "./MobileBottomNav";

type Props = {
  role: RoleKey;
  userName: string;
  contextLabel: string | null;
  badgeOverrides?: Record<string, number | string>;
  children: ReactNode;
};

export function DashboardChrome({
  role,
  userName,
  contextLabel,
  badgeOverrides,
  children,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Cerrar drawer cuando cambia la ruta (user tapeó un link adentro).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll mientras el drawer mobile está abierto.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--fg)",
      }}
    >
      <DashboardSidebar
        role={role}
        userName={userName}
        contextLabel={contextLabel}
        badgeOverrides={badgeOverrides}
        mobileOpen={drawerOpen}
        onMobileClose={() => setDrawerOpen(false)}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <TopBar role={role} contextLabel={contextLabel} />
        <main className="flex flex-col flex-1 gap-4 md:gap-5 p-4 md:p-7 pb-24 md:pb-7">
          {children}
        </main>
      </div>
      <MobileBottomNav role={role} onOpenDrawer={() => setDrawerOpen(true)} />
    </div>
  );
}
