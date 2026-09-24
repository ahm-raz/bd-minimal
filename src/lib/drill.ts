/** Metrics a number can drill down into (docs/05 section 8). */
export const DRILL_METRICS = [
  "leads_added",
  "outreach",
  "follow_ups",
  "replies",
  "positive_replies",
  "meetings_booked",
  "meetings_done",
  "proposals_sent",
  "won",
  "lost",
  "flagged",
] as const;
export type DrillMetric = (typeof DRILL_METRICS)[number];
