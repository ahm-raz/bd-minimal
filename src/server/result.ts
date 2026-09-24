import type { z } from "zod";

/** Every server action returns this shape (field errors are shown inline by the form). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; error?: undefined; fieldErrors?: undefined }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; data?: undefined };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, fieldErrors?: Record<string, string>): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  return { ok: false, error, fieldErrors };
}

/** Flattens Zod issues to `{ "contacts.0.email": "message" }` (first message per path). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Validate input with the form's schema; returns parsed data or a failed result. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; error: string; fieldErrors: Record<string, string> } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fieldErrors = zodFieldErrors(parsed.error);
  return { ok: false, error: "Check the highlighted fields.", fieldErrors };
}

/**
 * Turn a Postgres / PostgREST error into a sentence that says what happened and what to do.
 * RLS violations become permission messages; trigger exceptions pass through.
 */
export function dbErrorMessage(error: { message?: string; code?: string } | null | undefined, fallback: string): string {
  if (!error) return fallback;
  const msg = error.message ?? "";
  if (error.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return "You don't have permission to do that. Ask the founder if you need it changed.";
  }
  if (error.code === "23505") return "That name is already taken. Pick a different one.";
  if (error.code === "P0001" && msg) return msg.endsWith(".") ? msg : `${msg}.`;
  return fallback;
}
