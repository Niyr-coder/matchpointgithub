// Server: cola de check-ins próximos del club.
import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { loadReceptionQueue } from "@/server/queries/reception-queue";
import { EmployeeCheckinScreenView, type CheckinData } from "./EmployeeCheckinScreenView";

async function loadData(): Promise<CheckinData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) return { clubId: null, queue: [], upcomingCount: 0 };

  const supabase = await getServerClient();
  const queue = await loadReceptionQueue(supabase, clubId, { windowHours: 18, limit: 40 });
  const upcomingCount = queue.filter((r) => r.st !== "walkin").length;

  return { clubId, queue, upcomingCount };
}

export async function EmployeeCheckinScreen() {
  const data = await loadData();
  return <EmployeeCheckinScreenView data={data} />;
}
