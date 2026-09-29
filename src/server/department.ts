import "server-only";
import { cookies } from "next/headers";
import { DEPARTMENT_COOKIE, departmentFor, type Department } from "@/lib/department";
import type { Viewer } from "@/server/auth";

/** The viewer's department view: Sales for BDs, Social media for SMMs, the saved choice for the founder. */
export async function getDepartment(viewer: Pick<Viewer, "role">): Promise<Department> {
  const store = await cookies();
  return departmentFor(viewer.role, store.get(DEPARTMENT_COOKIE)?.value);
}
