import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/server/auth";
import { CALENDAR_SCOPE, google, googleCalendarEnabled, OAUTH_COOKIE } from "@/server/google/config";
import { encryptToken } from "@/server/google/crypto";
import { exchangeCode } from "@/server/google/oauth";

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Google sends the user back here after the consent screen (docs/10 section 2). */
export async function GET(req: NextRequest) {
  const back = (result: string) => {
    const url = new URL("/profile", google.siteUrl());
    url.searchParams.set("google", result);
    url.hash = "google-calendar";
    const res = NextResponse.redirect(url);
    res.cookies.set(OAUTH_COOKIE, "", { path: "/api/google", maxAge: 0 });
    return res;
  };
  if (!googleCalendarEnabled()) return back("off");
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login", google.siteUrl()));

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back(q.get("error") === "access_denied" ? "denied" : "error");
  let saved: { state?: string; verifier?: string; user?: string } = {};
  try {
    saved = JSON.parse(req.cookies.get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  const code = q.get("code");
  const state = q.get("state") ?? "";
  if (!code || !saved.state || !saved.verifier || saved.user !== viewer.id || !sameString(state, saved.state)) {
    return back("expired");
  }

  try {
    const t = await exchangeCode(code, saved.verifier);
    if (!t.scopes.includes(CALENDAR_SCOPE)) return back("scope");
    if (!t.refreshToken || !t.email) return back("error");
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_google_connection", {
      p_email: t.email,
      p_scopes: t.scopes,
      p_token_enc: encryptToken(t.refreshToken),
    });
    if (error) return back("error");
  } catch {
    return back("error");
  }
  return back("connected");
}
