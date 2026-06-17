"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminClient, setAuditActor } from "@/lib/db/client.admin";
import { getServerClient } from "@/lib/db/client.server";
import { runAction, type ActionResult } from "@/lib/api/action";
import { MpError } from "@/lib/api/errors";
import { AuthError, requireAdminUserId } from "@/lib/auth/session";
import { UuidSchema } from "@/lib/schemas/common";
import { SALES_LEAD_STATUSES, type SalesLeadPriority, type SalesLeadStatus } from "@/lib/sales/crm";

const ADMIN_SALES_PATH = "/dashboard/admin/admin-ventas";

export type AdminSalesLead = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  leadType: string;
  businessName: string | null;
  message: string | null;
  sourceUrl: string | null;
  sourceCampaign: string | null;
  status: SalesLeadStatus;
  priority: SalesLeadPriority;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  lostReason: string | null;
  notes: string | null;
  city: string | null;
  sport: string | null;
  clubSize: string | null;
  monthlyEvents: number | null;
  estimatedValueCents: number | null;
  category: string | null;
  targetCity: string | null;
  desiredInventory: string | null;
  budgetRange: string | null;
  campaignGoal: string | null;
  ownerUserId: string | null;
  updatedAt: string | null;
  occurredAt: string;
};

export type AdminSalesData = {
  leads: AdminSalesLead[];
  totals: {
    total: number;
    newCount: number;
    demoCount: number;
    wonCount: number;
    dueFollowUps: number;
    expectedValueCents: number;
  };
};

type TypedAdminClient = ReturnType<typeof getAdminClient>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseAdminClient = Omit<TypedAdminClient, "from"> & { from: (table: string) => any };

function adminClient(): LooseAdminClient {
  return getAdminClient() as LooseAdminClient;
}

async function setAdminAuditActor(admin: LooseAdminClient, adminId: string): Promise<void> {
  await setAuditActor(admin as unknown as TypedAdminClient, adminId, "admin");
}

const StatusSchema = z.enum(SALES_LEAD_STATUSES);
const PrioritySchema = z.enum(["low", "medium", "high"]);

const ListSalesSchema = z.object({
  limit: z.number().int().min(1).max(500).default(200).optional(),
});

const UpdateSalesLeadSchema = z.object({
  leadId: UuidSchema,
  status: StatusSchema.optional(),
  priority: PrioritySchema.optional(),
  nextFollowUpAt: z.string().datetime({ offset: true }).nullable().optional(),
  lostReason: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  ownerUserId: UuidSchema.nullable().optional(),
});

type SalesLeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  lead_type: string;
  business_name: string | null;
  message: string | null;
  source_url: string | null;
  source_campaign?: string | null;
  status?: SalesLeadStatus | null;
  priority?: SalesLeadPriority | null;
  next_follow_up_at?: string | null;
  last_contacted_at?: string | null;
  lost_reason?: string | null;
  notes?: string | null;
  city?: string | null;
  sport?: string | null;
  club_size?: string | null;
  monthly_events?: number | null;
  estimated_value_cents?: number | null;
  category?: string | null;
  target_city?: string | null;
  desired_inventory?: string | null;
  budget_range?: string | null;
  campaign_goal?: string | null;
  owner_user_id?: string | null;
  updated_at?: string | null;
  occurred_at: string;
};

function mapLead(row: SalesLeadRow): AdminSalesLead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    leadType: row.lead_type,
    businessName: row.business_name,
    message: row.message,
    sourceUrl: row.source_url,
    sourceCampaign: row.source_campaign ?? null,
    status: row.status ?? "new",
    priority: row.priority ?? "medium",
    nextFollowUpAt: row.next_follow_up_at ?? null,
    lastContactedAt: row.last_contacted_at ?? null,
    lostReason: row.lost_reason ?? null,
    notes: row.notes ?? null,
    city: row.city ?? null,
    sport: row.sport ?? null,
    clubSize: row.club_size ?? null,
    monthlyEvents: row.monthly_events ?? null,
    estimatedValueCents: row.estimated_value_cents ?? null,
    category: row.category ?? null,
    targetCity: row.target_city ?? null,
    desiredInventory: row.desired_inventory ?? null,
    budgetRange: row.budget_range ?? null,
    campaignGoal: row.campaign_goal ?? null,
    ownerUserId: row.owner_user_id ?? null,
    updatedAt: row.updated_at ?? null,
    occurredAt: row.occurred_at,
  };
}

function summarize(leads: AdminSalesLead[]): AdminSalesData["totals"] {
  const now = Date.now();
  return {
    total: leads.length,
    newCount: leads.filter((lead) => lead.status === "new").length,
    demoCount: leads.filter((lead) => lead.status === "demo_scheduled" || lead.status === "demo_completed").length,
    wonCount: leads.filter((lead) => lead.status === "won").length,
    dueFollowUps: leads.filter((lead) => {
      if (!lead.nextFollowUpAt || lead.status === "won" || lead.status === "lost") return false;
      return new Date(lead.nextFollowUpAt).getTime() <= now;
    }).length,
    expectedValueCents: leads.reduce((sum, lead) => sum + (lead.estimatedValueCents ?? 0), 0),
  };
}

export async function listAdminSalesLeads(input: unknown = {}): Promise<ActionResult<AdminSalesData>> {
  return runAction(ListSalesSchema, input, async ({ limit }) => {
    await requireAdminUserId();
    const admin = adminClient();

    const { data, error } = await admin
      .from("sales_leads")
      .select("*")
      .order("occurred_at", { ascending: false })
      .limit(limit ?? 200);

    if (error) throw new MpError("SALES_LEADS.QUERY_FAILED", error.message, 500);

    const leads = ((data ?? []) as SalesLeadRow[]).map(mapLead);
    return { leads, totals: summarize(leads) };
  });
}

export async function updateSalesLeadAdmin(input: unknown): Promise<ActionResult<AdminSalesLead>> {
  return runAction(UpdateSalesLeadSchema, input, async ({ leadId, ...patch }) => {
    const adminId = await requireAdminUserId();
    const admin = adminClient();
    await setAdminAuditActor(admin, adminId);

    const dbPatch: Record<string, unknown> = {
      updated_by: adminId,
    };
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.priority !== undefined) dbPatch.priority = patch.priority;
    if (patch.nextFollowUpAt !== undefined) dbPatch.next_follow_up_at = patch.nextFollowUpAt;
    if (patch.lostReason !== undefined) dbPatch.lost_reason = patch.lostReason;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.ownerUserId !== undefined) dbPatch.owner_user_id = patch.ownerUserId;
    if (patch.status === "contacted") dbPatch.last_contacted_at = new Date().toISOString();

    const { data, error } = await admin
      .from("sales_leads")
      .update(dbPatch)
      .eq("id", leadId)
      .select("*")
      .single();

    if (error || !data) {
      throw new MpError("SALES_LEADS.UPDATE_FAILED", error?.message ?? "No se pudo actualizar el lead", 500);
    }

    revalidatePath(ADMIN_SALES_PATH);
    return mapLead(data as SalesLeadRow);
  });
}
