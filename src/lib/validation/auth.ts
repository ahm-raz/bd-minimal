import { z } from "zod";
import { isValidTimeZone } from "@/lib/dates";

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter an email address.")
  .pipe(z.email("Enter a valid email address, like name@company.com."));

export const timezoneField = z
  .string()
  .trim()
  .min(1, "Pick a time zone.")
  .refine(isValidTimeZone, "Pick a time zone from the list.");

export const fullNameField = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(80, "Keep the name under 80 characters.");

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Enter your password."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailField });

/** Accept invite and reset password: min 10 characters, typed twice. */
export const newPasswordSchema = z
  .object({
    password: z.string().min(10, "Use at least 10 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;

export const setupSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  password: z.string().min(10, "Use at least 10 characters."),
  timezone: timezoneField,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const inviteSchema = z.object({
  fullName: fullNameField,
  email: emailField,
  primaryNicheId: z.uuid("Pick a niche."),
  timezone: timezoneField,
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const memberEditSchema = z.object({
  id: z.uuid(),
  fullName: fullNameField,
  primaryNicheId: z.uuid("Pick a niche.").nullable(),
  timezone: timezoneField,
});
export type MemberEditInput = z.infer<typeof memberEditSchema>;

export const profileSchema = z.object({
  fullName: fullNameField,
  timezone: timezoneField,
});
export type ProfileInput = z.infer<typeof profileSchema>;
