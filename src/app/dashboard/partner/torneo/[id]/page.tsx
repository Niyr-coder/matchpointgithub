// Gestión específica del torneo desde el panel partner. Inscritos inline,
// panel de acciones (estelar/cerrar/cancelar/generar bracket), KPIs y enlaces.
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getServerClient } from "@/lib/db/client.server";
import { getAdminClient } from "@/lib/db/client.admin";
import { getSession } from "@/lib/auth/session";
import { resolveActivePartnerId } from "@/lib/auth/resolvePartnerId";
import { Icon } from "@/components/Icon";
import { PartnerTorneoActions } from "@/components/dashboard/partner/PartnerTorneoActions";
import { GroupStagePanel } from "@/components/dashboard/partner/GroupStagePanel";
import { getGroupStageSummary } from "@/server/actions/tournament-group-stage";
import { MarkPaidInline } from "@/components/dashboard/partner/MarkPaidInline";
import { CategoriesPanel, type CategoryRow } from "@/components/dashboard/partner/CategoriesPanel";
import { SchedulePanel, type ScheduleBlock } from "@/components/dashboard/partner/SchedulePanel";
import { PublicPreviewModal } from "@/components/dashboard/partner/PublicPreviewModal";
import { AdminOverridesPanel } from "@/components/dashboard/partner/AdminOverridesPanel";
import { PrizesPanel, type PrizeRow } from "@/components/dashboard/partner/PrizesPanel";
import { TournamentGestionRealtime } from "@/components/dashboard/partner/TournamentGestionRealtime";

type RegRow = {
  id: string;
  status: string;
  paymentMode: "online" | "onsite" | "free" | null;
  payStatus:
    | "paid"
    | "free"
    | "onsite_pending"
    | "awaiting_proof"
    | "review"
    | "other";
  amountCents: number;
  createdAt: string;
  label: string;
  avatarUrl: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  registration_open: "Inscripciones abiertas",
  registration_closed: "Inscripciones cerradas",
  active: "Activo",
  in_progress: "En curso",
  finished: "Finalizado",
  cancelled: "Cancelado",
  completed: "Completado",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "var(--muted-fg)",
  registration_open: "var(--primary)",
  registration_closed: "#fbbf24",
  active: "var(--primary)",
  in_progress: "#0ea5e9",
  finished: "#0a0a0a",
  completed: "#0a0a0a",
  cancelled: "#dc2626",
};

