import { execSync } from "node:child_process";
import path from "node:path";
import { ANON_KEY, SUPABASE_URL } from "./env";

/** Every e2e run starts from a clean local database so runs are repeatable. */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  const root = process.cwd();
  const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  execSync(`"${bin}" db reset`, { cwd: root, stdio: "ignore" });
  // Give PostgREST, Auth and Realtime a moment to reconnect after the reset.
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/stages?select=key`, { headers: { apikey: ANON_KEY } });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

