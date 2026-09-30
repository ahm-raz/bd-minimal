import type { Metadata } from "next";
import { safeNextPath } from "@/lib/safe-path";
import { LoginForm } from "./login-form";
import { DEACTIVATED_MESSAGE, SUSPENDED_MESSAGE } from "@/lib/messages";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const initialError =
    sp.reason === "deactivated" ? DEACTIVATED_MESSAGE : sp.reason === "suspended" ? SUSPENDED_MESSAGE : null;
  return <LoginForm next={next} initialError={initialError} />;
}
