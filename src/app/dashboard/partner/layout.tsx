import { DashboardChromeServer } from "@/components/dashboard/DashboardChromeServer";

export default function DashboardPartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardChromeServer segment="partner">{children}</DashboardChromeServer>;
}