export default async function PartnerTorneoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session.authenticated) redirect("/login?next=/dashboard/partner");
  const supabase = await getServerClient();
  const admin = getAdminClient();

  const { data: tRaw } = await supabase
    .from("tournaments")
    .select(
      "id,slug,name,status,sport,format,starts_at,ends_at,max_participants,prize_pool_cents,entry_fee_cents,partner_id,club_id,payment_policy,clubs(name,city)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!tRaw) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tRaw as any;

  // is_featured aún no está en los types generados — fetch separado.
  const { data: featRow } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq("is_featured" as any, true)
    .maybeSingle();
  const isFeatured = !!featRow;

  const partnerId = (t.partner_id as string | null) ?? null;
  const { data: adminRow } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("user_id", session.session.userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  const isAdmin = !!adminRow;
  if (!isAdmin) {
    if (!partnerId) notFound();
    const activePartnerId = await resolveActivePartnerId();
    if (!activePartnerId || activePartnerId !== partnerId) notFound();
    const { data: member } = await admin
      .from("partner_members")
      .select("role")
      .eq("partner_id", partnerId)
      .eq("user_id", session.session.userId)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (!member) notFound();
  }

  // Inscritos del torneo. Columnas reales: player_ids (array), team_id,
  // paid_transaction_id. Datos de pago vienen de transactions.
  const { data: regsRaw } = await admin
    .from("registrations")
    .select("id,team_id,player_ids,status,paid_transaction_id,created_at,teams(name)")
    .eq("tournament_id", id)
    .not("status", "in", "(withdrawn,rejected,cancelled)")
    .order("created_at", { ascending: false });

  const playerIdSet = new Set<string>();
  for (const r of regsRaw ?? []) {
    for (const p of (r.player_ids as string[] | null) ?? []) playerIdSet.add(p);
  }
  const profById = new Map<string, { name: string; avatar: string | null }>();
  if (playerIdSet.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id,display_name,avatar_url")
      .in("id", Array.from(playerIdSet));
    for (const p of profs ?? []) {
      profById.set(p.id as string, {
        name: (p.display_name as string | null) ?? "Sin nombre",
        avatar: (p.avatar_url as string | null) ?? null,
      });
    }
  }

  const txIds = (regsRaw ?? [])
    .map((r) => r.paid_transaction_id as string | null)
    .filter((x): x is string => !!x);
  const txById = new Map<string, { amount: number; status: string; method: string }>();
  if (txIds.length > 0) {
    const { data: txns } = await admin
      .from("transactions")
      .select("id,amount_cents,status,method")
      .in("id", txIds);
    for (const tx of txns ?? []) {
      txById.set(tx.id as string, {
        amount: (tx.amount_cents as number) ?? 0,
        status: (tx.status as string) ?? "pending",
        method: (tx.method as string) ?? "transfer",
      });
    }
  }

  const fee = (t.entry_fee_cents as number | null) ?? 0;
  const regs: RegRow[] = (regsRaw ?? []).map((r) => {
    const pids = (r.player_ids as string[] | null) ?? [];
    const firstProf = pids[0] ? profById.get(pids[0]) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const teamName = ((r as any).teams?.name as string | undefined) ?? null;
    const label = teamName
      ? teamName
      : pids.length > 1 && firstProf
        ? `${firstProf.name} +${pids.length - 1}`
        : firstProf?.name ?? "Jugador";

    const txId = r.paid_transaction_id as string | null;
    const tx = txId ? txById.get(txId) ?? null : null;
    let paymentMode: RegRow["paymentMode"];
    if (!tx) paymentMode = "free";
    else if (tx.status === "pending") paymentMode = "onsite";
    else paymentMode = "online";

    let payStatus: RegRow["payStatus"];
    if (!tx) payStatus = "free";
    else if (tx.status === "captured") payStatus = "paid";
    else if (tx.status === "pending") payStatus = "onsite_pending";
    else if (tx.status === "pending_proof") payStatus = "awaiting_proof";
    else if (tx.status === "proof_submitted") payStatus = "review";
    else payStatus = "other";

    return {
      id: r.id as string,
      status: r.status as string,
      paymentMode,
      payStatus,
      amountCents: tx?.amount ?? fee,
      createdAt: r.created_at as string,
      label,
      avatarUrl: firstProf?.avatar ?? null,
    };
  });

  // "Inscritos" = todas las inscripciones válidas (ya filtramos retiradas
  // /rechazadas/canceladas en la query). El partner ve el total real, no solo
  // las aceptadas — la mayoría arrancan en pending hasta confirmar pago.
  const totalCount = regs.length;
  const acceptedCount = regs.filter((r) => r.status === "accepted").length;
  const pendingCount = regs.filter((r) => r.status === "pending").length;
  const revenue = Array.from(txById.values())
    .filter((tx) => tx.status === "captured")
    .reduce((s, tx) => s + tx.amount, 0);
  const pendingPay = Array.from(txById.values()).filter(
    (tx) => tx.status === "pending" || tx.status === "pending_proof" || tx.status === "proof_submitted",
  ).length;

  // tournament_categories.mpr_min/mpr_max no están en los types generados.
  const { data: catsRaw } = await admin
    .from("tournament_categories")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select("id,name,gender,level,mpr_min,mpr_max,age_min,age_max,max_teams" as any)
    .eq("tournament_id", id)
    .order("name", { ascending: true });
  type CatRow = {
    id: string;
    name: string;
    gender: string | null;
    level: string | null;
    mpr_min: number | string | null;
    mpr_max: number | string | null;
    age_min: number | null;
    age_max: number | null;
    max_teams: number | null;
  };
  const categories: CategoryRow[] = ((catsRaw ?? []) as unknown as CatRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    gender: c.gender ?? null,
    level: c.level ?? null,
    mprMin: c.mpr_min != null ? Number(c.mpr_min) : null,
    mprMax: c.mpr_max != null ? Number(c.mpr_max) : null,
    ageMin: c.age_min ?? null,
    ageMax: c.age_max ?? null,
    maxTeams: c.max_teams ?? null,
  }));

  // tournament_schedule_blocks aún no está en los types generados.
  const { data: blocksRaw } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("tournament_schedule_blocks" as any)
    .select("id,starts_at,label,category_id,notes")
    .eq("tournament_id", id)
    .order("starts_at", { ascending: true });
  type BlockRow = {
    id: string;
    starts_at: string;
    label: string;
    category_id: string | null;
    notes: string | null;
  };
  const blocks: ScheduleBlock[] = ((blocksRaw ?? []) as unknown as BlockRow[]).map((b) => ({
    id: b.id,
    startsAt: b.starts_at,
    label: b.label,
    categoryId: b.category_id ?? null,
    notes: b.notes ?? null,
  }));

  // tournament_prizes aún no está en los types generados.
  const { data: prizesRaw } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("tournament_prizes" as any)
    .select("id,position,place_label,prize_label,value_cents,sponsor")
    .eq("tournament_id", id)
    .order("position", { ascending: true });
  type PrizeRowRaw = {
    id: string;
    position: number | null;
    place_label: string;
    prize_label: string;
    value_cents: number | null;
    sponsor: string | null;
  };
  const { data: bracketRow } = await admin
    .from("brackets")
    .select("id")
    .eq("tournament_id", id)
    .limit(1)
    .maybeSingle();
  const hasBracket = !!bracketRow;

  const prizes: PrizeRow[] = ((prizesRaw ?? []) as unknown as PrizeRowRaw[]).map((p) => ({
    id: p.id,
    position: p.position ?? 0,
    placeLabel: p.place_label,
    prizeLabel: p.prize_label,
    valueCents: p.value_cents ?? null,
    sponsor: p.sponsor ?? null,
  }));

  const tournamentFormat = (t.format as string) ?? "single_elim";
  const club = t.clubs as { name?: string; city?: string } | null;
  const registrationLabels = Object.fromEntries(regs.map((r) => [r.id, r.label]));

  let groupStageInitial = null;
  if (tournamentFormat === "groups_to_knockout" && categories.length > 0) {
    const gs = await getGroupStageSummary({
      tournamentId: id,
      categoryId: categories[0].id,
    });
    if (gs.ok) groupStageInitial = gs.data;
  }

  const cap = (t.max_participants as number | null) ?? 0;
  const prize = ((t.prize_pool_cents as number | null) ?? 0) / 100;
  const dbStatus = String(t.status);
  const statusLabel = STATUS_LABEL[dbStatus] ?? dbStatus;
  const statusColor = STATUS_COLOR[dbStatus] ?? "var(--muted-fg)";
  const occupancyPct = cap > 0 ? Math.min(100, Math.round((totalCount / cap) * 100)) : 0;
  const isCancelled = dbStatus === "cancelled";
  const isFinished = dbStatus === "finished" || dbStatus === "completed";
  const isClosed = isCancelled || isFinished;
  const isDraft = dbStatus === "draft";

  return (
    <main className="mp-partner-torneo-main">
      <TournamentGestionRealtime tournamentId={t.id as string} />
          {isDraft && (
            <div
              style={{
                background: "linear-gradient(135deg, #f59e0b, #d97706)",
                color: "#fff",
                padding: "16px 18px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="eye-off" size={18} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.04em" }}>
                  Torneo en borrador · no visible públicamente
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.95, marginTop: 3, lineHeight: 1.5 }}>
                  Configura categorías, cronograma y revisa el preview. Cuando esté listo, dale <b>Publicar torneo</b> para abrir inscripciones y mostrarlo en el listado público.
                </div>
              </div>
            </div>
          )}
          {isClosed && (
            <div
              style={{
                background: isCancelled ? "#dc2626" : "#0a0a0a",
                color: "#fff",
                padding: "16px 18px",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.18)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name={isCancelled ? "alert-triangle" : "flag"} size={18} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: "0.04em" }}>
                  {isCancelled ? "Este torneo fue cancelado" : "Este torneo ya finalizó"}
                </div>
                <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3, lineHeight: 1.5 }}>
                  {isCancelled
                    ? "Las acciones de mutación están bloqueadas. Si cobraste cuotas online, debes devolverlas manualmente a los inscritos en un máximo de 7 días."
                    : "Las inscripciones y pagos están congelados. La página es de solo lectura."}
                </div>
              </div>
            </div>
          )}
          <div>
            <Link
              href="/dashboard/partner/p-torneos"
              style={{
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--muted-fg)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                marginBottom: 12,
              }}
            >
              <Icon name="arrow-left" size={12} color="var(--muted-fg)" />
              Volver a torneos
            </Link>
            <div className="label-mp">Partner · Gestión de torneo</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginTop: 6,
              }}
            >
              <h1
                className="font-heading mp-partner-torneo-title"
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  letterSpacing: "-0.03em",
                  textTransform: "uppercase",
                  margin: 0,
                  lineHeight: 1,
                }}
              >
                {t.name}
                <span style={{ color: "var(--primary)" }}>.</span>
              </h1>
              {isFeatured && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: "#fbbf2422",
                    color: "#a16207",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon name="star" size={10} color="#a16207" />
                  Estelar
                </span>
              )}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 900,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  padding: "4px 8px",
                  borderRadius: 6,
                  background: `${statusColor}1a`,
                  color: statusColor,
                }}
              >
                {statusLabel}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 14,
                fontSize: 12,
                color: "var(--muted-fg)",
                flexWrap: "wrap",
                marginTop: 10,
              }}
            >
              <span>
                <Icon name="trophy" size={11} /> {String(t.sport)} · {String(t.format)}
              </span>
              <span>
                <Icon name="calendar" size={11} />{" "}
                {new Date(t.starts_at as string).toLocaleDateString("es-EC")}
                {t.ends_at
                  ? ` → ${new Date(t.ends_at as string).toLocaleDateString("es-EC")}`
                  : " · Un solo día"}
              </span>
              {club?.name && (
                <span>
                  <Icon name="building-2" size={11} /> {club.name}
                </span>
              )}
              <span>
                <Icon name="dollar-sign" size={11} /> Política:{" "}
                <b>{String(t.payment_policy ?? "—")}</b>
              </span>
            </div>
          </div>

          <div className="mp-partner-torneo-kpis">
            <KPI
              label="Inscritos"
              value={`${totalCount}${cap > 0 ? ` / ${cap}` : ""}`}
              accent="#0a0a0a"
              foot={
                cap > 0 ? (
                  <div
                    style={{
                      height: 4,
                      background: "var(--muted)",
                      borderRadius: 2,
                      overflow: "hidden",
                      marginTop: 8,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${occupancyPct}%`,
                        background: "var(--primary)",
                        transition: "width 320ms var(--ease-out)",
                      }}
                    />
                  </div>
                ) : null
              }
            />
            <KPI
              label="Pendientes"
              value={String(pendingCount)}
              accent="#fbbf24"
              foot={
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 8 }}>
                  Esperando confirmación o pago
                </div>
              }
            />
            <KPI
              label="Revenue capturado"
              value={`$${Math.round(revenue / 100).toLocaleString("en-US")}`}
              accent="var(--primary)"
              foot={
                <div style={{ fontSize: 10, color: "var(--muted-fg)", marginTop: 8 }}>
                  {pendingPay} pago{pendingPay === 1 ? "" : "s"} pendiente
                  {pendingPay === 1 ? "" : "s"}
                </div>
              }
            />
            <KPI
              label="Premio"
              value={prize > 0 ? `$${Math.round(prize).toLocaleString("en-US")}` : "—"}
              accent="#fbbf24"
            />
          </div>

          {!isClosed && (
            <PartnerTorneoActions
              tournamentId={t.id as string}
              status={dbStatus}
              format={tournamentFormat}
              isFeatured={isFeatured}
              isAdmin={isAdmin}
              acceptedCount={acceptedCount}
              hasBracket={hasBracket}
              editable={{
                id: t.id as string,
                name: t.name as string,
                startsAt: t.starts_at as string,
                endsAt: (t.ends_at as string | null) ?? null,
                maxParticipants: (t.max_participants as number | null) ?? null,
                entryFeeCents: (t.entry_fee_cents as number | null) ?? 0,
                prizePoolCents: (t.prize_pool_cents as number | null) ?? null,
                paymentPolicy:
                  ((t.payment_policy as string | null) ?? "prepay") as
                    | "free"
                    | "prepay"
                    | "onsite"
                    | "flexible",
              }}
            />
          )}

          {tournamentFormat === "groups_to_knockout" && !isClosed && (
            <GroupStagePanel
              tournamentId={t.id as string}
              acceptedCount={acceptedCount}
              registrationLabels={registrationLabels}
              initial={groupStageInitial}
            />
          )}

          {isAdmin && (
            <AdminOverridesPanel
              tournamentId={t.id as string}
              status={dbStatus}
            />
          )}

          <CategoriesPanel
            tournamentId={t.id as string}
            initialCategories={categories}
            readOnly={isClosed}
          />

          <SchedulePanel
            tournamentId={t.id as string}
            initialBlocks={blocks}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            readOnly={isClosed}
          />

          <PrizesPanel
            tournamentId={t.id as string}
            initialPrizes={prizes}
            readOnly={isClosed}
          />

          <div className="card" style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <div>
                <div className="label-mp">Inscritos</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                  {regs.length === 0
                    ? "Aún no hay inscritos."
                    : `${regs.length} inscripción${regs.length === 1 ? "" : "es"} en total.`}
                </div>
              </div>
              <Link
                href="/dashboard/partner/p-inscritos"
                className="btn"
                style={{ background: "#fff", border: "1px solid var(--border)" }}
              >
                <Icon name="external-link" size={12} />
                Vista completa
              </Link>
            </div>

            {regs.length === 0 ? (
              <div
                style={{
                  padding: "24px 0",
                  textAlign: "center",
                  color: "var(--muted-fg)",
                  fontSize: 12,
                }}
              >
                Cuando alguien se inscriba aparecerá aquí.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="mp-partner-torneo-regs-head">
                  <div>Jugador</div>
                  <div style={{ textAlign: "center" }}>Estado</div>
                  <div style={{ textAlign: "center" }}>Modo</div>
                  <div style={{ textAlign: "center" }}>Pago</div>
                  <div style={{ textAlign: "right" }}>Inscrito</div>
                </div>
                {regs.slice(0, 12).map((r) => {
                  const name = r.label;
                  const dt = new Date(r.createdAt);
                  return (
                    <div key={r.id} className="mp-partner-torneo-regs-row">
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            background: r.avatarUrl
                              ? `url(${r.avatarUrl}) center/cover`
                              : "linear-gradient(135deg,#10b981,#047857)",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 900,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          {!r.avatarUrl && name.slice(0, 2).toUpperCase()}
                        </div>
                        <b style={{ color: "#0a0a0a" }}>{name}</b>
                      </div>
                      <RegStatus value={r.status} />
                      <div
                        style={{
                          textAlign: "center",
                          fontSize: 10,
                          fontWeight: 800,
                          color: "var(--muted-fg)",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                        }}
                      >
                        {r.paymentMode === "online"
                          ? "Online"
                          : r.paymentMode === "onsite"
                            ? "En club"
                            : r.paymentMode === "free"
                              ? "Gratis"
                              : "—"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        {r.payStatus === "onsite_pending" && !isCancelled ? (
                          <MarkPaidInline registrationId={r.id} />
                        ) : (
                          <PayStatus value={r.payStatus} />
                        )}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          fontSize: 11,
                          color: "var(--muted-fg)",
                        }}
                      >
                        {dt.toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}
                      </div>
                    </div>
                  );
                })}
                {regs.length > 12 && (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "10px 0 4px",
                      fontSize: 11,
                      color: "var(--muted-fg)",
                    }}
                  >
                    Mostrando 12 de {regs.length} ·{" "}
                    <Link
                      href="/dashboard/partner/p-inscritos"
                      style={{ color: "#0a0a0a", fontWeight: 800 }}
                    >
                      ver todos
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mp-partner-torneo-bottom">
            <PublicPreviewModal
              preview={{
                name: t.name as string,
                slug: t.slug as string,
                sport: String(t.sport),
                format: String(t.format),
                modalityLabel: "Pickleball",
                startsAt: t.starts_at as string,
                endsAt: (t.ends_at as string | null) ?? null,
                clubName: club?.name ?? null,
                prizePoolCents: (t.prize_pool_cents as number | null) ?? null,
                entryFeeCents: (t.entry_fee_cents as number | null) ?? 0,
                maxParticipants: (t.max_participants as number | null) ?? null,
                paymentPolicy: (t.payment_policy as string | null) ?? "prepay",
                status: dbStatus,
                isFeatured,
                scoringSummary: "Side-out · Best of 3 a 11 · Gana por 2",
              }}
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                mprMin: c.mprMin,
                mprMax: c.mprMax,
              }))}
              blocks={blocks.map((b) => ({
                id: b.id,
                startsAt: b.startsAt,
                label: b.label,
                categoryId: b.categoryId,
              }))}
              prizes={prizes.map((p) => ({
                id: p.id,
                placeLabel: p.placeLabel,
                prizeLabel: p.prizeLabel,
                valueCents: p.valueCents,
                sponsor: p.sponsor,
              }))}
            />
            <Link
              href="/dashboard/partner/p-brackets"
              className="card"
              style={{
                padding: 18,
                textDecoration: "none",
                color: "inherit",
                display: "flex",
                gap: 12,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--muted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="trophy" size={16} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 900 }}>Brackets</div>
                <div style={{ fontSize: 11, color: "var(--muted-fg)", marginTop: 2 }}>
                  Ver y gestionar el cuadro del torneo.
                </div>
              </div>
            </Link>
          </div>
    </main>
  );
}

function KPI({
  label,
  value,
  accent,
  foot,
}: {
  label: string;
  value: string;
  accent: string;
  foot?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="label-mp">{label}</div>
      <div
        className="font-heading tabular"
        style={{
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          marginTop: 6,
          color: accent,
        }}
      >
        {value}
      </div>
      {foot}
    </div>
  );
}

function RegStatus({ value }: { value: string }) {
  const map: Record<string, { bg: string; fg: string; l: string }> = {
    accepted: { bg: "var(--primary)", fg: "#fff", l: "ACEPTADO" },
    pending: { bg: "#fbbf24", fg: "#000", l: "PENDIENTE" },
    waitlist: { bg: "#0ea5e9", fg: "#fff", l: "ESPERA" },
  };
  const s = map[value] ?? { bg: "var(--muted-fg)", fg: "#fff", l: value.toUpperCase() };
  return (
    <div style={{ textAlign: "center" }}>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.08em",
          padding: "3px 7px",
          borderRadius: 4,
          background: s.bg,
          color: s.fg,
        }}
      >
        {s.l}
      </span>
    </div>
  );
}

function PayStatus({ value }: { value: string | null }) {
  const map: Record<string, { bg: string; l: string }> = {
    paid: { bg: "var(--primary)", l: "PAGADO" },
    free: { bg: "#0ea5e9", l: "GRATIS" },
    onsite_pending: { bg: "#fbbf24", l: "EN CLUB" },
    awaiting_proof: { bg: "#fbbf24", l: "COMPROBANTE" },
    review: { bg: "#7c3aed", l: "REVISIÓN" },
  };
  const s = (value ? map[value] : undefined) ?? {
    bg: "var(--muted-fg)",
    l: value ? value.toUpperCase() : "—",
  };
  return (
    <div style={{ textAlign: "center" }}>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 900,
          letterSpacing: "0.08em",
          padding: "3px 7px",
          borderRadius: 4,
          background: s.bg,
          color: "#fff",
        }}
      >
        {s.l}
      </span>
    </div>
  );
}
