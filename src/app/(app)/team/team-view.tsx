"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Chip } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { PageHeader, Panel } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { useProfile } from "@/components/app/profile-provider";
import { ROLE_LABELS } from "@/lib/domain";
import { formatNumber, firstName } from "@/lib/format";
import { formatRelative } from "@/lib/dates";
import { applyFieldErrors } from "@/lib/forms";
import { inviteSchema, memberEditSchema, type InviteInput, type MemberEditInput } from "@/lib/validation/auth";
import {
  deactivateMember,
  inviteMember,
  reactivateMember,
  reassignOpenLeads,
  resendInvite,
  updateMember,
} from "@/server/actions/team";
import type { ListItem, MemberItem } from "@/server/queries/lists";

export type TeamRow = MemberItem & {
  status: "active" | "invited" | "deactivated";
  openLeads: number;
  lastActive: string | null;
};

const STATUS_CHIP = {
  active: { tone: "ok", label: "Active" },
  invited: { tone: "warn", label: "Invited" },
  deactivated: { tone: "muted", label: "Deactivated" },
} as const;

export function TeamView({ rows, niches }: { rows: TeamRow[]; niches: ListItem[] }) {
  const { timezone } = useProfile();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [deactivating, setDeactivating] = useState<TeamRow | null>(null);
  const [reassigning, setReassigning] = useState<{ row: TeamRow; afterDeactivate: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const nicheName = (id: string | null) => niches.find((n) => n.id === id)?.name ?? "";
  const activeMembers = rows.filter((r) => r.status !== "deactivated");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      after?.();
      router.refresh();
    });

  return (
    <>
      <PageHeader
        title="Team"
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <Plus aria-hidden /> Invite member
          </Button>
        }
      />

      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Niche</TableHead>
                <TableHead>Time zone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open leads</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const chip = STATUS_CHIP[r.status];
                return (
                  <TableRow key={r.id} data-testid={`member-${r.email}`}>
                    <TableCell className="font-medium">{r.full_name || r.email}</TableCell>
                    <TableCell className="text-ink-muted">{r.email}</TableCell>
                    <TableCell>{ROLE_LABELS[r.role]}</TableCell>
                    <TableCell>{nicheName(r.primary_niche_id) || <span className="text-ink-muted">None</span>}</TableCell>
                    <TableCell>{r.timezone.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </TableCell>
                    <TableCell className="num text-right">{formatNumber(r.openLeads)}</TableCell>
                    <TableCell className="text-ink-muted">
                      {r.lastActive ? formatRelative(r.lastActive, timezone) : "No activity yet"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.full_name || r.email}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(r)}>Edit</DropdownMenuItem>
                          {r.status === "invited" && (
                            <DropdownMenuItem
                              onSelect={() => run(() => resendInvite(r.id), `Invite resent to ${r.email}`)}
                            >
                              Resend invite
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            disabled={r.openLeads === 0}
                            onSelect={() => setReassigning({ row: r, afterDeactivate: false })}
                          >
                            Reassign open leads
                          </DropdownMenuItem>
                          {r.role !== "founder" && (
                            <>
                              <DropdownMenuSeparator />
                              {r.status === "deactivated" ? (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    run(() => reactivateMember(r.id), `${firstName(r.full_name) || r.email} reactivated`)
                                  }
                                >
                                  Reactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem variant="destructive" onSelect={() => setDeactivating(r)}>
                                  Deactivate
                                </DropdownMenuItem>
                              )}
                            </>
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

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} niches={niches} />
      {editing && (
        <EditSheet
          key={editing.id}
          member={editing}
          niches={niches}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog open={!!deactivating} onOpenChange={(o) => !o && setDeactivating(null)}>
        <DialogContent>
          {deactivating && (
            <>
              <DialogHeader>
                <DialogTitle>Deactivate {firstName(deactivating.full_name) || deactivating.email}?</DialogTitle>
                <DialogDescription>
                  {firstName(deactivating.full_name) || "They"} will lose access immediately. Their past work stays in
                  reports. They have {formatNumber(deactivating.openLeads)} open{" "}
                  {deactivating.openLeads === 1 ? "lead" : "leads"}.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={() => setDeactivating(null)}>
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    const r = deactivating;
                    run(() => deactivateMember(r.id), `${firstName(r.full_name) || r.email} deactivated`, () =>
                      setDeactivating(null),
                    );
                  }}
                >
                  Deactivate only
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    const r = deactivating;
                    run(() => deactivateMember(r.id), `${firstName(r.full_name) || r.email} deactivated`, () => {
                      setDeactivating(null);
                      setReassigning({ row: r, afterDeactivate: true });
                    });
                  }}
                >
                  Deactivate and reassign leads
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {reassigning && (
        <ReassignDialog
          key={reassigning.row.id}
          from={reassigning.row}
          candidates={activeMembers.filter((m) => m.id !== reassigning.row.id)}
          onClose={() => setReassigning(null)}
        />
      )}
    </>
  );
}

function InviteSheet({
  open,
  onOpenChange,
  niches,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  niches: ListItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const empty: InviteInput = { fullName: "", email: "", primaryNicheId: "", timezone: "Asia/Karachi" };
  const form = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), defaultValues: empty });
  const errors = form.formState.errors;

  const close = () => {
    form.reset(empty);
    setFormError(null);
    onOpenChange(false);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Invite member"
      description="They get an email to set a password, then land on My Day."
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" disabled={pending}>
            Send invite
          </Button>
        </div>
      }
    >
      <form
        id="invite-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            setFormError(null);
            const res = await inviteMember(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              setFormError(res.error);
              return;
            }
            const { id, email } = res.data;
            toast.success(`Invite sent to ${email}`, {
              action: { label: "Set targets now", onClick: () => router.push(`/settings/targets?person=${id}`) },
            });
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
        <FormField label="Full name" htmlFor="invite-name" required error={errors.fullName?.message}>
          <Input id="invite-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        </FormField>
        <FormField label="Email" htmlFor="invite-email" required error={errors.email?.message}>
          <Input id="invite-email" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </FormField>
        <FormField label="Primary niche" htmlFor="invite-niche" required error={errors.primaryNicheId?.message}>
          <Controller
            control={form.control}
            name="primaryNicheId"
            render={({ field }) => (
              <SelectField
                id="invite-niche"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                options={niches.filter((n) => n.is_active).map((n) => ({ value: n.id, label: n.name }))}
                placeholder="Pick a niche"
                invalid={!!errors.primaryNicheId}
              />
            )}
          />
        </FormField>
        <FormField label="Time zone" htmlFor="invite-tz" required error={errors.timezone?.message}>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => <TimezoneSelect id="invite-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
      </form>
    </FormSheet>
  );
}

