// Layout para rutas /dashboard/clubes/* — mismo chrome que /dashboard/[role]/*
// (sidebar + topbar + bottom nav mobile vía DashboardChrome).
import { DashboardChromeServer } from "@/components/dashboard/DashboardChromeServer";

export default function DashboardClubesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardChromeServer>{children}</DashboardChromeServer>;
}
