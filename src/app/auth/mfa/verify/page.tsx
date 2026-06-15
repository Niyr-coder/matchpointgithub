import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getServerClient } from "@/lib/db/client.server";
import { getStaffMfaStatus } from "@/lib/auth/mfa";
import { buildMfaRedirectPath, safeMfaNext } from "@/lib/auth/mfa-policy";
import { MfaVerifyPlaceholder } from "@/components/auth/mfa/MfaVerifyPlaceholder";

export const dynamic = "force-dynamic";

export default async function MfaVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (!session.authenticated) {
    redirect("/?auth=signin&next=/auth/mfa/verify");
  }

  const { next: rawNext } = await searchParams;
  const next = safeMfaNext(rawNext, "/dashboard/user");

  const supabase = await getServerClient();
  const status = await getStaffMfaStatus(supabase);

  if (status.state === "enroll_required") {
    redirect(buildMfaRedirectPath("enroll", next));
  }
  if (status.state === "satisfied") {
    redirect(next);
  }

  return <MfaVerifyPlaceholder next={next} />;
}
