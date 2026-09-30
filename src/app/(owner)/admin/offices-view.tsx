"use client";

import { useMemo, useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";
import { useRouter } from "@/components/app/nav-progress";
import { RelativeTime } from "@/components/common/relative-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Chip } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { PageHeader, Panel } from "@/components/common/page";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { formatNumber } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import {
  createOfficeSchema,
  officeEditSchema,
  type CreateOfficeInput,
  type OfficeEditInput,
} from "@/lib/validation/offices";
import { createOffice, setOfficeStatus, updateOffice } from "@/server/actions/offices";

export type OfficeRow = {
  id: string;
  name: string;
  timezone: string;
  status: "active" | "suspended";
  seat_limit: number | null;
  created_at: string;
  founder_email: string | null;
  active_members: number;
  leads_count: number;
  last_activity_at: string | null;
};

const STATUS_CHIP = {
  active: { tone: "ok", label: "Active" },
  suspended: { tone: "bad", label: "Suspended" },
} as const;

/** The owner has no office or profile time zone; dates follow this browser. */
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function OfficesView({ offices, emailInvites }: { offices: OfficeRow[]; emailInvites: boolean }) {
  const router = useRouter();
  const timezone = browserTimezone();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OfficeRow | null>(null);
  const [suspending, setSuspending] = useState<OfficeRow | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? offices.filter((o) => o.name.toLowerCase().includes(q)) : offices;
  }, [offices, query]);

  const changeStatus = (office: OfficeRow, status: "active" | "suspended") =>
    startTransition(async () => {
      const res = await setOfficeStatus({ id: office.id, status });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(status === "suspended" ? `${office.name} suspended` : `${office.name} reactivated`);
      setSuspending(null);
      router.refresh();
    });

  return (
    <>
      <PageHeader
        title="Offices"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden /> Create office
          </Button>
        }
      />

      <div className="mb-3 flex max-w-sm items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            aria-label="Search offices"
            placeholder="Search offices"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Office</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Founder</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-ink-muted">
                    {offices.length === 0 ? "No offices yet." : "No office matches that search."}
                  </TableCell>
                </TableRow>
              )}
              {shown.map((o) => {
                const chip = STATUS_CHIP[o.status];
                return (
                  <TableRow key={o.id} data-testid={`office-${o.name}`}>
                    <TableCell className="font-medium text-ink">
                      {o.name}
                    </TableCell>
                    <TableCell>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </TableCell>
                    <TableCell className="text-ink-muted">{o.founder_email ?? "Not added yet"}</TableCell>
                    <TableCell className="num text-right">
                      {formatNumber(o.active_members)}
                      {o.seat_limit !== null && ` / ${formatNumber(o.seat_limit)}`}
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(o.leads_count)}</TableCell>
                    <TableCell className="text-ink-muted">
                      {o.last_activity_at ? <RelativeTime at={o.last_activity_at} tz={timezone} /> : "None yet"}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      <RelativeTime at={o.created_at} tz={timezone} />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${o.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(o)}>Edit</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {o.status === "suspended" ? (
                            <DropdownMenuItem onSelect={() => changeStatus(o, "active")}>Reactivate</DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem variant="destructive" onSelect={() => setSuspending(o)}>
                              Suspend
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <CreateOfficeSheet open={creating} onOpenChange={setCreating} emailInvites={emailInvites} />
      {editing && <EditOfficeSheet key={editing.id} office={editing} onClose={() => setEditing(null)} />}

      <Dialog open={!!suspending} onOpenChange={(o) => !o && setSuspending(null)}>
        <DialogContent>
          {suspending && (
            <>
              <DialogHeader>
                <DialogTitle>Suspend {suspending.name}?</DialogTitle>
                <DialogDescription>
                  Its members lose access until you reactivate it. Nothing is deleted.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setSuspending(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={() => changeStatus(suspending, "suspended")}>
                  Suspend office
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateOfficeSheet({
  open,
  onOpenChange,
  emailInvites,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  emailInvites: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const empty: CreateOfficeInput = {
    name: "",
    timezone: "Asia/Karachi",
    seatLimit: "",
    founderName: "",
    founderEmail: "",
    method: "password",
    password: "",
    confirm: "",
  };
  const form = useForm<CreateOfficeInput, unknown, z.output<typeof createOfficeSchema>>({
    resolver: zodResolver(createOfficeSchema),
    defaultValues: empty,
  });
  const errors = form.formState.errors;
  const method = useWatch({ control: form.control, name: "method" }) ?? "password";

  const close = () => {
    form.reset(empty);
    setFormError(null);
    onOpenChange(false);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Create office"
      description="A new office starts with the default settings. Its founder adds the rest of the team."
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="create-office-form" pending={pending}>
            Create office
          </Button>
        </div>
      }
    >
      <form
        id="create-office-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setFormError(null);
            const res = await createOffice(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              setFormError(res.error);
              return;
            }
            toast.success(
              values.method === "email"
                ? `${values.name} created. Invite sent to ${values.founderEmail}`
                : `${values.name} created. ${values.founderEmail} can sign in now.`,
            );
            close();
            router.refresh();
          }),
        )}
      >
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <FormField label="Office name" htmlFor="office-name" required error={errors.name?.message}>
          <Input id="office-name" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField
          label="Time zone"
          htmlFor="office-tz"
          required
          error={errors.timezone?.message}
          helper="The default for new members of this office."
        >
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => <TimezoneSelect id="office-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
        <FormField
          label="Seats"
          htmlFor="office-seats"
          error={errors.seatLimit?.message}
          helper="Active members, founder included. Leave empty for no limit."
        >
          <Input id="office-seats" inputMode="numeric" aria-invalid={!!errors.seatLimit} {...form.register("seatLimit")} />
        </FormField>

        <h3 className="pt-2 text-section text-ink">Founder</h3>
        <FormField label="Full name" htmlFor="office-founder-name" required error={errors.founderName?.message}>
          <Input id="office-founder-name" aria-invalid={!!errors.founderName} {...form.register("founderName")} />
        </FormField>
        <FormField label="Email" htmlFor="office-founder-email" required error={errors.founderEmail?.message}>
          <Input
            id="office-founder-email"
            type="email"
            aria-invalid={!!errors.founderEmail}
            {...form.register("founderEmail")}
          />
        </FormField>
        {emailInvites && (
          <label className="flex items-center gap-2 text-body text-ink">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={method === "email"}
              onChange={(e) => form.setValue("method", e.target.checked ? "email" : "password", { shouldDirty: true })}
            />
            Send an invite email instead
          </label>
        )}
        {method === "password" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Password"
              htmlFor="office-password"
              required
              error={errors.password?.message}
              helper="At least 10 characters."
            >
              <Input
                id="office-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
            </FormField>
            <FormField label="Confirm password" htmlFor="office-confirm" required error={errors.confirm?.message}>
              <Input
                id="office-confirm"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
                {...form.register("confirm")}
              />
            </FormField>
          </div>
        )}
      </form>
    </FormSheet>
  );
}

function EditOfficeSheet({ office, onClose }: { office: OfficeRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<OfficeEditInput, unknown, z.output<typeof officeEditSchema>>({
    resolver: zodResolver(officeEditSchema),
    defaultValues: { id: office.id, name: office.name, seatLimit: office.seat_limit === null ? "" : String(office.seat_limit) },
  });
  const errors = form.formState.errors;

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${office.name}`}
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-office-form" pending={pending}>
            Save office
          </Button>
        </div>
      }
    >
      <form
        id="edit-office-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setFormError(null);
            const res = await updateOffice(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              setFormError(res.error);
              return;
            }
            toast.success("Office saved");
            onClose();
            router.refresh();
          }),
        )}
      >
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <FormField label="Office name" htmlFor="edit-office-name" required error={errors.name?.message}>
          <Input id="edit-office-name" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField
          label="Seats"
          htmlFor="edit-office-seats"
          error={errors.seatLimit?.message}
          helper={`${formatNumber(office.active_members)} active now. Leave empty for no limit.`}
        >
          <Input id="edit-office-seats" inputMode="numeric" aria-invalid={!!errors.seatLimit} {...form.register("seatLimit")} />
        </FormField>
      </form>
    </FormSheet>
  );
}
