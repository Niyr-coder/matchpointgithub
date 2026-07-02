// Server: pagos del coach desde transactions (kind='class', ref_id ∈ sessions/lessons del coach).
import { getServerClient } from "@/lib/db/client.server";
import { getSession } from "@/lib/auth/session";
import { CoachPagosScreenView, type PagosData, type TxRow } from "./CoachPagosScreenView";

// Default si no hay row en coach_commissions para el (coach, club) — el
// coach que recién se asocia a un club hereda 20% hasta que se negocie.
const DEFAULT_COMMISSION_PCT = 0.2;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

async function loadData(): Promise<PagosData> {
  const session = await getSession();
  if (!session.authenticated) {
    return {
      coachId: null,
      txs: [],
      kpis: { grossCents: 0, commissionCents: 0, netCents: 0 },
    };
  }

  const coachId = session.session.userId;
  const supabase = await getServerClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Sessions + lessons del coach del mes
  const { data: myClasses } = await supabase
    .from("classes")
    .select("id,name,club_id")
    .eq("coach_id", coachId);
  const classIds = (myClasses ?? []).map((c) => c.id as string);
  const className = new Map<string, string>();
  const classClub = new Map<string, string>();
  const coachClubIds = new Set<string>();
  for (const c of myClasses ?? []) {
    className.set(c.id as string, c.name as string);
    if (c.club_id) {
      classClub.set(c.id as string, c.club_id as string);
      coachClubIds.add(c.club_id as string);
    }
  }

  // Mapa de comisión por club según coach_commissions. Fallback DEFAULT.
  type CommissionRow = { club_id: string; commission_pct: number | string };
  const commissionPctByClub = new Map<string, number>();
  if (coachClubIds.size > 0) {
    const { data: commRows } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("coach_commissions" as any)
      .select("club_id,commission_pct")
      .eq("coach_id", coachId)
      .in("club_id", Array.from(coachClubIds));
    for (const r of ((commRows ?? []) as unknown as CommissionRow[])) {
      commissionPctByClub.set(r.club_id, Number(r.commission_pct) / 100);
    }
  }

  const [{ data: sessions }, { data: lessons }] = await Promise.all([
    classIds.length > 0
      ? supabase
          .from("class_sessions")
          .select("id,class_id,during")
          .in("class_id", classIds)
          .gte("during", monthStart.toISOString())
      : Promise.resolve({ data: [] as { id: string; class_id: string; during: unknown }[] }),
    supabase
      .from("lessons_1on1")
      .select("id,student_id,during,created_at")
      .eq("coach_id", coachId)
      .gte("created_at", monthStart.toISOString()),
  ]);

  const refClass = new Map<string, string>(); // ref_id → class_id
  for (const s of sessions ?? []) refClass.set(s.id as string, s.class_id as string);

  const lessonStudent = new Map<string, string>();
  for (const l of lessons ?? []) lessonStudent.set(l.id as string, l.student_id as string);

  const refIds = new Set<string>([
    ...Array.from(refClass.keys()),
    ...Array.from(lessonStudent.keys()),
  ]);

  if (refIds.size === 0) {
    return {
      coachId,
      txs: [],
      kpis: { grossCents: 0, commissionCents: 0, netCents: 0 },
    };
  }

  const { data: txns } = await supabase
    .from("v_transactions_net")
    .select("id,kind,amount_cents,net_amount_cents,status,created_at,ref_id,customer_user_id,customer_name")
    .eq("kind", "class")
    .in("ref_id", Array.from(refIds))
    .order("created_at", { ascending: false });

  // Lookup nombres de students para lessons
  const studentIds = new Set<string>();
  for (const id of lessonStudent.values()) studentIds.add(id);
  for (const t of txns ?? []) {
    if (t.customer_user_id) studentIds.add(t.customer_user_id as string);
  }
  const { data: profiles } = studentIds.size > 0
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", Array.from(studentIds))
    : { data: [] as { id: string; display_name: string }[] };

  const nameById = new Map<string, string>();
  for (const p of profiles ?? []) nameById.set(p.id as string, (p.display_name as string) ?? "Alumno");

  // Acumuladores: gross y commission per-row para soportar % distinto por club.
  let grossCents = 0;
  let commissionCentsAccum = 0;
  const rows: TxRow[] = (txns ?? []).map((t) => {
    const refId = t.ref_id as string;
    const amt = (t.amount_cents as number) ?? 0;
    // KPI en neto (captured − refunds); la fila muestra el monto original.
    const netAmt = (t.net_amount_cents as number) ?? 0;
    if (t.status === "captured") {
      grossCents += netAmt;
      // Resolver % comisión por club: refId → class → club → coach_commissions.
      const clsId = refClass.get(refId);
      const clubId = clsId ? classClub.get(clsId) : undefined;
      const pct = clubId && commissionPctByClub.has(clubId)
        ? commissionPctByClub.get(clubId)!
        : DEFAULT_COMMISSION_PCT;
      commissionCentsAccum += Math.round(netAmt * pct);
    }

    let who = "—";
    let concept = "Clase";
    if (refClass.has(refId)) {
      const clsName = className.get(refClass.get(refId)!) ?? "Clase";
      who = clsName;
      concept = "Clase grupal";
    } else if (lessonStudent.has(refId)) {
      const sid = lessonStudent.get(refId)!;
      who = `${nameById.get(sid) ?? "Alumno"} · 1 a 1`;
      concept = "Lección 1 a 1";
    } else if (t.customer_user_id) {
      who = nameById.get(t.customer_user_id as string) ?? "—";
    } else if (t.customer_name) {
      who = t.customer_name as string;
    }

    return {
      id: t.id as string,
      d: fmtDate(t.created_at as string),
      who,
      concept,
      amtCents: amt,
      st: t.status === "captured" ? "pagado" : "pendiente",
    };
  });

  const commissionCents = commissionCentsAccum;
  const netCents = grossCents - commissionCents;

  return {
    coachId,
    txs: rows,
    kpis: { grossCents, commissionCents, netCents },
  };
}

export async function CoachPagosScreen() {
  const data = await loadData();
  return <CoachPagosScreenView data={data} />;
}
