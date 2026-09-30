import type { ActivityCategory, LeadStatus } from "@/lib/domain";

/**
 * Log activity → Type (APP-GUIDE §6, "Suggested activity types"): the types that fit where the lead is come first;
 * every other active type stays one click away under "More types". Nothing is ever disabled or refused.
 */
export type LeadStage = LeadStatus | "meeting_booked";

/** Where the lead is, for suggestions. An upcoming scheduled meeting wins over the status. */
export function leadStage(status: LeadStatus, hasUpcomingMeeting: boolean): LeadStage {
  return hasUpcomingMeeting && !["customer", "lost", "not_interested", "bad_fit"].includes(status) ? "meeting_booked" : status;
}

/** Suggested categories per stage, in the order they're shown. "other" is always suggested. */
export const SUGGESTED_CATEGORIES: Record<LeadStage, ActivityCategory[]> = {
  new: ["outreach", "call", "other"],
  contacted: ["follow_up", "outreach", "inbound_reply", "call", "other"],
  replied: ["follow_up", "inbound_reply", "call", "meeting", "proposal", "other"],
  meeting_booked: ["meeting", "call", "follow_up", "inbound_reply", "other"],
  qualified: ["proposal", "follow_up", "call", "meeting", "inbound_reply", "other"],
  nurture: ["follow_up", "inbound_reply", "call", "other"],
  customer: ["follow_up", "call", "inbound_reply", "other"],
  lost: ["follow_up", "call", "inbound_reply", "other"],
  not_interested: ["follow_up", "call", "inbound_reply", "other"],
  bad_fit: ["follow_up", "call", "inbound_reply", "other"],
};

/** Split the active types into suggested (in suggested-category order) and the rest (in their own order). */
export function splitTypesByStage<T extends { category: ActivityCategory }>(types: T[], stage: LeadStage) {
  const order = SUGGESTED_CATEGORIES[stage];
  const suggested = order.flatMap((c) => types.filter((t) => t.category === c));
  const more = types.filter((t) => !order.includes(t.category));
  return { suggested, more, suggestedCategories: order };
}
