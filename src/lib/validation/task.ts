import { z } from "zod";
import { isLocalDate } from "@/lib/dates";
import { TASK_METRICS, type TaskMetric } from "@/lib/domain";

/** Title auto-filled for count tasks: "Add 25 leads" (docs/07 section 8). */
export function countTaskTitle(metric: TaskMetric | null | undefined, target: number | string | null | undefined): string {
  const n = Number(target) || "N";
  switch (metric) {
    case "leads_added":
      return `Add ${n} leads`;
    case "outreach":
      return `Send ${n} first-touch messages`;
    case "follow_ups":
      return `Follow up with ${n} leads`;
    case "replies":
      return `Get ${n} replies`;
    case "meetings_booked":
      return `Book ${n} meetings`;
    default:
      return "";
  }
}

const optionalId = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

export const taskFormSchema = z
  .object({
    id: z.string().optional(),
    templateId: z.string().optional(),
    assigneeId: z.string().min(1, "Pick who it's for.").pipe(z.uuid("Pick who it's for.")),
    kind: z.enum(["count", "checklist"]),
    title: z.string().trim().min(2, "Give the task a title.").max(120, "Keep the title under 120 characters."),
    metric: z.enum(TASK_METRICS as [TaskMetric, ...TaskMetric[]]).nullable().optional(),
    targetCount: z.union([z.string(), z.number()]).nullable().optional(),
    filterNicheId: optionalId,
    filterCampaignId: optionalId,
    leadId: optionalId,
    opportunityId: optionalId,
    note: z.string().trim().max(1000, "Keep the note under 1,000 characters.").optional().default(""),
    dueDate: z.string().min(1, "Pick a date.").refine(isLocalDate, "Pick a date."),
    repeat: z.boolean().optional().default(false),
  })
  .transform((v, ctx) => {
    let target: number | null = null;
    if (v.kind === "count") {
      if (!v.metric) ctx.addIssue({ code: "custom", path: ["metric"], message: "Pick what to count." });
      const n = Number(String(v.targetCount ?? "").trim());
      if (!Number.isInteger(n) || n < 1) ctx.addIssue({ code: "custom", path: ["targetCount"], message: "Enter a whole number, 1 or more." });
      else if (n > 10000) ctx.addIssue({ code: "custom", path: ["targetCount"], message: "That's more than a day's work." });
      else target = n;
    }
    return {
      id: v.id || undefined,
      templateId: v.templateId || undefined,
      assigneeId: v.assigneeId,
      kind: v.kind,
      title: v.title,
      metric: v.kind === "count" ? (v.metric ?? null) : null,
      targetCount: v.kind === "count" ? target : null,
      filterNicheId: v.kind === "count" ? v.filterNicheId : null,
      filterCampaignId: v.kind === "count" ? v.filterCampaignId : null,
      leadId: v.kind === "checklist" ? v.leadId : null,
      opportunityId: v.kind === "checklist" ? v.opportunityId : null,
      note: v.note || null,
      dueDate: v.dueDate,
      repeat: v.repeat,
    };
  });
export type TaskFormValues = z.input<typeof taskFormSchema>;
export type TaskData = z.output<typeof taskFormSchema>;

export const flagLeadSchema = z.object({
  leadId: z.uuid(),
  note: z.string().trim().min(3, "Say what needs fixing.").max(500, "Keep the note under 500 characters."),
});
export type FlagLeadValues = z.input<typeof flagLeadSchema>;

/** "Start from a common task" library (docs/04 section 6). */
export const COMMON_TASKS: { key: string; label: string; values: Partial<TaskFormValues> }[] = [
  { key: "add_leads", label: "Add N new leads", values: { kind: "count", metric: "leads_added", targetCount: "20", repeat: true } },
  { key: "first_touch", label: "Send N first-touch messages", values: { kind: "count", metric: "outreach", targetCount: "15", repeat: true } },
  { key: "follow_up", label: "Follow up with N leads", values: { kind: "count", metric: "follow_ups", targetCount: "20", repeat: true } },
  { key: "book_meetings", label: "Book N meetings", values: { kind: "count", metric: "meetings_booked", targetCount: "1" } },
  { key: "research", label: "Research a lead before a call", values: { kind: "checklist", title: "Research lead before the call" } },
  { key: "proposal", label: "Prepare proposal", values: { kind: "checklist", title: "Prepare proposal" } },
  { key: "cleanup", label: "Clean up leads with no next action", values: { kind: "checklist", title: CLEANUP_TITLE() } },
  { key: "stuck", label: "Update stuck deals", values: { kind: "checklist", title: STUCK_TITLE() } },
];

// Checklist tasks from these two presets show the matching list when expanded (docs/04 section 6).
export function CLEANUP_TITLE() {
  return "Clean up leads with no next action";
}
export function STUCK_TITLE() {
  return "Update stuck deals";
}