function EditSheet({ member, niches, onClose }: { member: TeamRow; niches: ListItem[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<MemberEditInput>({
    resolver: zodResolver(memberEditSchema),
    defaultValues: {
      id: member.id,
      fullName: member.full_name,
      primaryNicheId: member.primary_niche_id,
      timezone: member.timezone,
    },
  });
  const errors = form.formState.errors;

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${member.full_name || member.email}`}
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="member-form" disabled={pending}>
            Save changes
          </Button>
        </div>
      }
    >
      <form
        id="member-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            const res = await updateMember(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              toast.error(res.error);
              return;
            }
            toast.success("Changes saved");
            onClose();
            router.refresh();
          }),
        )}
      >
        <FormField label="Full name" htmlFor="member-name" required error={errors.fullName?.message}>
          <Input id="member-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        </FormField>
        <FormField label="Primary niche" htmlFor="member-niche" error={errors.primaryNicheId?.message}>
          <Controller
            control={form.control}
            name="primaryNicheId"
            render={({ field }) => (
              <SelectField
                id="member-niche"
                value={field.value}
                onChange={field.onChange}
                noneLabel="No niche"
                options={niches
                  .filter((n) => n.is_active || n.id === field.value)
                  .map((n) => ({ value: n.id, label: n.name }))}
              />
            )}
          />
        </FormField>
        <FormField label="Time zone" htmlFor="member-tz" required error={errors.timezone?.message}>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => <TimezoneSelect id="member-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
      </form>
    </FormSheet>
  );
}

function ReassignDialog({
  from,
  candidates,
  onClose,
}: {
  from: TeamRow;
  candidates: TeamRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [toId, setToId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = firstName(from.full_name) || from.email;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {name}&apos;s open leads</DialogTitle>
          <DialogDescription>
            {formatNumber(from.openLeads)} open {from.openLeads === 1 ? "lead moves" : "leads move"}, with their open
            opportunities. Past activities stay credited to {name}.
          </DialogDescription>
        </DialogHeader>
        <FormField label="New owner" htmlFor="reassign-to" error={error}>
          <SelectField
            id="reassign-to"
            value={toId}
            onChange={setToId}
            placeholder="Pick a person"
            options={candidates.map((c) => ({ value: c.id, label: c.full_name || c.email }))}
            invalid={!!error}
          />
        </FormField>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (!toId) {
                setError("Pick who gets the leads.");
                return;
              }
              startTransition(async () => {
                const res = await reassignOpenLeads({ fromId: from.id, toId });
                if (!res.ok) {
                  setError(res.fieldErrors?.toId ?? res.error);
                  return;
                }
                toast.success(`${formatNumber(res.data.count)} ${res.data.count === 1 ? "lead" : "leads"} reassigned`);
                onClose();
                router.refresh();
              });
            }}
          >
            Reassign leads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
