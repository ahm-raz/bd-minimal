"use client";

import { RelativeTime } from "@/components/common/relative-time";
import { useRouter } from "@/components/app/nav-progress";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
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
import { MEMBER_ROLES, ROLE_LABELS } from "@/lib/domain";
import type { z } from "zod";
import { formatNumber, firstName } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import {
  inviteSchema,
  memberEditSchema,
  setMemberPasswordSchema,
  type AddMethod,
  type InviteInput,
  type MemberEditInput,
  type SetMemberPasswordInput,
} from "@/lib/validation/auth";
import { cn } from "@/lib/utils";
import {
  deactivateMember,
  inviteMember,
  reactivateMember,
  reassignOpenLeads,
  resendInvite,
  setImportPermission,
  setMemberPassword,
  updateMember,
} from "@/server/actions/team";
import { Switch } from "@/components/ui/switch";
import type { ListItem, MemberItem } from "@/server/queries/lists";

export type TeamRow = MemberItem & {
  status: "active" | "invited" | "deactivated";
  openLeads: number;
  lastActive: string | null;
  /** Google Calendar connection (null when the feature is off, or for SMMs). */
  calendar: "active" | "needs_reconnect" | "not_connected" | null;
};

const CALENDAR_CHIP = {
  active: { tone: "ok", label: "Connected" },
  needs_reconnect: { tone: "warn", label: "Needs reconnect" },
  not_connected: { tone: "neutral", label: "Not connected" },
} as const;

const STATUS_CHIP = {
  active: { tone: "ok", label: "Active" },
  invited: { tone: "warn", label: "Not signed in yet" },
  deactivated: { tone: "muted", label: "Deactivated" },
} as const;

