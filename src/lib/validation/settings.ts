import { z } from "zod";
import { ACTIVITY_CATEGORIES, TARGET_METRICS } from "@/lib/domain";

export const LIST_TABLES = ["niches", "channels", "lead_sources", "lost_reasons", "content_pillars"] as const;
export type ListTable = (typeof LIST_TABLES)[number];

export const LIST_LABELS: Record<ListTable, { title: string; singular: string }> = {
  niches: { title: "Niches", singular: "niche" },
  channels: { title: "Channels", singular: "channel" },
  lead_sources: { title: "Lead sources", singular: "lead source" },
  lost_reasons: { title: "Lost reasons", singular: "lost reason" },
  content_pillars: { title: "Content pillars", singular: "content pillar" },
};

export const listNameField = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(60, "Keep it under 60 characters.");

export const listItemSchema = z.object({ table: z.enum(LIST_TABLES), name: listNameField });
export const renameListItemSchema = z.object({ table: z.enum(LIST_TABLES), id: z.uuid(), name: listNameField });
export const toggleListItemSchema = z.object({ table: z.enum(LIST_TABLES), id: z.uuid(), active: z.boolean() });
export const reorderSchema = z.object({ table: z.enum([...LIST_TABLES, "activity_types", "social_accounts"]), ids: z.array(z.uuid()).min(1) });

export const activityTypeSchema = z.object({
  id: z.uuid().optional(),
  name: listNameField,
  category: z.enum(ACTIVITY_CATEGORIES as [string, ...string[]], "Pick a category."),
  defaultChannelId: z.uuid().nullable(),
  isActive: z.boolean(),
});
export type ActivityTypeInput = z.infer<typeof activityTypeSchema>;

export const outcomeLabelSchema = z.object({ key: z.string().min(1), label: listNameField });

export const stageSchema = z.object({
  key: z.string().min(1),
  label: listNameField,
  /** 0–100 in the form; stored as 0–1 */
  probability: z.number("Enter a number from 0 to 100.").int("Use a whole number.").min(0, "Use 0 to 100.").max(100, "Use 0 to 100."),
});
export type StageInput = z.infer<typeof stageSchema>;

export const campaignSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Use at least 2 characters.").max(80, "Keep it under 80 characters."),
  nicheId: z.uuid().nullable(),
  channelId: z.uuid().nullable(),
  ownerId: z.uuid().nullable(),
  status: z.enum(["active", "paused", "completed"]),
  notes: z
    .string()
    .trim()
    .max(1000, "Keep notes under 1,000 characters.")
    .transform((v) => v || null)
    .nullable(),
});
export type CampaignInput = z.input<typeof campaignSchema>;

export const targetSchema = z.object({
  userId: z.uuid(),
  metric: z.enum(TARGET_METRICS as [string, ...string[]]),
  /** null clears the target */
  weeklyValue: z
    .number("Enter a whole number.")
    .int("Use a whole number.")
    .min(0, "Use 0 or more.")
    .max(100000, "That's more than anyone can do in a week.")
    .nullable(),
});
export type TargetInput = z.infer<typeof targetSchema>;
