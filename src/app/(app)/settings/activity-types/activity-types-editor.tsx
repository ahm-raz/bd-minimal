"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip } from "@/components/common/chips";
import { InlineInput } from "@/components/common/inline-input";
import { FormField } from "@/components/common/form-field";
import { Panel, PanelHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { ACTIVITY_CATEGORIES, CATEGORY_HELP, CATEGORY_LABELS, type ActivityCategory } from "@/lib/domain";
import { saveActivityType } from "@/server/actions/settings";
import type { ActivityTypeItem, ListItem } from "@/server/queries/lists";

const categoryOptions = ACTIVITY_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));

export function ActivityTypesEditor({ types, channels }: { types: ActivityTypeItem[]; channels: ListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<{ name: string; category: ActivityCategory | null; channelId: string | null }>({
    name: "",
    category: null,
    channelId: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const channelOptions = (current: string | null) =>
    channels.filter((c) => c.is_active || c.id === current).map((c) => ({ value: c.id, label: c.name }));

  const save = (t: ActivityTypeItem, patch: Partial<{ name: string; category: ActivityCategory; channelId: string | null; isActive: boolean }>, success: string) =>
    startTransition(async () => {
      const res = await saveActivityType({
        id: t.id,
        name: patch.name ?? t.name,
        category: patch.category ?? t.category,
        defaultChannelId: patch.channelId === undefined ? t.default_channel_id : patch.channelId,
        isActive: patch.isActive ?? t.is_active,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });

  return (
    <div className="grid gap-6">
      <Panel>
        <PanelHeader title="What each category counts as" />
        <dl className="grid gap-x-6 gap-y-2 p-4 text-small sm:grid-cols-2">
          {ACTIVITY_CATEGORIES.map((c) => (
            <div key={c}>
              <dt className="font-medium text-ink">{CATEGORY_LABELS[c]}</dt>
              <dd className="text-ink-muted">{CATEGORY_HELP[c]}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader title="Activity types" meta="The category is what metrics count. The name is just a label." />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Default channel</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Visibility</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} className="h-auto" data-testid={`type-${t.name}`}>
                  <TableCell className="min-w-56 align-top">
                    <InlineInput
                      value={t.name}
                      label={`Name of ${t.name}`}
                      className={t.is_active ? undefined : "text-ink-muted"}
                      onCommit={(name) => save(t, { name }, "Name saved")}
                    />
                  </TableCell>
                  <TableCell className="min-w-64 align-top whitespace-normal">
                    <SelectField
                      aria-label={`Category of ${t.name}`}
                      value={t.category}
                      onChange={(v) => v && save(t, { category: v as ActivityCategory }, "Category saved")}
                      options={categoryOptions}
                      className="h-8"
                    />
                    <p className="mt-1 max-w-72 text-small text-ink-muted">{CATEGORY_HELP[t.category]}</p>
                  </TableCell>
                  <TableCell className="min-w-48 align-top">
                    <SelectField
                      aria-label={`Default channel of ${t.name}`}
                      value={t.default_channel_id}
                      noneLabel="Lead's channel"
                      onChange={(v) => save(t, { channelId: v }, "Channel saved")}
                      options={channelOptions(t.default_channel_id)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="align-top">
                    <div className="flex items-center justify-end gap-2">
                      {!t.is_active && <Chip>Hidden</Chip>}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        aria-label={`${t.is_active ? "Hide" : "Show"} ${t.name}`}
                        onClick={() => save(t, { isActive: !t.is_active }, t.is_active ? `${t.name} hidden` : `${t.name} shown`)}
                      >
                        {t.is_active ? "Hide" : "Show"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <form
          noValidate
          className="grid gap-3 border-t border-line p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start"
          onSubmit={(e) => {
            e.preventDefault();
            const errs: Record<string, string> = {};
            if (!draft.name.trim()) errs.name = "Enter a name.";
            if (!draft.category) errs.category = "Pick a category.";
            setErrors(errs);
            if (Object.keys(errs).length) return;
            startTransition(async () => {
              const res = await saveActivityType({
                name: draft.name,
                category: draft.category!,
                defaultChannelId: draft.channelId,
                isActive: true,
              });
              if (!res.ok) {
                setErrors(res.fieldErrors ?? { name: res.error });
                return;
              }
              toast.success(`${draft.name.trim()} added`);
              setDraft({ name: "", category: null, channelId: null });
              router.refresh();
            });
          }}
        >
          <FormField label="New activity type" htmlFor="new-type-name" error={errors.name}>
            <Input
              id="new-type-name"
              value={draft.name}
              aria-invalid={!!errors.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </FormField>
          <FormField label="Category" htmlFor="new-type-category" error={errors.category}>
            <SelectField
              id="new-type-category"
              value={draft.category}
              onChange={(v) => setDraft((d) => ({ ...d, category: v as ActivityCategory | null }))}
              options={categoryOptions}
              placeholder="Pick a category"
              invalid={!!errors.category}
            />
          </FormField>
          <FormField label="Default channel" htmlFor="new-type-channel">
            <SelectField
              id="new-type-channel"
              value={draft.channelId}
              onChange={(v) => setDraft((d) => ({ ...d, channelId: v }))}
              noneLabel="Lead's channel"
              options={channelOptions(null)}
            />
          </FormField>
          <Button type="submit" size="form" className="sm:mt-[26px]" pending={pending}>
            Add activity type
          </Button>
        </form>
      </Panel>
    </div>
  );
}

