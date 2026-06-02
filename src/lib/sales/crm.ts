export const SALES_LEAD_STATUSES = [
  "new",
  "qualified",
  "contacted",
  "demo_scheduled",
  "demo_completed",
  "pilot",
  "proposal_sent",
  "won",
  "lost",
  "nurture",
] as const;

export type SalesLeadStatus = (typeof SALES_LEAD_STATUSES)[number];
export type SalesLeadPriority = "low" | "medium" | "high";
