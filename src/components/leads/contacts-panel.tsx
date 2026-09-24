"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Mail, MoreHorizontal, Phone, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip } from "@/components/common/chips";
import { FormField } from "@/components/common/form-field";
import { FormSheet } from "@/components/common/form-sheet";
import { Panel, PanelHeader } from "@/components/common/page";
import { SelectField } from "@/components/common/select-field";
import { useApp } from "@/components/app/app-provider";
import { EMAIL_STATUSES, EMAIL_STATUS_LABELS, type Tables } from "@/lib/domain";
import { contactName, formatPhone } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import { emptyContact, makeContactSchema, type ContactFormValues, type LeadContactData } from "@/lib/validation/lead";
import { deleteContact, makePrimaryContact, saveContact } from "@/server/actions/leads";

type Contact = Tables<"contacts">;

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="currentColor">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  );
}

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copied`),
    () => toast.error(`${what} wasn't copied. Select it and copy by hand.`),
  );
}

export function ContactsPanel({ leadId, contacts, country }: { leadId: string; contacts: Contact[]; country?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [, startTransition] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });

  return (
    <Panel>
      <PanelHeader
        title="Contacts"
        actions={
          contacts.length < 10 && (
            <Button variant="ghost" size="sm" aria-label="Add contact" onClick={() => setEditing("new")}>
              <Plus aria-hidden /> Add
            </Button>
          )
        }
      />
      <ul className="divide-y divide-line">
        {contacts.map((c) => {
          const name = contactName(c);
          return (
            <li key={c.id} className="px-4 py-3" data-testid={`contact-${c.first_name}`}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.is_primary && <Star className="size-3.5 fill-accent-strong text-accent-strong" aria-label="Primary contact" />}
                    <span className="font-medium text-ink">{name}</span>
                    {c.job_title && <span className="text-small text-ink-muted">{c.job_title}</span>}
                    {c.is_decision_maker && <Chip tone="accent">Decision maker</Chip>}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 text-small">
                    {c.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="size-3.5 text-ink-faint" aria-hidden />
                        <a href={`mailto:${c.email}`} className="truncate hover:underline">
                          {c.email}
                        </a>
                        <span className="text-ink-muted">({EMAIL_STATUS_LABELS[c.email_status].toLowerCase()})</span>
                        <Button variant="ghost" size="icon-xs" aria-label={`Copy ${name}'s email`} onClick={() => copy(c.email!, "Email")}>
                          <Copy />
                        </Button>
                      </span>
                    )}
                    {[c.phone, c.mobile_phone].filter(Boolean).map((p, i) => (
                      <span key={p} className="flex items-center gap-1.5">
                        <Phone className="size-3.5 text-ink-faint" aria-hidden />
                        <a href={`tel:${p}`} className="num hover:underline">
                          {formatPhone(p)}
                        </a>
                        {i === 1 || (!c.phone && c.mobile_phone) ? <span className="text-ink-muted">(mobile)</span> : null}
                        <Button variant="ghost" size="icon-xs" aria-label={`Copy ${name}'s phone`} onClick={() => copy(p!, "Phone")}>
                          <Copy />
                        </Button>
                      </span>
                    ))}
                    {c.linkedin_url && (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex w-fit items-center gap-1.5 text-accent-strong hover:underline"
                        aria-label={`${name} on LinkedIn (opens in a new tab)`}
                      >
                        <LinkedInIcon /> LinkedIn
                      </a>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing(c)}>Edit</DropdownMenuItem>
                    {!c.is_primary && (
                      <DropdownMenuItem onSelect={() => run(() => makePrimaryContact({ contactId: c.id }), `${name} is now the primary contact`)}>
                        Make primary
                      </DropdownMenuItem>
                    )}
                    {contacts.length > 1 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onSelect={() => run(() => deleteContact({ contactId: c.id }), `${name} removed`)}>
                          Remove
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && (
        <ContactSheet
          key={editing === "new" ? "new" : editing.id}
          leadId={leadId}
          contact={editing === "new" ? null : editing}
          country={country}
          onClose={() => setEditing(null)}
        />
      )}
    </Panel>
  );
}

function ContactSheet({
  leadId,
  contact,
  country,
  onClose,
}: {
  leadId: string;
  contact: Contact | null;
  country?: string;
  onClose: () => void;
}) {
  const { lists } = useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const s = (v: string | null | undefined) => v ?? "";
  const defaults: ContactFormValues = contact
    ? {
        leadId,
        id: contact.id,
        first_name: contact.first_name,
        last_name: s(contact.last_name),
        job_title: s(contact.job_title),
        is_decision_maker: contact.is_decision_maker,
        is_primary: contact.is_primary,
        email: s(contact.email),
        email_status: contact.email_status,
        secondary_email: s(contact.secondary_email),
        phone: s(contact.phone),
        mobile_phone: s(contact.mobile_phone),
        linkedin_url: s(contact.linkedin_url),
        other_social_url: s(contact.other_social_url),
        preferred_channel_id: contact.preferred_channel_id,
        notes: s(contact.notes),
      }
    : { ...emptyContact(false), leadId };
  const form = useForm<ContactFormValues, unknown, LeadContactData & { leadId: string }>({
    resolver: zodResolver(makeContactSchema(country)),
    defaultValues: defaults,
  });
  const { register, control, formState } = form;
  const e = formState.errors;

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={contact ? `Edit ${contactName(contact)}` : "Add contact"}
      dirty={formState.isDirty}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="contact-form" disabled={pending}>
            {contact ? "Save contact" : "Add contact"}
          </Button>
        </div>
      }
    >
      <form
        id="contact-form"
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit(() =>
          startTransition(async () => {
            const res = await saveContact(form.getValues());
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              toast.error(res.error);
              return;
            }
            toast.success(contact ? "Contact saved" : "Contact added");
            onClose();
            router.refresh();
          }),
        )}
      >
        <FormField label="First name" htmlFor="c-first" required error={e.first_name?.message}>
          <Input id="c-first" aria-invalid={!!e.first_name} {...register("first_name")} />
        </FormField>
        <FormField label="Last name" htmlFor="c-last">
          <Input id="c-last" {...register("last_name")} />
        </FormField>
        <FormField label="Job title" htmlFor="c-title">
          <Input id="c-title" {...register("job_title")} />
        </FormField>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <Controller
            control={control}
            name="is_decision_maker"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Switch id="c-dm" checked={!!field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="c-dm" className="text-body">Decision maker</Label>
              </div>
            )}
          />
          <Controller
            control={control}
            name="is_primary"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Switch id="c-primary" checked={!!field.value} onCheckedChange={field.onChange} disabled={!!contact?.is_primary} />
                <Label htmlFor="c-primary" className="text-body">Primary contact</Label>
              </div>
            )}
          />
        </div>
        <FormField label="Email" htmlFor="c-email" error={e.email?.message}>
          <Input id="c-email" type="email" aria-invalid={!!e.email} {...register("email")} />
        </FormField>
        <FormField label="Email status" htmlFor="c-email-status">
          <Controller
            control={control}
            name="email_status"
            render={({ field }) => (
              <SelectField
                id="c-email-status"
                value={field.value ?? "unverified"}
                onChange={(v) => field.onChange(v ?? "unverified")}
                options={EMAIL_STATUSES.map((st) => ({ value: st, label: EMAIL_STATUS_LABELS[st] }))}
              />
            )}
          />
        </FormField>
        <FormField label="Phone" htmlFor="c-phone" error={e.phone?.message}>
          <Input id="c-phone" type="tel" aria-invalid={!!e.phone} {...register("phone")} />
        </FormField>
        <FormField label="Mobile" htmlFor="c-mobile" error={e.mobile_phone?.message}>
          <Input id="c-mobile" type="tel" aria-invalid={!!e.mobile_phone} {...register("mobile_phone")} />
        </FormField>
        <FormField label="LinkedIn URL" htmlFor="c-linkedin" error={e.linkedin_url?.message}>
          <Input id="c-linkedin" aria-invalid={!!e.linkedin_url} {...register("linkedin_url")} />
        </FormField>
        <FormField label="Preferred channel" htmlFor="c-channel">
          <Controller
            control={control}
            name="preferred_channel_id"
            render={({ field }) => (
              <SelectField
                id="c-channel"
                value={field.value ?? null}
                onChange={field.onChange}
                noneLabel="Not set"
                options={lists.channels.filter((c) => c.is_active || c.id === field.value).map((c) => ({ value: c.id, label: c.name }))}
              />
            )}
          />
        </FormField>
        <FormField label="Secondary email" htmlFor="c-email2" error={e.secondary_email?.message}>
          <Input id="c-email2" type="email" aria-invalid={!!e.secondary_email} {...register("secondary_email")} />
        </FormField>
        <FormField label="Other social URL" htmlFor="c-social" error={e.other_social_url?.message}>
          <Input id="c-social" aria-invalid={!!e.other_social_url} {...register("other_social_url")} />
        </FormField>
        <FormField label="Notes" htmlFor="c-notes" className="sm:col-span-2">
          <Textarea id="c-notes" rows={3} {...register("notes")} />
        </FormField>
      </form>
    </FormSheet>
  );
}
