import fs from "node:fs";
import path from "node:path";

/** Reads .env.local so tests can reach the local Supabase stack. */
export function loadEnv(): Record<string, string> {
  const file = path.resolve(process.cwd(), ".env.local");
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

export const env = { ...loadEnv(), ...process.env } as Record<string, string>;
export const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY!;
/** Mailpit API. Local Supabase serves it on the port after Studio. */
export const MAILPIT_URL = env.MAILPIT_URL ?? SUPABASE_URL.replace(/:\d+$/, ":55424");
