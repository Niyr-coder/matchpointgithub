import { ToastProvider } from "@/components/dashboard/ToastProvider";
import { PromptModalProvider } from "@/components/dashboard/widgets/PromptModal";
import { DashboardModals } from "@/components/dashboard/modals/DashboardModals";

export const metadata = {
  title: "MatchPoint · Dashboard",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <PromptModalProvider>
        {children}
        <DashboardModals />
      </PromptModalProvider>
    </ToastProvider>
  );
}
