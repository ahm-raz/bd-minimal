import type { Role } from "@/lib/domain";

/**
 * Department view (founder only): All, Sales or Social media. Remembered per browser in a cookie, like the
 * theme. BDs are always Sales and SMMs always Social media, so the choice only changes the founder's app.
 */
export const DEPARTMENTS = ["all", "sales", "social"] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const DEPARTMENT_LABELS: Record<Department, string> = {
  all: "All departments",
  sales: "Sales",
  social: "Social media",
};
export const DEPARTMENT_COOKIE = "cao-dept";

export function parseDepartment(value: string | undefined | null): Department {
  return (DEPARTMENTS as readonly string[]).includes(value ?? "") ? (value as Department) : "all";
}

/** The department a user works in: fixed for BDs and SMMs, the saved choice for the founder. */
export function departmentFor(role: Role, saved: string | undefined | null): Department {
  if (role === "bd") return "sales";
  if (role === "social") return "social";
  return parseDepartment(saved);
}

export const showsSales = (d: Department) => d !== "social";
export const showsSocial = (d: Department) => d !== "sales";

/** Is a member part of the department? The founder belongs to every view. */
export function inDepartment(role: Role, d: Department): boolean {
  if (d === "all" || role === "founder") return true;
  return d === "sales" ? role === "bd" : role === "social";
}

/** Browser only: the saved choice. */
export function readDepartment(): Department {
  if (typeof document === "undefined") return "all";
  return parseDepartment(document.cookie.match(new RegExp(`(?:^|; )${DEPARTMENT_COOKIE}=([^;]*)`))?.[1]);
}

/** Browser only: save for a year; the caller refreshes the page so server data follows. */
export function saveDepartment(d: Department) {
  document.cookie = `${DEPARTMENT_COOKIE}=${d}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Pages that belong to one department only. The proxy sends the founder away from the other department's
 * pages (settings tabs back to Settings, the rest to My Day). Lists and Targets serve both.
 */
export const SALES_ONLY_PATHS = [
  "/leads",
  "/pipeline",
  "/settings/activity-types",
  "/settings/outcomes",
  "/settings/campaigns",
];
export const SOCIAL_ONLY_PATHS = ["/content", "/settings/social-accounts", "/settings/pillars"];

function under(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Is the page part of the department view? */
export function pathInDepartment(pathname: string, d: Department): boolean {
  if (!showsSales(d) && under(pathname, SALES_ONLY_PATHS)) return false;
  if (!showsSocial(d) && under(pathname, SOCIAL_ONLY_PATHS)) return false;
  return true;
}
