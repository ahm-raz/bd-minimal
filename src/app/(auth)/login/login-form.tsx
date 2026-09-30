"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/form-field";
import { forgotPasswordSchema, loginSchema, type LoginInput } from "@/lib/validation/auth";
import { requestPasswordReset, signIn } from "@/server/actions/auth";
import { applyFieldErrors } from "@/lib/forms";
import { safeNextPath } from "@/lib/safe-path";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [mode, setMode] = useState<"signin" | "forgot" | "sent">("signin");
  const [formError, setFormError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const forgot = useForm<{ email: string }>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  if (mode === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-title text-ink">Check your email</h1>
        <p className="text-body text-ink-muted">If that address has an account, a reset link is on its way.</p>
        <Button variant="secondary" onClick={() => setMode("signin")}>
          Back to sign in
        </Button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={forgot.handleSubmit((values) =>
          startTransition(async () => {
            setFormError(null);
            const res = await requestPasswordReset(values);
            if (!res.ok) {
              applyFieldErrors(forgot.setError, res.fieldErrors);
              // Not about the email field (e.g. too many requests): say so instead of failing silently.
              if (!res.fieldErrors) setFormError(res.error);
              return;
            }
            setMode("sent");
          }),
        )}
      >
        <h1 className="text-title text-ink">Reset your password</h1>
        <p className="text-small text-ink-muted">We&apos;ll email you a link to choose a new one.</p>
        {formError && (
          <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
            {formError}
          </p>
        )}
        <FormField label="Email" htmlFor="forgot-email" error={forgot.formState.errors.email?.message}>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!forgot.formState.errors.email}
            {...forgot.register("email")}
          />
        </FormField>
        <Button type="submit" size="form" pending={pending}>
          Send reset link
        </Button>
        <Button
          type="button"
          variant="link"
          className="self-start"
          onClick={() => {
            setFormError(null);
            setMode("signin");
          }}
        >
          Back to sign in
        </Button>
      </form>
    );
  }

  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        startTransition(async () => {
          setFormError(null);
          const res = await signIn(values);
          if (!res.ok) {
            applyFieldErrors(form.setError, res.fieldErrors);
            if (!res.fieldErrors) setFormError(res.error);
            return;
          }
          // Inside the transition, so the button keeps spinning until My Day has rendered.
          startTransition(() => {
            router.replace(res.data.home ?? safeNextPath(next));
            router.refresh();
          });
        }),
      )}
    >
      <h1 className="text-title text-ink">Sign in</h1>
      {formError && (
        <p role="alert" className="rounded-md bg-bad-soft px-3 py-2 text-small text-bad">
          {formError}
        </p>
      )}
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register("email")} />
      </FormField>
      <FormField label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          {...form.register("password")}
        />
      </FormField>
      <Button type="submit" size="form" pending={pending}>
        Sign in
      </Button>
      <Button
        type="button"
        variant="link"
        className="self-start"
        onClick={() => {
          forgot.setValue("email", form.getValues("email"));
          setMode("forgot");
        }}
      >
        Forgot password?
      </Button>
    </form>
  );
}
