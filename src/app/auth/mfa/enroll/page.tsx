import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { getStaffMfaStatus } from "@/lib/auth/mfa";
import { safeMfaNext } from "@/lib/auth/mfa-policy";
import { MfaEnrollPlaceholder } from "@/components/auth/mfa/MfaEnrollPlaceholder";

export const dynamic = "force-dynamic";

export default async function MfaEnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/?auth=signin&next=/auth/mfa/enroll");
  }

  const { next: rawNext } = await searchParams;
  const next = safeMfaNext(rawNext, "/dashboard/user");

  const supabase = await getServerClient();
  const status = await getStaffMfaStatus(supabase);
  if (status.state === "satisfied" || status.state === "verify_required") {
    redirect(next);
  }

  return <MfaEnrollPlaceholder next={next} />;
}