/** emailInvites: invite emails need a sending domain; while off, members are added with a password (server/email.ts). */
export function TeamView({
  rows,
  niches,
  emailInvites,
}: {
  rows: TeamRow[];
  niches: ListItem[];
  emailInvites: boolean;
}) {
  const { timezone } = useProfile();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<TeamRow | null>(null);
  const [deactivating, setDeactivating] = useState<TeamRow | null>(null);
  const [settingPassword, setSettingPassword] = useState<TeamRow | null>(null);
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
            <Plus aria-hidden /> Add member
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
                {rows.some((r) => r.calendar) && <TableHead>Calendar</TableHead>}
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
                    <TableCell>
                      {ROLE_LABELS[r.role]}
                      {r.role === "bd" && r.can_import_leads && (
                        <Chip tone="info" className="ml-2" data-testid="csv-import-chip">
                          CSV import
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>
                      {nicheName(r.primary_niche_id) || <span className="text-ink-muted">None</span>}
                    </TableCell>
                    <TableCell>{r.timezone.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Chip tone={chip.tone}>{chip.label}</Chip>
                    </TableCell>
                    <TableCell className="text-right num">
                      {r.role === "social" ? <span className="text-ink-muted">None</span> : formatNumber(r.openLeads)}
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {r.lastActive ? <RelativeTime at={r.lastActive} tz={timezone} /> : "No activity yet"}
                    </TableCell>
                    {rows.some((x) => x.calendar) && (
                      <TableCell>
                        {r.calendar ? (
                          <Chip tone={CALENDAR_CHIP[r.calendar].tone}>{CALENDAR_CHIP[r.calendar].label}</Chip>
                        ) : (
                          <span className="text-ink-muted">None</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${r.full_name || r.email}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(r)}>Edit</DropdownMenuItem>
                          {r.role !== "founder" && (
                            <DropdownMenuItem onSelect={() => setSettingPassword(r)}>Set password</DropdownMenuItem>
                          )}
                          {r.status === "invited" && (
                            <DropdownMenuItem
                              disabled={!emailInvites}
                              onSelect={() => run(() => resendInvite(r.id), `Invite resent to ${r.email}`)}
                            >
                              Resend invite{!emailInvites && " (email off)"}
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
                                    run(
                                      () => reactivateMember(r.id),
                                      `${firstName(r.full_name) || r.email} reactivated`,
                                    )
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

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} niches={niches} emailInvites={emailInvites} />
      {settingPassword && (
        <SetPasswordDialog key={settingPassword.id} member={settingPassword} onClose={() => setSettingPassword(null)} />
      )}
      {editing && <EditSheet key={editing.id} member={editing} niches={niches} onClose={() => setEditing(null)} />}

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
                    run(
                      () => deactivateMember(r.id),
                      `${firstName(r.full_name) || r.email} deactivated`,
                      () => setDeactivating(null),
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
                    run(
                      () => deactivateMember(r.id),
                      `${firstName(r.full_name) || r.email} deactivated`,
                      () => {
                        setDeactivating(null);
                        setReassigning({ row: r, afterDeactivate: true });
                      },
                    );
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
          candidates={activeMembers.filter((m) => m.id !== reassigning.row.id && m.role !== "social")}
          onClose={() => setReassigning(null)}
        />
      )}
    </>
  );
}

const METHOD_LABELS: Record<AddMethod, string> = { password: "Set a password now", email: "Send an invite email" };

function InviteSheet({
  open,
  onOpenChange,
  niches,
  emailInvites,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  niches: ListItem[];
  emailInvites: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const empty: InviteInput = {
    fullName: "",
    email: "",
    role: "bd",
    primaryNicheId: null,
    timezone: "Asia/Karachi",
    method: "password",
    password: "",
    confirm: "",
  };
  const form = useForm<InviteInput, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: empty,
  });
  const errors = form.formState.errors;
  const role = useWatch({ control: form.control, name: "role" });
  const method = useWatch({ control: form.control, name: "method" }) ?? "password";
  const emailBlocked = method === "email" && !emailInvites;
  const hints: Record<AddMethod, string> = {
    password: "They sign in right away. Share the password with them yourself.",
    email: emailInvites ? "They get an email to set their own password." : "Off until an email domain is set up.",
  };

  const close = () => {
    form.reset(empty);
    setFormError(null);
    onOpenChange(false);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title="Add member"
      description="They land on My Day after signing in."
      dirty={form.formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          {/* While invite emails are off, "Send invite" stays visible but disabled. */}
          {!emailInvites && (
            <Button type="button" variant="secondary" disabled title="Off until an email domain is set up.">
              Send invite
            </Button>
          )}
          <Button type="submit" form="invite-form" pending={pending} disabled={emailBlocked}>
            {method === "email" ? "Send invite" : "Add member"}
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
            toast.success(
              res.data.method === "email" ? `Invite sent to ${email}` : `${email} added. They can sign in now.`,
              {
                action: { label: "Set targets now", onClick: () => router.push(`/settings/targets?person=${id}`) },
              },
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
        <FormField label="Full name" htmlFor="invite-name" required error={errors.fullName?.message}>
          <Input id="invite-name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        </FormField>
        <FormField label="Email" htmlFor="invite-email" required error={errors.email?.message}>
          <Input id="invite-email" type="email" aria-invalid={!!errors.email} {...form.register("email")} />
        </FormField>
        <FormField label="Role" htmlFor="invite-role" required error={errors.role?.message}>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <SelectField
                id="invite-role"
                value={field.value ?? "bd"}
                onChange={(v) => field.onChange(v ?? "bd")}
                options={MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
              />
            )}
          />
        </FormField>
        {role !== "social" && (
          <FormField label="Primary niche" htmlFor="invite-niche" required error={errors.primaryNicheId?.message}>
            <Controller
              control={form.control}
              name="primaryNicheId"
              render={({ field }) => (
                <SelectField
                  id="invite-niche"
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? null)}
                  options={niches.filter((n) => n.is_active).map((n) => ({ value: n.id, label: n.name }))}
                  placeholder="Pick a niche"
                  invalid={!!errors.primaryNicheId}
                />
              )}
            />
          </FormField>
        )}
        <FormField label="Time zone" htmlFor="invite-tz" required error={errors.timezone?.message}>
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => <TimezoneSelect id="invite-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-small font-medium text-ink">How they get in</legend>
          {(["password", "email"] as const).map((m) => {
            const disabled = m === "email" && !emailInvites;
            return (
              <label
                key={m}
                className={cn(
                  "flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface-muted",
                  method === m && !disabled && "border-accent-strong bg-accent-soft",
                )}
              >
                <input
                  type="radio"
                  value={m}
                  disabled={disabled}
                  className="mt-0.5 accent-[var(--accent)]"
                  {...form.register("method")}
                />
                <span className="flex flex-col">
                  <span className="text-body text-ink">{METHOD_LABELS[m]}</span>
                  <span className="text-small text-ink-muted">{hints[m]}</span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {method === "password" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Password"
              htmlFor="invite-password"
              required
              error={errors.password?.message}
              helper="At least 10 characters."
            >
              <Input
                id="invite-password"
                type="password"
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
            </FormField>
            <FormField label="Confirm password" htmlFor="invite-confirm" required error={errors.confirm?.message}>
              <Input
                id="invite-confirm"
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

/** Team → Set password: the founder types a new password for a member who forgot theirs. No email is sent. */
function SetPasswordDialog({ member, onClose }: { member: TeamRow; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const name = firstName(member.full_name) || member.email;
  const form = useForm<SetMemberPasswordInput>({
    resolver: zodResolver(setMemberPasswordSchema),
    defaultValues: { id: member.id, password: "", confirm: "" },
  });
  const errors = form.formState.errors;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set a new password for {name}</DialogTitle>
          <DialogDescription>
            Their old password stops working. They sign in with {member.email} and the new one. Share it with them
            yourself.
          </DialogDescription>
        </DialogHeader>
        <form
          id="set-password-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              setFormError(null);
              const res = await setMemberPassword(values);
              if (!res.ok) {
                applyFieldErrors(form.setError, res.fieldErrors);
                setFormError(res.error);
                return;
              }
              toast.success(`New password set for ${name}`);
              onClose();
            }),
          )}
        >
          {formError && (
            <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
              {formError}
            </p>
          )}
          <FormField
            label="New password"
            htmlFor="member-password"
            required
            error={errors.password?.message}
            helper="At least 10 characters."
          >
            <Input
              id="member-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register("password")}
            />
          </FormField>
          <FormField label="Confirm password" htmlFor="member-confirm" required error={errors.confirm?.message}>
            <Input
              id="member-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register("confirm")}
            />
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="set-password-form" pending={pending}>
            Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      role: member.role === "founder" ? undefined : member.role,
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
          <Button type="submit" form="member-form" pending={pending}>
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
        {member.role !== "founder" && (
          <FormField
            label="Role"
            htmlFor="member-role"
            required
            error={errors.role?.message}
            helper="A social media manager can't see leads or deals."
          >
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <SelectField
                  id="member-role"
                  value={field.value ?? "bd"}
                  onChange={(v) => field.onChange(v ?? "bd")}
                  options={MEMBER_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                  invalid={!!errors.role}
                />
              )}
            />
          </FormField>
        )}
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
      {member.role === "bd" && <ImportPermissionSwitch member={member} />}
    </FormSheet>
  );
}

/** Saved at once, apart from the form: the database checks it on every import step (docs/03). */
function ImportPermissionSwitch({ member }: { member: TeamRow }) {
  const router = useRouter();
  const [on, setOn] = useState(member.can_import_leads);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-2 flex items-start justify-between gap-4 rounded-lg border border-line p-3">
      <label htmlFor="member-import" className="text-body text-ink">
        Can import leads from CSV
        <span className="block text-small text-ink-muted">Saved straight away. The founder can always import.</span>
      </label>
      <Switch
        id="member-import"
        checked={on}
        disabled={pending}
        onCheckedChange={(v) => {
          setOn(v);
          startTransition(async () => {
            const res = await setImportPermission({ id: member.id, enabled: v });
            if (!res.ok) {
              setOn(!v);
              toast.error(res.error);
              return;
            }
            toast.success(v ? "CSV import turned on" : "CSV import turned off");
            router.refresh();
          });
        }}
      />
    </div>
  );
}

function ReassignDialog({ from, candidates, onClose }: { from: TeamRow; candidates: TeamRow[]; onClose: () => void }) {
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
