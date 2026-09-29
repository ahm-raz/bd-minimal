import "server-only";

/**
 * Invite emails need a sending domain (custom SMTP, docs/DEPLOY.md). Until one is set up they stay off:
 * the founder adds members with a password instead. Turn on with EMAIL_INVITES=on in the server env.
 */
export function emailInvitesEnabled() {
  return process.env.EMAIL_INVITES === "on";
}
