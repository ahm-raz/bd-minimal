import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export type Role = Enums["user_role"];
export type LeadStatus = Enums["lead_status"];
export type LeadPriority = Enums["lead_priority"];
export type ActivityCategory = Enums["activity_category"];
export type EmailStatus = Enums["email_status"];
export type ContractType = Enums["contract_type"];
export type CampaignStatus = Enums["campaign_status"];
export type TaskKind = Enums["task_kind"];
export type TaskMetric = Enums["task_metric"];
export type TargetMetric = Enums["target_metric"];

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "replied",
  "qualified",
  "customer",
  "lost",
  "nurture",
  "not_interested",
  "bad_fit",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  qualified: "Qualified",
  customer: "Customer",
  lost: "Lost",
  nurture: "Nurture",
  not_interested: "Not interested",
  bad_fit: "Bad fit",
};

/** Statuses that no longer need follow-up (docs/07 section 2, docs/04 section 5). */
export const CLOSED_LEAD_STATUSES: LeadStatus[] = ["customer", "lost", "not_interested", "bad_fit"];

export const PRIORITIES: LeadPriority[] = ["high", "medium", "low"];
export const PRIORITY_LABELS: Record<LeadPriority, string> = { high: "High", medium: "Medium", low: "Low" };

export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

export const EMAIL_STATUSES: EmailStatus[] = ["unverified", "valid", "invalid", "bounced"];
export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  unverified: "Unverified",
  valid: "Valid",
  invalid: "Invalid",
  bounced: "Bounced",
};

export const ACTIVITY_CATEGORIES: ActivityCategory[] = [
  "outreach",
  "follow_up",
  "inbound_reply",
  "call",
  "meeting",
  "proposal",
  "other",
];

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  outreach: "Outreach",
  follow_up: "Follow-up",
  inbound_reply: "Reply received",
  call: "Call",
  meeting: "Meeting",
  proposal: "Proposal",
  other: "Other",
};

/** Help line shown in Settings → Activity types (docs/07 section 12). */
export const CATEGORY_HELP: Record<ActivityCategory, string> = {
  outreach: "Counts as outreach: a first touch. Drives reply, meeting and positive reply rates.",
  follow_up: "Counts as a follow-up on a lead you've already contacted.",
  inbound_reply: "Something the lead sent you. Its outcome decides if it counts as a reply.",
  call: "A phone call. Counts toward replies or meetings only through its outcome.",
  meeting: "A meeting that took place. Not counted as outreach or follow-up.",
  proposal: "A proposal sent. Pipeline proposal counts come from the Proposal sent stage.",
  other: "Anything else. Counted only through its outcome.",
};

export const STAGE_KEYS = ["qualified", "meeting_done", "proposal_sent", "negotiation", "won", "lost"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];
export const OPEN_STAGE_KEYS: StageKey[] = ["qualified", "meeting_done", "proposal_sent", "negotiation"];

export const OUTCOME_KEYS = [
  "no_response",
  "bounced",
  "interested",
  "not_now",
  "not_interested",
  "meeting_booked",
  "done",
] as const;
export type OutcomeKey = (typeof OUTCOME_KEYS)[number];

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = { one_time: "One-time", monthly: "Monthly" };

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
};

export const TARGET_METRICS: TargetMetric[] = [
  "leads_added",
  "outreach",
  "follow_ups",
  "replies",
  "meetings_booked",
  "proposals_sent",
];

export const METRIC_LABELS: Record<TargetMetric, string> = {
  leads_added: "Leads added",
  outreach: "Outreach",
  follow_ups: "Follow-ups",
  replies: "Replies",
  meetings_booked: "Meetings booked",
  proposals_sent: "Proposals sent",
};

export const TASK_METRICS: TaskMetric[] = ["leads_added", "outreach", "follow_ups", "replies", "meetings_booked"];

export const ROLE_LABELS: Record<Role, string> = { founder: "Founder", bd: "BD" };
