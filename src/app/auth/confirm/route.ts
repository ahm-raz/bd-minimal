import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Email links (invite, password recovery) land here with a token hash.
 * Verifying it server-side sets the session cookies, then we forward to the right page.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const dest = type === "recovery" ? "/reset-password" : type === "invite" ? "/accept-invite" : "/my-day";

  const target = url.clone();
  target.search = "";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      target.pathname = dest;
      return NextResponse.redirect(target);
    }
  }

  target.pathname = dest;
  target.searchParams.set("error", "expired");
  return NextResponse.redirect(target);
}
