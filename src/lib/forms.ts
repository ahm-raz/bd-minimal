import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** Show a server action's field errors inline on the form. */
export function applyFieldErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  fieldErrors: Record<string, string> | undefined,
) {
  if (!fieldErrors) return;
  let first = true;
  for (const [name, message] of Object.entries(fieldErrors)) {
    setError(name as Path<T>, { type: "server", message }, { shouldFocus: first });
    first = false;
  }
}
