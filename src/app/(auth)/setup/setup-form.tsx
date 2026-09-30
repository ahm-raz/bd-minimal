"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/form-field";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { setupSchema, type SetupInput } from "@/lib/validation/auth";
import { setupFounder } from "@/server/actions/auth";
import { applyFieldErrors } from "@/lib/forms";

export function SetupForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<SetupInput>({
    resolver: zodResolver(setupSchema),
    defaultValues: { fullName: "", email: "", password: "", timezone: "Asia/Karachi" },
  });
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          setFormError(null);
          const res = await setupFounder(values);
          if (!res.ok) {
            applyFieldErrors(form.setError, res.fieldErrors);
            setFormError(res.error);
            return;
          }
          startTransition(() => {
            router.replace("/my-day");
            router.refresh();
          });
        }),
      )}
    >
      {formError && (
        <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
          {formError}
        </p>
      )}
      <FormField label="Name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" aria-invalid={!!errors.fullName} {...form.register("fullName")} />
      </FormField>
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={errors.password?.message} helper="At least 10 characters.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </FormField>
      <FormField label="Time zone" htmlFor="timezone" error={errors.timezone?.message}>
        <Controller
          control={form.control}
          name="timezone"
          render={({ field }) => (
            <TimezoneSelect id="timezone" value={field.value} onChange={field.onChange} invalid={!!errors.timezone} />
          )}
        />
      </FormField>
      <Button type="submit" size="form" pending={pending}>
        Create founder account
      </Button>
    </form>
  );
}
