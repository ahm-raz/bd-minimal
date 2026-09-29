import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { google, GOOGLE_TIMEOUT_MS, OAUTH_SCOPES } from "./config";

/** Google said the refresh token is no good (expired, revoked or the password changed). */
export class GoogleAuthError extends Error {
  constructor(public reason: string) {
    super(`Google sign-in failed: ${reason}`);
    this.name = "GoogleAuthError";
  }
}

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(24).toString("base64url");
  return { verifier, challenge, state };
}

/** The Google consent page. `loginHint` preselects the account. */
export function authUrl({ state, challenge, loginHint }: { state: string; challenge: string; loginHint?: string }) {
  const q = new URLSearchParams({
    client_id: google.clientId(),
    redirect_uri: google.redirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `${google.authBase()}/o/oauth2/v2/auth?${q}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${google.oauthBase()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: google.clientId(), client_secret: google.clientSecret(), ...body }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new GoogleAuthError("invalid_grant");
    throw new Error(`Google token endpoint answered ${res.status}${json.error ? ` (${json.error})` : ""}`);
  }
  return json;
}

export async function exchangeCode(code: string, verifier: string) {
  const t = await tokenRequest({
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: google.redirectUri(),
  });
  return {
    refreshToken: t.refresh_token ?? null,
    email: t.id_token ? emailFromIdToken(t.id_token) : null,
    scopes: (t.scope ?? "").split(" ").filter(Boolean),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  if (!t.access_token) throw new Error("Google didn't return an access token");
  return t.access_token;
}

/** Best effort: the connection is removed on our side even if Google can't be reached. */
export async function revokeToken(token: string): Promise<void> {
  await fetch(`${google.oauthBase()}/revoke`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
  }).catch(() => undefined);
}

/** The id_token comes straight from Google's token endpoint over TLS, so its payload is read without re-verifying. */
export function emailFromIdToken(idToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      email?: string;
    };
    return payload.email ?? null;
  } catch {
    return null;
  }
}
