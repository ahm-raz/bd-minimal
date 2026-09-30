import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Signs out and returns to /login. `?reason=deactivated` or `?reason=suspended` shows why (docs/11 section 5). */
async function signOut(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  const reason = url.searchParams.get("reason");
  url.pathname = "/login";
  url.search = "";
  if (reason === "deactivated" || reason === "suspended") url.searchParams.set("reason", reason);
  return NextResponse.redirect(url, { status: 303 });
}

export const GET = signOut;
export const POST = signOut;
