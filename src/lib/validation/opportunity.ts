import { z } from "zod";
import { isLocalDate } from "@/lib/dates";
import { STAGE_KEYS } from "@/lib/domain";

const money = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""))))
    .pipe(
      z
        .number(`Enter ${label} in dollars.`)
        .min(0, `${label[0]!.toUpperCase()}${label.slice(1)} can't be negative.`)
        .max(9_999_999_999, `That ${label} is too large.`)
        .refine((n) => Number.isFinite(n), `Enter ${label} in dollars.`),
    );

const optionalDate = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isLocalDate(v), "Pick a date.");

/** New opportunity: title and estimated value are required; expected close date optional (docs/04 section 4). */
export const createOpportunitySchema = z.object({
  leadId: z.uuid(),
  title: z.string().trim().min(2, "Give it a title, like AI patient intake setup.").max(120, "Keep the title under 120 characters."),
  estimatedValue: money("the estimated value"),
  expectedCloseDate: optionalDate,
  notes: z.string().trim().max(2000).optional().default(""),
});
export type CreateOpportunityValues = z.input<typeof createOpportunitySchema>;

export const editOpportunitySchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(2, "Give it a title.").max(120, "Keep the title under 120 characters."),
  estimatedValue: money("the estimated value"),
  expectedCloseDate: optionalDate,
  notes: z.string().trim().max(2000).optional().default(""),
  contractEndedAt: optionalDate,
});
export type EditOpportunityValues = z.input<typeof editOpportunitySchema>;

/** Won: final value (defaults to the estimate), contract type, monthly amount if monthly. */
export const wonSchema = z
  .object({
    id: z.uuid(),
    wonValue: money("the final value"),
    contractType: z.enum(["one_time", "monthly"], "Pick a contract type."),
    monthlyAmount: z.union([z.string(), z.number()]).optional().nullable(),
  })
  .transform((v, ctx) => {
    let monthly = 0;
    if (v.contractType === "monthly") {
      const n = Number(String(v.monthlyAmount ?? "").replace(/[$,\s]/g, ""));
      if (v.monthlyAmount === null || v.monthlyAmount === undefined || String(v.monthlyAmount).trim() === "" || !Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: "custom", path: ["monthlyAmount"], message: "Enter the monthly amount." });
      } else monthly = n;
    }
    return { id: v.id, wonValue: v.wonValue, contractType: v.contractType, monthlyAmount: monthly };
  });
export type WonValues = z.input<typeof wonSchema>;

/** Lost: reason from the list (required) and an optional note. */
export const lostSchema = z.object({
  id: z.uuid(),
  lostReasonId: z.string().min(1, "Pick a reason.").pipe(z.uuid("Pick a reason.")),
  lostNote: z.string().trim().max(1000, "Keep the note under 1,000 characters.").optional().default(""),
});
export type LostValues = z.input<typeof lostSchema>;

export const moveStageSchema = z.object({
  id: z.uuid(),
  stage: z.enum(STAGE_KEYS),
});
