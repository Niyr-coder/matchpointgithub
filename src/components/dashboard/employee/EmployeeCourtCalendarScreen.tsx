import { getServerClient } from "@/lib/db/client.server";
import { resolveActiveClubId } from "@/lib/auth/resolveClubId";
import { loadCourtDaySchedule } from "@/server/queries/court-day-schedule";
import {
  EmployeeCourtCalendarScreenView,
  type CourtCalendarData,
} from "./EmployeeCourtCalendarScreenView";

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

async function loadData(dayOffset = 0): Promise<CourtCalendarData> {
  const clubId = await resolveActiveClubId();
  if (!clubId) {
    return { clubId: null, days: [], dayOffset: 0 };
  }
  const supabase = await getServerClient();
  const base = new Date();
  const offsets = [0, 1, 2, 3];
  const days = await Promise.all(
    offsets.map((off) => loadCourtDaySchedule(supabase, clubId, addDays(base, off))),
  );
  return {
    clubId,
    days: days.filter((d): d is NonNullable<typeof d> => d != null),
    dayOffset: Math.min(Math.max(dayOffset, 0), 3),
  };
}

export async function EmployeeCourtCalendarScreen({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const raw = sp.dia ?? sp.day ?? "0";
  const dayOffset = Math.min(
    3,
    Math.max(0, parseInt(Array.isArray(raw) ? raw[0] : raw, 10) || 0),
  );
  const data = await loadData(dayOffset);
  return <EmployeeCourtCalendarScreenView data={data} />;
}
