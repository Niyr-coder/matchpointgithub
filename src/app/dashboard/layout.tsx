import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/dashboard/ToastProvider";
import { PromptModalProvider } from "@/components/dashboard/widgets/PromptModal";
import { DashboardModals } from "@/components/dashboard/modals/DashboardModals";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";

export const metadata = {
  title: "MatchPoint · Dashboard",
};

// Gate de onboarding: si el usuario está autenticado pero no completó el
// wizard (profiles.onboarded_at IS NULL), lo mandamos a /onboarding antes
// de dejarle ver cualquier pantalla del dashboard.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (session.authenticated) {
    const supabase = await getServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", session.session.userId)
      .maybeSingle();
    if (profile && profile.onboarded_at == null) {
      redirect("/onboarding");
    }
  }
  return (
    <ToastProvider>
      <PromptModalProvider>
        {children}
        <DashboardModals />
      </PromptModalProvider>
    </ToastProvider>
  );
}
