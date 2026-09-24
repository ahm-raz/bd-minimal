import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { ActivityCategory } from "@/lib/domain";

export type ListItem = { id: string; name: string; sort_order: number; is_active: boolean };
export type ActivityTypeItem = ListItem & { category: ActivityCategory; default_channel_id: string | null };
export type OutcomeItem = {
  key: string;
  label: string;
  is_reply: boolean;
  is_positive: boolean;
  is_meeting: boolean;
  allowed_categories: ActivityCategory[];
  sort_order: number;
};
export type StageItem = { key: string; label: string; probability: number; is_open: boolean; sort_order: number };
export type CampaignItem = {
  id: string;
  name: string;
  niche_id: string | null;
  channel_id: string | null;
  owner_id: string | null;
  status: "active" | "paused" | "completed";
  notes: string | null;
};
export type MemberItem = {
  id: string;
  full_name: string;
  email: string;
  role: "founder" | "bd";
  is_active: boolean;
  timezone: string;
  primary_niche_id: string | null;
};

export type Lists = {
  niches: ListItem[];
  channels: ListItem[];
  sources: ListItem[];
  lostReasons: ListItem[];
  activityTypes: ActivityTypeItem[];
  outcomes: OutcomeItem[];
  stages: StageItem[];
  campaigns: CampaignItem[];
  members: MemberItem[];
};

/** All settings lists (including hidden items, so old records still show their labels). Once per request. */
export const getLists = cache(async (): Promise<Lists> => {
  const supabase = await createClient();
  const cols = "id, name, sort_order, is_active";
  const [niches, channels, sources, lostReasons, activityTypes, outcomes, stages, campaigns, members] = await Promise.all([
    supabase.from("niches").select(cols).order("sort_order").order("name"),
    supabase.from("channels").select(cols).order("sort_order").order("name"),
    supabase.from("lead_sources").select(cols).order("sort_order").order("name"),
    supabase.from("lost_reasons").select(cols).order("sort_order").order("name"),
    supabase.from("activity_types").select(`${cols}, category, default_channel_id`).order("sort_order").order("name"),
    supabase.from("outcomes").select("*").order("sort_order"),
    supabase.from("stages").select("*").order("sort_order"),
    supabase.from("campaigns").select("id, name, niche_id, channel_id, owner_id, status, notes").order("name"),
    supabase.from("profiles").select("id, full_name, email, role, is_active, timezone, primary_niche_id").order("role").order("full_name"),
  ]);
  return {
    niches: niches.data ?? [],
    channels: channels.data ?? [],
    sources: sources.data ?? [],
    lostReasons: lostReasons.data ?? [],
    activityTypes: activityTypes.data ?? [],
    outcomes: outcomes.data ?? [],
    stages: (stages.data ?? []).map((s) => ({ ...s, probability: Number(s.probability) })),
    campaigns: campaigns.data ?? [],
    members: members.data ?? [],
  };
});

export function nameOf<T extends { id: string; name: string }>(items: T[], id: string | null | undefined): string {
  if (!id) return "";
  return items.find((i) => i.id === id)?.name ?? "";
}
