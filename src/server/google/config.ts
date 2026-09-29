import "server-only";

/**
 * Google Calendar settings (docs/10 section 2). The feature is off unless GOOGLE_CALENDAR=on and the
 * client id, secret and token key are all set. Base URLs can be pointed at a mock server in tests.
 */
export function googleCalendarEnabled() {
  return (
    process.env.GOOGLE_CALENDAR === "on" &&
    !!process.env.GOOGLE_CLIENT_ID &&
    !!process.env.GOOGLE_CLIENT_SECRET &&
    !!process.env.GOOGLE_TOKEN_KEY
  );
}

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
export const OAUTH_SCOPES = ["openid", "email", CALENDAR_SCOPE];

export const google = {
  clientId: () => process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: () => process.env.GOOGLE_CLIENT_SECRET ?? "",
  /** Consent page */
  authBase: () => process.env.GOOGLE_AUTH_BASE ?? "https://accounts.google.com",
  /** Token and revoke endpoints */
  oauthBase: () => process.env.GOOGLE_OAUTH_BASE ?? "https://oauth2.googleapis.com",
  /** Calendar REST API */
  apiBase: () => process.env.GOOGLE_API_BASE ?? "https://www.googleapis.com",
  siteUrl: () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  redirectUri: () => `${google.siteUrl()}/api/google/callback`,
};

/** Every Google request gives up after this long; the meeting stays saved and retries later. */
export const GOOGLE_TIMEOUT_MS = 8000;
