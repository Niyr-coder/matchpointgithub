// Layout para /dashboard/eventos/* — chrome unificado con DashboardChrome.
import { DashboardChromeServer } from "@/components/dashboard/DashboardChromeServer";

export default function DashboardEventosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardChromeServer>{children}</DashboardChromeServer>;
}
