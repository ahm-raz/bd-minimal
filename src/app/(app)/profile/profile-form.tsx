"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/form-field";
import { Panel } from "@/components/common/page";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { profileSchema, type ProfileInput } from "@/lib/validation/auth";
import { updateOwnProfile } from "@/server/actions/profile";
import { requestPasswordReset } from "@/server/actions/auth";
import { applyFieldErrors } from "@/lib/forms";

export function ProfileForm({ fullName, timezone, email }: { fullName: string; timezone: string; email: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { fullName, timezone } });
  const errors = form.formState.errors;

  return (
    <Panel className="max-w-xl p-5">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            const res = await updateOwnProfile(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              toast.error(res.error);
              return;
            }
            form.reset(values);
            toast.success("Profile saved");
            router.refresh();
          }),
        )}
      >
        <FormField label="Full name" htmlFor="profile-name" error={errors.fullName?.message}>
          <Input id="profile-name" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
        </FormField>
        <FormField
          label="Time zone"
          htmlFor="profile-tz"
          error={errors.timezone?.message}
          helper="Today, overdue and this week follow this time zone."
        >
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => <TimezoneSelect id="profile-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
        <FormField label="Email" htmlFor="profile-email" helper="Ask the founder if your email needs to change.">
          <Input id="profile-email" value={email} readOnly disabled />
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="link"
            onClick={() =>
              startTransition(async () => {
                await requestPasswordReset({ email });
                toast.success(`Password reset link sent to ${email}`);
              })
            }
          >
            Change password
          </Button>
          <Button type="submit" size="form" disabled={pending || !form.formState.isDirty}>
            Save profile
          </Button>
        </div>
      </form>
    </Panel>
  );
}
