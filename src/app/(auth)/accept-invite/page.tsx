import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { firstName } from "@/lib/format";
import { NewPasswordForm } from "../new-password-form";

export const metadata: Metadata = { title: "Accept invite" };

export default async function AcceptInvitePage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  const { data: profile } = userId
    ? await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle()
    : { data: null };

  if (!userId || !profile) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title text-ink">This invite link has expired</h1>
        <p className="text-body text-ink-muted">Ask the founder to resend your invite, then open the newest email.</p>
        <Link href="/login" className="text-body text-accent-strong underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  const name = firstName(profile.full_name);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-ink">{name ? `Welcome, ${name}.` : "Welcome."}</h1>
      <p className="-mt-2 text-body text-ink-muted">Set a password to start.</p>
      <NewPasswordForm submitLabel="Set password" passwordLabel="Password" toastText="Password set" />
    </div>
  );
}
