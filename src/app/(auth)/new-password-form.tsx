"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/form-field";
import { newPasswordSchema, type NewPasswordInput } from "@/lib/validation/auth";
import { setNewPassword } from "@/server/actions/auth";
import { applyFieldErrors } from "@/lib/forms";

/** Password + confirm, used by Accept invite and Reset password. */
export function NewPasswordForm({ submitLabel, passwordLabel, toastText }: { submitLabel: string; passwordLabel: string; toastText: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const form = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const errors = form.formState.errors;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          setFormError(null);
          const res = await setNewPassword(values);
          if (!res.ok) {
            applyFieldErrors(form.setError, res.fieldErrors);
            setFormError(res.error);
            return;
          }
          toast.success(toastText);
          router.replace("/my-day");
          router.refresh();
        }),
      )}
    >
      {formError && (
        <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
          {formError}
        </p>
      )}
      <FormField label={passwordLabel} htmlFor="password" error={errors.password?.message} helper="At least 10 characters.">
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </FormField>
      <FormField label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.confirm}
          {...form.register("confirm")}
        />
      </FormField>
      <Button type="submit" size="form" pending={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
