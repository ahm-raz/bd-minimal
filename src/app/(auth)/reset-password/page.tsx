import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "../new-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();

  if (!claims?.claims?.sub) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title text-ink">Reset your password</h1>
        <p className="text-body text-ink-muted">
          This page needs the link from your reset email. Ask for a new link on the sign-in page.
        </p>
        <Link href="/login" className="text-body text-accent-strong underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-ink">Choose a new password</h1>
      <NewPasswordForm submitLabel="Update password" passwordLabel="New password" toastText="Password updated" />
    </div>
  );
}
