import { redirect } from "next/navigation";

// Entry point del dashboard. Por defecto entramos como admin (estamos migrando este rol primero).
// En producción se inferirá del JWT del usuario autenticado.
export default function DashboardIndex() {
  redirect("/dashboard/admin");
}
