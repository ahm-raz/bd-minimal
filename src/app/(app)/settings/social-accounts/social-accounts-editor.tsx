"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { Panel, PanelHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { PlatformChip } from "@/components/content/post-status-chip";
import { applyFieldErrors } from "@/lib/forms";
import { zoneCity } from "@/lib/dates";
import { PLATFORMS, PLATFORM_LABELS } from "@/lib/social";
import { socialAccountSchema, type SocialAccountValues } from "@/lib/validation/social";
import { saveSocialAccount } from "@/server/actions/schedules";
import type { SocialAccountItem } from "@/server/queries/lists";

/** Settings → Social accounts (docs/09 section 2): the brand accounts posts go to. Hide, don't delete. */
export function SocialAccountsEditor({ accounts }: { accounts: SocialAccountItem[] }) {
  const [editing, setEditing] = useState<SocialAccountItem | "new" | null>(null);
  return (
    <>
      <p className="prose-width mb-4 text-small text-ink-muted">
        The accounts your social media manager posts to. Post times are entered in each account&apos;s audience time zone.
        Hidden accounts stay on old posts and in reports.
      </p>
      <Panel className="max-w-3xl">
        <PanelHeader
          title="Social accounts"
          actions={
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add account
            </Button>
          }
        />
        {accounts.length === 0 ? (
          <EmptyState>No accounts yet. Add the LinkedIn page or profile you post to.</EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="social-accounts">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <PlatformChip platform={a.platform} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.name}</span>
                <span className="text-small text-ink-muted">{PLATFORM_LABELS[a.platform]}</span>
                <span className="text-small text-ink-muted">Audience: {zoneCity(a.audience_timezone)}</span>
                {a.profile_url && (
                  <a href={a.profile_url} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-ink" aria-label={`Open ${a.name}`}>
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )}
                {!a.is_active && <Chip tone="muted">Hidden</Chip>}
                <Button variant="ghost" size="sm" onClick={() => setEditing(a)}>
                  Edit<span className="sr-only"> {a.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {editing && <AccountSheet key={editing === "new" ? "new" : editing.id} account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AccountSheet({ account, onClose }: { account: SocialAccountItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SocialAccountValues, unknown, z.output<typeof socialAccountSchema>>({
    resolver: zodResolver(socialAccountSchema),
    defaultValues: account
      ? {
          id: account.id,
          name: account.name,
          platform: account.platform,
          profileUrl: account.profile_url ?? "",
          audienceTimezone: account.audience_timezone,
          isActive: account.is_active,
        }
      : { name: "", platform: "linkedin_page", profileUrl: "", audienceTimezone: "America/New_York", isActive: true },
  });
  const errors = form.formState.errors;
  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={account ? `Edit ${account.name}` : "Add account"}
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="account-form" disabled={pending}>
            {account ? "Save account" : "Add account"}
          </Button>
        </div>
      }
    >
      <form
        id="account-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            setFormError(null);
            const res = await saveSocialAccount(form.getValues());
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              setFormError(res.error);
              return;
            }
            toast.success(account ? "Account saved" : "Account added");
            router.refresh();
            onClose();
          }),
        )}
      >
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <FormField label="Name" htmlFor="acc-name" required error={errors.name?.message}>
          <Input id="acc-name" placeholder="BlueBugs LinkedIn page" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField label="Platform" htmlFor="acc-platform" required error={errors.platform?.message}>
          <Controller
            control={form.control}
            name="platform"
            render={({ field }) => (
              <SelectField
                id="acc-platform"
                value={field.value}
                onChange={(v) => v && field.onChange(v)}
                options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABELS[p] }))}
              />
            )}
          />
        </FormField>
        <FormField label="Profile link" htmlFor="acc-url" error={errors.profileUrl?.message}>
          <Input id="acc-url" type="url" placeholder="https://" aria-invalid={!!errors.profileUrl} {...form.register("profileUrl")} />
        </FormField>
        <FormField label="Audience time zone" htmlFor="acc-tz" required error={errors.audienceTimezone?.message} helper="Where most followers live. Post times are set in this zone.">
          <Controller
            control={form.control}
            name="audienceTimezone"
            render={({ field }) => <TimezoneSelect id="acc-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
        {account && (
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Switch id="acc-active" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="acc-active" className="text-body">
                  Show in dropdowns
                </Label>
              </div>
            )}
          />
        )}
      </form>
    </FormSheet>
  );
}
