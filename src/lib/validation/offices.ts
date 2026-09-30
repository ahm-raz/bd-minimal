import { z } from "zod";
import { ADD_METHODS, PASSWORD_MIN, emailField, fullNameField, officeNameField, timezoneField } from "@/lib/validation/auth";

/** Seats: empty means no limit; otherwise a whole number from 1 to 1000 (docs/11 section 3). */
export const seatLimitField = z
  .union([z.literal(""), z.null(), z.number(), z.string()])
  .transform((v, ctx) => {
    if (v === null || String(v).trim() === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).trim());
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      ctx.addIssue({ code: "custom", message: "Enter a whole number from 1 to 1000, or leave it empty for no limit." });
      return z.NEVER;
    }
    return n;
  });

/** Settings → Office (founder): name and default time zone. */
export const officeSettingsSchema = z.object({
  name: officeNameField,
  timezone: timezoneField,
});
export type OfficeSettingsInput = z.infer<typeof officeSettingsSchema>;

/** /admin → Create office (platform admin): the office and its founder, like Team → Add member. */
export const createOfficeSchema = z
  .object({
    name: officeNameField,
    timezone: timezoneField,
    seatLimit: seatLimitField,
    founderName: fullNameField,
    founderEmail: emailField,
    method: z.enum(ADD_METHODS).default("password"),
    password: z.string().optional().default(""),
    confirm: z.string().optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.method === "password") {
      if (v.password.length < PASSWORD_MIN) ctx.addIssue({ code: "custom", path: ["password"], message: `Use at least ${PASSWORD_MIN} characters.` });
      else if (v.password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "The passwords don't match." });
    }
  });
export type CreateOfficeInput = z.input<typeof createOfficeSchema>;

/** /admin → Edit: name and seats. */
export const officeEditSchema = z.object({
  id: z.uuid(),
  name: officeNameField,
  seatLimit: seatLimitField,
});
export type OfficeEditInput = z.input<typeof officeEditSchema>;

export const officeStatusSchema = z.object({ id: z.uuid(), status: z.enum(["active", "suspended"]) });
