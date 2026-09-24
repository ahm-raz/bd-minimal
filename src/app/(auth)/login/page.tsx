import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/my-day";
  const deactivated = sp.reason === "deactivated";
  return <LoginForm next={next} initialError={deactivated ? "Your access has been turned off. Contact the founder." : null} />;
}
