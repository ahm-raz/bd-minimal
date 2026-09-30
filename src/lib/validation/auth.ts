import { z } from "zod";
import { MEMBER_ROLES } from "@/lib/domain";
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

/** Office name (docs/11 section 3): 1 to 80 characters. */
export const officeNameField = z.string().trim().min(1, "Enter the office name.").max(80, "Use up to 80 characters.");

export const setupSchema = z.object({
  officeName: officeNameField,
  fullName: fullNameField,
  email: emailField,
  password: z.string().min(10, "Use at least 10 characters."),
  timezone: timezoneField,
});
export type SetupInput = z.infer<typeof setupSchema>;

/** Roles the founder gives a member: BD (sales) or Social media manager (docs/09 section 1). */
export const memberRoleField = z.enum(MEMBER_ROLES, "Pick a role.");

/** How a new member gets in: a password the founder sets now, or an invite email (needs a sending domain). */
export const ADD_METHODS = ["password", "email"] as const;
export type AddMethod = (typeof ADD_METHODS)[number];
export const PASSWORD_MIN = 10;

/** Add member. A BD needs a primary niche; a social media manager doesn't. "password" needs it typed twice. */
export const inviteSchema = z
  .object({
    fullName: fullNameField,
    email: emailField,
    role: memberRoleField.default("bd"),
    primaryNicheId: z.uuid("Pick a niche.").nullable().optional().transform((v) => v ?? null),
    timezone: timezoneField,
    method: z.enum(ADD_METHODS).default("password"),
    password: z.string().optional().default(""),
    confirm: z.string().optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.role === "bd" && !v.primaryNicheId) ctx.addIssue({ code: "custom", path: ["primaryNicheId"], message: "Pick a niche." });
    if (v.method === "password") {
      if (v.password.length < PASSWORD_MIN) ctx.addIssue({ code: "custom", path: ["password"], message: `Use at least ${PASSWORD_MIN} characters.` });
      else if (v.password !== v.confirm) ctx.addIssue({ code: "custom", path: ["confirm"], message: "The passwords don't match." });
    }
  });
export type InviteInput = z.input<typeof inviteSchema>;

/** Team → Set password: the founder sets a member's password (no email involved). */
export const setMemberPasswordSchema = z
  .object({
    id: z.uuid(),
    password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
export type SetMemberPasswordInput = z.infer<typeof setMemberPasswordSchema>;

export const memberEditSchema = z.object({
  id: z.uuid(),
  fullName: fullNameField,
  /** Ignored for the founder, whose role never changes. */
  role: memberRoleField.optional(),
  primaryNicheId: z.uuid("Pick a niche.").nullable(),
  timezone: timezoneField,
});
export type MemberEditInput = z.infer<typeof memberEditSchema>;

export const profileSchema = z.object({
  fullName: fullNameField,
  timezone: timezoneField,
});
export type ProfileInput = z.infer<typeof profileSchema>;
