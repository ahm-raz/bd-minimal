import { execSync } from "node:child_process";
import path from "node:path";
import { ANON_KEY, SUPABASE_URL } from "./env";

/** Every e2e run starts from a clean local database so runs are repeatable. */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  const root = process.cwd();
  const bin = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
  execSync(`"${bin}" db reset`, { cwd: root, stdio: "ignore" });
  // `db reset` restarts services: wait until PostgREST, Auth and Realtime all answer again.
  const probes = [`${SUPABASE_URL}/rest/v1/stages?select=key`, `${SUPABASE_URL}/auth/v1/health`, `${SUPABASE_URL}/realtime/v1/api/ping`];
  for (let i = 0; i < 60; i++) {
    const ok = await Promise.all(
      probes.map((url) =>
        fetch(url, { headers: { apikey: ANON_KEY } })
          .then((r) => r.ok)
          .catch(() => false),
      ),
    );
    if (ok.every(Boolean)) {
      // Realtime answers ping slightly before its tenant is ready for sockets.
      await new Promise((r) => setTimeout(r, 3000));
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

