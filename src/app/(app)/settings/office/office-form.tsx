"use client";

import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useRouter } from "@/components/app/nav-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/common/form-field";
import { Panel } from "@/components/common/page";
import { TimezoneSelect } from "@/components/common/timezone-select";
import { formatNumber } from "@/lib/format";
import { applyFieldErrors } from "@/lib/forms";
import { officeSettingsSchema, type OfficeSettingsInput } from "@/lib/validation/offices";
import { updateMyOffice } from "@/server/actions/offices";

export function OfficeForm({
  name,
  timezone,
  seatLimit,
  activeMembers,
}: {
  name: string;
  timezone: string;
  seatLimit: number | null;
  activeMembers: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm<OfficeSettingsInput>({ resolver: zodResolver(officeSettingsSchema), defaultValues: { name, timezone } });
  const errors = form.formState.errors;
  const seats =
    seatLimit === null
      ? `${formatNumber(activeMembers)} ${activeMembers === 1 ? "member" : "members"}`
      : `${formatNumber(activeMembers)} of ${formatNumber(seatLimit)} seats used`;

  return (
    <Panel className="max-w-xl p-5">
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          startTransition(async () => {
            const res = await updateMyOffice(values);
            if (!res.ok) {
              applyFieldErrors(form.setError, res.fieldErrors);
              toast.error(res.error);
              return;
            }
            form.reset(values);
            toast.success("Office saved");
            router.refresh();
          }),
        )}
      >
        <FormField label="Office name" htmlFor="office-name" error={errors.name?.message} helper="Shown in the sidebar for everyone.">
          <Input id="office-name" aria-invalid={!!errors.name} {...form.register("name")} />
        </FormField>
        <FormField
          label="Default time zone"
          htmlFor="office-tz"
          error={errors.timezone?.message}
          helper="New members start with this time zone. Each person can change their own on Profile."
        >
          <Controller
            control={form.control}
            name="timezone"
            render={({ field }) => <TimezoneSelect id="office-tz" value={field.value} onChange={field.onChange} />}
          />
        </FormField>
        <FormField label="Seats" htmlFor="office-seats" helper="Contact us to change the number of seats.">
          <Input id="office-seats" value={seats} readOnly disabled data-testid="office-seats" />
        </FormField>
        <div className="flex justify-end pt-2">
          <Button type="submit" size="form" pending={pending} disabled={!form.formState.isDirty}>
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}
