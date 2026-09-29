"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { Panel } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/domain";
import { formatNumber } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import { campaignSchema, type CampaignInput } from "@/lib/validation/settings";
import { saveCampaign } from "@/server/actions/settings";
import type { CampaignItem, ListItem, MemberItem } from "@/server/queries/lists";

const STATUS_TONE = { active: "ok", paused: "warn", completed: "neutral" } as const;

export function CampaignsEditor({
  campaigns,
  leadCounts,
  niches,
  channels,
  members,
}: {
  campaigns: CampaignItem[];
  leadCounts: Record<string, number>;
  niches: ListItem[];
  channels: ListItem[];
  members: MemberItem[];
}) {
  const [editing, setEditing] = useState<CampaignItem | "new" | null>(null);
  const nameOf = (list: { id: string; name?: string; full_name?: string }[], id: string | null) => {
    const item = list.find((x) => x.id === id);
    return item ? (item.name ?? item.full_name ?? "") : "";
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden /> New campaign
        </Button>
      </div>
      <Panel className="overflow-hidden">
        {campaigns.length === 0 ? (
          <EmptyState action={<Button onClick={() => setEditing("new")}>New campaign</Button>}>
            No campaigns yet. Add one so leads and outreach can be grouped by it.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Niche</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{nameOf(niches, c.niche_id) || <span className="text-ink-muted">Any</span>}</TableCell>
                    <TableCell>{nameOf(channels, c.channel_id) || <span className="text-ink-muted">Any</span>}</TableCell>
                    <TableCell>{nameOf(members, c.owner_id) || <span className="text-ink-muted">Anyone</span>}</TableCell>
                    <TableCell>
                      <Chip tone={STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABELS[c.status]}</Chip>
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(leadCounts[c.id] ?? 0)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
      {editing && (
        <CampaignSheet
          key={editing === "new" ? "new" : editing.id}
          campaign={editing === "new" ? null : editing}
          niches={niches}
          channels={channels}
          members={members}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function CampaignSheet({
  campaign,
  niches,
  channels,
  members,
  onClose,
}: {
  campaign: CampaignItem | null;
  niches: ListItem[];
  channels: ListItem[];
  members: MemberItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      id: campaign?.id,
      name: campaign?.name ?? "",
      nicheId: campaign?.niche_id ?? null,
      channelId: campaign?.channel_id ?? null,
      ownerId: campaign?.owner_id ?? null,
      status: campaign?.status ?? "active",
      notes: campaign?.notes ?? "",
    },
  });
  const errors = form.formState.errors;
  const opts = (list: ListItem[], current: string | null | undefined) =>
    list.filter((x) => x.is_active || x.id === current).map((x) => ({ value: x.id, label: x.name }));

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={campaign ? `Edit ${campaign.name}` : "New campaign"}
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="campaign-form" pending={pending}>
            {campaign ? "Save campaign" : "Add campaign"}
          </Button>
        </div>
      }
    >
      <form
        id="campaign-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            const res = await saveCampaign(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              toast.error(res.error);
              return;
            }
            toast.success(campaign ? "Campaign saved" : "Campaign added");
            onClose();
            router.refresh();
          }),
        )}
      >
        <FormField label="Name" htmlFor="campaign-name" required error={errors.name?.message}>
          <Input id="campaign-name" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Niche" htmlFor="campaign-niche">
            <Controller
              control={form.control}
              name="nicheId"
              render={({ field }) => (
                <SelectField id="campaign-niche" value={field.value} onChange={field.onChange} noneLabel="Any niche" options={opts(niches, field.value)} />
              )}
            />
          </FormField>
          <FormField label="Channel" htmlFor="campaign-channel">
            <Controller
              control={form.control}
              name="channelId"
              render={({ field }) => (
                <SelectField id="campaign-channel" value={field.value} onChange={field.onChange} noneLabel="Any channel" options={opts(channels, field.value)} />
              )}
            />
          </FormField>
          <FormField label="Owner" htmlFor="campaign-owner">
            <Controller
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <SelectField
                  id="campaign-owner"
                  value={field.value}
                  onChange={field.onChange}
                  noneLabel="Anyone"
                  options={members.filter((m) => m.is_active || m.id === field.value).map((m) => ({ value: m.id, label: m.full_name || m.email }))}
                />
              )}
            />
          </FormField>
          <FormField label="Status" htmlFor="campaign-status">
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <SelectField
                  id="campaign-status"
                  value={field.value}
                  onChange={(v) => v && field.onChange(v)}
                  options={(["active", "paused", "completed"] as const).map((s) => ({ value: s, label: CAMPAIGN_STATUS_LABELS[s] }))}
                />
              )}
            />
          </FormField>
        </div>
        <FormField label="Notes" htmlFor="campaign-notes" error={errors.notes?.message}>
          <Textarea id="campaign-notes" rows={4} {...form.register("notes")} />
        </FormField>
      </form>
    </FormSheet>
  );
}
