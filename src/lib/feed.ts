/** Feed event types grouped for the filter (docs/07 section 9). */
export const FEED_GROUPS = {
  leads: { label: "Leads added", kinds: ["lead_created"] },
  activities: { label: "Activities", kinds: ["activity_logged"] },
  pipeline: { label: "Pipeline", kinds: ["stage_changed", "lead_reassigned"] },
  outcomes: { label: "Wins and losses", kinds: ["opportunity_won", "opportunity_lost"] },
  tasks: { label: "Tasks", kinds: ["task_completed"] },
  flags: { label: "Flags", kinds: ["lead_flagged"] },
  social: {
    label: "Social",
    kinds: ["post_submitted", "post_approved", "changes_requested", "post_published", "post_missed"],
  },
} as const;
export type FeedGroup = keyof typeof FEED_GROUPS;
export const FEED_GROUP_KEYS = Object.keys(FEED_GROUPS) as FeedGroup[];

export type FeedEvent = {
  id: number;
  kind: string;
  actorId: string | null;
  subjectUserId: string | null;
  leadId: string | null;
  opportunityId: string | null;
  taskId: string | null;
  postId: string | null;
  summary: string;
  createdAt: string;
  /** lead company, when loaded with the page (Realtime rows don't carry it) */
  company?: string | null;
};

export const FEED_PAGE = 50;

export function kindsFor(groups: FeedGroup[]): string[] {
  return groups.flatMap((g) => [...FEED_GROUPS[g].kinds]);
}
