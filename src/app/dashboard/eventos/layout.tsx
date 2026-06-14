// Layout para /dashboard/eventos/* — usa el chrome compartido para tener
// sidebar mobile drawer, bottom nav, banner de anuncios y gating por flags,
// igual que [role]/layout.tsx.
import { renderDashboardChromeShell } from "@/components/dashboard/SharedDashboardShell";

export default async function DashboardEventosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return renderDashboardChromeShell(children);
}
