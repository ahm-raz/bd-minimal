import { NextResponse } from "next/server";
import { getViewer } from "@/server/auth";
import { google, googleCalendarEnabled, OAUTH_COOKIE } from "@/server/google/config";
import { authUrl, newPkce } from "@/server/google/oauth";

/** Start "Connect Google Calendar" (docs/10 section 2): state + PKCE in a short-lived httpOnly cookie. */
export async function GET() {
  const profile = new URL("/profile", google.siteUrl());
  if (!googleCalendarEnabled()) {
    profile.searchParams.set("google", "off");
    return NextResponse.redirect(profile);
  }
  const viewer = await getViewer();
  if (!viewer) return NextResponse.redirect(new URL("/login", google.siteUrl()));
  const { state, verifier, challenge } = newPkce();
  const res = NextResponse.redirect(authUrl({ state, challenge }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, user: viewer.id }), {
    httpOnly: true,
    secure: google.siteUrl().startsWith("https://"),
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return res;
}
