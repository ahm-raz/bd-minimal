import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

// Pages anyone may open without a session.
const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/reset-password", "/setup", "/auth", "/healthz"];
// Pages only the founder may open (docs/03, Sessions).
const FOUNDER_PREFIXES = ["/feed", "/team", "/settings"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    },
  );

  // Refreshes the session if needed. Do not put code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const { pathname } = request.nextUrl;

  const redirect = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
    const res = NextResponse.redirect(url);
    // keep refreshed auth cookies
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  if (pathname.startsWith("/dev/")) {
    return process.env.NODE_ENV === "production" ? NextResponse.rewrite(new URL("/404", request.url)) : response;
  }

  if (!userId) {
    if (matches(pathname, PUBLIC_PREFIXES)) return response;
    const params: Record<string, string> = {};
    if (pathname !== "/" && pathname !== "/my-day") params.next = pathname + request.nextUrl.search;
    return redirect("/login", params);
  }

  if (pathname === "/" || pathname === "/login") {
    return redirect("/my-day");
  }

  if (matches(pathname, FOUNDER_PREFIXES)) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (profile?.role !== "founder") {
      return redirect("/my-day", { notice: "founder-only" });
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt)$).*)",
  ],
};
